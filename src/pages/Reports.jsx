import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import jsPDF from 'jspdf';
import { hasLocalApi, localStoreList } from '../data/api/localApi';
import { getExchangeRate, getPreferredCurrency, setPreferredCurrency, toDisplayAmount } from '../utils/helpers';

const fmt = n => (n||0).toLocaleString('ar-IQ') + ' د.ع';
const COLORS = ['#F5C800','#10b981','#3b82f6','#ef4444','#a78bfa','#f59e0b','#06b6d4'];
const toNum = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};
const toISO = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};
const todayISO = () => new Date().toISOString().split('T')[0];
const rowISO = (row) => row?.dateISO || toISO(row?.createdAt) || toISO(row?.date) || todayISO();
const voucherAmountIQD = (v) => {
  const exchangeRate = toNum(v?.exchangeRate || 1) || 1;
  const amountIQDStored = toNum(v?.amountIQD ?? (toNum(v?.amountIQDEntry) + toNum(v?.amountUSDEntry) * exchangeRate));
  const discountIQDStored = toNum(v?.discountIQD ?? (toNum(v?.discountIQDEntry) + toNum(v?.discountUSDEntry) * exchangeRate));
  if (v?.amountIQD != null || v?.amountIQDEntry != null || v?.amountUSDEntry != null || v?.discountIQD != null || v?.discountIQDEntry != null || v?.discountUSDEntry != null) {
    return amountIQDStored + discountIQDStored;
  }
  const amount = toNum(v?.amount);
  const isUSD = v?.currency === 'دولار أمريكي' || v?.currency === 'USD';
  const discount = toNum(v?.discountAmount || 0);
  return (isUSD ? amount * exchangeRate : amount) + discount;
};
const calcSaleCost = (inv, products) => {
  // نعتمد تكلفة الفاتورة المحفوظة إن كانت متوفرة، وإلا نحسب من تفاصيل المواد
  if (inv?.cogs != null) return toNum(inv.cogs);
  return (inv?.items || []).reduce((sum, it) => {
    if (it?.costTotal != null) return sum + toNum(it.costTotal);
    const qtyUnits = toNum(it?.qtyUnits || (it?.isPackage ? toNum(it?.qty) * toNum(it?.packageQty || 1) : toNum(it?.qty)));
    const savedUnitCost = toNum(it?.buyPrice ?? it?.costPrice);
    const productCost = toNum(products.find((p) => p.id === it?.id)?.buyPrice);
    const unitCost = savedUnitCost || productCost;
    return sum + (unitCost * qtyUnits);
  }, 0);
};

const REPORTS = [
  { id:'trading',    icon:'📊', label:'تقرير المتاجرة',        color:'#F5C800' },
  { id:'profit',     icon:'📈', label:'الأرباح والخسائر',      color:'#10b981' },
  { id:'customer_debt', icon:'👥', label:'ديون الزبائن',       color:'#ef4444' },
  { id:'supplier_debt', icon:'🏭', label:'ديون الموردين',      color:'#f59e0b' },
  { id:'sales',      icon:'🛒', label:'تقرير المبيعات',        color:'#3b82f6' },
  { id:'inventory',  icon:'📦', label:'تقرير المخزون',         color:'#a78bfa' },
  { id:'cashflow',   icon:'💰', label:'التدفق النقدي',         color:'#06b6d4' },
  { id:'top',        icon:'🏆', label:'أفضل المنتجات',         color:'#F5C800' },
];

