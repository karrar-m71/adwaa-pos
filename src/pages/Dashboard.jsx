import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { sendWhatsAppText, explainWhatsAppError, readAppSettings } from '../utils/invoiceSharing';
import { fmtIQD, toNum, todayISO, toISO, getExchangeRate } from '../utils/helpers';

const fmt = fmtIQD;

const saleISO  = (sale) => sale?.dateISO || toISO(sale?.createdAt);
const expISO   = (exp)  => exp?.dateISO  || toISO(exp?.createdAt);

const calcSaleCost = (inv, products) => {
  if (inv?.cogs != null) return toNum(inv.cogs);
  return (inv?.items || []).reduce((sum, it) => {
    if (it?.costTotal != null) return sum + toNum(it.costTotal);
    const qtyUnits = toNum(it?.qtyUnits || (it?.isPackage ? toNum(it?.qty) * toNum(it?.packageQty || 1) : toNum(it?.qty)));
    const savedCost = toNum(it?.buyPrice ?? it?.costPrice);
    const productCost = toNum(products.find((p) => p.id === it?.id)?.buyPrice);
    return sum + ((savedCost || productCost) * qtyUnits);
  }, 0);
};

export default function Dashboard({ user }) {
  const [sales,     setSales]     = useState([]);
  const [products,  setProducts]  = useState([]);
  const [expenses,  setExpenses]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [waSending, setWaSending] = useState(false);

  // اشتراكات Firebase — محدودة بآخر 500 سجل للمبيعات لتحسين الأداء
  useEffect(() => {
    const salesQ = query(collection(db, 'pos_sales'), orderBy('createdAt', 'desc'), limit(500));
    const u1 = onSnapshot(salesQ, s => setSales(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(collection(db, 'pos_products'),  s => setProducts(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u3 = onSnapshot(collection(db, 'pos_expenses'),  s => setExpenses(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u4 = onSnapshot(collection(db, 'pos_customers'), s => setCustomers(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // قراءة الإعدادات مرة واحدة
  const settings = useMemo(() => readAppSettings(), []);
  const exchangeRate = useMemo(() => getExchangeRate(), []);
  const todayStr = useMemo(() => new Date().toLocaleDateString('ar-IQ'), []);
  const currentISO = useMemo(() => todayISO(), []);

  // ── حسابات اليوم ──────────────────────────────────────────────────────
  const todaySales = useMemo(
    () => sales.filter(s => saleISO(s) === currentISO),
    [sales, currentISO]
  );

  const totalRevenue = useMemo(
    () => todaySales.reduce((s, i) => s + toNum(i.total), 0),
    [todaySales]
  );

  const totalCogs = useMemo(
    () => todaySales.reduce((s, inv) => s + calcSaleCost(inv, products), 0),
    [todaySales, products]
  );

  const totalExpenses = useMemo(
    () => expenses.filter(e => expISO(e) === currentISO).reduce((s, i) => s + toNum(i.amount), 0),
    [expenses, currentISO]
  );

  const profit = useMemo(
    () => totalRevenue - totalCogs - totalExpenses,
    [totalRevenue, totalCogs, totalExpenses]
  );

  const lowStock = useMemo(
    () => products.filter(p => toNum(p.stock) <= toNum(p.minStock || 5)),
    [products]
  );

  // ── رسم بياني: آخر 7 أيام ─────────────────────────────────────────────
  const last7 = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label  = d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
      const dayISO = d.toISOString().split('T')[0];
      const dayTotal = sales
        .filter(s => saleISO(s) === dayISO)
        .reduce((s2, i2) => s2 + toNum(i2.total), 0);
      return { name: label, مبيعات: dayTotal };
    }).reverse()
  ), [sales]);

  // ── ذمم الزبائن ───────────────────────────────────────────────────────
  const { totalDebtIQD, totalDebtUSD, topDebtors } = useMemo(() => {
    let iqd = 0, usd = 0;
    const withDebt = customers.map(c => {
      const cIQD = toNum(c?.debtByCurrency?.IQD ?? c?.debt ?? 0);
      const cUSD = toNum(c?.debtByCurrency?.USD ?? 0);
      iqd += cIQD;
      usd += cUSD;
      return { name: c.name, iqd: cIQD, usd: cUSD };
    }).filter(c => c.iqd > 0 || c.usd > 0)
      .sort((a, b) => (b.iqd + b.usd * exchangeRate) - (a.iqd + a.usd * exchangeRate))
      .slice(0, 3);
    return { totalDebtIQD: iqd, totalDebtUSD: usd, topDebtors: withDebt };
  }, [customers, exchangeRate]);

  // ── اتجاه الأسبوع ─────────────────────────────────────────────────────
  const { weekRevenue, weeklyTrendDown } = useMemo(() => {
    const d7  = new Date(); d7.setDate(d7.getDate() - 6);
    const d14 = new Date(); d14.setDate(d14.getDate() - 13);
    const d7e = new Date(); d7e.setDate(d7e.getDate() - 7);
    const w7  = d7.toISOString().split('T')[0];
    const w14 = d14.toISOString().split('T')[0];
    const w7e = d7e.toISOString().split('T')[0];
    const wRev  = sales.filter(s => saleISO(s) >= w7  && saleISO(s) <= currentISO).reduce((s, i) => s + toNum(i.total), 0);
    const pwRev = sales.filter(s => saleISO(s) >= w14 && saleISO(s) <= w7e).reduce((s, i) => s + toNum(i.total), 0);
    return { weekRevenue: wRev, weeklyTrendDown: pwRev > 0 && wRev < pwRev * 0.8 };
  }, [sales, currentISO]);

  const topProducts = useMemo(
    () => [...products].sort((a, b) => toNum(b.soldCount) - toNum(a.soldCount)).slice(0, 5),
    [products]
  );

  // ── توصيات ذكية ───────────────────────────────────────────────────────
  const dailyInsights = useMemo(() => [
    lowStock.length > 0
      ? `يوجد ${lowStock.length} مادة بحاجة إعادة تموين.`
      : 'المخزون ضمن الحدود الطبيعية اليوم.',
    profit < 0
      ? 'صافي الربح اليوم سالب، راجع الخصومات والمصاريف.'
      : `صافي الربح اليوم إيجابي: ${fmt(profit)}.`,
    weeklyTrendDown
      ? 'المبيعات الأسبوعية أقل من الأسبوع الماضي بأكثر من 20%.'
      : 'الاتجاه الأسبوعي للمبيعات مستقر.',
    (totalDebtIQD > 0 || totalDebtUSD > 0)
      ? `ذمم الزبائن: ${fmt(totalDebtIQD)}${totalDebtUSD ? ` + $${totalDebtUSD.toFixed(2)}` : ''}.`
      : 'لا توجد ذمم مدينة مفتوحة على الزبائن.',
  ], [lowStock, profit, weeklyTrendDown, totalDebtIQD, totalDebtUSD]);

  const buildDailySummaryMessage = () => {
    const debtLines = topDebtors.length
      ? topDebtors.map((c, i) => `${i + 1}. ${c.name}: ${fmt(c.iqd)}${c.usd ? ` + $${c.usd.toFixed(2)}` : ''}`).join('\n')
      : 'لا يوجد';
    return [
      `📊 ملخص يومي — ${currentISO}`,
      `🏪 ${settings.storeName || 'المتجر'}`,
      '',
      `💰 مبيعات اليوم: ${fmt(totalRevenue)}`,
      `📈 صافي الربح: ${fmt(profit)}`,
      `⚠️ مواد منخفضة المخزون: ${lowStock.length}`,
      `💳 ذمم الزبائن: ${fmt(totalDebtIQD)}${totalDebtUSD ? ` + $${totalDebtUSD.toFixed(2)}` : ''}`,
      '',
      '🔝 أعلى الزبائن مديونية:',
      debtLines,
      '',
      '🤖 توصيات:',
      ...dailyInsights.map(l => `- ${l}`),
    ].join('\n');
  };

  const sendDailySummaryToWhatsApp = async () => {
    const managerPhone = String(settings.managerWhatsApp || settings.storeWhatsApp || '').trim();
    if (!managerPhone) {
      alert('يرجى إضافة رقم واتساب المدير في الإعدادات أولاً.');
      return;
    }
    setWaSending(true);
    try {
      const result = await sendWhatsAppText({ phone: managerPhone, text: buildDailySummaryMessage() });
      if (!result?.ok) { alert(explainWhatsAppError(result)); return; }
      alert('✅ تم إرسال الملخص اليومي على واتساب.');
    } finally {
      setWaSending(false);
    }
  };

  const aiEnabled = settings.aiDailyInsights !== false;

  const statCards = [
    { icon:'💰', label:'مبيعات اليوم',   val: fmt(totalRevenue),    color:'#F5C800', bg:'#F5C80015' },
    { icon:'🧾', label:'عدد الفواتير',   val: todaySales.length,    color:'#3b82f6', bg:'#3b82f615' },
    { icon:'📈', label:'صافي الربح',     val: fmt(profit),           color: profit >= 0 ? '#10b981' : '#ef4444', bg: profit >= 0 ? '#10b98115' : '#ef444415' },
    { icon:'⚠️', label:'منتجات تنفد',   val: lowStock.length,       color:'#ef4444', bg:'#ef444415' },
  ];

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>لوحة التحكم</div>
        <div style={{ color:'#64748b', fontSize:13 }}>مرحباً {user.name} — {todayStr}</div>
      </div>

      {/* بطاقات الإحصاء */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {statCards.map(st => (
          <div key={st.label} style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2', transition:'box-shadow .2s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ color:'#64748b', fontSize:12, marginBottom:8 }}>{st.label}</div>
                <div style={{ color:st.color, fontSize:22, fontWeight:800 }}>{st.val}</div>
              </div>
              <div style={{ width:44, height:44, borderRadius:12, background:st.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{st.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* التقرير الذكي */}
      {aiEnabled && (
        <div style={{ background:'#ffffff', borderRadius:16, border:'1px solid #3b82f633', padding:16, marginBottom:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ color:'#3b82f6', fontSize:15, fontWeight:800 }}>🤖 التقرير الذكي اليومي</div>
            <button
              onClick={sendDailySummaryToWhatsApp}
              disabled={waSending}
              style={{ background: waSending ? '#94a3b8' : '#22c55e', color:'#fff', border:'none', borderRadius:10, padding:'8px 14px', cursor: waSending ? 'not-allowed' : 'pointer', fontFamily:"'Cairo'", fontWeight:800, fontSize:12 }}>
              {waSending ? '...جاري الإرسال' : '📲 إرسال الملخص للمدير'}
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:12 }}>
            <div style={{ background:'#f8fbff', border:'1px solid #d9e2f2', borderRadius:12, padding:10 }}>
              {dailyInsights.map((line, idx) => (
                <div key={idx} style={{ color:'#334155', fontSize:12, lineHeight:1.9 }}>{idx + 1}. {line}</div>
              ))}
            </div>
            <div style={{ background:'#f8fbff', border:'1px solid #d9e2f2', borderRadius:12, padding:10 }}>
              <div style={{ color:'#64748b', fontSize:11, marginBottom:6 }}>أعلى مديونية:</div>
              {topDebtors.length === 0
                ? <div style={{ color:'#94a3b8', fontSize:12 }}>لا يوجد</div>
                : topDebtors.map((c, i) => (
                  <div key={c.name} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'#334155' }}>{i + 1}. {c.name}</span>
                    <span style={{ color:'#ef4444', fontWeight:700 }}>{fmt(c.iqd)}{c.usd ? ` + $${c.usd.toFixed(2)}` : ''}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:24 }}>
        {/* رسم بياني */}
        <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2' }}>
          <div style={{ color:'#1e293b', fontSize:15, fontWeight:700, marginBottom:16 }}>📊 مبيعات آخر 7 أيام</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={last7}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2f2"/>
              <XAxis dataKey="name" tick={{ fill:'#64748b', fontSize:11 }}/>
              <YAxis tick={{ fill:'#64748b', fontSize:11 }}/>
              <Tooltip contentStyle={{ fontFamily:"'Cairo'", color:'#0f172a' }}/>
              <Area type="monotone" dataKey="مبيعات" stroke="#F5C800" fill="#F5C80022" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* أفضل المنتجات */}
        <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2' }}>
          <div style={{ color:'#1e293b', fontSize:15, fontWeight:700, marginBottom:16 }}>🏆 أكثر مبيعاً</div>
          {topProducts.length === 0
            ? <div style={{ color:'#64748b', textAlign:'center', padding:40 }}>لا توجد بيانات</div>
            : topProducts.map((p, i) => (
              <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #e2e8f7' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:'#F5C80022', display:'flex', alignItems:'center', justifyContent:'center', color:'#F5C800', fontSize:11, fontWeight:800 }}>{i + 1}</div>
                  <span style={{ color:'#1e293b', fontSize:13 }}>{p.name}</span>
                </div>
                <span style={{ color:'#F5C800', fontSize:12 }}>{toNum(p.soldCount)} قطعة</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* تنبيهات المخزون */}
      {lowStock.length > 0 && (
        <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #ef444433', marginBottom:16 }}>
          <div style={{ color:'#ef4444', fontSize:15, fontWeight:700, marginBottom:14 }}>⚠️ منتجات تحتاج إعادة تموين ({lowStock.length})</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10 }}>
            {lowStock.map(p => (
              <div key={p.id} style={{ background:'#ef444411', borderRadius:12, padding:12, border:'1px solid #ef444433' }}>
                <div style={{ color:'#1e293b', fontSize:12, fontWeight:600, marginBottom:4 }}>{p.name}</div>
                <div style={{ color:'#ef4444', fontSize:18, fontWeight:800 }}>{toNum(p.stock)} قطعة</div>
                <div style={{ color:'#64748b', fontSize:11 }}>الحد الأدنى: {toNum(p.minStock) || 5}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* آخر الفواتير */}
      <div style={{ background:'#ffffff', borderRadius:16, padding:20, border:'1px solid #d9e2f2' }}>
        <div style={{ color:'#1e293b', fontSize:15, fontWeight:700, marginBottom:14 }}>🧾 آخر الفواتير</div>
        {sales.length === 0
          ? <div style={{ color:'#64748b', textAlign:'center', padding:30 }}>لا توجد فواتير بعد</div>
          : sales.slice(0, 5).map((s, i) => (
            <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom: i < 4 ? '1px solid #e2e8f7' : 'none' }}>
              <div>
                <div style={{ color:'#1e293b', fontSize:13, fontWeight:600 }}>#{s.invoiceNo}</div>
                <div style={{ color:'#64748b', fontSize:11 }}>{s.date || s.dateISO} — {s.paymentMethod} — {s.customer || 'زبون عام'}</div>
              </div>
              <div style={{ textAlign:'left' }}>
                <div style={{ color:'#F5C800', fontSize:14, fontWeight:700 }}>{fmt(s.total)}</div>
                <div style={{ color:'#64748b', fontSize:11 }}>{s.items?.length || 0} منتج</div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
