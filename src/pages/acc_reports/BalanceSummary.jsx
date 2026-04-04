import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
const fmt=n=>(n||0).toLocaleString('ar-IQ')+' د.ع';
const normalizeCurrencyCode = (currency) => (currency === 'USD' || currency === 'دولار أمريكي' ? 'USD' : 'IQD');
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
  return { iqd: code === 'IQD' ? amount : 0, usd: code === 'USD' ? amount : 0 };
};
const voucherAmountIQD = (voucher = {}, fallbackRate = 1480) => {
  if (voucher?.amountIQD != null) return Number(voucher.amountIQD || 0);
  const { iqd, usd } = readVoucherEntryAmounts(voucher);
  const rate = Number(voucher?.exchangeRate || fallbackRate || 1480) || 1480;
  return iqd + usd * rate;
};
export default function BalanceSummary({user}){
  const [customers,setCustomers]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [sales,    setSales]    =useState([]);
  const [purchases,setPurchases]=useState([]);
  const [vouchers, setVouchers] =useState([]);
  const [expenses, setExpenses] =useState([]);
  const [products, setProducts] =useState([]);
  useEffect(()=>{
    const us=[
      onSnapshot(collection(db,'pos_customers'),s=>setCustomers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_suppliers'),s=>setSuppliers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_sales'),    s=>setSales(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_purchases'),s=>setPurchases(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_vouchers'), s=>setVouchers(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_expenses'), s=>setExpenses(s.docs.map(d=>({...d.data(),id:d.id})))),
      onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id})))),
    ];
    return()=>us.forEach(u=>u());
  },[]);
  const totalRevenue =sales.reduce((s,i)=>s+(i.total||0),0);
  const totalPurchases=purchases.reduce((s,p)=>s+(p.total||0),0);
  const totalExpenses=expenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalVouchIn =vouchers.filter(v=>v.type==='قبض').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const totalVouchOut=vouchers.filter(v=>v.type==='دفع'||v.type==='صرف').reduce((s,v)=>s+voucherAmountIQD(v),0);
  const custDebt     =customers.reduce((s,c)=>s+(c.debt||0),0);
  const suppDebt     =suppliers.reduce((s,s2)=>s+(s2.debt||0),0);
  const invValue     =products.reduce((s,p)=>s+(p.stock||0)*(p.buyPrice||0),0);
  const invSellValue =products.reduce((s,p)=>s+(p.stock||0)*(p.sellPrice||0),0);
  const cogs=sales.reduce((s,inv)=>s+(inv.items||[]).reduce((ss,it)=>{ const p=products.find(p=>p.id===it.id); return ss+(p?.buyPrice||0)*it.qty; },0),0);
  const netProfit=totalRevenue-cogs-totalExpenses;
  const cards=[
    {icon:'💰',label:'إجمالي الإيرادات',val:totalRevenue,color:'#10b981',desc:'مجموع فواتير البيع'},
    {icon:'🛍️',label:'إجمالي المشتريات',val:totalPurchases,color:'#f59e0b',desc:'مجموع فواتير الشراء'},
    {icon:'💸',label:'إجمالي المصروفات',val:totalExpenses,color:'#ef4444',desc:'جميع المصروفات'},
    {icon:'📈',label:'صافي الربح',val:netProfit,color:netProfit>=0?'#10b981':'#ef4444',desc:`هامش ${totalRevenue>0?((netProfit/totalRevenue)*100).toFixed(1):0}%`},
    {icon:'👥',label:'ديون الزبائن',val:custDebt,color:'#ef4444',desc:`${customers.filter(c=>c.debt>0).length} زبون مدين`},
    {icon:'🏭',label:'ديون الموردين',val:suppDebt,color:'#f59e0b',desc:`${suppliers.filter(s=>s.debt>0).length} مورد مدين`},
    {icon:'📦',label:'قيمة المخزون (شراء)',val:invValue,color:'#3b82f6',desc:`${products.length} صنف`},
    {icon:'📦',label:'قيمة المخزون (بيع)',val:invSellValue,color:'#a78bfa',desc:`ربح محتمل ${fmt(invSellValue-invValue)}`},
    {icon:'📥',label:'إجمالي السندات الواردة',val:totalVouchIn,color:'#10b981',desc:'سندات القبض'},
    {icon:'📤',label:'إجمالي السندات الصادرة',val:totalVouchOut,color:'#ef4444',desc:'سندات الدفع والصرف'},
  ];
  const pieData=[{name:'إيرادات',value:totalRevenue},{name:'تكلفة',value:cogs},{name:'مصروفات',value:totalExpenses},{name:'ربح',value:Math.max(0,netProfit)}];
  const COLORS=['#10b981','#ef4444','#f59e0b','#F5C800'];
  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:20}}>💰 ملخص الأرصدة العام</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:14,marginBottom:24}}>
        {cards.map((c,i)=>(
          <div key={i} style={{background:'#ffffff',borderRadius:16,padding:18,border:`1px solid ${c.color}33`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{color:'#64748b',fontSize:12,marginBottom:4}}>{c.icon} {c.label}</div>
              <div style={{color:c.color,fontSize:20,fontWeight:900}}>{fmt(c.val)}</div>
              <div style={{color:'#475569',fontSize:10,marginTop:4}}>{c.desc}</div>
            </div>
            <div style={{width:48,height:48,borderRadius:12,background:`${c.color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>{c.icon}</div>
          </div>
        ))}
      </div>
      <div style={{background:'#ffffff',borderRadius:16,padding:20,border:'1px solid #d9e2f2'}}>
        <div style={{color:'#fff',fontSize:14,fontWeight:700,marginBottom:14}}>توزيع الإيرادات</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
              {pieData.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}
            </Pie>
            <Tooltip formatter={v=>fmt(v)} contentStyle={{color:'#0f172a'}}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
