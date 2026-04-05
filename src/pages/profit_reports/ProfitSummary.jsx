import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import { hasLocalApi, localStoreList } from '../../data/api/localApi';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
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
const rowISO = (row = {}) => row?.dateISO || toISO(row?.createdAt) || toISO(row?.date) || todayISO();

export default function ProfitSummary({ user }) {
  const [sales,    setSales]    = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [returns,  setReturns]  = useState([]);
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo,   setDateTo]   = useState(todayISO());

  useEffect(()=>{
    if (hasLocalApi()) {
      let alive = true;
      const loadLocal = async () => {
        const [salesRows, vouchersRows, expensesRows, productsRows, returnsRows] = await Promise.all([
          localStoreList('pos_sales'),
          localStoreList('pos_vouchers'),
          localStoreList('pos_expenses'),
          localStoreList('pos_products'),
          localStoreList('pos_returns'),
        ]);
        if (!alive) return;
        setSales(salesRows || []);
        setVouchers(vouchersRows || []);
        setExpenses(expensesRows || []);
        setProducts(productsRows || []);
        setReturns(returnsRows || []);
      };
      loadLocal().catch(() => null);
      const t = setInterval(() => loadLocal().catch(() => null), 2000);
      return () => { alive = false; clearInterval(t); };
    }

    const us=[
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'), s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'), s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_returns'),  s=>setReturns(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange=d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales    = sales.filter(s=>inRange(rowISO(s)));
  const fVouchers = vouchers.filter(v=>inRange(rowISO(v)));
  const fExpenses = expenses.filter(e=>inRange(rowISO(e)));
  const fReturns  = returns.filter(r=>inRange(rowISO(r)));

  const voucherDiscountIQD = (v = {}) => {
    const rate = toNum(v.exchangeRate || 1) || 1;
    if (v.discountIQD != null || v.discountIQDEntry != null || v.discountUSDEntry != null) {
      return toNum(v.discountIQD ?? (toNum(v.discountIQDEntry) + toNum(v.discountUSDEntry) * rate));
    }
    return toNum(v.discountAmount || 0);
  };
  const saleDiscountLoss = (inv = {}) => toNum(inv.itemDiscountAmount) + toNum(inv.discountAmount);

  const grossRevenue  = fSales.reduce((s,i)=>s+toNum(i.total),0);
  const salesReturns  = fReturns.reduce((s,r)=>s+toNum(r.total),0);
  const netRevenue    = grossRevenue - salesReturns;
  const calcCogs=(inv)=>{
    if(inv?.cogs!=null)return toNum(inv.cogs);
    return(inv?.items||[]).reduce((ss,it)=>{
      if(it?.costTotal!=null)return ss+toNum(it.costTotal);
      const qtyUnits=toNum(it?.qtyUnits||(it?.isPackage?toNum(it?.qty)*toNum(it?.packageQty||1):toNum(it?.qty)));
      const savedCost=toNum(it?.buyPrice??it?.costPrice);
      const productCost=toNum(products.find(p=>p.id===it?.id)?.buyPrice);
      return ss+((savedCost||productCost)*qtyUnits);
    },0);
  };
  const cogs=fSales.reduce((s,inv)=>s+calcCogs(inv),0);
  const grossProfit   = netRevenue - cogs;

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
        desc: `خصم فاتورة بيع رقم ${inv.invoiceNo || key}`,
        cat: 'خسائر',
        amount: loss,
        dateISO: rowISO(inv),
        createdAt: inv.createdAt || null,
        source: 'derived_sale_discount',
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
        desc: `خصم سند ${v.type || ''} رقم ${v.voucherNo || key}`,
        cat: 'خسائر',
        amount: loss,
        dateISO: rowISO(v),
        createdAt: v.createdAt || null,
        source: 'derived_voucher_discount',
      };
    })
    .filter(Boolean);

  const allExpenses = [...fExpenses, ...derivedSaleLossExpenses, ...derivedVoucherLossExpenses];

  // المصاريف حسب التصنيف
  const expByCategory = {};
  allExpenses.forEach(e=>{ const c=e.cat||'أخرى'; expByCategory[c]=(expByCategory[c]||0)+toNum(e.amount); });
  const totalExpenses = allExpenses.reduce((s,e)=>s+toNum(e.amount),0);
  const netProfit     = grossProfit - totalExpenses;
  const grossMargin   = netRevenue>0?(grossProfit/netRevenue*100).toFixed(1):0;
  const netMargin     = netRevenue>0?(netProfit/netRevenue*100).toFixed(1):0;

  const print=()=>{
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(16);doc2.text('Adwaa Al-Madina',105,15,{align:'center'});
    doc2.setFontSize(13);doc2.text('PROFIT & LOSS STATEMENT',105,23,{align:'center'});
    doc2.setFontSize(10);doc2.setFont('helvetica','normal');
    doc2.text(`Period: ${dateFrom||'All time'} — ${dateTo||'Present'}`,105,30,{align:'center'});
    doc2.line(14,33,196,33);
    let y=41;
    const sec=(title,color)=>{doc2.setFont('helvetica','bold');doc2.setFontSize(11);doc2.text(title,14,y);y+=2;doc2.line(14,y,196,y);y+=6;doc2.setFont('helvetica','normal');doc2.setFontSize(10);};
    const row=(l,v,bold=false,indent=false)=>{if(bold)doc2.setFont('helvetica','bold');else doc2.setFont('helvetica','normal');doc2.text((indent?'    ':'')+l,14,y);doc2.text(`${v.toLocaleString()} IQD`,196,y,{align:'right'});y+=6;};

    sec('REVENUES',0);
    row('Gross Sales Revenue',grossRevenue,false,true);
    row('Less: Sales Returns',salesReturns,false,true);
    row('NET REVENUE',netRevenue,true);
    y+=3;
    sec('COST OF GOODS SOLD');
    row('Cost of Goods Sold',cogs,false,true);
    row('GROSS PROFIT',grossProfit,true);
    y+=3;
    sec('OPERATING EXPENSES');
    Object.entries(expByCategory).forEach(([c,v])=>row(c,v,false,true));
    row('Total Expenses',totalExpenses,true);
    y+=5;doc2.line(14,y,196,y);y+=6;
    doc2.setFontSize(14);doc2.setFont('helvetica','bold');
    doc2.text('NET PROFIT',14,y);
    doc2.text(`${netProfit.toLocaleString()} IQD`,196,y,{align:'right'});y+=8;
    doc2.setFontSize(10);doc2.setFont('helvetica','normal');
    doc2.text(`Gross Margin: ${grossMargin}% | Net Margin: ${netMargin}%`,105,y,{align:'center'});
    doc2.save(`P&L-${dateFrom||'All'}.pdf`);
  };

  const line=(label,value,color='#1e293b',bold=false,indent=false,sub=null)=>(
    <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:`${bold?12:8}px ${indent?32:0}px`,borderBottom:`1px solid ${bold?'#d9e2f2':'#ffffff'}`}}>
      <span style={{color:bold?'#fff':'#64748b',fontSize:bold?14:13,fontWeight:bold?800:400,paddingRight:indent?16:0}}>{label}</span>
      <div style={{textAlign:'left'}}>
        <div style={{color,fontSize:bold?16:13,fontWeight:bold?900:600}}>{fmt(value)}</div>
        {sub&&<div style={{color:'#64748b',fontSize:10}}>{sub}</div>}
      </div>
    </div>
  );

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📊 قائمة الأرباح والخسائر</div>
        <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>🖨️ طباعة PDF</button>
      </div>

      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom(todayISO());setDateTo(todayISO());}}
          style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
        {/* القائمة المحاسبية */}
        <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
          {/* الإيرادات */}
          <div style={{padding:'14px 20px',background:'#10b98111',borderBottom:'1px solid #10b98133'}}>
            <span style={{color:'#10b981',fontSize:14,fontWeight:800}}>📥 الإيرادات</span>
          </div>
          <div style={{padding:'0 20px'}}>
            {line('إجمالي المبيعات',grossRevenue,'#10b981',false,true,`${fSales.length} فاتورة`)}
            {line('مردودات المبيعات',-salesReturns,'#ef4444',false,true,`${fReturns.length} إرجاع`)}
            {line('صافي الإيرادات',netRevenue,'#10b981',true)}
          </div>

          {/* تكلفة البضاعة */}
          <div style={{padding:'14px 20px',background:'#f59e0b11',borderBottom:'1px solid #f59e0b33',borderTop:'1px solid #d9e2f2'}}>
            <span style={{color:'#f59e0b',fontSize:14,fontWeight:800}}>📦 تكلفة البضاعة المباعة</span>
          </div>
          <div style={{padding:'0 20px'}}>
            {line('تكلفة البضاعة',cogs,'#f59e0b',false,true)}
            {line('مجمل الربح',grossProfit,grossProfit>=0?'#10b981':'#ef4444',true,false,`هامش ${grossMargin}%`)}
          </div>

          {/* المصاريف */}
          <div style={{padding:'14px 20px',background:'#ef444411',borderBottom:'1px solid #ef444433',borderTop:'1px solid #d9e2f2'}}>
            <span style={{color:'#ef4444',fontSize:14,fontWeight:800}}>💸 المصاريف التشغيلية</span>
          </div>
          <div style={{padding:'0 20px'}}>
            {Object.entries(expByCategory).map(([cat,val])=>line(cat,val,'#ef4444',false,true))}
            {line('إجمالي المصاريف',totalExpenses,'#ef4444',true)}
          </div>

          {/* الصافي */}
          <div style={{padding:20,background:netProfit>=0?'#10b98111':'#ef444411',borderTop:`2px solid ${netProfit>=0?'#10b981':'#ef4444'}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{color:'#fff',fontSize:16,fontWeight:800}}>صافي الربح</span>
              <div style={{textAlign:'left'}}>
                <div style={{color:netProfit>=0?'#10b981':'#ef4444',fontSize:28,fontWeight:900}}>{fmt(netProfit)}</div>
                <div style={{color:'#64748b',fontSize:11}}>هامش صافي {netMargin}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* بطاقات الملخص */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {[
            {icon:'💰',label:'صافي الإيرادات',val:fmt(netRevenue),color:'#10b981'},
            {icon:'📦',label:'تكلفة البضاعة',val:fmt(cogs),color:'#f59e0b'},
            {icon:'📊',label:'مجمل الربح',val:fmt(grossProfit),sub:`هامش ${grossMargin}%`,color:grossProfit>=0?'#10b981':'#ef4444'},
            {icon:'💸',label:'إجمالي المصاريف',val:fmt(totalExpenses),color:'#ef4444'},
            {icon:'📈',label:'صافي الربح',val:fmt(netProfit),sub:`هامش ${netMargin}%`,color:netProfit>=0?'#10b981':'#ef4444'},
            {icon:'↩️',label:'مردودات البيع',val:fmt(salesReturns),color:'#a78bfa'},
          ].map(c=>(
            <div key={c.label} style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${c.color}33`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <span style={{fontSize:24}}>{c.icon}</span>
                <div>
                  <div style={{color:'#64748b',fontSize:11}}>{c.label}</div>
                  {c.sub&&<div style={{color:'#475569',fontSize:10}}>{c.sub}</div>}
                </div>
              </div>
              <div style={{color:c.color,fontSize:15,fontWeight:800}}>{c.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
