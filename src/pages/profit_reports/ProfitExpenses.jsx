import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
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

export default function ProfitExpenses({ user }) {
  const [sales,    setSales]    = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo,   setDateTo]   = useState(todayISO());
  const [groupBy,  setGroupBy]  = useState('day'); // day | week | month

  useEffect(()=>{
    if (hasLocalApi()) {
      let alive = true;
      const loadLocal = async () => {
        const [salesRows, vouchersRows, expensesRows, productsRows] = await Promise.all([
          localStoreList('pos_sales'),
          localStoreList('pos_vouchers'),
          localStoreList('pos_expenses'),
          localStoreList('pos_products'),
        ]);
        if (!alive) return;
        setSales(salesRows || []);
        setVouchers(vouchersRows || []);
        setExpenses(expensesRows || []);
        setProducts(productsRows || []);
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
    ];
    return()=>us.forEach(u=>u());
  },[]);

  const inRange = d=>{ if(!d)return true; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; };
  const fSales    = sales.filter(s=>inRange(rowISO(s)));
  const fVouchers = vouchers.filter(v=>inRange(rowISO(v)));
  const fExpenses = expenses.filter(e=>inRange(rowISO(e)));

  const calcCOGS = inv=>(inv.items||[]).reduce((s,it)=>{
    const p=products.find(p=>p.id===it.id);
    return s + toNum(p?.buyPrice) * toNum(it?.qty);
  },0);
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

  // تعويض للبيانات القديمة: خصومات غير مرحّلة لمصروفات فعلية.
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
        date: rowISO(inv),
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
        date: rowISO(v),
        createdAt: v.createdAt || null,
        source: 'derived_voucher_discount',
      };
    })
    .filter(Boolean);

  const allExpenses = [...fExpenses, ...derivedSaleLossExpenses, ...derivedVoucherLossExpenses];

  const totalRevenue  = fSales.reduce((s,i)=>s+toNum(i.total),0);
  const totalCOGS     = fSales.reduce((s,i)=>s+calcCOGS(i),0);
  const grossProfit   = totalRevenue - totalCOGS;
  const totalExpenses = allExpenses.reduce((s,e)=>s+toNum(e.amount),0);
  const netProfit     = grossProfit - totalExpenses;
  const margin        = totalRevenue>0?((netProfit/totalRevenue)*100).toFixed(1):0;
  const grossMargin   = totalRevenue>0?((grossProfit/totalRevenue)*100).toFixed(1):0;

  // تجميع المصاريف حسب التصنيف
  const expByCategory = {};
  allExpenses.forEach(e=>{
    const cat=e.cat||'أخرى';
    expByCategory[cat]=(expByCategory[cat]||0)+toNum(e.amount);
  });
  const expCatData = Object.entries(expByCategory).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  // بيانات الرسم البياني (آخر 30 يوم)
  const chartData = Array.from({length:30},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()-i);
    const ds=d.toISOString().split('T')[0];
    const label=d.toLocaleDateString('ar-IQ',{month:'short',day:'numeric'});
    const rev=sales.filter(s=>rowISO(s)===ds).reduce((s,i)=>s+toNum(i.total),0);
    const cogs=sales.filter(s=>rowISO(s)===ds).reduce((s,i)=>s+calcCOGS(i),0);
    const exp=allExpenses.filter(e=>rowISO(e)===ds).reduce((s,e)=>s+toNum(e.amount),0);
    return{name:label,إيرادات:rev,تكلفة:cogs,مصاريف:exp,ربحصافي:rev-cogs-exp};
  }).reverse();

  const print=()=>{
    const doc2=new jsPDF({orientation:'p',unit:'mm',format:'a4'});
    doc2.setFont('helvetica','bold');
    doc2.setFontSize(16);doc2.text('Adwaa Al-Madina — Profit & Expenses',105,15,{align:'center'});
    doc2.setFontSize(10);doc2.setFont('helvetica','normal');
    doc2.text(`Period: ${dateFrom||'All'} — ${dateTo||'All'}`,14,25);
    doc2.line(14,28,196,28);
    let y=36;
    [['Total Revenue',totalRevenue],['Cost of Goods Sold',totalCOGS],['Gross Profit',grossProfit],['Total Expenses',totalExpenses],['NET PROFIT',netProfit]].forEach(([l,v])=>{
      if(l==='NET PROFIT'||l==='Gross Profit')doc2.setFont('helvetica','bold');else doc2.setFont('helvetica','normal');
      doc2.text(l,14,y);doc2.text(`${v.toLocaleString()} IQD`,196,y,{align:'right'});y+=7;
    });
    y+=5;doc2.setFont('helvetica','bold');
    doc2.text(`Gross Margin: ${grossMargin}% | Net Margin: ${margin}%`,105,y,{align:'center'});
    if(expCatData.length>0){y+=10;doc2.text('EXPENSES BY CATEGORY:',14,y);y+=5;
      expCatData.forEach(e=>{doc2.setFont('helvetica','normal');doc2.text(e.name,14,y);doc2.text(`${e.value.toLocaleString()} IQD`,196,y,{align:'right'});y+=6;});
    }
    doc2.save(`Profit-Expenses-${dateFrom||'All'}.pdf`);
  };

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{color:'#fff',fontSize:22,fontWeight:800}}>💰 الأرباح والمصاريف</div>
        <button onClick={print} style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontFamily:"'Cairo'",fontSize:13}}>🖨️ طباعة PDF</button>
      </div>

      {/* فلتر */}
      <div style={{display:'flex',gap:14,marginBottom:20,background:'#ffffff',borderRadius:14,padding:16,border:'1px solid #d9e2f2',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#64748b',fontSize:13}}>الفترة:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <span style={{color:'#64748b'}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{color:'#0f172a',outline:'none'}}/>
        <button onClick={()=>{setDateFrom(todayISO());setDateTo(todayISO());}}
          style={{background:'#d9e2f2',border:'none',borderRadius:10,padding:'8px 14px',color:'#64748b',cursor:'pointer',fontFamily:"'Cairo'"}}>إعادة</button>
        <div style={{color:'#F5C800',fontSize:13,fontWeight:700,marginRight:'auto'}}>{fSales.length} فاتورة</div>
      </div>

      {/* البطاقات */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[
          ['📥','إجمالي الإيرادات',fmt(totalRevenue),'#10b981'],
          ['📦','تكلفة البضاعة',fmt(totalCOGS),'#f59e0b'],
          ['📈','مجمل الربح',fmt(grossProfit),grossProfit>=0?'#10b981':'#ef4444'],
          ['💸','إجمالي المصاريف',fmt(totalExpenses),'#ef4444'],
          ['💰','صافي الربح',fmt(netProfit),netProfit>=0?'#10b981':'#ef4444'],
          ['📊','هامش الربح الصافي',`${margin}%`,Number(margin)>=20?'#10b981':Number(margin)>=10?'#F5C800':'#ef4444'],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{background:'#ffffff',borderRadius:14,padding:18,border:`1px solid ${color}33`,textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:6}}>{label}</div>
            <div style={{color,fontSize:20,fontWeight:900}}>{val}</div>
          </div>
        ))}
      </div>

      {/* تحليل الهوامش */}
      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #F5C80033',marginBottom:24}}>
        <div style={{color:'#F5C800',fontSize:14,fontWeight:800,marginBottom:14}}>تحليل الهوامش</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          {[['هامش الربح الإجمالي',grossMargin,'#10b981','الإيرادات - تكلفة البضاعة'],['هامش الربح الصافي',margin,'#F5C800','بعد خصم كل المصاريف']].map(([l,v,c,sub])=>(
            <div key={l} style={{background:'#f8fbff',borderRadius:12,padding:16}}>
              <div style={{color:'#64748b',fontSize:12,marginBottom:6}}>{l}</div>
              <div style={{color:c,fontSize:28,fontWeight:900,marginBottom:4}}>{v}%</div>
              <div style={{color:'#475569',fontSize:10}}>{sub}</div>
              <div style={{height:6,background:'#d9e2f2',borderRadius:3,marginTop:10,overflow:'hidden'}}>
                <div style={{width:`${Math.min(100,Math.abs(Number(v)))}%`,height:'100%',background:c,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,marginBottom:24}}>
        {/* رسم بياني */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:16}}>الأرباح والمصاريف — آخر 30 يوم</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:9}}/>
              <YAxis tick={{fill:'#64748b',fontSize:9}}/>
              <Tooltip contentStyle={{color:'#0f172a'}}/>
              <Legend/>
              <Line type="monotone" dataKey="إيرادات" stroke="#10b981" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="مصاريف"  stroke="#ef4444" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="ربحصافي" stroke="#F5C800" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* المصاريف حسب التصنيف */}
        <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>💸 المصاريف حسب التصنيف</div>
          {expCatData.length===0
            ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد مصاريف</div>
            :expCatData.map((e,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#1e293b',fontSize:12}}>{e.name}</span>
                  <span style={{color:'#ef4444',fontSize:12,fontWeight:700}}>{fmt(e.value)}</span>
                </div>
                <div style={{height:4,background:'#d9e2f2',borderRadius:2,overflow:'hidden'}}>
                  <div style={{width:`${totalExpenses>0?(e.value/totalExpenses*100):0}%`,height:'100%',background:'#ef4444',borderRadius:2}}/>
                </div>
                <div style={{color:'#475569',fontSize:10,marginTop:2}}>{totalExpenses>0?((e.value/totalExpenses)*100).toFixed(1):0}%</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* جدول المصاريف */}
      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid #d9e2f2',color:'#fff',fontSize:14,fontWeight:700}}>
          سجل المصاريف ({fExpenses.length})
        </div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',padding:'10px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['الوصف','التصنيف','المبلغ','التاريخ'].map(h=><div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>)}
        </div>
        {fExpenses.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:40}}>لا توجد مصاريف في هذه الفترة</div>
          :[...allExpenses].sort((a,b)=>new Date(b.createdAt||b.dateISO||0)-new Date(a.createdAt||a.dateISO||0)).map((e,i)=>(
            <div key={e.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',padding:'10px 20px',borderBottom:i<allExpenses.length-1?'1px solid #ffffff':'none',alignItems:'center'}}>
              <div style={{color:'#1e293b',fontSize:13}}>{e.desc}</div>
              <span style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:20,padding:'2px 8px',color:'#ef4444',fontSize:10,display:'inline-block'}}>{e.cat||'أخرى'}</span>
              <div style={{color:'#ef4444',fontSize:13,fontWeight:700}}>{fmt(e.amount)}</div>
              <div style={{color:'#64748b',fontSize:11}}>{rowISO(e) || e.date || '—'}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
