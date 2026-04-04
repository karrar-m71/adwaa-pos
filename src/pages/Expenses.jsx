import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtIQD, todayAR, todayISO, toNum, getErrorMessage } from '../utils/helpers';

const CATS = ['إيجار', 'رواتب', 'كهرباء', 'ماء', 'نقل', 'صيانة', 'مشتريات', 'خسائر', 'أخرى'];
const EMPTY_FORM = { desc: '', amountRaw: '', cat: 'أخرى', dateISO: todayISO() };

export default function Expenses({ user }) {
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState('الكل');
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const u = onSnapshot(collection(db, 'pos_expenses'), s =>
      setExpenses(
        s.docs
          .map(d => ({ ...d.data(), id: d.id }))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      )
    );
    return () => u();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'الكل') return expenses;
    return expenses.filter(e => e.cat === filter);
  }, [expenses, filter]);

  const total = useMemo(() => filtered.reduce((s, e) => s + toNum(e.amount), 0), [filtered]);
  const todayTotal = useMemo(() => {
    const t = todayISO();
    return expenses.filter(e => e.dateISO === t || e.date === todayAR())
      .reduce((s, e) => s + toNum(e.amount), 0);
  }, [expenses]);

  const catTotals = useMemo(() => {
    const map = {};
    for (const e of expenses) {
      map[e.cat] = (map[e.cat] || 0) + toNum(e.amount);
    }
    return map;
  }, [expenses]);

  const save = useCallback(async () => {
    const desc   = form.desc.trim();
    const amount = toNum(form.amountRaw);
    if (!desc)       return alert('يرجى إدخال وصف المصروف');
    if (amount <= 0) return alert('يرجى إدخال مبلغ صحيح أكبر من صفر');
    setSaving(true);
    try {
      await addDoc(collection(db, 'pos_expenses'), {
        desc,
        amount,
        cat:       form.cat,
        dateISO:   form.dateISO,
        date:      todayAR(),
        addedBy:   user.name,
        createdAt: new Date().toISOString(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      alert(getErrorMessage(e, 'فشل حفظ المصروف'));
    } finally {
      setSaving(false);
    }
  }, [form, user]);

  const del = useCallback(async (expense) => {
    if (!confirm(`حذف المصروف "${expense.desc}" بمبلغ ${fmtIQD(expense.amount)}؟`)) return;
    try {
      await deleteDoc(doc(db, 'pos_expenses', expense.id));
    } catch (e) {
      alert(getErrorMessage(e, 'فشل حذف المصروف'));
    }
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>المصروفات</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{expenses.length} مصروف مسجل</div>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo'", fontSize: 14 }}>
          + إضافة مصروف
        </button>
      </div>

      {/* ملخص */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          ['💸', 'مصروفات اليوم',    fmtIQD(todayTotal), '#ef4444'],
          ['📊', 'إجمالي المعروض',   fmtIQD(total),      '#F5C800'],
          ['📝', 'عدد العمليات',     filtered.length,     '#3b82f6'],
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ background: '#ffffff', borderRadius: 16, padding: 20, border: '1px solid #d9e2f2', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: 18, fontWeight: 800 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* تصفية حسب التصنيف */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {['الكل', ...CATS].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ background: filter === c ? '#ef4444' : '#f8fbff', color: filter === c ? '#fff' : '#64748b', border: `1px solid ${filter === c ? '#ef4444' : '#cdd8ec'}`, borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Cairo'" }}>
            {c}{catTotals[c] && c !== 'الكل' ? ` (${fmtIQD(catTotals[c])})` : ''}
          </button>
        ))}
      </div>

      {/* نموذج الإضافة */}
      {showForm && (
        <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, border: '1px solid #ef444433', marginBottom: 20 }}>
          <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 800, marginBottom: 20 }}>➕ إضافة مصروف</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            <div>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>الوصف *</label>
              <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="مثال: إيجار الشهر"
                style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px 14px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'", boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>المبلغ (د.ع) *</label>
              <input
                type="text" inputMode="decimal"
                value={form.amountRaw}
                onChange={e => setForm(f => ({ ...f, amountRaw: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="0"
                style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px 14px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'", boxSizing: 'border-box', textAlign: 'center' }} />
            </div>
            <div>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>التصنيف</label>
              <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}
                style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px 14px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'" }}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>التاريخ</label>
              <input type="date" value={form.dateISO} onChange={e => setForm(f => ({ ...f, dateISO: e.target.value }))}
                style={{ width: '100%', color: '#0f172a', outline: 'none', padding: '10px 14px', borderRadius: 8, border: '1px solid #cdd8ec', fontFamily: "'Cairo'", boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              style={{ flex: 1, background: '#f8fbff', border: '1px solid #cdd8ec', borderRadius: 12, padding: 12, color: '#64748b', cursor: 'pointer', fontFamily: "'Cairo'" }}>إلغاء</button>
            <button onClick={save} disabled={saving}
              style={{ flex: 2, background: saving ? '#f1f5f9' : '#ef4444', color: saving ? '#94a3b8' : '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Cairo'" }}>
              {saving ? '⏳ جاري الحفظ...' : '✅ حفظ'}
            </button>
          </div>
        </div>
      )}

      {/* جدول المصروفات */}
      <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #d9e2f2', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: '1px solid #d9e2f2', background: '#f8fbff' }}>
          {['الوصف', 'التصنيف', 'المبلغ', 'التاريخ', 'إجراء'].map(h => (
            <div key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{h}</div>
          ))}
        </div>
        {filtered.length === 0
          ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 60 }}>لا توجد مصروفات</div>
          : filtered.map((e, i) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 600 }}>{e.desc}</div>
                {e.addedBy && <div style={{ color: '#94a3b8', fontSize: 11 }}>{e.addedBy}</div>}
              </div>
              <div>
                <span style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 20, padding: '2px 10px', color: '#ef4444', fontSize: 11 }}>{e.cat}</span>
              </div>
              <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 700 }}>{fmtIQD(e.amount)}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{e.date || e.dateISO}</div>
              <div>
                {user.role === 'مدير' && (
                  <button onClick={() => del(e)}
                    style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 8, padding: '5px 10px', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>🗑️</button>
                )}
              </div>
            </div>
          ))
        }
        {filtered.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', background: '#fef9ec', borderTop: '2px solid #F5C80033' }}>
            <span style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>الإجمالي ({filtered.length} سجل)</span>
            <span style={{ color: '#ef4444', fontSize: 15, fontWeight: 800 }}>{fmtIQD(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