export default function Reports() {
  const [active, setActive]     = useState('trading');
  const [sales, setSales]       = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo]     = useState(todayISO());
  const [reportCurrency, setReportCurrency] = useState(() => getPreferredCurrency());

  useEffect(() => {
    setPreferredCurrency(reportCurrency);
  }, [reportCurrency]);

  const fmt = (n) => reportCurrency === 'USD'
    ? `$${toDisplayAmount(n, 'USD', getExchangeRate()).toFixed(2)}`
    : (n||0).toLocaleString('ar-IQ') + ' د.ع';

  useEffect(() => {
    if (hasLocalApi()) {
      let alive = true;
      const loadLocal = async () => {
        const [salesRows, purchasesRows, expensesRows, productsRows, customersRows, suppliersRows, vouchersRows] = await Promise.all([
          localStoreList('pos_sales'),
          localStoreList('pos_purchases'),
          localStoreList('pos_expenses'),
          localStoreList('pos_products'),
          localStoreList('pos_customers'),
          localStoreList('pos_suppliers'),
          localStoreList('pos_vouchers'),
        ]);
        if (!alive) return;
        setSales(salesRows || []);
        setPurchases(purchasesRows || []);
        setExpenses(expensesRows || []);
        setProducts(productsRows || []);
        setCustomers(customersRows || []);
        setSuppliers(suppliersRows || []);
        setVouchers(vouchersRows || []);
      };
      loadLocal().catch(() => null);
      const t = setInterval(() => loadLocal().catch(() => null), 2000);
      return () => { alive = false; clearInterval(t); };
    }

    const uns = [
      onSnapshot(collection(db,'pos_sales'),     s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'), s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'),  s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'),  s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_customers'), s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'), s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'),  s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return () => uns.forEach(u=>u());
  }, []);

  // فلترة بالتاريخ
  const filterByDate = (arr) => arr.filter(i => {
    const d = rowISO(i);
    if (dateFrom && (!d || d < dateFrom)) return false;
    if (dateTo   && (!d || d > dateTo))   return false;
    return true;
  });

  const fSales     = filterByDate(sales);
  const fPurchases = filterByDate(purchases);
  const fExpenses  = filterByDate(expenses);
  const fVouchers  = filterByDate(vouchers);

  const voucherDiscountIQD = (v = {}) => {
    const rate = toNum(v.exchangeRate || 1) || 1;
    if (v.discountIQD != null || v.discountIQDEntry != null || v.discountUSDEntry != null) {
      return toNum(v.discountIQD ?? (toNum(v.discountIQDEntry) + toNum(v.discountUSDEntry) * rate));
    }
    return toNum(v.discountAmount || 0);
  };
  const saleDiscountLoss = (inv = {}) => toNum(inv.itemDiscountAmount) + toNum(inv.discountAmount);

  const existingSaleLossKeys = new Set(
    fExpenses
      .filter((e) => e.source === 'sale_discount_auto' && (e.linkedSaleNo || e.linkedSaleId))
      .map((e) => e.linkedSaleNo || e.linkedSaleId),
  );
  const existingVoucherLossKeys = new Set(
    fExpenses
      .filter((e) => e.source === 'voucher_discount_auto' && (e.linkedVoucherNo || e.linkedVoucherId))
      .map((e) => e.linkedVoucherNo || e.linkedVoucherId),
  );

  const derivedSaleLossExpenses = fSales
    .map((inv) => {
      const loss = saleDiscountLoss(inv);
      const key = inv.invoiceNo || inv.id;
      if (loss <= 0 || !key || existingSaleLossKeys.has(key)) return null;
      return {
        id: `derived-sale-loss-${key}`,
        amount: loss,
        cat: 'خسائر',
        source: 'derived_sale_discount',
        dateISO: rowISO(inv),
        createdAt: inv.createdAt || null,
      };
    })
    .filter(Boolean);

  const derivedVoucherLossExpenses = fVouchers
    .map((v) => {
      const loss = voucherDiscountIQD(v);
      const key = v.voucherNo || v.id;
      if (loss <= 0 || !key || existingVoucherLossKeys.has(key)) return null;
      return {
        id: `derived-voucher-loss-${key}`,
        amount: loss,
        cat: 'خسائر',
        source: 'derived_voucher_discount',
        dateISO: rowISO(v),
        createdAt: v.createdAt || null,
      };
    })
    .filter(Boolean);

  const allExpenses = [...fExpenses, ...derivedSaleLossExpenses, ...derivedVoucherLossExpenses];

  // ── حسابات المتاجرة ──────────────────────────
  const totalRevenue     = fSales.reduce((s,i)=>s+toNum(i.total),0);
  const costOfGoods      = fSales.reduce((s,inv)=>s+calcSaleCost(inv, products),0);
  const grossProfit      = totalRevenue - costOfGoods;
  const totalExpenses    = allExpenses.reduce((s,e)=>s+toNum(e.amount),0);
  const totalPurchases   = fPurchases.reduce((s,p)=>s+toNum(p.total),0);
  const netProfit        = grossProfit - totalExpenses;
  const profitMargin     = totalRevenue>0?((netProfit/totalRevenue)*100).toFixed(1):0;

  // ── ديون ──────────────────────────────────────
  const customerDebts  = customers.filter(c=>(c.debt||0)>0).sort((a,b)=>(b.debt||0)-(a.debt||0));
  const supplierDebts  = suppliers.filter(s=>(s.debt||0)>0).sort((a,b)=>(b.debt||0)-(a.debt||0));
  const totalCustDebt  = customerDebts.reduce((s,c)=>s+(c.debt||0),0);
  const totalSuppDebt  = supplierDebts.reduce((s,s2)=>s+(s2.debt||0),0);

  // ── مبيعات يومية ──────────────────────────────
  const dailySales = Array.from({length:14},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-i);
    const label=d.toLocaleDateString('ar-IQ',{month:'short',day:'numeric'});
    const dateStr=d.toISOString().split('T')[0];
    const daySalesRows = sales.filter((s) => rowISO(s) === dateStr);
    const rev=daySalesRows.reduce((sum,row)=>sum+(row.total||0),0);
    const cost=daySalesRows.reduce((sum,row)=>sum+calcSaleCost(row, products),0);
    return {name:label, مبيعات:rev, تكلفة:cost, ربح:rev-cost};
  }).reverse();

  // ── المخزون ───────────────────────────────────
  const inventoryValue = products.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0);
  const inventorySell  = products.reduce((s,p)=>s+(p.stock||0)*(p.sellPrice||0),0);
  const lowStock       = products.filter(p=>(p.stock||0)<=(p.minStock||5));

  // ── أفضل المنتجات ─────────────────────────────
  const topProducts = [...products].sort((a,b)=>(b.soldCount||0)-(a.soldCount||0)).slice(0,10);

  // ── التدفق النقدي ─────────────────────────────
  const cashIn  = fSales.filter(s=>s.paymentMethod==='نقدي').reduce((s,i)=>s+(i.total||0),0)
                + fVouchers.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const cashOut = allExpenses.reduce((s,e)=>s+toNum(e.amount),0)
                + fVouchers.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);

  const printReport = () => {
    const doc2 = new jsPDF();
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(16);
    doc2.text('Adwaa Al-Madina — Financial Report', 105, 15, {align:'center'});
    doc2.setFontSize(11);
    doc2.setFont('helvetica','normal');
    doc2.text(`Date: ${new Date().toLocaleDateString()}`, 105, 23, {align:'center'});
    doc2.line(14, 26, 196, 26);
    let y = 34;
    const row = (l,v,bold=false) => {
      if(bold) doc2.setFont('helvetica','bold');
      else doc2.setFont('helvetica','normal');
      doc2.text(l, 14, y);
      doc2.text(v, 196, y, {align:'right'});
      y += 7;
    };
    row('TRADING REPORT','', true);
    y+=2; doc2.line(14,y,196,y); y+=5;
    row('Total Revenue:', `${totalRevenue.toLocaleString()} IQD`);
    row('Cost of Goods Sold:', `${costOfGoods.toLocaleString()} IQD`);
    row('Gross Profit:', `${grossProfit.toLocaleString()} IQD`, true);
    y+=3; doc2.line(14,y,196,y); y+=5;
    row('Total Expenses:', `${totalExpenses.toLocaleString()} IQD`);
    row('NET PROFIT:', `${netProfit.toLocaleString()} IQD`, true);
    row('Profit Margin:', `${profitMargin}%`);
    y+=5; doc2.line(14,y,196,y); y+=5;
    row('DEBTS','', true);
    y+=2;
    row('Customer Debts:', `${totalCustDebt.toLocaleString()} IQD`);
    row('Supplier Debts:', `${totalSuppDebt.toLocaleString()} IQD`);
    y+=5; doc2.line(14,y,196,y); y+=5;
    row('INVENTORY','', true);
    y+=2;
    row('Inventory Value (Cost):', `${inventoryValue.toLocaleString()} IQD`);
    row('Inventory Value (Sell):', `${inventorySell.toLocaleString()} IQD`);
    row('Low Stock Items:', lowStock.length.toString());
    doc2.save(`Financial-Report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const curReport = REPORTS.find(r=>r.id===active);

  return (
    <div style={{ display:'flex', height:'100%', fontFamily:"'Cairo'", direction:'rtl' }}>

      {/* قائمة التقارير */}
      <div style={{ width:200, background:'#f8fbff', borderLeft:'1px solid #ffffff', padding:12, flexShrink:0, overflowY:'auto' }}>
        <div style={{ color:'#64748b', fontSize:11, fontWeight:700, marginBottom:12, padding:'0 4px' }}>التقارير المالية</div>
        {REPORTS.map(r=>(
          <button key={r.id} onClick={()=>setActive(r.id)}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'10px 10px', borderRadius:10, border:'none', cursor:'pointer', marginBottom:2, background:active===r.id?`${r.color}18`:'transparent', textAlign:'right' }}>
            <span style={{ fontSize:16 }}>{r.icon}</span>
            <span style={{ color:active===r.id?r.color:'#64748b', fontSize:12, fontWeight:active===r.id?700:400 }}>{r.label}</span>
          </button>
        ))}
        <div style={{ borderTop:'1px solid #ffffff', marginTop:12, paddingTop:12 }}>
          <button onClick={printReport}
            style={{ width:'100%', background:'#3b82f622', border:'1px solid #3b82f644', borderRadius:10, padding:'10px 0', color:'#3b82f6', cursor:'pointer', fontSize:12, fontWeight:700 }}>
            🖨️ طباعة PDF
          </button>
        </div>
      </div>

      {/* المحتوى */}
      <div style={{ flex:1, overflowY:'auto', padding:24 }}>

        {/* فلتر التاريخ */}
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20, background:'#ffffff', borderRadius:12, padding:14, border:'1px solid #d9e2f2' }}>
          <span style={{ color:'#64748b', fontSize:13 }}>الفترة:</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{ color:'#0f172a', outline:'none', fontFamily:"'Cairo'" }}/>
          <span style={{ color:'#64748b' }}>—</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{ color:'#0f172a', outline:'none', fontFamily:"'Cairo'" }}/>
          <div style={{display:'flex',gap:4,marginRight:6}}>
            {['IQD','USD'].map((code) => (
              <button key={code} onClick={() => setReportCurrency(code)}
                style={{background:reportCurrency===code?'#e8f1ff':'#fff',color:reportCurrency===code?'#1f6feb':'#64748b',border:`1px solid ${reportCurrency===code?'#93c5fd':'#d9e2f2'}`,borderRadius:8,padding:'6px 10px',cursor:'pointer',fontFamily:"'Cairo'",fontSize:11,fontWeight:reportCurrency===code?700:500}}>
                {code === 'USD' ? 'دولار' : 'دينار'}
              </button>
            ))}
          </div>
          <button onClick={()=>{setDateFrom(todayISO());setDateTo(todayISO());}}
            style={{ background:'#d9e2f2', border:'none', borderRadius:8, padding:'6px 14px', color:'#64748b', cursor:'pointer', fontFamily:"'Cairo'", fontSize:12 }}>إعادة ضبط</button>
          <div style={{ color:curReport?.color, fontSize:14, fontWeight:800, marginRight:'auto' }}>
            {curReport?.icon} {curReport?.label}
          </div>
        </div>

        {/* ══ تقرير المتاجرة ══ */}
        {active==='trading' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              {/* جانب المبيعات */}
              <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
                <div style={{ background:'#10b98122', padding:'14px 20px', borderBottom:'1px solid #10b98133' }}>
                  <div style={{ color:'#10b981', fontSize:15, fontWeight:800 }}>📥 الإيرادات</div>
                </div>
                <div style={{ padding:16 }}>
                  {[
                    ['إجمالي المبيعات', fmt(totalRevenue), '#10b981', true],
                    ['مردودات المبيعات', fmt(0), '#ef4444', false],
                    ['صافي المبيعات', fmt(totalRevenue), '#10b981', true],
                  ].map(([l,v,c,bold])=>(
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #ffffff' }}>
                      <span style={{ color:bold?'#1e293b':'#666', fontSize:13, fontWeight:bold?700:400 }}>{l}</span>
                      <span style={{ color:c, fontSize:14, fontWeight:bold?800:600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* جانب التكاليف */}
              <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
                <div style={{ background:'#ef444422', padding:'14px 20px', borderBottom:'1px solid #ef444433' }}>
                  <div style={{ color:'#ef4444', fontSize:15, fontWeight:800 }}>📤 التكاليف</div>
                </div>
                <div style={{ padding:16 }}>
                  {[
                    ['تكلفة البضاعة المباعة', fmt(costOfGoods), '#ef4444', false],
                    ['مجموع المشتريات', fmt(totalPurchases), '#f59e0b', false],
                    ['المصروفات التشغيلية', fmt(totalExpenses), '#ef4444', false],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #ffffff' }}>
                      <span style={{ color:'#666', fontSize:13 }}>{l}</span>
                      <span style={{ color:c, fontSize:14, fontWeight:600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* نتائج المتاجرة */}
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #F5C80033', padding:24, marginBottom:20 }}>
              <div style={{ color:'#F5C800', fontSize:16, fontWeight:800, marginBottom:16, textAlign:'center' }}>⚖️ نتائج المتاجرة</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                {[
                  ['مجمل الربح', fmt(grossProfit), grossProfit>=0?'#10b981':'#ef4444'],
                  ['صافي الربح', fmt(netProfit), netProfit>=0?'#10b981':'#ef4444'],
                  ['هامش الربح', `${profitMargin}%`, Number(profitMargin)>=20?'#10b981':Number(profitMargin)>=10?'#F5C800':'#ef4444'],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ textAlign:'center', background:'#f8fbff', borderRadius:14, padding:20, border:'1px solid #d9e2f2' }}>
                    <div style={{ color:'#64748b', fontSize:12, marginBottom:8 }}>{l}</div>
                    <div style={{ color:c, fontSize:24, fontWeight:900 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* رسم بياني */}
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', padding:20 }}>
              <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:16 }}>📊 المبيعات والأرباح — آخر 14 يوم</div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
                  <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}}/>
                  <YAxis tick={{fill:'#64748b',fontSize:10}}/>
                  <Tooltip contentStyle={{color:'#0f172a',fontFamily:'Cairo'}}/>
                  <Legend/>
                  <Line type="monotone" dataKey="مبيعات" stroke="#10b981" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="تكلفة" stroke="#ef4444" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="ربح" stroke="#F5C800" strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══ الأرباح والخسائر ══ */}
        {active==='profit' && (
          <div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #d9e2f2', background:'#10b98111' }}>
                <div style={{ color:'#10b981', fontSize:16, fontWeight:800 }}>قائمة الأرباح والخسائر</div>
              </div>
              <div style={{ padding:20 }}>
                {/* الإيرادات */}
                <div style={{ color:'#10b981', fontSize:13, fontWeight:800, marginBottom:10, paddingBottom:6, borderBottom:'2px solid #10b98133' }}>الإيرادات</div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ color:'#64748b', fontSize:13 }}>إيرادات المبيعات</span>
                  <span style={{ color:'#1e293b', fontSize:13, fontWeight:600 }}>{fmt(totalRevenue)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16, paddingBottom:16, borderBottom:'1px solid #d9e2f2' }}>
                  <span style={{ color:'#1e293b', fontSize:14, fontWeight:700 }}>إجمالي الإيرادات</span>
                  <span style={{ color:'#10b981', fontSize:15, fontWeight:800 }}>{fmt(totalRevenue)}</span>
                </div>

                {/* المصروفات */}
                <div style={{ color:'#ef4444', fontSize:13, fontWeight:800, marginBottom:10, paddingBottom:6, borderBottom:'2px solid #ef444433' }}>المصروفات</div>
                {[
                  ['تكلفة البضاعة المباعة', costOfGoods],
                  ['المصروفات التشغيلية', totalExpenses],
                ].map(([l,v])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ color:'#64748b', fontSize:13 }}>{l}</span>
                    <span style={{ color:'#1e293b', fontSize:13, fontWeight:600 }}>{fmt(v)}</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:24, paddingBottom:16, borderBottom:'1px solid #d9e2f2' }}>
                  <span style={{ color:'#1e293b', fontSize:14, fontWeight:700 }}>إجمالي المصروفات</span>
                  <span style={{ color:'#ef4444', fontSize:15, fontWeight:800 }}>{fmt(costOfGoods+totalExpenses)}</span>
                </div>

                {/* الصافي */}
                <div style={{ background:netProfit>=0?'#10b98122':'#ef444422', borderRadius:14, padding:20, border:`1px solid ${netProfit>=0?'#10b98144':'#ef444444'}`, textAlign:'center' }}>
                  <div style={{ color:'#64748b', fontSize:14, marginBottom:8 }}>صافي {netProfit>=0?'الربح':'الخسارة'}</div>
                  <div style={{ color:netProfit>=0?'#10b981':'#ef4444', fontSize:36, fontWeight:900 }}>{fmt(Math.abs(netProfit))}</div>
                  <div style={{ color:'#64748b', fontSize:12, marginTop:8 }}>هامش الربح: {profitMargin}%</div>
                </div>
              </div>
            </div>

            {/* مخطط دائري */}
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', padding:20 }}>
              <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:16 }}>توزيع التكاليف</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={[{name:'تكلفة البضاعة',value:costOfGoods},{name:'المصروفات',value:totalExpenses},{name:'صافي الربح',value:Math.max(0,netProfit)}]}
                    cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                    {COLORS.map((c,i)=><Cell key={i} fill={c}/>)}
                  </Pie>
                  <Tooltip formatter={v=>fmt(v)} contentStyle={{color:'#0f172a'}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══ ديون الزبائن ══ */}
        {active==='customer_debt' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
              {[['👥','إجمالي الزبائن',customers.length,'#3b82f6'],['⚠️','زبائن لديهم ديون',customerDebts.length,'#ef4444'],['💰','إجمالي الديون',fmt(totalCustDebt),'#ef4444']].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
                  <div style={{ color:'#64748b', fontSize:12, marginBottom:6 }}>{label}</div>
                  <div style={{ color, fontSize:18, fontWeight:800 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #d9e2f2', display:'flex', justifyContent:'space-between' }}>
                <div style={{ color:'#fff', fontSize:15, fontWeight:700 }}>كشف ديون الزبائن</div>
                <div style={{ color:'#ef4444', fontSize:14, fontWeight:800 }}>إجمالي: {fmt(totalCustDebt)}</div>
              </div>
              {customerDebts.length===0
                ?<div style={{ color:'#10b981', textAlign:'center', padding:60, fontSize:16 }}>✅ لا توجد ديون على الزبائن</div>
                :customerDebts.map((c,i)=>(
                  <div key={c.id} style={{ display:'flex', justifyContent:'space-between', padding:'14px 20px', borderBottom:i<customerDebts.length-1?'1px solid #ffffff':'none', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:'#ef444422', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
                      <div>
                        <div style={{ color:'#1e293b', fontSize:13, fontWeight:700 }}>{c.name}</div>
                        <div style={{ color:'#64748b', fontSize:11 }}>{c.phone||'—'}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                      {/* شريط تقدم نسبي */}
                      <div style={{ width:100, height:6, background:'#d9e2f2', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(100,(c.debt/totalCustDebt)*100)}%`, height:'100%', background:'#ef4444', borderRadius:3 }}/>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ color:'#ef4444', fontSize:16, fontWeight:800 }}>{fmt(c.debt)}</div>
                        <div style={{ color:'#64748b', fontSize:10 }}>{((c.debt/totalCustDebt)*100).toFixed(1)}% من الإجمالي</div>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ══ ديون الموردين ══ */}
        {active==='supplier_debt' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
              {[['🏭','إجمالي الموردين',suppliers.length,'#3b82f6'],['⚠️','موردون لديهم ديون',supplierDebts.length,'#f59e0b'],['💰','إجمالي الديون',fmt(totalSuppDebt),'#f59e0b']].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
                  <div style={{ color:'#64748b', fontSize:12, marginBottom:6 }}>{label}</div>
                  <div style={{ color, fontSize:18, fontWeight:800 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #d9e2f2', display:'flex', justifyContent:'space-between' }}>
                <div style={{ color:'#fff', fontSize:15, fontWeight:700 }}>كشف ديون الموردين</div>
                <div style={{ color:'#f59e0b', fontSize:14, fontWeight:800 }}>إجمالي: {fmt(totalSuppDebt)}</div>
              </div>
              {supplierDebts.length===0
                ?<div style={{ color:'#10b981', textAlign:'center', padding:60, fontSize:16 }}>✅ لا توجد ديون على الموردين</div>
                :supplierDebts.map((s,i)=>(
                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between', padding:'14px 20px', borderBottom:i<supplierDebts.length-1?'1px solid #ffffff':'none', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:'#f59e0b22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🏭</div>
                      <div>
                        <div style={{ color:'#1e293b', fontSize:13, fontWeight:700 }}>{s.name}</div>
                        <div style={{ color:'#64748b', fontSize:11 }}>{s.phone||'—'}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                      <div style={{ width:100, height:6, background:'#d9e2f2', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ width:`${Math.min(100,(s.debt/totalSuppDebt)*100)}%`, height:'100%', background:'#f59e0b', borderRadius:3 }}/>
                      </div>
                      <div style={{ textAlign:'left' }}>
                        <div style={{ color:'#f59e0b', fontSize:16, fontWeight:800 }}>{fmt(s.debt)}</div>
                        <div style={{ color:'#64748b', fontSize:10 }}>{((s.debt/totalSuppDebt)*100).toFixed(1)}% من الإجمالي</div>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ══ تقرير المبيعات ══ */}
        {active==='sales' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              {[
                ['🧾','عدد الفواتير',fSales.length,'#3b82f6'],
                ['💰','إجمالي المبيعات',fmt(totalRevenue),'#10b981'],
                ['💵','نقدي',fmt(fSales.filter(s=>s.paymentMethod==='نقدي').reduce((s,i)=>s+(i.total||0),0)),'#F5C800'],
                ['📋','آجل',fmt(fSales.filter(s=>s.paymentMethod==='آجل').reduce((s,i)=>s+(i.total||0),0)),'#ef4444'],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:16, border:'1px solid #d9e2f2', textAlign:'center' }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
                  <div style={{ color:'#64748b', fontSize:11, marginBottom:4 }}>{label}</div>
                  <div style={{ color, fontSize:16, fontWeight:800 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', padding:20, marginBottom:16 }}>
              <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:16 }}>مبيعات آخر 14 يوم</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
                  <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}}/>
                  <YAxis tick={{fill:'#64748b',fontSize:10}}/>
                  <Tooltip contentStyle={{color:'#0f172a'}}/>
                  <Bar dataKey="مبيعات" fill="#F5C800" radius={[4,4,0,0]}/>
                  <Bar dataKey="ربح" fill="#10b981" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #d9e2f2' }}>
                <div style={{ color:'#fff', fontSize:14, fontWeight:700 }}>سجل الفواتير ({fSales.length})</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', padding:'10px 20px', borderBottom:'1px solid #e2e8f7', background:'#f8fbff' }}>
                {['رقم الفاتورة','الزبون','المنتجات','الدفع','الإجمالي'].map(h=><div key={h} style={{ color:'#64748b', fontSize:11, fontWeight:700 }}>{h}</div>)}
              </div>
              {fSales.slice(0,20).map((s,i)=>(
                <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', padding:'10px 20px', borderBottom:i<fSales.length-1?'1px solid #ffffff':'none', alignItems:'center' }}>
                  <div style={{ color:'#F5C800', fontSize:12, fontWeight:700 }}>{s.invoiceNo}</div>
                  <div style={{ color:'#1e293b', fontSize:12 }}>{s.customer||'عام'}</div>
                  <div style={{ color:'#666', fontSize:12 }}>{s.items?.length||0} صنف</div>
                  <span style={{ background:'#F5C80022', border:'1px solid #F5C80044', borderRadius:20, padding:'2px 8px', color:'#F5C800', fontSize:10, display:'inline-block' }}>{s.paymentMethod}</span>
                  <div style={{ color:'#10b981', fontSize:13, fontWeight:800 }}>{fmt(s.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ تقرير المخزون ══ */}
        {active==='inventory' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
              {[
                ['📦','عدد الأصناف',products.length,'#3b82f6'],
                ['💰','قيمة المخزون (شراء)',fmt(inventoryValue),'#F5C800'],
                ['📈','قيمة المخزون (بيع)',fmt(inventorySell),'#10b981'],
                ['📊','هامش المخزون',fmt(inventorySell-inventoryValue),'#a78bfa'],
                ['⚠️','أصناف تحت الحد',lowStock.length,'#ef4444'],
                ['✅','أصناف بمستوى جيد',products.length-lowStock.length,'#10b981'],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:'#ffffff', borderRadius:14, padding:16, border:'1px solid #d9e2f2', textAlign:'center' }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
                  <div style={{ color:'#64748b', fontSize:11, marginBottom:4 }}>{label}</div>
                  <div style={{ color, fontSize:16, fontWeight:800 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #d9e2f2' }}>
                <div style={{ color:'#fff', fontSize:14, fontWeight:700 }}>تفاصيل المخزون</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr', padding:'10px 20px', borderBottom:'1px solid #e2e8f7', background:'#f8fbff' }}>
                {['المنتج','المخزون','سعر الشراء','سعر البيع','قيمة الشراء','قيمة البيع'].map(h=><div key={h} style={{ color:'#64748b', fontSize:11, fontWeight:700 }}>{h}</div>)}
              </div>
              {products.map((p,i)=>(
                <div key={p.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr', padding:'10px 20px', borderBottom:i<products.length-1?'1px solid #ffffff':'none', alignItems:'center', background:(p.stock||0)<=(p.minStock||5)?'#ef444408':'transparent' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:18 }}>{p.img||'📦'}</span>
                    <span style={{ color:'#1e293b', fontSize:12, fontWeight:600 }}>{p.name}</span>
                  </div>
                  <span style={{ color:(p.stock||0)<=(p.minStock||5)?'#ef4444':'#10b981', fontSize:13, fontWeight:800 }}>{p.stock||0}</span>
                  <span style={{ color:'#64748b', fontSize:12 }}>{fmt(p.buyPrice)}</span>
                  <span style={{ color:'#F5C800', fontSize:12 }}>{fmt(p.sellPrice)}</span>
                  <span style={{ color:'#a78bfa', fontSize:12 }}>{fmt((p.stock||0)*(p.buyPrice||0))}</span>
                  <span style={{ color:'#10b981', fontSize:12, fontWeight:700 }}>{fmt((p.stock||0)*(p.sellPrice||0))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ التدفق النقدي ══ */}
        {active==='cashflow' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
              {[
                ['📥','إجمالي التدفقات الداخلة',fmt(cashIn),'#10b981'],
                ['📤','إجمالي التدفقات الخارجة',fmt(cashOut),'#ef4444'],
                ['⚖️','صافي التدفق النقدي',fmt(cashIn-cashOut),(cashIn-cashOut)>=0?'#F5C800':'#ef4444'],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>{icon}</div>
                  <div style={{ color:'#64748b', fontSize:12, marginBottom:6 }}>{label}</div>
                  <div style={{ color, fontSize:20, fontWeight:800 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #10b98133', overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', background:'#10b98111', borderBottom:'1px solid #10b98133' }}>
                  <div style={{ color:'#10b981', fontSize:14, fontWeight:800 }}>📥 مصادر الدخل النقدي</div>
                </div>
                <div style={{ padding:16 }}>
                  {[
                    ['مبيعات نقدية', fSales.filter(s=>s.paymentMethod==='نقدي').reduce((s,i)=>s+(i.total||0),0)],
                    ['سندات قبض', fVouchers.filter(v=>v.type==='قبض').reduce((s,v)=>s+(v.amount||0),0)],
                  ].map(([l,v])=>(
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #ffffff' }}>
                      <span style={{ color:'#64748b', fontSize:13 }}>{l}</span>
                      <span style={{ color:'#10b981', fontSize:14, fontWeight:700 }}>{fmt(v)}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, marginTop:4 }}>
                    <span style={{ color:'#1e293b', fontSize:14, fontWeight:800 }}>الإجمالي</span>
                    <span style={{ color:'#10b981', fontSize:16, fontWeight:900 }}>{fmt(cashIn)}</span>
                  </div>
                </div>
              </div>
              <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #ef444433', overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', background:'#ef444411', borderBottom:'1px solid #ef444433' }}>
                  <div style={{ color:'#ef4444', fontSize:14, fontWeight:800 }}>📤 مصادر المدفوعات النقدية</div>
                </div>
                <div style={{ padding:16 }}>
                  {[
                    ['المصروفات', fExpenses.reduce((s,e)=>s+(e.amount||0),0)],
                    ['سندات دفع وصرف', fVouchers.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+(v.amount||0),0)],
                  ].map(([l,v])=>(
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #ffffff' }}>
                      <span style={{ color:'#64748b', fontSize:13 }}>{l}</span>
                      <span style={{ color:'#ef4444', fontSize:14, fontWeight:700 }}>{fmt(v)}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, marginTop:4 }}>
                    <span style={{ color:'#1e293b', fontSize:14, fontWeight:800 }}>الإجمالي</span>
                    <span style={{ color:'#ef4444', fontSize:16, fontWeight:900 }}>{fmt(cashOut)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ أفضل المنتجات ══ */}
        {active==='top' && (
          <div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', padding:20, marginBottom:16 }}>
              <div style={{ color:'#fff', fontSize:14, fontWeight:700, marginBottom:16 }}>📊 أكثر المنتجات مبيعاً</div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topProducts.slice(0,8).map(p=>({name:p.name?.length>10?p.name.slice(0,10)+'...':p.name, مبيعات:p.soldCount||0}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
                  <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}}/>
                  <YAxis tick={{fill:'#64748b',fontSize:10}}/>
                  <Tooltip contentStyle={{color:'#0f172a'}}/>
                  <Bar dataKey="مبيعات" fill="#F5C800" radius={[6,6,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid #d9e2f2' }}>
                <div style={{ color:'#fff', fontSize:14, fontWeight:700 }}>🏆 ترتيب المنتجات</div>
              </div>
              {topProducts.map((p,i)=>(
                <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px 20px', borderBottom:i<topProducts.length-1?'1px solid #ffffff':'none', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'#F5C80022', display:'flex', alignItems:'center', justifyContent:'center', color:'#F5C800', fontWeight:800, fontSize:14 }}>#{i+1}</div>
                    <span style={{ fontSize:20 }}>{p.img||'📦'}</span>
                    <div>
                      <div style={{ color:'#1e293b', fontSize:13, fontWeight:600 }}>{p.name}</div>
                      <div style={{ color:'#64748b', fontSize:11 }}>{p.cat}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ color:'#F5C800', fontSize:15, fontWeight:800 }}>{p.soldCount||0} قطعة</div>
                    <div style={{ color:'#64748b', fontSize:11 }}>مخزون: {p.stock}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
