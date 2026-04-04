import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { readAppSettings } from '../utils/invoiceSharing';
import {
  openProfessionalVoucherPrint,
  shareVoucherOnWhatsApp,
  openProfessionalStatementPrint,
  shareStatementOnWhatsApp,
  explainVoucherShareError,
} from '../utils/voucherPrint';
import { hasLocalApi, localCreateVoucher, runLocalSync } from '../data/api/localApi';

const fmt = n => (n||0).toLocaleString('ar-IQ') + ' د.ع';
const now = () => new Date().toLocaleDateString('ar-IQ',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const today = () => new Date().toISOString().split('T')[0];

const VOUCHER_TYPES = [
  { id:'قبض',    label:'سند قبض',          icon:'📥', color:'#10b981', desc:'استلام مبلغ من طرف ما' },
  { id:'دفع',    label:'سند دفع',          icon:'📤', color:'#ef4444', desc:'دفع مبلغ لطرف ما' },
  { id:'صرف',   label:'سند صرف',          icon:'💸', color:'#f59e0b', desc:'صرف مبلغ من الصندوق' },
  { id:'تحويل', label:'سند تحويل العملة', icon:'💱', color:'#3b82f6', desc:'تحويل بين العملات' },
];

const CURRENCIES = ['دينار عراقي','دولار أمريكي','يورو','ريال سعودي','درهم إماراتي','تركي'];
const TRANSFER_DECIMALS = { 'دولار أمريكي': 2, 'يورو': 2, 'ريال سعودي': 2, 'درهم إماراتي': 2, 'تركي': 2, 'دينار عراقي': 0 };
const normalizeCurrencyCode = (currency) => (currency === 'دولار أمريكي' || currency === 'USD' ? 'USD' : 'IQD');
const normalizeNumericInput = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٬،,]/g, '')
  .trim();
