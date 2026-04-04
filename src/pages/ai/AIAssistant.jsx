import { useMemo, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { askCloudAI, explainCloudAIError } from '../../utils/cloudAi';

const fmtIQD = (n) => (Number(n || 0) || 0).toLocaleString('ar-IQ') + ' د.ع';
const fmtUSD = (n) => '$' + (Number(n || 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toNum = (v) => Number(v || 0) || 0;
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const toISO = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && value.length >= 10 && value.includes('-')) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const getDateISO = (obj = {}) => obj.dateISO || toISO(obj.date || obj.createdAt);
const getRangeStart = (daysBack) => {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return toISO(d);
};

function calcSaleCogs(sale, products) {
  if (sale?.cogs != null) return toNum(sale.cogs);
  return (sale?.items || []).reduce((sum, it) => {
    if (it?.costTotal != null) return sum + toNum(it.costTotal);
    const qtyUnits = toNum(it?.qtyUnits || (it?.isPackage ? toNum(it?.qty) * toNum(it?.packageQty || 1) : toNum(it?.qty)));
    const itemCost = toNum(it?.buyPrice ?? it?.costPrice);
    const productCost = toNum(products.find((p) => p.id === it?.id)?.buyPrice);
    const unitCost = itemCost || productCost;
    return sum + unitCost * qtyUnits;
  }, 0);
}

function card({ title, value, sub, color }) {
  return (
    <div style={{ background:'#ffffff', borderRadius:16, border:`1px solid ${color}33`, padding:16 }}>
      <div style={{ color:'#64748b', fontSize:12, marginBottom:6 }}>{title}</div>
      <div style={{ color, fontWeight:900, fontSize:22, marginBottom:4 }}>{value}</div>
      <div style={{ color:'#94a3b8', fontSize:11 }}>{sub}</div>
    </div>
  );
}

export default function AIAssistant({ user }) {
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  const settings = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('adwaa_settings') || '{}'); }
    catch { return {}; }
  }, []);
  const aiEnabled = settings.aiAssistantEnabled !== false;
  const canSeeProfit = user?.role === 'مدير';

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'pos_sales'), (s) => setSales(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
      onSnapshot(collection(db, 'pos_purchases'), (s) => setPurchases(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
      onSnapshot(collection(db, 'pos_expenses'), (s) => setExpenses(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
      onSnapshot(collection(db, 'pos_products'), (s) => setProducts(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
      onSnapshot(collection(db, 'pos_customers'), (s) => setCustomers(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
      onSnapshot(collection(db, 'pos_suppliers'), (s) => setSuppliers(s.docs.map((d) => ({ ...d.data(), id:d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const metrics = useMemo(() => {
    const today = todayISO();
    const weekStart = getRangeStart(6);
    const prevWeekStart = getRangeStart(13);
    const prevWeekEnd = getRangeStart(7);

    const salesToday = sales.filter((s) => getDateISO(s) === today);
    const salesWeek = sales.filter((s) => {
      const d = getDateISO(s);
      return d >= weekStart && d <= today;
    });
    const salesPrevWeek = sales.filter((s) => {
      const d = getDateISO(s);
      return d >= prevWeekStart && d <= prevWeekEnd;
    });
    const expensesToday = expenses.filter((e) => getDateISO(e) === today);
    const purchasesWeek = purchases.filter((p) => {
      const d = getDateISO(p);
      return d >= weekStart && d <= today;
    });

    const revToday = salesToday.reduce((s, i) => s + toNum(i.total), 0);
    const cogsToday = salesToday.reduce((s, inv) => s + calcSaleCogs(inv, products), 0);
    const expToday = expensesToday.reduce((s, e) => s + toNum(e.amount), 0);
    const profitToday = revToday - cogsToday - expToday;

    const revWeek = salesWeek.reduce((s, i) => s + toNum(i.total), 0);
    const revPrevWeek = salesPrevWeek.reduce((s, i) => s + toNum(i.total), 0);
    const cogsWeek = salesWeek.reduce((s, inv) => s + calcSaleCogs(inv, products), 0);
    const expWeek = expenses.filter((e) => {
      const d = getDateISO(e);
      return d >= weekStart && d <= today;
    }).reduce((s, e) => s + toNum(e.amount), 0);
    const profitWeek = revWeek - cogsWeek - expWeek;
    const purchasesWeekTotal = purchasesWeek.reduce((s, p) => s + toNum(p.total), 0);

    const lowStock = products.filter((p) => toNum(p.stock) <= toNum(p.minStock || 5));

    const customerDebtIQD = customers.reduce((s, c) => s + toNum(c?.debtByCurrency?.IQD ?? c?.debt ?? 0), 0);
    const customerDebtUSD = customers.reduce((s, c) => s + toNum(c?.debtByCurrency?.USD ?? 0), 0);
    const supplierDebtIQD = suppliers.reduce((s, c) => s + toNum(c?.debtByCurrency?.IQD ?? c?.debt ?? 0), 0);
    const supplierDebtUSD = suppliers.reduce((s, c) => s + toNum(c?.debtByCurrency?.USD ?? 0), 0);

    const topLowStock = [...lowStock].sort((a, b) => toNum(a.stock) - toNum(b.stock)).slice(0, 5);
    const topCustomerDebts = [...customers]
      .map((c) => ({
        name: c.name,
        iqd: toNum(c?.debtByCurrency?.IQD ?? c?.debt ?? 0),
        usd: toNum(c?.debtByCurrency?.USD ?? 0),
      }))
      .sort((a, b) => (b.iqd + b.usd * 1480) - (a.iqd + a.usd * 1480))
      .slice(0, 5);

    return {
      today,
      revToday, cogsToday, expToday, profitToday,
      revWeek, revPrevWeek, profitWeek, purchasesWeekTotal,
      lowStock, topLowStock, topCustomerDebts,
      customerDebtIQD, customerDebtUSD, supplierDebtIQD, supplierDebtUSD,
      salesTodayCount: salesToday.length,
    };
  }, [sales, purchases, expenses, products, customers, suppliers]);

  const recommendations = useMemo(() => {
    const rec = [];
    if (metrics.lowStock.length > 0) {
      rec.push({
        level:'high',
        title:'مواد قاربت على النفاد',
        text:`يوجد ${metrics.lowStock.length} مادة تحتاج إعادة تموين. ابدأ بالمواد الأعلى دوراناً أولاً.`,
      });
    }
    if (canSeeProfit && metrics.profitWeek < 0) {
      rec.push({
        level:'high',
        title:'صافي الربح الأسبوعي سالب',
        text:'الربح الأسبوعي أقل من الصفر. راجع أسعار البيع والخصومات والمصاريف الثابتة فوراً.',
      });
    }
    if (metrics.revPrevWeek > 0 && metrics.revWeek < metrics.revPrevWeek * 0.8) {
      rec.push({
        level:'medium',
        title:'تراجع المبيعات الأسبوعية',
        text:'المبيعات أقل من الأسبوع السابق بأكثر من 20%. فعّل عروض قصيرة على المنتجات الراكدة.',
      });
    }
    if (metrics.customerDebtIQD > 0 || metrics.customerDebtUSD > 0) {
      rec.push({
        level:'medium',
        title:'ارتفاع الذمم المدينة',
        text:'يوجد رصيد كبير على الزبائن. جدولة التحصيل حسب أكبر 5 حسابات ستسرّع التدفق النقدي.',
      });
    }
    if (!rec.length) {
      rec.push({
        level:'low',
        title:'الوضع المالي مستقر',
        text:'لا توجد مؤشرات خطر عالية الآن. استمر بمراجعة هامش الربح والمخزون يومياً.',
      });
    }
    return rec.slice(0, 4);
  }, [metrics, canSeeProfit]);

  const buildContext = () => {
    const topDebt = metrics.topCustomerDebts
      .filter((c) => c.iqd > 0 || c.usd > 0)
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${c.name}: ${fmtIQD(c.iqd)}${c.usd > 0 ? ` + ${fmtUSD(c.usd)}` : ''}`)
      .join('\n');
    const lines = [
      `التاريخ: ${metrics.today}`,
      `مبيعات اليوم: ${fmtIQD(metrics.revToday)}`,
      `مبيعات الأسبوع: ${fmtIQD(metrics.revWeek)}`,
      `عدد فواتير اليوم: ${metrics.salesTodayCount}`,
      `مشتريات الأسبوع: ${fmtIQD(metrics.purchasesWeekTotal)}`,
      `مواد منخفضة المخزون: ${metrics.lowStock.length}`,
      `ذمم الزبائن: ${fmtIQD(metrics.customerDebtIQD)}${metrics.customerDebtUSD ? ` + ${fmtUSD(metrics.customerDebtUSD)}` : ''}`,
      `ذمم الموردين: ${fmtIQD(metrics.supplierDebtIQD)}${metrics.supplierDebtUSD ? ` + ${fmtUSD(metrics.supplierDebtUSD)}` : ''}`,
      `أعلى مديونية زبائن:\n${topDebt || 'لا يوجد'}`,
    ];
    if (canSeeProfit) {
      lines.push(`ربح اليوم: ${fmtIQD(metrics.profitToday)}`);
      lines.push(`ربح الأسبوع: ${fmtIQD(metrics.profitWeek)}`);
    }
    return lines.join('\n');
  };

  const askLocal = (qRaw) => {
    const q = String(qRaw || '').trim();
    if (!q) return '';
    const lower = q.toLowerCase();
    if (lower.includes('ربح') || lower.includes('profit')) {
      if (!canSeeProfit) {
        return 'بيانات الربح متاحة للمدير فقط. يمكنني إعطاؤك تحليل المبيعات والمخزون والذمم.';
      }
      return `اليوم: ${fmtIQD(metrics.profitToday)}\nهذا الأسبوع: ${fmtIQD(metrics.profitWeek)}\nالمبيعات الأسبوعية: ${fmtIQD(metrics.revWeek)}.`;
    }
    if (lower.includes('مخزون') || lower.includes('نفاد') || lower.includes('stock')) {
      if (!metrics.topLowStock.length) {
        return 'لا توجد مواد تحت الحد الأدنى حالياً.';
      }
      const lines = metrics.topLowStock.map((p, i) => `${i + 1}. ${p.name}: المتوفر ${toNum(p.stock)} / الحد الأدنى ${toNum(p.minStock || 5)}`);
      return `أهم مواد بحاجة تموين:\n${lines.join('\n')}`;
    }
    if (lower.includes('دين') || lower.includes('تحصيل') || lower.includes('debts')) {
      if (!metrics.topCustomerDebts.length) {
        return 'لا توجد ذمم مدينة على الزبائن حالياً.';
      }
      const lines = metrics.topCustomerDebts
        .filter((c) => c.iqd > 0 || c.usd > 0)
        .map((c, i) => `${i + 1}. ${c.name}: ${fmtIQD(c.iqd)}${c.usd > 0 ? ` + ${fmtUSD(c.usd)}` : ''}`);
      return lines.length ? `أعلى الزبائن مديونية:\n${lines.join('\n')}` : 'لا توجد ذمم مدينة على الزبائن حالياً.';
    }
    return (
      `ملخص سريع:\n` +
      `- مبيعات اليوم: ${fmtIQD(metrics.revToday)}\n` +
      `${canSeeProfit ? `- صافي ربح اليوم: ${fmtIQD(metrics.profitToday)}\n` : ''}` +
      `- مواد منخفضة المخزون: ${metrics.lowStock.length}\n` +
      `- ذمم الزبائن: ${fmtIQD(metrics.customerDebtIQD)}${metrics.customerDebtUSD ? ` + ${fmtUSD(metrics.customerDebtUSD)}` : ''}`
    );
  };

  const ask = async (qRaw) => {
    const q = String(qRaw || '').trim();
    if (!q) return;
    const lower = q.toLowerCase();
    if (!canSeeProfit && (lower.includes('ربح') || lower.includes('profit'))) {
      setAnswer('بيانات الربح متاحة للمدير فقط. يمكنني مساعدتك في المبيعات والمخزون والذمم والتحصيل.');
      return;
    }
    setAsking(true);
    try {
      const cloud = await askCloudAI({
        question: q,
        contextText: buildContext(),
        canSeeProfit,
      });
      if (cloud?.ok && cloud?.text) {
        setAnswer(cloud.text);
        return;
      }
      const local = askLocal(q);
      setAnswer(`${local}\n\n(ملاحظة: ${explainCloudAIError(cloud)})`);
    } catch (e) {
      const local = askLocal(q);
      setAnswer(`${local}\n\n(ملاحظة: تعذر استخدام الذكاء السحابي الآن وتم استخدام التحليل المحلي.)`);
    } finally {
      setAsking(false);
    }
  };

  if (!aiEnabled) {
    return (
      <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
        <div style={{ background:'#ffffff', border:'1px solid #d9e2f2', borderRadius:16, padding:30, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:10 }}>🤖</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1e293b', marginBottom:8 }}>المساعد الذكي معطّل</div>
          <div style={{ color:'#64748b' }}>فعّله من الإعدادات: الأدوات ← الإعدادات ← إعدادات الذكاء الاصطناعي.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ marginBottom:18 }}>
        <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>🤖 المساعد الذكي</div>
        <div style={{ color:'#64748b', fontSize:12 }}>تحليل فوري لبيانات المتجر وتوصيات تشغيلية</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        {card({ title:'مبيعات اليوم', value:fmtIQD(metrics.revToday), sub:`${metrics.salesTodayCount} فاتورة`, color:'#3b82f6' })}
        {card({
          title:'ربح اليوم',
          value: canSeeProfit ? fmtIQD(metrics.profitToday) : 'خاص بالمدير',
          sub: canSeeProfit ? 'بعد التكلفة والمصاريف' : 'غير متاح لهذا الدور',
          color: canSeeProfit ? (metrics.profitToday >= 0 ? '#10b981' : '#ef4444') : '#94a3b8',
        })}
        {card({ title:'ذمم الزبائن', value:fmtIQD(metrics.customerDebtIQD), sub:metrics.customerDebtUSD ? fmtUSD(metrics.customerDebtUSD) : 'بدون دولار', color:'#f59e0b' })}
        {card({ title:'ذمم الموردين', value:fmtIQD(metrics.supplierDebtIQD), sub:metrics.supplierDebtUSD ? fmtUSD(metrics.supplierDebtUSD) : 'بدون دولار', color:'#a855f7' })}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:14 }}>
        <div style={{ background:'#ffffff', border:'1px solid #d9e2f2', borderRadius:16, padding:18 }}>
          <div style={{ color:'#1e293b', fontSize:15, fontWeight:800, marginBottom:10 }}>🎯 توصيات ذكية</div>
          <div style={{ display:'grid', gap:8 }}>
            {recommendations.map((r, i) => {
              const color = r.level === 'high' ? '#ef4444' : r.level === 'medium' ? '#f59e0b' : '#10b981';
              return (
                <div key={`${r.title}-${i}`} style={{ border:`1px solid ${color}33`, background:`${color}11`, borderRadius:12, padding:12 }}>
                  <div style={{ color, fontWeight:800, fontSize:13, marginBottom:4 }}>{r.title}</div>
                  <div style={{ color:'#334155', fontSize:12, lineHeight:1.8 }}>{r.text}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #d9e2f2', borderRadius:16, padding:18 }}>
          <div style={{ color:'#1e293b', fontSize:15, fontWeight:800, marginBottom:10 }}>💬 اسأل المساعد</div>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={canSeeProfit ? 'اكتب سؤالك... مثل: ما وضع الربح؟' : 'اكتب سؤالك... مثل: ما المواد الناقصة؟'}
              style={{ flex:1, color:'#0f172a', outline:'none', fontFamily:"'Cairo'" }}
            />
            <button
              onClick={() => ask(question)}
              disabled={asking}
              style={{ background:'#F5C800', color:'#000', border:'none', borderRadius:10, padding:'8px 14px', cursor:'pointer', fontFamily:"'Cairo'", fontWeight:800 }}
            >
              {asking ? '...جاري التحليل' : 'تحليل'}
            </button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            {[
              ...(canSeeProfit ? ['ما وضع الربح؟'] : []),
              'ما المواد الناقصة؟',
              'من أعلى الزبائن مديونية؟',
            ].map((q) => (
              <button
                key={q}
                onClick={() => { setQuestion(q); ask(q); }}
                style={{ border:'1px solid #d9e2f2', background:'#f8fbff', borderRadius:18, padding:'5px 10px', fontSize:11, color:'#475569', cursor:'pointer', fontFamily:"'Cairo'" }}
              >
                {q}
              </button>
            ))}
          </div>
          <div style={{ minHeight:180, border:'1px dashed #d9e2f2', borderRadius:10, padding:10, whiteSpace:'pre-wrap', color:'#334155', lineHeight:1.9, fontSize:12 }}>
            {answer || 'اكتب سؤالاً وسيجيبك المساعد اعتماداً على بيانات النظام الحالية.'}
          </div>
        </div>
      </div>
    </div>
  );
}
