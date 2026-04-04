import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtIQD, toNum, getExchangeRate, getErrorMessage, nowAR, applyDebtDelta, readDebt } from '../utils/helpers';

const fmt    = fmtIQD;
const fmtUsd = n => `$${(Number(n || 0)).toFixed(2)}`;
const now    = nowAR;

export default function Customers({ user }) {
  const [customers, setCustomers] = useState([]);
  const [sales, setSales]         = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [selCustomer, setSelCustomer] = useState(null);
  const [search, setSearch]       = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState('IQD');
  const [payNote, setPayNote]     = useState('');
  const [editing, setEditing]     = useState(null);
  const empty = { name:'', phone:'', address:'', notes:'' };
  const [form, setForm]           = useState(empty);

  useEffect(() => {
    const u1 = onSnapshot(collection(db,'pos_customers'), s => setCustomers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2 = onSnapshot(collection(db,'pos_sales'),     s => setSales(s.docs.map(d=>({...d.data(),id:d.id}))));
    return () => { u1(); u2(); };
  }, []);

  const filtered = customers.filter(c => !search || c.name?.includes(search) || c.phone?.includes(search));

  const save = async () => {
    if (!form.name?.trim()) return alert('يرجى إدخال اسم الزبون');
    try {
      if (editing) {
        await updateDoc(doc(db, 'pos_customers', editing), { ...form, name: form.name.trim() });
      } else {
        const dup = customers.find(c => c.name.trim() === form.name.trim());
        if (dup) return alert(`يوجد زبون بنفس الاسم: "${dup.name}"`);
        await addDoc(collection(db, 'pos_customers'), {
          ...form, name: form.name.trim(),
          debt: 0, totalPurchases: 0,
          debtByCurrency: { IQD:0, USD:0 },
          totalPurchasesByCurrency: { IQD:0, USD:0 },
          createdAt: new Date().toISOString(),
        });
      }
      setForm(empty); setEditing(null); setShowForm(false);
    } catch (e) {
      console.error('[Customers.save]', e);
      alert('خطأ في الحفظ: ' + getErrorMessage(e));
    }
  };

  const del = async (id, name) => {
    if (!confirm(`هل أنت متأكد من حذف الزبون "${name}"؟\nسيتم حذف كل بياناته.`)) return;
    try {
      await deleteDoc(doc(db, 'pos_customers', id));
    } catch (e) {
      console.error('[Customers.del]', e);
      alert('خطأ في الحذف: ' + getErrorMessage(e));
    }
  };

  const payDebt = async () => {
    const amt = toNum(payAmount);
    if (!amt || amt <= 0) return alert('يرجى إدخال مبلغ سداد صحيح (أكبر من صفر)');
    if (!selCustomer) return;
    const exchangeRate = getExchangeRate();
    const currentDebt  = readDebt(selCustomer);
    if (amt > toNum(currentDebt[payCurrency])) {
      return alert(`المبلغ (${payCurrency === 'USD' ? '$' : ''}${amt}) أكبر من الدين الحالي (${payCurrency === 'USD' ? '$' : ''}${toNum(currentDebt[payCurrency]).toLocaleString()})`);
    }
    try {
      const nextDebt = applyDebtDelta(currentDebt, payCurrency, -amt);
      const amtIQD   = payCurrency === 'USD' ? amt * exchangeRate : amt;
      const newDebt  = Math.max(0, toNum(selCustomer.debt) - amtIQD);
      await updateDoc(doc(db, 'pos_customers', selCustomer.id), { debt: newDebt, debtByCurrency: nextDebt });
      await addDoc(collection(db, 'pos_payments'), {
        customerId:   selCustomer.id,
        customerName: selCustomer.name,
        amount:       amt,
        currency:     payCurrency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي',
        note:         payNote,
        type:         'سداد دين',
        date:         now(),
        createdAt:    new Date().toISOString(),
        addedBy:      user?.name || '',
      });
      setSelCustomer(c => ({ ...c, debt: newDebt, debtByCurrency: nextDebt }));
      setPayAmount('');
      setPayNote('');
      alert('✅ تم تسجيل السداد بنجاح');
    } catch (e) {
      console.error('[Customers.payDebt]', e);
      alert('خطأ في تسجيل السداد: ' + getErrorMessage(e));
    }
  };

  const customerSales = selCustomer ? sales.filter(s => s.customer === selCustomer.name) : [];
  const customerDebtIQD = toNum(selCustomer?.debtByCurrency?.IQD ?? selCustomer?.debt ?? 0);
  const customerDebtUSD = toNum(selCustomer?.debtByCurrency?.USD ?? 0);
  const suggestedCollectIQD = Math.round(customerDebtIQD * 0.5);
  const suggestedCollectUSD = Number((customerDebtUSD * 0.5).toFixed(2));
  const totalDebt = customers.reduce((s,c) => s+(c.debt||0), 0);
  const totalDebtUSD = customers.reduce((s,c) => s+toNum(c?.debtByCurrency?.USD ?? 0), 0);
  const collectPlan = [...customers]
    .map((c) => {
      const iqd = toNum(c?.debtByCurrency?.IQD ?? c?.debt ?? 0);
      const usd = toNum(c?.debtByCurrency?.USD ?? 0);
      const score = iqd + usd * 1480;
      return {
        ...c,
        iqd,
        usd,
        score,
        collectIqd: Math.round(iqd * 0.5),
        collectUsd: Number((usd * 0.5).toFixed(2)),
      };
    })
    .filter((c) => c.iqd > 0 || c.usd > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // تفاصيل الزبون
  if (selCustomer) return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={()=>setSelCustomer(null)}
          style={{ background:'#ffffff', border:'1px solid #cdd8ec', borderRadius:10, padding:'8px 16px', color:'#F5C800', cursor:'pointer', fontFamily:"'Cairo'" }}>← رجوع</button>
        <div style={{ color:'#fff', fontSize:20, fontWeight:800 }}>{selCustomer.name}</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:20 }}>
        {/* معلومات الزبون */}
        <div>
          <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', marginBottom:16 }}>
            <div style={{ color:'#F5C800', fontSize:16, fontWeight:800, marginBottom:16 }}>معلومات الزبون</div>
            {[['📞 الهاتف',selCustomer.phone||'—'],['📍 العنوان',selCustomer.address||'—'],['📝 ملاحظات',selCustomer.notes||'—']].map(([l,v])=>(
              <div key={l} style={{ display:'flex', gap:10, marginBottom:10 }}>
                <span style={{ color:'#64748b', fontSize:13, minWidth:90 }}>{l}</span>
                <span style={{ color:'#1e293b', fontSize:13 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* خطة تحصيل ذكية لهذا الزبون */}
          {(customerDebtIQD > 0 || customerDebtUSD > 0) && (
            <div style={{ background:'#ffffff', borderRadius:16, padding:16, border:'1px solid #3b82f633', marginBottom:16 }}>
              <div style={{ color:'#3b82f6', fontSize:14, fontWeight:800, marginBottom:10 }}>🤖 خطة تحصيل ذكية</div>
              <div style={{ color:'#475569', fontSize:12, lineHeight:1.9 }}>
                الأولوية: {customerDebtIQD > 200000 || customerDebtUSD > 200 ? 'عالية' : customerDebtIQD > 50000 || customerDebtUSD > 50 ? 'متوسطة' : 'منخفضة'}
              </div>
              <div style={{ color:'#475569', fontSize:12, lineHeight:1.9 }}>
                المبلغ المقترح للتحصيل الآن: {fmt(suggestedCollectIQD)}{suggestedCollectUSD ? ` + ${fmtUsd(suggestedCollectUSD)}` : ''}
              </div>
              <div style={{ color:'#64748b', fontSize:11, marginTop:4 }}>المقترح محسوب تلقائياً بنسبة 50% كدفعة أولى مرنة.</div>
            </div>
          )}

          {/* الإحصائيات */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              ['💰','إجمالي المشتريات',fmt(customerSales.reduce((s,i)=>s+(i.total||0),0)),'#10b981'],
              ['🧾','عدد الفواتير',customerSales.length,'#3b82f6'],
              ['⚠️','الدين الحالي IQD',fmt(selCustomer.debt||0),'#ef4444'],
              ['💵','الدين الحالي USD',fmtUsd(selCustomer?.debtByCurrency?.USD||0),'#3b82f6'],
            ].map(([icon,label,val,color])=>(
              <div key={label} style={{ background:'#ffffff', borderRadius:12, padding:14, border:'1px solid #d9e2f2', textAlign:'center' }}>
                <div style={{ fontSize:24, marginBottom:4 }}>{icon}</div>
                <div style={{ color:'#64748b', fontSize:11, marginBottom:4 }}>{label}</div>
                <div style={{ color:color, fontSize:16, fontWeight:800 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* تسجيل سداد */}
          {(toNum(selCustomer?.debtByCurrency?.IQD ?? selCustomer?.debt ?? 0) > 0 || toNum(selCustomer?.debtByCurrency?.USD) > 0) && (
            <div style={{ background:'#ffffff', borderRadius:16, padding:16, border:'1px solid #ef444433' }}>
              <div style={{ color:'#ef4444', fontSize:14, fontWeight:700, marginBottom:12 }}>💳 تسجيل سداد</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:8,padding:'6px 8px',fontSize:11,color:'#64748b'}}>
                  IQD: <b style={{color:'#ef4444'}}>{fmt(selCustomer?.debtByCurrency?.IQD ?? selCustomer?.debt ?? 0)}</b>
                </div>
                <div style={{background:'#f8fbff',border:'1px solid #d9e2f2',borderRadius:8,padding:'6px 8px',fontSize:11,color:'#64748b'}}>
                  USD: <b style={{color:'#3b82f6'}}>{fmtUsd(selCustomer?.debtByCurrency?.USD || 0)}</b>
                </div>
              </div>
              <select value={payCurrency} onChange={e=>setPayCurrency(e.target.value)}
                style={{ width:'100%', color:'#0f172a', outline:'none', marginBottom:8, boxSizing:'border-box' }}>
                <option value="IQD">دينار عراقي</option>
                <option value="USD">دولار أمريكي</option>
              </select>
              <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)}
                placeholder="المبلغ المسدّد"
                style={{ width:'100%', color:'#0f172a', outline:'none', marginBottom:8, boxSizing:'border-box' }}/>
              <input value={payNote} onChange={e=>setPayNote(e.target.value)}
                placeholder="ملاحظة (اختياري)"
                style={{ width:'100%', color:'#0f172a', outline:'none', marginBottom:10, boxSizing:'border-box' }}/>
              <button onClick={payDebt}
                style={{ width:'100%', background:'#10b981', color:'#fff', border:'none', borderRadius:10, padding:12, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'" }}>
                ✅ تسجيل السداد
              </button>
            </div>
          )}
        </div>

        {/* سجل المشتريات */}
        <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #d9e2f2', overflow:'hidden' }}>
          <div style={{ color:'#fff', fontSize:15, fontWeight:700, padding:'16px 20px', borderBottom:'1px solid #d9e2f2' }}>🧾 سجل المشتريات</div>
          {customerSales.length === 0
            ? <div style={{ color:'#cdd8ec', textAlign:'center', padding:60 }}>لا توجد مشتريات</div>
            : customerSales.map((s,i) => (
              <div key={s.id} style={{ padding:'12px 20px', borderBottom:i<customerSales.length-1?'1px solid #ffffff':'none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ color:'#F5C800', fontSize:13, fontWeight:700 }}>#{s.invoiceNo}</span>
                  <span style={{ color:'#10b981', fontSize:14, fontWeight:800 }}>{fmt(s.total)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#64748b', fontSize:11 }}>{s.date}</span>
                  <span style={{ background:s.paymentMethod==='آجل'?'#ef444422':'#10b98122', border:`1px solid ${s.paymentMethod==='آجل'?'#ef444444':'#10b98144'}`, borderRadius:20, padding:'1px 8px', color:s.paymentMethod==='آجل'?'#ef4444':'#10b981', fontSize:10 }}>{s.paymentMethod}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>إدارة الزبائن</div>
          <div style={{ color:'#64748b', fontSize:13 }}>{customers.length} زبون</div>
        </div>
        <button onClick={()=>{setForm(empty);setEditing(null);setShowForm(true);}}
          style={{ background:'#F5C800', color:'#000', border:'none', borderRadius:12, padding:'10px 20px', fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'", fontSize:14 }}>
          + إضافة زبون
        </button>
      </div>

      {/* ملخص */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[['👥','إجمالي الزبائن',customers.length,'#3b82f6'],['⚠️','ديون IQD',fmt(totalDebt),'#ef4444'],['💵','ديون USD',fmtUsd(totalDebtUSD),'#3b82f6'],['✅','بدون ديون',customers.filter(c=>!toNum(c.debtByCurrency?.IQD??c.debt??0)&&!toNum(c.debtByCurrency?.USD)).length,'#10b981']].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>{icon}</div>
            <div style={{ color:'#64748b', fontSize:12, marginBottom:6 }}>{label}</div>
            <div style={{ color, fontSize:20, fontWeight:800 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* خطة التحصيل الذكية */}
      <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #3b82f633', padding:16, marginBottom:16 }}>
        <div style={{ color:'#3b82f6', fontSize:15, fontWeight:800, marginBottom:10 }}>🤖 خطة تحصيل ديون ذكية (حسب الأولوية)</div>
        {collectPlan.length === 0
          ? <div style={{ color:'#94a3b8', fontSize:12 }}>لا توجد ديون مفتوحة حالياً.</div>
          : (
            <div style={{ display:'grid', gap:8 }}>
              {collectPlan.map((c, i) => (
                <div key={c.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 1fr 1fr', gap:8, alignItems:'center', background:'#f8fbff', border:'1px solid #d9e2f2', borderRadius:10, padding:'8px 10px' }}>
                  <div style={{ color:'#3b82f6', fontSize:13, fontWeight:900 }}>{i + 1}</div>
                  <div style={{ color:'#1e293b', fontSize:12, fontWeight:700 }}>{c.name}</div>
                  <div style={{ color:'#ef4444', fontSize:12 }}>المديونية: {fmt(c.iqd)}{c.usd ? ` + ${fmtUsd(c.usd)}` : ''}</div>
                  <div style={{ color:'#10b981', fontSize:12, fontWeight:700 }}>المقترح: {fmt(c.collectIqd)}{c.collectUsd ? ` + ${fmtUsd(c.collectUsd)}` : ''}</div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* نموذج الإضافة */}
      {showForm && (
        <div style={{ background:'#ffffff', borderRadius:16, padding:24, border:'1px solid #F5C80033', marginBottom:20 }}>
          <div style={{ color:'#F5C800', fontSize:16, fontWeight:800, marginBottom:20 }}>{editing?'✏️ تعديل زبون':'➕ إضافة زبون'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
            {[['اسم الزبون *','name'],['رقم الهاتف','phone'],['العنوان','address'],['ملاحظات','notes']].map(([lb,k])=>(
              <div key={k}>
                <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>{lb}</label>
                <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box' }}/>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button onClick={()=>{setShowForm(false);setForm(empty);setEditing(null);}}
              style={{ flex:1, background:'#f8fbff', border:'1px solid #cdd8ec', borderRadius:12, padding:12, color:'#64748b', cursor:'pointer', fontFamily:"'Cairo'" }}>إلغاء</button>
            <button onClick={save}
              style={{ flex:2, background:'linear-gradient(135deg,#F5C800,#d4a800)', color:'#000', border:'none', borderRadius:12, padding:12, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'" }}>
              {editing?'💾 حفظ':'✅ إضافة'}
            </button>
          </div>
        </div>
      )}

      {/* بحث */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الهاتف..."
        style={{ width:'100%', color:'#0f172a', fontSize:13, outline:'none', marginBottom:16, boxSizing:'border-box' }}/>

      {/* قائمة الزبائن */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        {filtered.length === 0
          ? <div style={{ gridColumn:'1/-1', color:'#cdd8ec', textAlign:'center', padding:60 }}>لا يوجد زبائن</div>
          : filtered.map(c => (
            <div key={c.id} style={{ background:'#ffffff', borderRadius:16, border:`1px solid ${(toNum(c.debtByCurrency?.IQD??c.debt??0)>0 || toNum(c.debtByCurrency?.USD)>0)?'#ef444433':'#d9e2f2'}`, overflow:'hidden' }}>
              <div style={{ padding:16, cursor:'pointer' }} onClick={()=>setSelCustomer(c)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:'#F5C80022', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👤</div>
                    <div>
                      <div style={{ color:'#1e293b', fontSize:14, fontWeight:700 }}>{c.name}</div>
                      <div style={{ color:'#64748b', fontSize:11 }}>{c.phone||'—'}</div>
                    </div>
                  </div>
                  {(toNum(c.debtByCurrency?.IQD??c.debt??0)>0 || toNum(c.debtByCurrency?.USD)>0) && (
                    <div style={{ background:'#ef444422', border:'1px solid #ef444444', borderRadius:10, padding:'4px 10px', textAlign:'center' }}>
                      <div style={{ color:'#ef4444', fontSize:10 }}>دين</div>
                      <div style={{ color:'#ef4444', fontSize:11, fontWeight:800 }}>{fmt(c.debtByCurrency?.IQD??c.debt??0)}</div>
                      <div style={{ color:'#3b82f6', fontSize:11, fontWeight:800 }}>{fmtUsd(c.debtByCurrency?.USD||0)}</div>
                    </div>
                  )}
                </div>
                {c.address && <div style={{ color:'#475569', fontSize:11 }}>📍 {c.address}</div>}
              </div>
              <div style={{ display:'flex', borderTop:'1px solid #e2e8f7' }}>
                <button onClick={()=>setSelCustomer(c)}
                  style={{ flex:1, background:'none', border:'none', borderLeft:'1px solid #e2e8f7', padding:'9px', color:'#F5C800', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'" }}>👁️ عرض</button>
                <button onClick={()=>{setForm({name:c.name,phone:c.phone||'',address:c.address||'',notes:c.notes||''});setEditing(c.id);setShowForm(true);}}
                  style={{ flex:1, background:'none', border:'none', borderLeft:'1px solid #e2e8f7', padding:'9px', color:'#3b82f6', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'" }}>✏️ تعديل</button>
                {user.role==='مدير' && <button onClick={()=>del(c.id,c.name)}
                  style={{ flex:1, background:'none', border:'none', padding:'9px', color:'#ef4444', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Cairo'" }}>🗑️ حذف</button>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