const toNum = (value) => {
  const normalized = normalizeNumericInput(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const hasDebtByCurrency = (entity = {}) => (
  entity?.debtByCurrency?.IQD != null
  || entity?.debtByCurrency?.iqd != null
  || entity?.debtByCurrency?.USD != null
  || entity?.debtByCurrency?.usd != null
);
const readDebtByCurrency = (entity = {}) => ({
  IQD: Number(entity?.debtByCurrency?.IQD ?? entity?.debtByCurrency?.iqd ?? (!hasDebtByCurrency(entity) ? entity?.debt : 0) ?? 0) || 0,
  USD: Number(entity?.debtByCurrency?.USD ?? entity?.debtByCurrency?.usd ?? 0) || 0,
});
const readVoucherEntryAmounts = (voucher = {}) => {
  const hasSplit = voucher?.amountIQDEntry != null || voucher?.amountUSDEntry != null;
  if (hasSplit) {
    return {
      iqd: Number(voucher?.amountIQDEntry || 0) || 0,
      usd: Number(voucher?.amountUSDEntry || 0) || 0,
    };
  }
  const code = normalizeCurrencyCode(voucher?.currency);
  const amount = Number(voucher?.amount || 0) || 0;
  return {
    iqd: code === 'IQD' ? amount : 0,
    usd: code === 'USD' ? amount : 0,
  };
};
const readVoucherDiscountAmounts = (voucher = {}) => ({
  iqd: Number(voucher?.discountIQDEntry || 0) || 0,
  usd: Number(voucher?.discountUSDEntry || 0) || 0,
});
const fmtVoucherDiscount = (voucher = {}) => {
  const { iqd, usd } = readVoucherDiscountAmounts(voucher);
  if (iqd > 0 && usd > 0) return `IQD: ${fmt(iqd)} | USD: $${usd.toFixed(2)}`;
  if (usd > 0) return `$${usd.toFixed(2)}`;
  return fmt(iqd);
};
const fmtVoucherAmount = (voucher = {}) => {
  const { iqd, usd } = readVoucherEntryAmounts(voucher);
  if (iqd > 0 && usd > 0) return `IQD: ${fmt(iqd)} | USD: $${usd.toFixed(2)}`;
  if (usd > 0) return `$${usd.toFixed(2)}`;
  return fmt(iqd);
};
const debtDeltaSign = (voucherType, partyType) => {
  if (partyType === 'زبون') {
    if (voucherType === 'قبض') return -1;
    if (voucherType === 'دفع') return 1;
    return 0;
  }
  if (partyType === 'مورد') {
    if (voucherType === 'دفع') return -1;
    if (voucherType === 'قبض') return 1;
    return 0;
  }
  return 0;
};
const isDebtAffectingVoucher = (v = {}) => {
  const src = String(v?.source || '');
  if (!src) return true;
  if (src.startsWith('sales_auto') || src.startsWith('purchase_auto') || src.startsWith('sale_return_auto') || src.startsWith('purchase_return_auto')) return false;
  return true;
};

export default function Vouchers({ user }) {
  const [vouchers,  setVouchers]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [sales,     setSales]     = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [returns,   setReturns]   = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [showForm,  setShowForm]  = useState(false);
  const [selType,   setSelType]   = useState(null);
  const [filterType,setFilterType]= useState('الكل');
  const [filterParty,setFilterParty]=useState('');
  const [search,    setSearch]    = useState('');
  const [selVoucher,setSelVoucher]= useState(null);
  const [selParty,  setSelParty]  = useState(null); // عرض كشف حساب طرف
  const [saving,    setSaving]    = useState(false);
  const [activeTab, setActiveTab] = useState('vouchers'); // vouchers | statement

  const emptyForm = {
    type:'قبض', amount:'', currency:'دينار عراقي',
    amountIQDInput:'', amountUSDInput:'',
    discountIQDInput:'', discountUSDInput:'',
    fromTo:'', description:'', date:today(),
    fromCurrency:'دولار أمريكي', toCurrency:'دينار عراقي',
    fromAmount:'', toAmount:'', rate:'',
    paymentMethod:'نقدي', bankName:'', checkNo:'',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_vouchers'),  s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
    const u2=onSnapshot(collection(db,'pos_customers'), s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3=onSnapshot(collection(db,'pos_suppliers'), s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u4=onSnapshot(collection(db,'pos_sales'),     s=>setSales(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u5=onSnapshot(collection(db,'pos_purchases'), s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u6=onSnapshot(collection(db,'pos_returns'), s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u7=onSnapshot(collection(db,'pos_purchase_returns'), s=>setPurchaseReturns(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>{u1();u2();u3();u4();u5();u6();u7();};
  },[]);

  const appExchangeRate = Number(readAppSettings()?.exchangeRate || 1480) || 1480;
  const voucherAmountIQD = (v) => {
    const hasSplit = v?.amountIQDEntry != null || v?.amountUSDEntry != null;
    if (hasSplit) {
      const entry = readVoucherEntryAmounts(v);
      const rate = Number(v?.exchangeRate || appExchangeRate || 1480) || 1480;
      return Number(entry.iqd || 0) + Number(entry.usd || 0) * rate;
    }
    if (v?.amountIQD != null) return Number(v.amountIQD || 0);
    const code = normalizeCurrencyCode(v?.currency);
    const rate = Number(v?.exchangeRate || appExchangeRate || 1480) || 1480;
    const amount = Number(v?.amount || 0);
    return code === 'USD' ? amount * rate : amount;
  };
  const partyDebtByCurrency = (party) => readDebtByCurrency(party || {});
  const partyDebtIQDEquivalent = (party) => {
    const byCur = partyDebtByCurrency(party);
    return Number(byCur.IQD || 0) + Number(byCur.USD || 0) * appExchangeRate;
  };

  // ── حساب الرصيد لكل طرف ─────────────────────
  const getPartyBalance = (name, typeHint = null) => {
    const party = (typeHint === 'زبون'
      ? customers.find((c) => c.name === name)
      : typeHint === 'مورد'
        ? suppliers.find((s) => s.name === name)
        : customers.find((c) => c.name === name) || suppliers.find((s) => s.name === name)) || null;
    const partyType = typeHint || (party && customers.some((c) => c.id === party.id) ? 'زبون' : 'مورد');
    const debtFromInvoices = partyType === 'زبون'
      ? sales.filter((s) => s.customer === name && s.paymentMethod === 'آجل').reduce((sum, s) => sum + Number(s.dueAmount ?? s.remainingAmount ?? s.total ?? 0), 0)
      : purchases.filter((p) => p.supplier === name && p.paymentMethod === 'آجل').reduce((sum, p) => sum + Number(p.dueAmount ?? p.remainingAmount ?? p.total ?? 0), 0);
    const received = vouchers.filter((v) => v.fromTo === name && v.type === 'قبض').reduce((sum, v) => sum + voucherAmountIQD(v), 0);
    const paid = vouchers.filter((v) => v.fromTo === name && v.type === 'دفع').reduce((sum, v) => sum + voucherAmountIQD(v), 0);
    const byCurrency = partyDebtByCurrency(party);
    const balanceIQD = Number(byCurrency.IQD || 0);
    const balanceUSD = Number(byCurrency.USD || 0);
    const balance = partyDebtIQDEquivalent(party);
    return { debtFromInvoices, received, paid, balance, byCurrency, balanceIQD, balanceUSD, type: partyType };
  };

  const calcTransferResult = (fromAmount, rate, fromCurrency, toCurrency) => {
    const amount = toNum(fromAmount);
    const exRate = toNum(rate);
    if (!amount || !exRate) return 0;
    if (fromCurrency === toCurrency) return amount;

    const fromIsIQD = fromCurrency === 'دينار عراقي';
    const toIsIQD = toCurrency === 'دينار عراقي';

    if (fromIsIQD && !toIsIQD) return amount / exRate;
    if (!fromIsIQD && toIsIQD) return amount * exRate;
    return amount * exRate;
  };

  const formatTransferAmount = (amount, currency) => {
    const decimals = TRANSFER_DECIMALS[currency] ?? 0;
    return Number(amount || 0).toLocaleString('ar-IQ', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const applyTransferCalc = (patch = {}) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      const result = calcTransferResult(next.fromAmount, next.rate, next.fromCurrency, next.toCurrency);
      next.toAmount = next.fromAmount && next.rate ? String(Number(result.toFixed(TRANSFER_DECIMALS[next.toCurrency] ?? 0))) : '';
      return next;
    });
  };

  const getPartyPhone = (name) => {
    const party = allParties.find((p) => p.name === name);
    return party?.phone || '';
  };

  const buildPartyStatementRows = (partyName, partyType = null) => {
    const b = getPartyBalance(partyName, partyType);
    const partyVouchers = vouchers
      .filter((v) => v.fromTo === partyName && (v.type === 'قبض' || v.type === 'دفع') && isDebtAffectingVoucher(v))
      .sort((a, b2) => new Date(a.createdAt) - new Date(b2.createdAt));
    const partySales = sales.filter((s) => s.customer === partyName && s.paymentMethod === 'آجل');
    const partyPurchases = purchases.filter((p) => p.supplier === partyName && p.paymentMethod === 'آجل');
    const partySaleReturns = returns.filter((r) => r.customer === partyName);
    const partyPurchaseReturns = purchaseReturns.filter((r) => r.supplier === partyName);
    const movements = [
      ...(b.type === 'زبون'
        ? partySales.map((s) => ({
          date:s.createdAt,
          label:`فاتورة بيع آجلة #${s.invoiceNo}`,
          debit:Number(s.dueAmount ?? s.remainingAmount ?? s.total ?? 0),
          credit:0,
          type:'sale',
        }))
        : partyPurchases.map((p) => ({
          date:p.createdAt,
          label:`فاتورة شراء آجلة #${p.invoiceNo}`,
          debit:Number(p.dueAmount ?? p.remainingAmount ?? p.total ?? 0),
          credit:0,
          type:'purchase',
        }))),
      ...(b.type === 'زبون'
        ? partySaleReturns.map((r) => ({
          date:r.createdAt,
          label:`إرجاع بيع #${r.returnNo}`,
          debit:0,
          credit:Number(r.settledAmount ?? r.receivedAmount ?? 0),
          type:'sale_return',
        }))
        : partyPurchaseReturns.map((r) => ({
          date:r.createdAt,
          label:`إرجاع شراء #${r.returnNo}`,
          debit:0,
          credit:Number(r.settledAmount ?? r.receivedAmount ?? 0),
          type:'purchase_return',
        }))),
      ...partyVouchers.map((v) => ({
        date:v.createdAt,
        label:`${VOUCHER_TYPES.find((t) => t.id === v.type)?.label} #${v.voucherNo}`,
        debit: v.type === (b.type === 'زبون' ? 'دفع' : 'قبض') ? voucherAmountIQD(v) : 0,
        credit: v.type === (b.type === 'زبون' ? 'قبض' : 'دفع') ? voucherAmountIQD(v) : 0,
        type:'voucher',
      })),
    ].sort((a, b2) => new Date(a.date) - new Date(b2.date));

    const movementNet = movements.reduce((s, m) => s + (m.debit || 0) - (m.credit || 0), 0);
    const openingBalance = Number(b.balanceIQD || 0) - movementNet;
    let running = openingBalance;
    const rows = movements.map((m) => {
      running += (m.debit || 0) - (m.credit || 0);
      return { ...m, balance:running };
    });
    return { b, rows };
  };

  const printPartyStatement = (party) => {
    if (!party?.name) return;
    const { b, rows } = buildPartyStatementRows(party.name, party.type);
    const ok = openProfessionalStatementPrint({
      partyName: party.name,
      partyType: party.type,
      rows,
      summary: {
        debtFromInvoices: b.debtFromInvoices,
        received: b.received,
        paid: b.paid,
        balanceIQD: b.balanceIQD,
        balanceUSD: b.balanceUSD,
      },
    });
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  const shareVoucherToWhatsApp = (v) => {
    const phone = getPartyPhone(v.fromTo);
    const partyType = customers.some((c)=>c.name===v.fromTo) ? 'زبون' : suppliers.some((s)=>s.name===v.fromTo) ? 'مورد' : null;
    const bal = v.type!=='تحويل' ? getPartyBalance(v.fromTo, partyType) : null;
    shareVoucherOnWhatsApp({
      voucher:v,
      phone,
      options:{ balanceIQD: bal?.balanceIQD || 0, balanceUSD: bal?.balanceUSD || 0 },
    }).then((result)=>{
      if (!result?.ok) {
        alert(explainVoucherShareError(result));
        return;
      }
      if (result?.manualAttachRequired) {
        alert(`تم تجهيز ملف PDF للسند ${v.voucherNo || ''}. يرجى إرفاق الملف (${result.fileName}) في محادثة واتساب.`);
      }
    }).catch(()=>{
      alert('تعذر إرسال السند عبر واتساب.');
    });
  };

  const shareStatementToWhatsApp = (party) => {
    if (!party?.name) return;
    const phone = getPartyPhone(party.name);
    const { b, rows } = buildPartyStatementRows(party.name, party.type);
    shareStatementOnWhatsApp({
      statement: {
        partyName: party.name,
        partyType: party.type,
        rows,
        summary: {
          debtFromInvoices: b.debtFromInvoices,
          received: b.received,
          paid: b.paid,
          balanceIQD: b.balanceIQD,
          balanceUSD: b.balanceUSD,
        },
      },
      phone,
    }).then((result)=>{
      if (!result?.ok) {
        alert(explainVoucherShareError(result));
        return;
      }
      if (result?.manualAttachRequired) {
        alert(`تم تجهيز ملف PDF لكشف الحساب. يرجى إرفاق الملف (${result.fileName}) في محادثة واتساب.`);
      }
    }).catch(()=>{
      alert('تعذر إرسال كشف الحساب عبر واتساب.');
    });
  };

  // كل الأطراف (زبائن + موردون)
  const allParties = [
    ...customers.map(c=>({...c, type:'زبون'})),
    ...suppliers.map(s=>({...s, type:'مورد'})),
  ];

  // أطراف لديهم حركات
  const activeParties = allParties.filter(p=>{
    const b = getPartyBalance(p.name, p.type);
    return b.debtFromInvoices>0 || b.received>0 || b.paid>0 || (b.balanceIQD||0)!==0 || (b.balanceUSD||0)!==0;
  });

  const filtered = vouchers.filter(v=>
    (filterType==='الكل'||v.type===filterType) &&
    (!search||v.fromTo?.includes(search)||v.voucherNo?.includes(search))
  );

  // إجماليات
  const totalIn  = vouchers.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalOut = vouchers.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);

  const openForm=(type)=>{setForm({...emptyForm,type});setSelType(VOUCHER_TYPES.find(t=>t.id===type));setShowForm(true);};

  const save=async()=>{
    const amountIQD = toNum(form.amountIQDInput);
    const amountUSD = toNum(form.amountUSDInput);
    const discountIQD = toNum(form.discountIQDInput);
    const discountUSD = toNum(form.discountUSDInput);
    const totalAmountEntered = amountIQD + amountUSD;
    const totalDiscountEntered = discountIQD + discountUSD;
    const effectiveEntered = totalAmountEntered + totalDiscountEntered;
    if(form.type!=='تحويل' && effectiveEntered<=0) return alert('يرجى إدخال مبلغ أو خصم (دينار أو دولار)');
    if(form.type==='تحويل'&&(!form.fromAmount||!form.toAmount||!form.rate))return alert('يرجى إدخال بيانات التحويل');
    setSaving(true);
    try{
      const voucherNo=`V-${form.type.charAt(0)}-${Date.now().toString().slice(-6)}`;
      const amount = amountIQD + amountUSD * appExchangeRate;
      const discountIQDEquivalent = discountIQD + discountUSD * appExchangeRate;
      const singleCurrencyOnly = (amountIQD > 0 && amountUSD <= 0) || (amountUSD > 0 && amountIQD <= 0);
      const legacyCurrency = amountUSD > 0 && amountIQD <= 0 ? 'دولار أمريكي' : 'دينار عراقي';
      const legacyAmount = amountUSD > 0 && amountIQD <= 0 ? amountUSD : amount;
      if (hasLocalApi()) {
        await localCreateVoucher({
          ...form,
          partyType: (() => {
            const party = allParties.find((p) => p.name === form.fromTo?.trim());
            return party?.type || 'زبون';
          })(),
          voucherNo,
          amount: form.type === 'تحويل' ? 0 : legacyAmount,
          currency: form.type === 'تحويل' ? form.currency : (singleCurrencyOnly ? legacyCurrency : 'متعدد العملات'),
          amountIQDEntry: form.type === 'تحويل' ? 0 : amountIQD,
          amountUSDEntry: form.type === 'تحويل' ? 0 : amountUSD,
          discountIQDEntry: form.type === 'تحويل' ? 0 : discountIQD,
          discountUSDEntry: form.type === 'تحويل' ? 0 : discountUSD,
          amountIQD: form.type === 'تحويل' ? 0 : amount,
          discountIQD: form.type === 'تحويل' ? 0 : discountIQDEquivalent,
          exchangeRate: appExchangeRate,
          fromAmount: toNum(form.fromAmount),
          toAmount: toNum(form.toAmount),
          rate: toNum(form.rate),
          addedBy: user.name,
          status: 'مؤكد',
          createdAt: new Date().toISOString(),
          dateISO: today(),
          date: now(),
        });
        runLocalSync().catch(() => null);
        setShowForm(false); setForm(emptyForm);
        alert('✅ تم حفظ السند محليًا');
        setSaving(false);
        return;
      }
      await addDoc(collection(db,'pos_vouchers'),{
        ...form,
        amount: form.type === 'تحويل' ? 0 : legacyAmount,
        currency: form.type === 'تحويل' ? form.currency : (singleCurrencyOnly ? legacyCurrency : 'متعدد العملات'),
        amountIQDEntry: form.type === 'تحويل' ? 0 : amountIQD,
        amountUSDEntry: form.type === 'تحويل' ? 0 : amountUSD,
        discountIQDEntry: form.type === 'تحويل' ? 0 : discountIQD,
        discountUSDEntry: form.type === 'تحويل' ? 0 : discountUSD,
        amountIQD: form.type === 'تحويل' ? 0 : amount,
        discountIQD: form.type === 'تحويل' ? 0 : discountIQDEquivalent,
        exchangeRate: appExchangeRate,
        fromAmount:toNum(form.fromAmount),
        toAmount:toNum(form.toAmount),
        rate:toNum(form.rate),
        voucherNo, addedBy:user.name, status:'مؤكد',
        createdAt:new Date().toISOString(),
      });

      // تحديث رصيد الطرف المختار (زبون/مورد) لكل من سند القبض والدفع
      if((form.type==='قبض'||form.type==='دفع')&&form.fromTo.trim()){
        const partyName = form.fromTo.trim();
        const cust = customers.find(c=>c.name===partyName);
        const supp = !cust ? suppliers.find(s=>s.name===partyName) : null;
        if(cust){
          const debtByCurrency = readDebtByCurrency(cust);
          const sign = debtDeltaSign(form.type, 'زبون');
          const effectiveIQD = amountIQD + discountIQD;
          const effectiveUSD = amountUSD + discountUSD;
          const nextDebtByCurrency = {
            IQD: Number(debtByCurrency.IQD || 0) + sign * effectiveIQD,
            USD: Number(debtByCurrency.USD || 0) + sign * effectiveUSD,
          };
          await updateDoc(doc(db,'pos_customers',cust.id),{
            debt: Number(nextDebtByCurrency.IQD || 0),
            debtByCurrency:nextDebtByCurrency,
          });
        } else if(supp){
          const debtByCurrency = readDebtByCurrency(supp);
          const sign = debtDeltaSign(form.type, 'مورد');
          const effectiveIQD = amountIQD + discountIQD;
          const effectiveUSD = amountUSD + discountUSD;
          const nextDebtByCurrency = {
            IQD: Number(debtByCurrency.IQD || 0) + sign * effectiveIQD,
            USD: Number(debtByCurrency.USD || 0) + sign * effectiveUSD,
          };
          await updateDoc(doc(db,'pos_suppliers',supp.id),{
            debt: Number(nextDebtByCurrency.IQD || 0),
            debtByCurrency:nextDebtByCurrency,
          });
        }
      }

      setShowForm(false);setForm(emptyForm);
      alert('✅ تم حفظ السند بنجاح');
    }catch(e){alert('حدث خطأ!');}
    setSaving(false);
  };

  const printVoucher=(v)=>{
    const partyType = customers.some((c) => c.name === v.fromTo) ? 'زبون' : suppliers.some((s)=>s.name===v.fromTo) ? 'مورد' : null;
    const bal=v.fromTo&&v.type!=='تحويل'?getPartyBalance(v.fromTo, partyType):{balanceIQD:0,balanceUSD:0};
    const ok = openProfessionalVoucherPrint(v, { balanceIQD: bal.balanceIQD || 0, balanceUSD: bal.balanceUSD || 0 });
    if (!ok) alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  };

  // ── كشف حساب طرف ──────────────────────────────
  if(selParty){
    const { b, rows } = buildPartyStatementRows(selParty.name, selParty.type);

    return(
      <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <button onClick={()=>setSelParty(null)}
            style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 16px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
          <div style={{color:'#fff',fontSize:20,fontWeight:800}}>كشف حساب — {selParty.name}</div>
          <span style={{background:selParty.type==='زبون'?'#3b82f622':'#f59e0b22',border:`1px solid ${selParty.type==='زبون'?'#3b82f644':'#f59e0b44'}`,borderRadius:20,padding:'3px 12px',color:selParty.type==='زبون'?'#3b82f6':'#f59e0b',fontSize:12,fontWeight:700}}>{selParty.type}</span>
          <div style={{marginRight:'auto',display:'flex',gap:8}}>
            <button onClick={()=>printPartyStatement(selParty)}
              style={{background:'#3b82f6',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontFamily:"'Cairo'",fontSize:12,fontWeight:700}}>
              🖨️ طباعة الكشف
            </button>
            <button onClick={()=>shareStatementToWhatsApp(selParty)}
              style={{background:'#10b981',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontFamily:"'Cairo'",fontSize:12,fontWeight:700}}>
              واتساب
            </button>
          </div>
        </div>

        {/* ملخص الحساب */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:20}}>
          {[
            ['📋','مديونية من الفواتير',fmt(b.debtFromInvoices),'#f59e0b'],
            ['📥','مبالغ مستلمة',fmt(b.received),'#10b981'],
            ['📤','مبالغ مدفوعة',fmt(b.paid),'#ef4444'],
            ['🇮🇶','الرصيد الحالي IQD',fmt(b.balanceIQD),'#ef4444'],
            ['💵','الرصيد الحالي USD',`$${Number(b.balanceUSD||0).toFixed(2)}`,'#3b82f6'],
          ].map(([icon,label,val,color])=>(
            <div key={label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${color}33`,textAlign:'center'}}>
              <div style={{fontSize:26,marginBottom:6}}>{icon}</div>
              <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
              <div style={{color,fontSize:16,fontWeight:800}}>{val}</div>
            </div>
          ))}
        </div>

        {/* كشف الحركات */}
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden',marginBottom:16}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{color:'#fff',fontSize:14,fontWeight:700}}>📋 كشف الحركات</div>
            <div style={{display:'flex',gap:16,fontSize:12}}>
              <span style={{color:'#f59e0b'}}>مدين (عليه)</span>
              <span style={{color:'#10b981'}}>دائن (له)</span>
              <span style={{color:'#F5C800'}}>الرصيد</span>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:'1px solid #f8fbff',background:'#f8fbff'}}>
            {['التاريخ','البيان','مدين','دائن','الرصيد'].map(h=>(
              <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
            ))}
          </div>
          {rows.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد حركات</div>
            :rows.map((r,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<rows.length-1?'1px solid #f8fbff':'none',alignItems:'center',background:i%2===0?'transparent':'#f8fbff'}}>
                <div style={{color:'#64748b',fontSize:11}}>{new Date(r.date).toLocaleDateString('ar-IQ')}</div>
                <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{r.label}</div>
                <div style={{color:r.debit>0?'#f59e0b':'#cdd8ec',fontSize:13,fontWeight:r.debit>0?700:400}}>{r.debit>0?fmt(r.debit):'—'}</div>
                <div style={{color:r.credit>0?'#10b981':'#cdd8ec',fontSize:13,fontWeight:r.credit>0?700:400}}>{r.credit>0?fmt(r.credit):'—'}</div>
                <div style={{color:r.balance>0?'#ef4444':r.balance<0?'#10b981':'#64748b',fontSize:13,fontWeight:800}}>
                  {r.balance>0?`${fmt(r.balance)} د`:r.balance<0?`${fmt(Math.abs(r.balance))} ئ`:'صفر'}
                </div>
              </div>
            ))
          }
          {/* سطر الإجمالي */}
          <div style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr',padding:'14px 20px',background:'#f8fbff',borderTop:'2px solid #d9e2f2'}}>
            <div style={{color:'#64748b',fontSize:12,fontWeight:700,gridColumn:'1/3'}}>الإجمالي</div>
            <div style={{color:'#f59e0b',fontSize:14,fontWeight:800}}>{fmt(rows.reduce((s,r)=>s+(r.debit||0),0))}</div>
            <div style={{color:'#10b981',fontSize:14,fontWeight:800}}>{fmt(rows.reduce((s,r)=>s+(r.credit||0),0))}</div>
            <div style={{color:'#334155',fontSize:15,fontWeight:900}}>
              IQD: {fmt(b.balanceIQD)} | USD: ${Number(b.balanceUSD||0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* إنشاء سند قبض مباشر */}
        {(b.balanceIQD>0 || b.balanceUSD>0) && (
          <div style={{background:'#10b98111',border:'1px solid #10b98133',borderRadius:14,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{color:'#10b981',fontSize:14,fontWeight:700}}>المتبقي: IQD {fmt(b.balanceIQD)} | USD ${Number(b.balanceUSD||0).toFixed(2)}</div>
              <div style={{color:'#64748b',fontSize:12}}>اختر عملة السند المطابقة للرصيد</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              {b.balanceIQD>0&&<button onClick={()=>{
                setSelParty(null);
                setForm({...emptyForm,type:'قبض',fromTo:selParty.name,amountIQDInput:String(b.balanceIQD),amountUSDInput:''});
                setSelType(VOUCHER_TYPES.find(t=>t.id==='قبض'));
                setShowForm(true);
              }} style={{background:'#10b981',color:'#000',border:'none',borderRadius:12,padding:'12px 16px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
                📥 سند IQD
              </button>}
              {b.balanceUSD>0&&<button onClick={()=>{
                setSelParty(null);
                setForm({...emptyForm,type:'قبض',fromTo:selParty.name,amountIQDInput:'',amountUSDInput:String(Number(b.balanceUSD).toFixed(2))});
                setSelType(VOUCHER_TYPES.find(t=>t.id==='قبض'));
                setShowForm(true);
              }} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'12px 16px',fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
                📥 سند USD
              </button>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── تفاصيل سند ────────────────────────────────
  if(selVoucher){
    const type=VOUCHER_TYPES.find(t=>t.id===selVoucher.type);
    const bal=selVoucher.fromTo?getPartyBalance(selVoucher.fromTo, customers.some((c)=>c.name===selVoucher.fromTo)?'زبون':'مورد'):null;
    return(
      <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <button onClick={()=>setSelVoucher(null)}
            style={{background:'#ffffff',border:'1px solid #cdd8ec',borderRadius:10,padding:'8px 16px',color:'#F5C800',cursor:'pointer',fontFamily:"'Cairo'"}}>← رجوع</button>
          <div style={{color:'#fff',fontSize:20,fontWeight:800}}>{type?.icon} {type?.label} — {selVoucher.voucherNo}</div>
        </div>

        <div style={{background:'#ffffff',borderRadius:20,padding:28,border:`1px solid ${type?.color}33`,maxWidth:600}}>
          <div style={{textAlign:'center',marginBottom:24,paddingBottom:20,borderBottom:'1px solid #d9e2f2'}}>
            <div style={{fontSize:48,marginBottom:8}}>{type?.icon}</div>
            <div style={{color:type?.color,fontSize:22,fontWeight:800,marginBottom:4}}>{type?.label}</div>
            <div style={{color:'#64748b',fontSize:13}}>{selVoucher.voucherNo}</div>
          </div>

          {selVoucher.type==='تحويل'?(
            <div style={{marginBottom:20}}>
              <div style={{display:'flex',gap:16,justifyContent:'center',alignItems:'center'}}>
                <div style={{textAlign:'center',background:'#f8fbff',borderRadius:16,padding:20,flex:1}}>
                  <div style={{color:'#64748b',fontSize:12,marginBottom:4}}>من</div>
                  <div style={{color:'#ef4444',fontSize:20,fontWeight:800}}>{(selVoucher.fromAmount||0).toLocaleString()}</div>
                  <div style={{color:'#64748b',fontSize:12}}>{selVoucher.fromCurrency}</div>
                </div>
                <div style={{color:'#64748b',fontSize:28}}>→</div>
                <div style={{textAlign:'center',background:'#f8fbff',borderRadius:16,padding:20,flex:1}}>
                  <div style={{color:'#64748b',fontSize:12,marginBottom:4}}>إلى</div>
                  <div style={{color:'#10b981',fontSize:20,fontWeight:800}}>{(selVoucher.toAmount||0).toLocaleString()}</div>
                  <div style={{color:'#64748b',fontSize:12}}>{selVoucher.toCurrency}</div>
                </div>
              </div>
              <div style={{textAlign:'center',marginTop:12,color:'#64748b',fontSize:13}}>
                سعر الصرف: <span style={{color:'#F5C800',fontWeight:700}}>1 {selVoucher.fromCurrency} = {selVoucher.rate} {selVoucher.toCurrency}</span>
              </div>
            </div>
          ):(
            <div style={{marginBottom:20}}>
              <div style={{textAlign:'center',background:'#f8fbff',borderRadius:16,padding:20,marginBottom:16}}>
                <div style={{color:'#64748b',fontSize:13,marginBottom:6}}>المبلغ</div>
                <div style={{color:type?.color,fontSize:30,fontWeight:900}}>{fmtVoucherAmount(selVoucher)}</div>
                <div style={{color:'#64748b',fontSize:14}}>{selVoucher.currency || '—'}</div>
                <div style={{marginTop:6,color:'#ef4444',fontSize:13,fontWeight:800}}>
                  الخصم: {fmtVoucherDiscount(selVoucher)}
                </div>
              </div>
            </div>
          )}

          {[
            selVoucher.type!=='تحويل'&&['من/إلى',selVoucher.fromTo],
            ['التاريخ',selVoucher.date],
            selVoucher.type!=='تحويل'&&['طريقة الدفع',selVoucher.paymentMethod],
            selVoucher.bankName&&['البنك',selVoucher.bankName],
            selVoucher.checkNo&&['رقم الشيك',selVoucher.checkNo],
            selVoucher.description&&['البيان',selVoucher.description],
            ['أضافه',selVoucher.addedBy],
          ].filter(Boolean).map(([l,v])=>v&&(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #e2e8f7'}}>
              <span style={{color:'#64748b',fontSize:13}}>{l}</span>
              <span style={{color:'#1e293b',fontSize:13,fontWeight:600}}>{v}</span>
            </div>
          ))}

          {/* ✅ الرصيد المتبقي */}
          {bal&&selVoucher.type!=='تحويل'&&(
            <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:14,padding:16,marginTop:16,textAlign:'center'}}>
              <div style={{color:'#64748b',fontSize:12,marginBottom:6}}>الرصيد المتبقي لـ {selVoucher.fromTo}</div>
              <div style={{color:'#ef4444',fontSize:22,fontWeight:900}}>IQD: {fmt(bal.balanceIQD)}</div>
              <div style={{color:'#3b82f6',fontSize:22,fontWeight:900,marginTop:4}}>USD: ${Number(bal.balanceUSD||0).toFixed(2)}</div>
              <div style={{color:'#64748b',fontSize:12,fontWeight:700,marginTop:6}}>
                التسديد يجب أن يكون بنفس العملة
              </div>
            </div>
          )}

          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button onClick={()=>printVoucher(selVoucher)}
              style={{flex:1,background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
              🖨️ طباعة PDF
            </button>
            {selVoucher.type!=='تحويل'&&(
              <button onClick={()=>shareVoucherToWhatsApp(selVoucher)}
                style={{flex:1,background:'#10b981',color:'#fff',border:'none',borderRadius:12,padding:12,fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
                واتساب
              </button>
            )}
            {user.role==='مدير'&&(
              <button onClick={async()=>{if(confirm('حذف هذا السند؟')){await deleteDoc(doc(db,'pos_vouchers',selVoucher.id));setSelVoucher(null);}}}
                style={{flex:1,background:'#ef444422',border:'1px solid #ef444444',borderRadius:12,padding:12,color:'#ef4444',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:14}}>
                🗑️ حذف
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>السندات المالية</div>
          <div style={{color:'#64748b',fontSize:13}}>{vouchers.length} سند</div>
        </div>
      </div>

      {/* أزرار إنشاء السندات */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        {VOUCHER_TYPES.map(type=>(
          <button key={type.id} onClick={()=>openForm(type.id)}
            style={{background:'#ffffff',border:`1px solid ${type.color}33`,borderRadius:16,padding:18,cursor:'pointer',textAlign:'center',transition:'all .15s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=type.color}
            onMouseLeave={e=>e.currentTarget.style.borderColor=`${type.color}33`}>
            <div style={{fontSize:32,marginBottom:8}}>{type.icon}</div>
            <div style={{color:type.color,fontSize:14,fontWeight:800,marginBottom:4}}>{type.label}</div>
            <div style={{color:'#475569',fontSize:11}}>{type.desc}</div>
          </button>
        ))}
      </div>

      {/* ملخص مالي */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        {[
          ['📥','إجمالي المقبوضات',fmt(totalIn),'#10b981'],
          ['📤','إجمالي المدفوعات',fmt(totalOut),'#ef4444'],
          ['⚖️','الرصيد الصافي',fmt(totalIn-totalOut),(totalIn-totalOut)>=0?'#F5C800':'#ef4444'],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:16,padding:18,border:'1px solid #d9e2f2',textAlign:'center'}}>
            <div style={{fontSize:26,marginBottom:8}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:12,marginBottom:6}}>{label}</div>
            <div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      {/* التبويبات */}
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        {[['vouchers','🧾 السندات'],['statement','📋 كشوفات الحسابات']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{background:activeTab===id?'#F5C800':'#ffffff',color:activeTab===id?'#000':'#64748b',border:`1px solid ${activeTab===id?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'8px 20px',fontSize:13,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:activeTab===id?700:400}}>
            {label}
          </button>
        ))}
      </div>

      {/* قائمة السندات */}
      {activeTab==='vouchers'&&(
        <>
          <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
              style={{flex:1,minWidth:200,color:'#0f172a',fontSize:13,outline:'none',fontFamily:"'Cairo'"}}/>
            {['الكل',...VOUCHER_TYPES.map(t=>t.id)].map(f=>(
              <button key={f} onClick={()=>setFilterType(f)}
                style={{background:filterType===f?'#F5C800':'#ffffff',color:filterType===f?'#000':'#64748b',border:`1px solid ${filterType===f?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:filterType===f?700:400}}>
                {f==='الكل'?'الكل':VOUCHER_TYPES.find(t=>t.id===f)?.label}
              </button>
            ))}
          </div>
          <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid #d9e2f2',background:'#f8fbff'}}>
              {['رقم السند','النوع','من/إلى','المبلغ','الرصيد المتبقي','التاريخ','إجراء'].map(h=>(
                <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
              ))}
            </div>
            {filtered.length===0
              ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد سندات</div>
              :filtered.map((v,i)=>{
                const type=VOUCHER_TYPES.find(t=>t.id===v.type);
                const bal=v.fromTo&&v.type!=='تحويل'?getPartyBalance(v.fromTo, customers.some((c)=>c.name===v.fromTo)?'زبون':'مورد'):null;
                return(
                  <div key={v.id} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<filtered.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
                    <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{v.voucherNo}</div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:16}}>{type?.icon}</span>
                      <span style={{background:`${type?.color}22`,border:`1px solid ${type?.color}44`,borderRadius:20,padding:'2px 8px',color:type?.color,fontSize:10,fontWeight:700}}>{type?.label}</span>
                    </div>
                    <div style={{color:'#1e293b',fontSize:12}}>{v.type==='تحويل'?`${v.fromCurrency}→${v.toCurrency}`:v.fromTo||'—'}</div>
                    <div style={{color:type?.color,fontSize:13,fontWeight:800}}>
                      {v.type==='تحويل'?`${(v.fromAmount||0).toLocaleString()}`:fmtVoucherAmount(v)}
                    </div>
                    {/* ✅ الرصيد المتبقي */}
                    <div>
                      {bal!=null?(
                        <div>
                          <div style={{color:'#ef4444',fontSize:11,fontWeight:800}}>IQD: {fmt(bal.balanceIQD)}</div>
                          <div style={{color:'#3b82f6',fontSize:11,fontWeight:800}}>USD: ${Number(bal.balanceUSD||0).toFixed(2)}</div>
                        </div>
                      ):<span style={{color:'#cdd8ec',fontSize:11}}>—</span>}
                    </div>
                    <div style={{color:'#64748b',fontSize:11}}>{v.date}</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setSelVoucher(v)}
                        style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:8,padding:'5px 8px',color:'#F5C800',fontSize:11,cursor:'pointer'}}>👁️</button>
                      <button onClick={()=>printVoucher(v)}
                        style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:8,padding:'5px 8px',color:'#3b82f6',fontSize:11,cursor:'pointer'}}>🖨️</button>
                      {v.type!=='تحويل'&&(
                        <button onClick={()=>shareVoucherToWhatsApp(v)}
                          style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 8px',color:'#10b981',fontSize:11,cursor:'pointer'}}>📲</button>
                      )}
                    </div>
                  </div>
                );
              })
            }
          </div>
        </>
      )}

      {/* كشوفات الحسابات */}
      {activeTab==='statement'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
          {activeParties.length===0
            ?<div style={{gridColumn:'1/-1',color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد حسابات بعد</div>
            :activeParties.map(p=>{
              const b=getPartyBalance(p.name, p.type);
              return(
                <div key={p.id} onClick={()=>setSelParty(p)}
                  style={{background:'#ffffff',borderRadius:16,padding:16,border:`1px solid ${(b.balanceIQD>0||b.balanceUSD>0)?'#ef444433':'#10b98133'}`,cursor:'pointer',transition:'all .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#e2e8f7'}
                  onMouseLeave={e=>e.currentTarget.style.background='#ffffff'}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <div style={{width:40,height:40,borderRadius:10,background:p.type==='زبون'?'#3b82f622':'#f59e0b22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>
                        {p.type==='زبون'?'👤':'🏭'}
                      </div>
                      <div>
                        <div style={{color:'#1e293b',fontSize:14,fontWeight:700}}>{p.name}</div>
                        <div style={{color:p.type==='زبون'?'#3b82f6':'#f59e0b',fontSize:11}}>{p.type}</div>
                      </div>
                    </div>
                    <div style={{textAlign:'center',background:'#f8fbff',borderRadius:12,padding:'8px 14px',border:'1px solid #d9e2f2'}}>
                      <div style={{color:'#ef4444',fontSize:12,fontWeight:900}}>IQD: {fmt(b.balanceIQD)}</div>
                      <div style={{color:'#3b82f6',fontSize:12,fontWeight:900}}>USD: ${Number(b.balanceUSD||0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                    {[['مديونية',fmt(b.debtFromInvoices),'#f59e0b'],['مستلم',fmt(b.received),'#10b981'],['مدفوع',fmt(b.paid),'#ef4444']].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:'center',background:'#f8fbff',borderRadius:8,padding:'6px 0'}}>
                        <div style={{color:'#64748b',fontSize:10}}>{l}</div>
                        <div style={{color:c,fontSize:12,fontWeight:700}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    <button onClick={(e)=>{e.stopPropagation();printPartyStatement(p);}}
                      style={{flex:1,background:'#e8f1ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'5px 8px',color:'#1f6feb',fontSize:11,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
                      طباعة
                    </button>
                    <button onClick={(e)=>{e.stopPropagation();shareStatementToWhatsApp(p);}}
                      style={{flex:1,background:'#ecfdf5',border:'1px solid #a7f3d0',borderRadius:8,padding:'5px 8px',color:'#047857',fontSize:11,cursor:'pointer',fontFamily:"'Cairo'",fontWeight:700}}>
                      واتساب
                    </button>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* نموذج السند */}
      {showForm&&selType&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#ffffff',borderRadius:20,padding:28,width:'100%',maxWidth:560,border:`1px solid ${selType.color}44`,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <span style={{fontSize:32}}>{selType.icon}</span>
                <div>
                  <div style={{color:selType.color,fontSize:18,fontWeight:800}}>{selType.label}</div>
                  <div style={{color:'#64748b',fontSize:12}}>{selType.desc}</div>
                </div>
              </div>
              <button onClick={()=>setShowForm(false)} style={{background:'none',border:'none',color:'#64748b',fontSize:24,cursor:'pointer'}}>✕</button>
            </div>

            {form.type==='تحويل'?(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:10,alignItems:'end',marginBottom:16}}>
                  <div>
                    <label style={lbl}>من عملة</label>
                    <select value={form.fromCurrency} onChange={e=>applyTransferCalc({fromCurrency:e.target.value})} style={inp}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
                  </div>
                  <div style={{textAlign:'center',color:'#64748b',fontSize:24,paddingBottom:8}}>⇄</div>
                  <div>
                    <label style={lbl}>إلى عملة</label>
                    <select value={form.toCurrency} onChange={e=>applyTransferCalc({toCurrency:e.target.value})} style={inp}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
                  <div>
                    <label style={lbl}>المبلغ المحوَّل *</label>
                    <input type="text" inputMode="decimal" value={form.fromAmount} onChange={e=>applyTransferCalc({fromAmount:e.target.value})} style={inp} placeholder="0"/>
                  </div>
                  <div>
                    <label style={lbl}>سعر الصرف *</label>
                    <input type="text" inputMode="decimal" value={form.rate} onChange={e=>applyTransferCalc({rate:e.target.value})} style={inp} placeholder="مثال: 1480"/>
                  </div>
                  <div>
                    <label style={lbl}>المبلغ الناتج</label>
                    <input type="text" inputMode="decimal" value={form.toAmount} onChange={e=>setForm(f=>({...f,toAmount:e.target.value}))} style={{...inp,color:'#10b981'}} placeholder="0"/>
                  </div>
                </div>
                {form.fromAmount&&form.rate&&(
                  <div style={{background:'#f8fbff',borderRadius:12,padding:14,marginBottom:16,textAlign:'center',border:'1px solid #d9e2f2'}}>
                    <span style={{color:'#64748b',fontSize:13}}>النتيجة: </span>
                    <span style={{color:'#10b981',fontSize:18,fontWeight:800}}>{formatTransferAmount(calcTransferResult(form.fromAmount, form.rate, form.fromCurrency, form.toCurrency), form.toCurrency)} {form.toCurrency}</span>
                  </div>
                )}
              </div>
            ):(
              <div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                  <div>
                    <label style={lbl}>المبلغ بالدينار (IQD)</label>
                    <input type="text" inputMode="decimal" value={form.amountIQDInput} onChange={e=>setForm(f=>({...f,amountIQDInput:e.target.value}))} placeholder="0" style={{...inp,fontSize:18,color:'#ef4444',fontWeight:800}}/>
                  </div>
                  <div>
                    <label style={lbl}>المبلغ بالدولار (USD)</label>
                    <input type="text" inputMode="decimal" value={form.amountUSDInput} onChange={e=>setForm(f=>({...f,amountUSDInput:e.target.value}))} placeholder="0.00" style={{...inp,fontSize:18,color:'#3b82f6',fontWeight:800}}/>
                  </div>
                </div>
                {(form.type==='قبض'||form.type==='دفع')&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                    <div>
                      <label style={lbl}>خصم بالدينار (IQD)</label>
                      <input type="text" inputMode="decimal" value={form.discountIQDInput} onChange={e=>setForm(f=>({...f,discountIQDInput:e.target.value}))} placeholder="0" style={{...inp,fontSize:16,color:'#b45309',fontWeight:800}}/>
                    </div>
                    <div>
                      <label style={lbl}>خصم بالدولار (USD)</label>
                      <input type="text" inputMode="decimal" value={form.discountUSDInput} onChange={e=>setForm(f=>({...f,discountUSDInput:e.target.value}))} placeholder="0.00" style={{...inp,fontSize:16,color:'#1d4ed8',fontWeight:800}}/>
                    </div>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12,marginBottom:14}}>
                  <div>
                    <label style={lbl}>طريقة الدفع</label>
                    <select value={form.paymentMethod} onChange={e=>setForm(f=>({...f,paymentMethod:e.target.value}))} style={inp}>
                      {['نقدي','شيك','تحويل بنكي','بطاقة'].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {form.paymentMethod==='شيك'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                    <div><label style={lbl}>اسم البنك</label><input value={form.bankName} onChange={e=>setForm(f=>({...f,bankName:e.target.value}))} style={inp} placeholder="اسم البنك"/></div>
                    <div><label style={lbl}>رقم الشيك</label><input value={form.checkNo} onChange={e=>setForm(f=>({...f,checkNo:e.target.value}))} style={inp} placeholder="رقم الشيك"/></div>
                  </div>
                )}
                <div style={{marginBottom:14}}>
                  <label style={lbl}>{form.type==='قبض'?'المستلَم منه':'المدفوع إليه'} *</label>
                  <input value={form.fromTo} onChange={e=>setForm(f=>({...f,fromTo:e.target.value}))}
                    list="contacts-list" placeholder="اسم الشخص أو الجهة" style={inp}/>
                  <datalist id="contacts-list">
                    {[...customers,...suppliers].map(c=><option key={c.id} value={c.name}/>)}
                  </datalist>
                  {/* عرض رصيد الطرف */}
                  {form.fromTo.trim()&&(()=>{
                    const pType = customers.some((c)=>c.name===form.fromTo.trim()) ? 'زبون' : suppliers.some((s)=>s.name===form.fromTo.trim()) ? 'مورد' : null;
                    const b=getPartyBalance(form.fromTo.trim(), pType);
                    if((b.balanceIQD||0)===0&&(b.balanceUSD||0)===0&&b.debtFromInvoices===0)return null;
                    const amountIQD = toNum(form.amountIQDInput);
                    const amountUSD = toNum(form.amountUSDInput);
                    const discountIQD = toNum(form.discountIQDInput);
                    const discountUSD = toNum(form.discountUSDInput);
                    const sign = debtDeltaSign(form.type, pType);
                    const projectedIQD = b.balanceIQD + sign * (amountIQD + discountIQD);
                    const projectedUSD = b.balanceUSD + sign * (amountUSD + discountUSD);
                    return(
                      <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:8,padding:'8px 12px',marginTop:6}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{color:'#64748b',fontSize:12}}>الرصيد الحالي</span>
                          <span style={{color:'#334155',fontSize:13,fontWeight:800}}>IQD: {fmt(b.balanceIQD)} | USD: ${Number(b.balanceUSD||0).toFixed(2)}</span>
                        </div>
                        {(form.type==='قبض'||form.type==='دفع')&&(amountIQD>0||amountUSD>0||discountIQD>0||discountUSD>0)&&(
                          <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px dashed #cdd8ec',paddingTop:4}}>
                            <span style={{color:'#64748b',fontSize:12}}>الرصيد بعد السند (لحظي)</span>
                            <span style={{color:'#334155',fontSize:13,fontWeight:900}}>
                              IQD: {fmt(projectedIQD)} | USD: ${projectedUSD.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {(discountIQD>0||discountUSD>0)&&(
                          <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px dashed #cdd8ec',paddingTop:4,marginTop:4}}>
                            <span style={{color:'#64748b',fontSize:12}}>الخصم المطبق</span>
                            <span style={{color:'#b45309',fontSize:13,fontWeight:900}}>
                              IQD: {fmt(discountIQD)} | USD: ${discountUSD.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div style={{marginBottom:14}}>
              <label style={lbl}>التاريخ</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={lbl}>البيان / الوصف</label>
              <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                rows={2} placeholder="وصف العملية..." style={{...inp,resize:'vertical'}}/>
            </div>

            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowForm(false)}
                style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:12,padding:12,color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إلغاء</button>
              <button onClick={save} disabled={saving}
                style={{flex:2,background:`linear-gradient(135deg,${selType.color},${selType.color}99)`,color:'#000',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:15,opacity:saving?0.6:1}}>
                {saving?'⏳ جاري الحفظ...':'✅ حفظ السند'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = {color:'#64748b',fontSize:12,display:'block',marginBottom:5};
const inp = {width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo',sans-serif",fontSize:14,direction:'rtl'};
