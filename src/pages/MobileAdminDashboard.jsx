import { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { uploadToImgBB } from '../utils/imgbb';

const SUPPORT = '07714424355';
const S = {
  bg: '#F6F8FC',
  sidebar: '#FFFFFF',
  card: '#FFFFFF',
  border: '#D9E2F2',
  accent: '#C88A12',
  green: '#059669',
  red: '#DC2626',
  blue: '#2563EB',
  text: '#18243A',
  muted: '#64748B',
  subtle: '#94A3B8',
};
const TIER_MAP = { برونزي: '#CD7F32', فضي: '#A8A8A8', ذهبي: '#D4AF37', بلاتيني: '#E5E4E2' };
const fmt = (n) => (n || 0).toLocaleString('ar-IQ') + ' د.ع';
const nowStr = () => new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function ImageUploader({ value, onChange, label = 'صورة' }) {
  const inputRef = useRef();
  const [up, setUp] = useState(false);
  const [msg, setMsg] = useState('');
  const handle = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUp(true);
    setMsg('⏳ جاري الرفع...');
    try {
      const url = await uploadToImgBB(file);
      onChange(url);
      setMsg('✅ تم!');
      setTimeout(() => setMsg(''), 2000);
    } catch {
      setMsg('❌ فشل');
      setTimeout(() => setMsg(''), 2000);
    }
    setUp(false);
    e.target.value = '';
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          onClick={() => !up && inputRef.current.click()}
          style={{ width: 80, height: 80, borderRadius: 12, background: '#F8FBFF', border: `2px dashed ${value ? S.accent : S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
        >
          {value ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, opacity: 0.4 }}>📷</div><div style={{ color: S.muted, fontSize: 10, marginTop: 2 }}>رفع</div></div>}
          {up && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⏳</div>}
        </div>
        <div style={{ flex: 1 }}>
          <input ref={inputRef} type="file" accept="image/*" onChange={handle} style={{ display: 'none' }} />
          <button onClick={() => inputRef.current.click()} disabled={up} style={{ background: up ? '#E2E8F0' : S.accent, color: up ? S.muted : '#fff', border: 'none', borderRadius: 10, padding: '8px 0', fontWeight: 700, cursor: up ? 'not-allowed' : 'pointer', fontFamily: "'Cairo',sans-serif", fontSize: 12, width: '100%', marginBottom: 4 }}>
            {up ? '⏳ جاري الرفع...' : '📷 رفع صورة'}
          </button>
          {value && !up && <button onClick={() => onChange('')} style={{ background: '#ef444411', border: '1px solid #ef444433', borderRadius: 10, padding: '6px 0', color: S.red, cursor: 'pointer', fontFamily: "'Cairo',sans-serif", fontSize: 11, width: '100%' }}>🗑️ حذف</button>}
          {msg && <div style={{ color: msg.startsWith('✅') ? S.green : S.red, fontSize: 11, marginTop: 4 }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function MultiImageUploader({ values = [], onChange, label = 'صور الأعمال' }) {
  const inputRef = useRef();
  const [up, setUp] = useState(false);
  const handle = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUp(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadToImgBB(f)));
      onChange([...values, ...urls]);
    } catch (error) {
      console.error('[MobileAdminDashboard.MultiImageUploader]', error);
    }
    setUp(false);
    e.target.value = '';
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {values.map((img, i) => (
          <div key={i} style={{ position: 'relative', width: 70, height: 70 }}>
            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
            <button onClick={() => onChange(values.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: -6, right: -6, background: S.red, color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ))}
        <div onClick={() => !up && inputRef.current.click()} style={{ width: 70, height: 70, borderRadius: 10, background: '#F8FBFF', border: `2px dashed ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          {up ? <span style={{ fontSize: 20 }}>⏳</span> : <span style={{ color: S.muted, fontSize: 24 }}>+</span>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handle} style={{ display: 'none' }} />
      <div style={{ color: S.muted, fontSize: 10 }}>يمكن رفع أكثر من صورة دفعة واحدة</div>
    </div>
  );
}

function Btn(color) {
  return { background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 10, padding: '7px 16px', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" };
}

export default function MobileAdminDashboard() {
  const [page, setPage] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [giftReqs, setGiftReqs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ptsLog, setPtsLog] = useState([]);
  const [offers, setOffers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalUser, setModalUser] = useState(null);
  const [modalPts, setModalPts] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [modalAction, setModalAction] = useState('add');

  useEffect(() => {
    const us = [
      onSnapshot(collection(db, 'products'), (s) => { setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); }),
      onSnapshot(collection(db, 'users'), (s) => { setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }),
      onSnapshot(collection(db, 'gifts'), (s) => { setGifts(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }),
      onSnapshot(collection(db, 'offers'), (s) => { setOffers(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }),
      onSnapshot(collection(db, 'technicians'), (s) => { setTechnicians(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }),
      onSnapshot(collection(db, 'gift_requests'), (s) => { setGiftReqs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))); }),
      onSnapshot(collection(db, 'orders'), (s) => { setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))); }),
      onSnapshot(collection(db, 'points_history'), (s) => { setPtsLog(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))); }),
    ];
    return () => us.forEach((u) => u());
  }, []);

  const showToast = (msg, color = S.green) => { setToast({ msg, color }); setTimeout(() => setToast(null), 3500); };

  const sendNotif = async (userId, userName, title, body, icon = '🔔') => {
    await addDoc(collection(db, 'notifications'), { userId, userName, title, body, icon, date: nowStr(), createdAt: new Date().toISOString(), read: false });
  };
  const sendBroadcast = async (title, body, icon = '📢') => {
    await addDoc(collection(db, 'notifications'), { userId: 'all', userName: 'الجميع', title, body, icon, type: 'broadcast', date: nowStr(), createdAt: new Date().toISOString(), read: false });
  };
  const updateOrder = async (id, status, o) => {
    await updateDoc(doc(db, 'orders', id), { status });
    const icons = { 'تم التأكيد': '✅', 'قيد التجهيز': '⚙️', 'تم التسليم': '🎉', 'ملغي': '❌' };
    await sendNotif(o.userId, o.userName, `تحديث طلبك — ${status}`, `طلبك بقيمة ${fmt(o.total)} أصبح "${status}"`, icons[status] || '📦');
    showToast('✅ تم تحديث الطلب + إشعار');
  };
  const updateGift = async (id, status, r) => {
    await updateDoc(doc(db, 'gift_requests', id), { status });
    const icons = { 'تمت الموافقة': '✅', 'تم التسليم': '🎁', 'مرفوض': '❌' };
    await sendNotif(r.userId, r.userName, `طلب الهدية — ${status}`, `طلبك للهدية "${r.giftName}" أصبح "${status}"`, icons[status] || '🎁');
    showToast('✅ تم تحديث الهدية + إشعار');
  };
  const applyPts = async () => {
    if (!modalPts || !modalReason || !modalUser) return;
    const pts = parseInt(modalPts, 10);
    const newPts = modalAction === 'add' ? (modalUser.points || 0) + pts : Math.max(0, (modalUser.points || 0) - pts);
    const tier = newPts >= 2000 ? 'بلاتيني' : newPts >= 1000 ? 'ذهبي' : newPts >= 500 ? 'فضي' : 'برونزي';
    await updateDoc(doc(db, 'users', modalUser.id), { points: newPts, tier });
    await addDoc(collection(db, 'points_history'), { userId: modalUser.id, userName: modalUser.name, action: modalAction === 'add' ? 'إضافة' : 'خصم', pts, reason: modalReason, date: nowStr(), createdAt: new Date().toISOString() });
    await sendNotif(modalUser.id, modalUser.name, modalAction === 'add' ? `تم إضافة ${pts} نقطة 🎉` : `تم خصم ${pts} نقطة`, `السبب: ${modalReason}`, modalAction === 'add' ? '⭐' : '➖');
    showToast(`✅ تم ${modalAction === 'add' ? 'إضافة' : 'خصم'} ${pts} نقطة + إشعار`);
    setModalUser(null);
    setModalPts('');
    setModalReason('');
  };

  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'الرئيسية' },
    { id: 'orders', icon: '📦', label: 'الطلبات', badge: orders.filter((o) => o.status === 'قيد المراجعة').length },
    { id: 'gift_req', icon: '🎁', label: 'طلبات الهدايا', badge: giftReqs.filter((r) => r.status === 'قيد المراجعة').length },
    { id: 'technicians', icon: '👷', label: 'الفنيون' },
    { id: 'notify', icon: '🔔', label: 'الإشعارات' },
    { id: 'delivery', icon: '🚚', label: 'إعدادات التوصيل' },
    { id: 'gifts', icon: '🏆', label: 'الهدايا' },
    { id: 'offers', icon: '🏷️', label: 'العروض' },
    { id: 'users', icon: '👥', label: 'المستخدمون' },
    { id: 'points', icon: '⭐', label: 'النقاط' },
    { id: 'pts_log', icon: '📝', label: 'سجل النقاط' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Bebas+Neue&display=swap');
        @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .row:hover{background:#F8FBFF!important}.nb:hover{background:#EEF4FF!important}
      `}</style>
      <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', background: S.bg, fontFamily: "'Cairo',sans-serif", direction: 'rtl' }}>
        {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: toast.color, color: '#000', padding: '12px 28px', borderRadius: 14, fontWeight: 700, zIndex: 1000, animation: 'slideIn .3s ease' }}>{toast.msg}</div>}
        {modalUser && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: S.card, borderRadius: 20, padding: 28, width: '100%', maxWidth: 440, border: `1px solid ${S.border}`, animation: 'slideIn .3s ease' }}>
              <div style={{ color: S.text, fontSize: 18, fontWeight: 800, marginBottom: 20 }}>تعديل نقاط — {modalUser.name}</div>
              <div style={{ background: S.bg, borderRadius: 14, padding: 14, marginBottom: 20, border: `1px solid ${S.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: S.muted }}>الرصيد الحالي</span>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: S.accent, fontSize: 28 }}>{(modalUser.points || 0).toLocaleString()} ⭐</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {[['add', '➕ إضافة', S.green], ['sub', '➖ خصم', S.red]].map(([v, l, c]) => (
                  <button key={v} onClick={() => setModalAction(v)} style={{ flex: 1, background: modalAction === v ? `${c}22` : '#F8FBFF', border: `2px solid ${modalAction === v ? c : S.border}`, borderRadius: 12, padding: 10, color: modalAction === v ? c : S.muted, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{l}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {[50, 100, 200, 500, 1000].map((n) => (
                  <button key={n} onClick={() => setModalPts(String(n))} style={{ background: modalPts === String(n) ? S.accent + '22' : '#F8FBFF', border: `1px solid ${modalPts === String(n) ? S.accent : S.border}`, borderRadius: 8, padding: '6px 14px', color: modalPts === String(n) ? S.accent : S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{n}</button>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>عدد النقاط</label><input type="number" value={modalPts} onChange={(e) => setModalPts(e.target.value)} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>
              <div style={{ marginBottom: 20 }}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>السبب</label><input value={modalReason} onChange={(e) => setModalReason(e.target.value)} placeholder="مثال: عرض خاص" style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setModalUser(null); setModalPts(''); setModalReason(''); }} style={{ flex: 1, background: '#F8FBFF', border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, color: S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>إلغاء</button>
                <button onClick={applyPts} disabled={!modalPts || !modalReason} style={{ flex: 2, background: modalAction === 'add' ? `linear-gradient(135deg,${S.green},#059669)` : `linear-gradient(135deg,${S.red},#dc2626)`, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif", opacity: (!modalPts || !modalReason) ? 0.5 : 1 }}>
                  {modalAction === 'add' ? `✅ إضافة ${modalPts || '...'}` : `❌ خصم ${modalPts || '...'}`}
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ width: 220, background: S.sidebar, borderLeft: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', padding: '20px 0', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '0 20px 20px', borderBottom: `1px solid ${S.border}` }}>
            <div style={{ background: S.accent, width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 10 }}>💡</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", color: S.accent, fontSize: 20, letterSpacing: 2 }}>أضواء المدينة</div>
            <div style={{ color: S.muted, fontSize: 10, marginTop: 2 }}>📞 {SUPPORT}</div>
            <div style={{ color: S.green, fontSize: 10, marginTop: 2 }}>📱 لوحة تحكم الموبايل</div>
          </div>
          <nav style={{ flex: 1, padding: 12 }}>
            {navItems.map((it) => (
              <button key={it.id} className="nb" onClick={() => setPage(it.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', marginBottom: 4, background: page === it.id ? '#EEF4FF' : 'none' }}>
                <span style={{ fontSize: 16, opacity: page === it.id ? 1 : 0.5 }}>{it.icon}</span>
                <span style={{ color: page === it.id ? S.accent : S.muted, fontSize: 12, fontWeight: page === it.id ? 700 : 400 }}>{it.label}</span>
                {it.badge > 0 && <span style={{ background: S.red, color: '#fff', fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 'auto', padding: '0 4px' }}>{it.badge}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: S.accent, fontSize: 18 }}>⏳ جاري التحميل...</div> : (
            <>
              {page === 'dashboard' && <Dashboard products={products} users={users} giftReqs={giftReqs} orders={orders} technicians={technicians} />}
              {page === 'orders' && <OrdersPage orders={orders} onUpdate={updateOrder} />}
              {page === 'gift_req' && <GiftReqsPage giftReqs={giftReqs} onUpdate={updateGift} />}
              {page === 'technicians' && <TechniciansPage technicians={technicians} showToast={showToast} />}
              {page === 'notify' && <NotifyPage users={users} onSend={sendNotif} onBroadcast={sendBroadcast} showToast={showToast} />}
              {page === 'delivery' && <DeliveryPage showToast={showToast} />}
              {page === 'gifts' && <GiftsPage gifts={gifts} showToast={showToast} />}
              {page === 'offers' && <OffersPage offers={offers} showToast={showToast} />}
              {page === 'users' && <UsersPage users={users} onEdit={(u) => { setModalUser(u); setModalAction('add'); }} />}
              {page === 'points' && <PointsPage users={users} onEdit={(u, mode = 'add') => { setModalUser(u); setModalAction(mode); }} />}
              {page === 'pts_log' && <PtsLogPage ptsLog={ptsLog} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Dashboard({ products, users, giftReqs, orders, technicians }) {
  const po = orders.filter((o) => o.status === 'قيد المراجعة').length;
  const pg = giftReqs.filter((r) => r.status === 'قيد المراجعة').length;
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>📊 لوحة التحكم</div>
      <div style={{ color: S.muted, fontSize: 12, marginBottom: 20 }}>📞 {SUPPORT}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[{ icon: '⚡', label: 'المواد', val: products.length, c: S.blue }, { icon: '👥', label: 'المستخدمون', val: users.length, c: S.green }, { icon: '👷', label: 'الفنيون', val: technicians.length, c: S.accent }, { icon: '📦', label: 'طلبات جديدة', val: po, c: po > 0 ? S.red : S.muted }].map((st) => (
          <div key={st.label} style={{ background: S.card, borderRadius: 16, padding: 18, border: `1px solid ${S.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><div><div style={{ color: S.muted, fontSize: 11, marginBottom: 6 }}>{st.label}</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", color: st.c, fontSize: 34 }}>{st.val}</div></div><div style={{ fontSize: 28, opacity: 0.7 }}>{st.icon}</div></div>
          </div>
        ))}
      </div>
      {(po > 0 || pg > 0) && <div style={{ background: '#ef444411', borderRadius: 16, padding: 18, border: `1px solid ${S.red}33`, marginBottom: 20 }}>
        <div style={{ color: S.red, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>🚨 تتطلب موافقتك</div>
        {po > 0 && <div style={{ color: S.text, fontSize: 13, marginBottom: 4 }}>📦 {po} طلب شراء</div>}
        {pg > 0 && <div style={{ color: S.text, fontSize: 13 }}>🎁 {pg} طلب هدية</div>}
      </div>}
      <div style={{ background: S.card, borderRadius: 18, padding: 20, border: `1px solid ${S.border}` }}>
        <div style={{ color: S.text, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📦 آخر الطلبات</div>
        {orders.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 20 }}>لا توجد طلبات</div> :
          orders.slice(0, 5).map((o, i) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 4 ? `1px solid ${S.border}` : 'none' }}>
              <div style={{ flex: 1 }}><div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{o.userName}</div><div style={{ color: S.muted, fontSize: 11 }}>{o.date}</div></div>
              <span style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 20, padding: '2px 10px', color: S.accent, fontSize: 11, fontWeight: 700 }}>{o.status}</span>
              <div style={{ color: S.accent, fontSize: 14, fontWeight: 700 }}>{fmt(o.total)}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function OrdersPage({ orders, onUpdate }) {
  const [f, setF] = useState('all');
  const list = orders.filter((o) => f === 'all' || o.status === f);
  const sc = { 'قيد المراجعة': S.accent, 'تم التأكيد': S.blue, 'قيد التجهيز': '#a78bfa', 'تم التسليم': S.green, 'ملغي': S.red };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>📦 الطلبات</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'الكل'], ['قيد المراجعة', 'جديد 🔴'], ['تم التأكيد', 'مؤكد'], ['قيد التجهيز', 'جاري'], ['تم التسليم', 'تم'], ['ملغي', 'ملغي']].map(([v, l]) => (
          <button key={v} onClick={() => setF(v)} style={{ background: f === v ? S.accent : '#F8FBFF', border: `1px solid ${f === v ? S.accent : S.border}`, borderRadius: 20, padding: '6px 14px', color: f === v ? '#fff' : S.muted, fontSize: 12, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{l}</button>
        ))}
      </div>
      <div style={{ background: S.card, borderRadius: 18, border: `1px solid ${S.border}` }}>
        {list.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 40 }}>لا توجد طلبات</div> :
          list.map((o, i) => (
            <div key={o.id} style={{ padding: 16, borderBottom: i < list.length - 1 ? `1px solid ${S.border}` : 'none', background: o.status === 'قيد المراجعة' ? '#F5C80008' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ color: S.text, fontSize: 14, fontWeight: 700 }}>{o.userName}</div>
                  <div style={{ color: S.muted, fontSize: 12 }}>{o.userPhone} • {o.date}</div>
                  <div style={{ color: S.accent, fontSize: 13, fontWeight: 700, marginTop: 4 }}>{fmt(o.total)} • {o.itemsCount || 1} منتج</div>
                  {o.address && <div style={{ color: S.subtle, fontSize: 12, marginTop: 4 }}>📍 {o.address.province}، {o.address.area}{o.address.landmark ? ` — ${o.address.landmark}` : ''}</div>}
                  {o.address?.phone2 && <div style={{ color: S.subtle, fontSize: 12 }}>📞 {o.address.phone2}</div>}
                </div>
                <span style={{ background: `${sc[o.status] || '#888'}22`, border: `1px solid ${sc[o.status] || '#888'}44`, borderRadius: 20, padding: '3px 12px', color: sc[o.status] || '#888', fontSize: 12, fontWeight: 700 }}>{o.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {o.status === 'قيد المراجعة' && <><button onClick={() => onUpdate(o.id, 'تم التأكيد', o)} style={Btn(S.green)}>✅ قبول + إشعار</button><button onClick={() => onUpdate(o.id, 'ملغي', o)} style={Btn(S.red)}>❌ رفض + إشعار</button></>}
                {o.status === 'تم التأكيد' && <button onClick={() => onUpdate(o.id, 'قيد التجهيز', o)} style={Btn('#a78bfa')}>⚙️ جاري التجهيز</button>}
                {o.status === 'قيد التجهيز' && <button onClick={() => onUpdate(o.id, 'تم التسليم', o)} style={Btn(S.green)}>🎉 تم التسليم</button>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function GiftReqsPage({ giftReqs, onUpdate }) {
  const [f, setF] = useState('all');
  const list = giftReqs.filter((r) => f === 'all' || r.status === f);
  const sc = { 'قيد المراجعة': S.accent, 'تمت الموافقة': S.blue, 'تم التسليم': S.green, 'مرفوض': S.red };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🎁 طلبات الهدايا</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'الكل'], ['قيد المراجعة', 'جديد 🔴'], ['تمت الموافقة', 'موافق'], ['تم التسليم', 'تم'], ['مرفوض', 'مرفوض']].map(([v, l]) => (
          <button key={v} onClick={() => setF(v)} style={{ background: f === v ? S.accent : '#F8FBFF', border: `1px solid ${f === v ? S.accent : S.border}`, borderRadius: 20, padding: '6px 14px', color: f === v ? '#fff' : S.muted, fontSize: 12, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{l}</button>
        ))}
      </div>
      <div style={{ background: S.card, borderRadius: 18, border: `1px solid ${S.border}` }}>
        {list.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 40 }}>لا توجد طلبات</div> :
          list.map((r, i) => (
            <div key={r.id} style={{ padding: 16, borderBottom: i < list.length - 1 ? `1px solid ${S.border}` : 'none', background: r.status === 'قيد المراجعة' ? '#F5C80008' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 32 }}>{r.giftIcon || '🎁'}</span>
                  <div><div style={{ color: S.text, fontSize: 14, fontWeight: 700 }}>{r.userName}</div><div style={{ color: S.muted, fontSize: 12 }}>{r.userPhone} • {r.date}</div><div style={{ color: S.accent, fontSize: 13, fontWeight: 700 }}>{r.giftName} — {r.ptsUsed} ⭐</div></div>
                </div>
                <span style={{ background: `${sc[r.status] || '#888'}22`, border: `1px solid ${sc[r.status] || '#888'}44`, borderRadius: 20, padding: '3px 12px', color: sc[r.status] || '#888', fontSize: 12, fontWeight: 700 }}>{r.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {r.status === 'قيد المراجعة' && <><button onClick={() => onUpdate(r.id, 'تمت الموافقة', r)} style={Btn(S.green)}>✅ موافقة + إشعار</button><button onClick={() => onUpdate(r.id, 'مرفوض', r)} style={Btn(S.red)}>❌ رفض + إشعار</button></>}
                {r.status === 'تمت الموافقة' && <button onClick={() => onUpdate(r.id, 'تم التسليم', r)} style={Btn(S.green)}>🎉 تم التسليم</button>}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function TechniciansPage({ technicians, showToast }) {
  const SPECS = ['كهرباء عامة', 'إضاءة', 'تمديدات', 'تابلوهات', 'صيانة', 'طاقة شمسية'];
  const E = { name: '', phone: '', specialty: 'كهرباء عامة', address: '', province: 'بغداد', bio: '', workHours: '٨ص — ٨م', visitFee: '', imageUrl: '', workImages: [], available: true };
  const [form, setForm] = useState(E);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selTech, setSelTech] = useState(null);
  const save = async () => {
    if (!form.name.trim()) return showToast('⚠️ أدخل اسم الفني', '#ef4444');
    if (!form.phone.trim()) return showToast('⚠️ أدخل رقم الهاتف', '#ef4444');
    const data = { ...form, visitFee: form.visitFee ? Number(form.visitFee) : 0, ratings: editing ? form.ratings || [] : [] };
    if (editing) { await updateDoc(doc(db, 'technicians', editing), data); showToast('✅ تم تحديث الفني'); } else { await addDoc(collection(db, 'technicians'), { ...data, createdAt: new Date().toISOString() }); showToast('✅ تمت إضافة الفني'); }
    setForm(E); setEditing(null); setShowForm(false);
  };
  const del = async (id, name) => { if (!confirm(`حذف الفني "${name}"؟`)) return; await deleteDoc(doc(db, 'technicians', id)); showToast('🗑️ تم الحذف', '#ef4444'); };
  const edit = (t) => { setForm({ ...t, visitFee: String(t.visitFee || '') }); setEditing(t.id); setShowForm(true); setSelTech(null); };
  const avg = (t) => { if (!t.ratings || t.ratings.length === 0) return '—'; return (t.ratings.reduce((s, r) => s + r.value, 0) / t.ratings.length).toFixed(1); };
  if (selTech) return <div style={{ color: S.text }}>...</div>;
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ color: S.text, fontSize: 22, fontWeight: 800 }}>👷 إدارة الفنيين</div><div style={{ color: S.muted, fontSize: 12 }}>{technicians.length} فني مسجّل</div></div>
        <button onClick={() => { setForm(E); setEditing(null); setShowForm(true); }} style={{ background: S.accent, color: '#000', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>+ إضافة فني</button>
      </div>
      {showForm && (
        <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}`, boxShadow: '0 10px 30px rgba(15,23,42,0.06)', marginBottom: 20, animation: 'slideIn .3s ease' }}>
          <div style={{ color: S.accent, fontSize: 16, fontWeight: 800, marginBottom: 20 }}>{editing ? '✏️ تعديل فني' : '➕ إضافة فني جديد'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1/-1' }}><ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="📷 صورة الفني الشخصية" /></div>
            {[['الاسم الكامل *', 'name', 'text'], ['رقم الهاتف *', 'phone', 'tel'], ['العنوان', 'address', 'text'], ['ساعات العمل', 'workHours', 'text'], ['أجرة الكشف (د.ع)', 'visitFee', 'number'], ['نبذة عن الفني', 'bio', 'text']].map(([lb, k, type]) => (
              <div key={k} style={k === 'bio' ? { gridColumn: '1/-1' } : {}}>
                <label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>{lb}</label>
                <input type={type} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} />
              </div>
            ))}
            <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>التخصص *</label><select value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }}>{SPECS.map((sp) => <option key={sp}>{sp}</option>)}</select></div>
            <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>المحافظة</label><select value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }}>{['بغداد', 'كربلاء', 'النجف', 'البصرة', 'الموصل', 'أربيل', 'السليمانية', 'كركوك', 'ديالى', 'الأنبار', 'واسط', 'ميسان', 'ذي قار', 'المثنى', 'القادسية', 'بابل', 'صلاح الدين', 'دهوك', 'حلبجة'].map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>الحالة</label><div style={{ display: 'flex', gap: 10 }}>{[[true, 'متاح', S.green], [false, 'مشغول', S.red]].map(([v, l, c]) => <button key={l} onClick={() => setForm((f) => ({ ...f, available: v }))} style={{ flex: 1, background: form.available === v ? `${c}22` : '#111', border: `2px solid ${form.available === v ? c : S.border}`, borderRadius: 10, padding: 8, color: form.available === v ? c : S.muted, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{l}</button>)}</div></div>
            <div style={{ gridColumn: '1/-1' }}><MultiImageUploader values={form.workImages || []} onChange={(imgs) => setForm((f) => ({ ...f, workImages: imgs }))} label="🖼️ صور الأعمال" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => { setShowForm(false); setForm(E); setEditing(null); }} style={{ flex: 1, background: '#F8FBFF', border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, color: S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>إلغاء</button>
            <button onClick={save} style={{ flex: 2, background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{editing ? '💾 حفظ التعديلات' : '✅ إضافة الفني'}</button>
          </div>
        </div>
      )}
      {technicians.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 60, background: S.card, borderRadius: 18, border: `1px solid ${S.border}` }}>لا يوجد فنيون — أضف أول فني!</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {technicians.map((t) => {
            const av = t.ratings && t.ratings.length > 0 ? (t.ratings.reduce((s, r) => s + r.value, 0) / t.ratings.length).toFixed(1) : '—';
            return (
              <div key={t.id} style={{ background: S.card, borderRadius: 16, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 14, padding: 14 }}>
                  <div style={{ width: 70, height: 70, borderRadius: 12, background: '#F8FBFF', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${S.border}` }}>{t.imageUrl ? <img src={t.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 32 }}>👷</span>}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: S.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                    <div style={{ background: '#EEF4FF', borderRadius: 8, display: 'inline-block', padding: '2px 8px', marginBottom: 6 }}><span style={{ color: S.accent, fontSize: 11, fontWeight: 700 }}>🔧 {t.specialty}</span></div>
                    <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>📍 {t.province} — {t.address}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: S.accent, fontSize: 13 }}>⭐ {av} ({t.ratings?.length || 0})</span>
                      <span style={{ background: t.available ? '#10b98122' : '#ef444422', border: `1px solid ${t.available ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '2px 8px', color: t.available ? S.green : S.red, fontSize: 10, fontWeight: 700 }}>{t.available ? 'متاح' : 'مشغول'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', borderTop: `1px solid ${S.border}` }}>
                  <button onClick={() => edit(t)} style={{ flex: 1, background: 'none', border: 'none', borderLeft: `1px solid ${S.border}`, padding: '10px', color: S.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>✏️ تعديل</button>
                  <button onClick={() => del(t.id, t.name)} style={{ flex: 1, background: 'none', border: 'none', padding: '10px', color: S.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>🗑️ حذف</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

function NotifyPage({ users, onSend, onBroadcast, showToast }) {
  const [sel, setSel] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [icon, setIcon] = useState('📢');
  const [sending, setSending] = useState(false);
  const ICONS = ['📢', '🎉', '⭐', '🎁', '⚡', '🔔', '✅', '❌', '💡', '🏷️', '📦', '💰', '👷'];
  const send = async () => {
    if (!title.trim() || !body.trim()) return showToast('⚠️ أدخل العنوان والمحتوى', '#ef4444');
    setSending(true);
    try {
      if (sel === 'all') { await onBroadcast(title, body, icon); showToast('✅ تم الإرسال للجميع'); }
      else { const u = users.find((u) => u.id === sel); await onSend(sel, u?.name || '', title, body, icon); showToast(`✅ تم الإرسال لـ ${u?.name}`); }
      setTitle(''); setBody('');
    } catch { showToast('❌ حدث خطأ', '#ef4444'); }
    setSending(false);
  };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🔔 الإشعارات</div>
      <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>المستلم</label><select value={sel} onChange={(e) => setSel(e.target.value)} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }}><option value="all">الجميع</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>الأيقونة</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ICONS.map((e) => <button key={e} onClick={() => setIcon(e)} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${icon === e ? S.accent : S.border}`, background: icon === e ? '#F5C80022' : 'none', fontSize: 18, cursor: 'pointer' }}>{e}</button>)}</div></div>
          <div style={{ gridColumn: '1/-1' }}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>العنوان</label><input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>
          <div style={{ gridColumn: '1/-1' }}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>المحتوى</label><textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', minHeight: 120, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>
        </div>
        <button onClick={send} disabled={sending} style={{ marginTop: 18, background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{sending ? '⏳ جاري الإرسال...' : 'إرسال الإشعار'}</button>
      </div>
    </div>
  );
}

function DeliveryPage({ showToast }) {
  const [price, setPrice] = useState('');
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'delivery'), (snap) => setPrice(String(snap.data()?.price || '')));
    return () => unsub();
  }, []);
  const save = async () => { await setDoc(doc(db, 'settings', 'delivery'), { price: Number(price || 0), updatedAt: new Date().toISOString() }, { merge: true }); showToast('✅ تم حفظ سعر التوصيل'); };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🚚 إعدادات التوصيل</div>
      <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}`, maxWidth: 460 }}>
        <label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 6 }}>سعر التوصيل</label>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none', marginBottom: 16 }} />
        <button onClick={save} style={{ background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>حفظ</button>
      </div>
    </div>
  );
}

function ProductsPage({ products, showToast }) {
  const E = { name: '', cat: 'كابلات', price: '', unit: 'متر', brand: '', stock: true, pts: '', img: '🔌', imageUrl: '', desc: '' };
  const [form, setForm] = useState(E);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const CATS = ['كابلات', 'إضاءة', 'قواطع', 'مفاتيح', 'أسلاك', 'أدوات', 'أخرى'];
  const EMOJIS = ['📦', '💡', '🔌', '⚡', '🔧', '🔲', '📏', '🟡', '🔒', '🔬'];
  const filtered = products.filter((p) => p.name?.includes(search) || p.cat?.includes(search));
  const save = async () => {
    if (!form.name || !form.price) return showToast('⚠️ أدخل الاسم والسعر', '#ef4444');
    const data = { ...form, price: Number(form.price), pts: Number(form.pts || 0) };
    if (editing) { await updateDoc(doc(db, 'products', editing), data); showToast('✅ تم التحديث'); } else { await addDoc(collection(db, 'products'), { ...data, createdAt: new Date().toISOString() }); showToast('✅ تمت الإضافة'); }
    setForm(E); setEditing(null); setShowForm(false);
  };
  const del = async (id, name) => { if (!confirm(`حذف "${name}"؟`)) return; await deleteDoc(doc(db, 'products', id)); showToast('🗑️ تم الحذف', '#ef4444'); };
  const edit = (p) => { setForm({ ...p, price: String(p.price || ''), pts: String(p.pts || ''), imageUrl: p.imageUrl || p.imgUrl || '' }); setEditing(p.id); setShowForm(true); };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ color: S.text, fontSize: 22, fontWeight: 800 }}>⚡ إدارة المواد</div><div style={{ color: S.muted, fontSize: 12 }}>{products.length} مادة</div></div>
        <button onClick={() => { setForm(E); setEditing(null); setShowForm(true); }} style={{ background: S.accent, color: '#000', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>+ إضافة مادة</button>
      </div>
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}><span>🔍</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." style={{ background: 'none', border: 'none', outline: 'none', color: S.text, fontSize: 14, flex: 1 }} /></div>
      {showForm && <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}`, boxShadow: '0 10px 30px rgba(15,23,42,0.06)', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}><ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="📷 صورة المنتج" /></div>
          {[['اسم المادة', 'name'], ['السعر', 'price'], ['النقاط', 'pts'], ['الوصف', 'desc'], ['العلامة', 'brand'], ['الوحدة', 'unit']].map(([lb, k]) => (<div key={k} style={k === 'desc' ? { gridColumn: '1/-1' } : {}}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>{lb}</label><input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>))}
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>التصنيف</label><select value={form.cat} onChange={(e) => setForm((f) => ({ ...f, cat: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>أيقونة احتياطية</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{EMOJIS.map((e) => <button key={e} onClick={() => setForm((f) => ({ ...f, img: e }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${form.img === e ? S.accent : S.border}`, background: form.img === e ? '#F5C80022' : 'none', fontSize: 18, cursor: 'pointer' }}>{e}</button>)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button onClick={() => { setShowForm(false); setForm(E); setEditing(null); }} style={{ flex: 1, background: '#F8FBFF', border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, color: S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>إلغاء</button><button onClick={save} style={{ flex: 2, background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{editing ? '💾 حفظ' : '✅ إضافة'}</button></div>
      </div>}
      <div style={{ background: S.card, borderRadius: 18, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: `1px solid ${S.border}`, background: '#F8FBFF' }}>{['المنتج', 'التصنيف', 'السعر', 'النقاط', 'الحالة', 'إجراء'].map((h) => <div key={h} style={{ color: S.muted, fontSize: 11, fontWeight: 700 }}>{h}</div>)}</div>
        {filtered.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 40 }}>لا توجد منتجات</div> : filtered.map((p, i) => (
          <div key={p.id} className="row" style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: i < filtered.length - 1 ? `1px solid ${S.border}` : 'none', alignItems: 'center', transition: 'background .15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 44, height: 44, borderRadius: 10, background: '#F8FBFF', border: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>{p.imageUrl || p.imgUrl ? <img src={p.imageUrl || p.imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>{p.img || '⚡'}</span>}</div><div><div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{p.name}</div><div style={{ color: S.muted, fontSize: 11 }}>{p.brand}</div></div></div>
            <div style={{ color: S.subtle, fontSize: 12 }}>{p.cat}</div><div style={{ color: S.accent, fontSize: 13, fontWeight: 700 }}>{fmt(p.price || p.sellPrice)}</div><div style={{ color: S.accent, fontSize: 13 }}>+{p.pts || 0} ⭐</div>
            <div><span style={{ background: (p.stockCount || p.stock || 0) ? '#10b98122' : '#ef444422', border: `1px solid ${(p.stockCount || p.stock || 0) ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '2px 10px', color: (p.stockCount || p.stock || 0) ? S.green : S.red, fontSize: 11, fontWeight: 700 }}>{(p.stockCount || p.stock || 0) ? 'متوفر' : 'نفد'}</span></div>
            <div style={{ display: 'flex', gap: 6 }}><button onClick={() => edit(p)} style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 8, padding: '5px 10px', color: S.accent, fontSize: 12, cursor: 'pointer' }}>✏️</button><button onClick={() => del(p.id, p.name)} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 8, padding: '5px 10px', color: S.red, fontSize: 12, cursor: 'pointer' }}>🗑️</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GiftsPage({ gifts, showToast }) {
  const E = { name: '', cat: 'خصومات', pts: '', icon: '🎁', imageUrl: '', left: '99', desc: '' };
  const [form, setForm] = useState(E); const [editing, setEditing] = useState(null); const [showForm, setShowForm] = useState(false);
  const GCATS = ['خدمات', 'خصومات', 'هدايا صغيرة', 'هدايا متوسطة', 'هدايا كبيرة', 'هدايا VIP'];
  const EMOJIS = ['🎁', '☕', '🚚', '🏷️', '🧰', '💰', '📏', '✂️', '🎫', '🔧', '⭐'];
  const save = async () => { if (!form.name || !form.pts) return showToast('⚠️ أدخل الاسم والنقاط', '#ef4444'); const data = { ...form, pts: Number(form.pts), left: Number(form.left) }; if (editing) { await updateDoc(doc(db, 'gifts', editing), data); showToast('✅ تم التحديث'); } else { await addDoc(collection(db, 'gifts'), data); showToast('✅ تمت الإضافة'); } setForm(E); setEditing(null); setShowForm(false); };
  const del = async (id, n) => { if (!confirm(`حذف "${n}"؟`)) return; await deleteDoc(doc(db, 'gifts', id)); showToast('🗑️ تم الحذف', '#ef4444'); };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ color: S.text, fontSize: 22, fontWeight: 800 }}>🏆 إدارة الهدايا</div><div style={{ color: S.muted, fontSize: 12 }}>{gifts.length} هدية</div></div>
        <button onClick={() => { setForm(E); setEditing(null); setShowForm(true); }} style={{ background: S.accent, color: '#000', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>+ إضافة هدية</button>
      </div>
      {showForm && <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}`, boxShadow: '0 10px 30px rgba(15,23,42,0.06)', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}><ImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="📷 صورة الهدية" /></div>
          {[['اسم الهدية', 'name'], ['النقاط المطلوبة', 'pts'], ['الكمية المتاحة', 'left'], ['الوصف', 'desc']].map(([lb, k]) => (<div key={k} style={k === 'desc' ? { gridColumn: '1/-1' } : {}}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>{lb}</label><input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>))}
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>التصنيف</label><select value={form.cat} onChange={(e) => setForm((f) => ({ ...f, cat: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }}>{GCATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>أيقونة احتياطية</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{EMOJIS.map((e) => <button key={e} onClick={() => setForm((f) => ({ ...f, icon: e }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${form.icon === e ? S.accent : S.border}`, background: form.icon === e ? '#F5C80022' : 'none', fontSize: 18, cursor: 'pointer' }}>{e}</button>)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button onClick={() => { setShowForm(false); setForm(E); setEditing(null); }} style={{ flex: 1, background: '#F8FBFF', border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, color: S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>إلغاء</button><button onClick={save} style={{ flex: 2, background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{editing ? '💾 حفظ' : '✅ إضافة'}</button></div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {gifts.length === 0 ? <div style={{ gridColumn: '1/-1', color: S.muted, textAlign: 'center', padding: 60 }}>لا توجد هدايا</div> : gifts.map((g) => (
          <div key={g.id} style={{ background: S.card, borderRadius: 16, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
            <div style={{ height: 120, background: '#F8FBFF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${S.border}` }}>{g.imageUrl ? <img src={g.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 44 }}>{g.icon || '🎁'}</span>}</div>
            <div style={{ padding: 12 }}><div style={{ color: S.text, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{g.name}</div><div style={{ color: S.accent, fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{(g.pts || 0).toLocaleString()} ⭐</div><div style={{ color: S.muted, fontSize: 11, marginBottom: 10 }}>{g.cat} • متبقي: {g.left}</div><div style={{ display: 'flex', gap: 8 }}><button onClick={() => { setForm({ ...g, pts: String(g.pts), left: String(g.left), imageUrl: g.imageUrl || '' }); setEditing(g.id); setShowForm(true); }} style={{ flex: 1, background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: 7, color: S.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>✏️</button><button onClick={() => del(g.id, g.name)} style={{ flex: 1, background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: 7, color: S.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>🗑️</button></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OffersPage({ offers, showToast }) {
  const E = { title: '', desc: '', badge: 'عرض خاص', icon: '🏷️', color: '#2a2400', active: true };
  const [form, setForm] = useState(E); const [editing, setEditing] = useState(null); const [showForm, setShowForm] = useState(false);
  const ICONS = ['🏷️', '⚡', '💡', '🎁', '🔥', '💰', '✂️', '🎯', '⭐', '🎉', '🏆', '📦', '👷'];
  const COLORS = ['#2a2400', '#0a1628', '#0a2010', '#1a0010', '#1a1a00', '#001a1a'];
  const save = async () => { if (!form.title.trim()) return showToast('⚠️ أدخل العنوان', '#ef4444'); if (editing) { await updateDoc(doc(db, 'offers', editing), form); showToast('✅ تم التحديث'); } else { await addDoc(collection(db, 'offers'), { ...form, createdAt: new Date().toISOString() }); showToast('✅ تمت الإضافة'); } setForm(E); setEditing(null); setShowForm(false); };
  const del = async (id, t) => { if (!confirm(`حذف "${t}"؟`)) return; await deleteDoc(doc(db, 'offers', id)); showToast('🗑️ تم الحذف', '#ef4444'); };
  const toggle = async (id, cur) => { await updateDoc(doc(db, 'offers', id), { active: !cur }); showToast(!cur ? '✅ تم التفعيل' : '⏸️ تم الإيقاف'); };
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ color: S.text, fontSize: 22, fontWeight: 800 }}>🏷️ العروض</div><div style={{ color: S.muted, fontSize: 12 }}>{offers.length} عرض</div></div>
        <button onClick={() => { setForm(E); setEditing(null); setShowForm(true); }} style={{ background: S.accent, color: '#000', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>+ إضافة عرض</button>
      </div>
      {showForm && <div style={{ background: S.card, borderRadius: 18, padding: 24, border: `1px solid ${S.border}`, boxShadow: '0 10px 30px rgba(15,23,42,0.06)', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[['عنوان العرض', 'title'], ['شارة', 'badge'], ['الوصف', 'desc']].map(([lb, k]) => (<div key={k} style={k === 'desc' ? { gridColumn: '1/-1' } : {}}><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>{lb}</label><input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '10px 12px', color: S.text, outline: 'none' }} /></div>))}
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>الأيقونة</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ICONS.map((e) => <button key={e} onClick={() => setForm((f) => ({ ...f, icon: e }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${form.icon === e ? S.accent : S.border}`, background: form.icon === e ? '#F5C80022' : 'none', fontSize: 18, cursor: 'pointer' }}>{e}</button>)}</div></div>
          <div><label style={{ color: S.muted, fontSize: 12, display: 'block', marginBottom: 5 }}>اللون</label><div style={{ display: 'flex', gap: 8 }}>{COLORS.map((c) => <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))} style={{ width: 36, height: 36, borderRadius: 8, background: c, border: `2px solid ${form.color === c ? S.accent : S.border}`, cursor: 'pointer' }} />)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><button onClick={() => { setShowForm(false); setForm(E); setEditing(null); }} style={{ flex: 1, background: '#F8FBFF', border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, color: S.muted, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>إلغاء</button><button onClick={save} style={{ flex: 2, background: `linear-gradient(135deg,${S.accent},${S.accentHover || '#A86E00'})`, color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{editing ? '💾 حفظ' : '✅ إضافة'}</button></div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {offers.length === 0 ? <div style={{ gridColumn: '1/-1', color: S.muted, textAlign: 'center', padding: 60 }}>لا توجد عروض</div> : offers.map((o) => (
          <div key={o.id} style={{ background: '#FFFFFF', borderRadius: 16, padding: 20, border: `1px solid ${S.border}`, boxShadow: '0 8px 24px rgba(15,23,42,0.05)', opacity: o.active ? 1 : 0.72 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 36 }}>{o.icon}</span><span style={{ background: o.active ? '#10b98122' : '#ef444422', border: `1px solid ${o.active ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '2px 10px', color: o.active ? S.green : S.red, fontSize: 11, fontWeight: 700 }}>{o.active ? 'مفعّل' : 'متوقف'}</span></div>
            {o.badge && <div style={{ color: S.accent, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>{o.badge}</div>}
            <div style={{ color: S.text, fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{o.title}</div>
            <div style={{ color: '#a89840', fontSize: 12, marginBottom: 14 }}>{o.desc}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => toggle(o.id, o.active)} style={{ flex: 1, background: o.active ? '#ef444422' : '#10b98122', border: `1px solid ${o.active ? '#ef444444' : '#10b98144'}`, borderRadius: 10, padding: 8, color: o.active ? S.red : S.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>{o.active ? '⏸️ إيقاف' : '▶️ تفعيل'}</button>
              <button onClick={() => { setForm({ ...o }); setEditing(o.id); setShowForm(true); }} style={{ flex: 1, background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: 8, color: S.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>✏️</button>
              <button onClick={() => del(o.id, o.title)} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '8px 12px', color: S.red, fontSize: 12, cursor: 'pointer' }}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersPage({ users, onEdit }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((u) => u.name?.includes(search) || u.phone?.includes(search));
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>👥 المستخدمون</div>
      <div style={{ color: S.muted, fontSize: 12, marginBottom: 16 }}>{users.length} مستخدم</div>
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}><span>🔍</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث..." style={{ background: 'none', border: 'none', outline: 'none', color: S.text, fontSize: 14, flex: 1 }} /></div>
      <div style={{ background: S.card, borderRadius: 18, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: `1px solid ${S.border}`, background: '#F8FBFF' }}>{['المستخدم', 'الهاتف', 'المحافظة', 'النقاط', 'المستوى', 'إجراء'].map((h) => <div key={h} style={{ color: S.muted, fontSize: 11, fontWeight: 700 }}>{h}</div>)}</div>
        {filtered.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 40 }}>لا توجد نتائج</div> : filtered.map((u, i) => {
          const pts = u.points || 0; const tier = pts >= 2000 ? 'بلاتيني' : pts >= 1000 ? 'ذهبي' : pts >= 500 ? 'فضي' : 'برونزي';
          return (<div key={u.id} className="row" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: i < filtered.length - 1 ? `1px solid ${S.border}` : 'none', alignItems: 'center', transition: 'background .15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 10, background: `${TIER_MAP[tier] || '#888'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚡</div><div><div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{u.name || 'مستخدم'}</div><div style={{ color: S.muted, fontSize: 11 }}>{u.joinDate || '—'}</div></div></div>
            <div style={{ color: S.subtle, fontSize: 12 }}>{u.phone}</div><div style={{ color: S.muted, fontSize: 12 }}>{u.address?.province || u.city || '—'}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", color: S.accent, fontSize: 20 }}>{pts.toLocaleString()}</div>
            <span style={{ background: `${TIER_MAP[tier] || '#888'}22`, border: `1px solid ${TIER_MAP[tier] || '#888'}44`, borderRadius: 20, padding: '2px 10px', color: TIER_MAP[tier] || '#888', fontSize: 11, fontWeight: 700 }}>{tier}</span>
            <button onClick={() => onEdit(u)} style={{ background: `${S.accent}22`, border: `1px solid ${S.accent}44`, borderRadius: 10, padding: '7px 12px', color: S.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Cairo',sans-serif" }}>⭐ تعديل</button>
          </div>);
        })}
      </div>
    </div>
  );
}

function PointsPage({ users, onEdit }) {
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>⭐ إدارة النقاط</div>
      <div style={{ color: S.muted, fontSize: 12, marginBottom: 20 }}>سيصل المستخدم إشعاراً تلقائياً</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {users.length === 0 ? <div style={{ gridColumn: '1/-1', color: S.muted, textAlign: 'center', padding: 60 }}>لا يوجد مستخدمون</div> : users.map((u) => {
          const pts = u.points || 0; const tier = pts >= 2000 ? 'بلاتيني' : pts >= 1000 ? 'ذهبي' : pts >= 500 ? 'فضي' : 'برونزي';
          return (<div key={u.id} style={{ background: S.card, borderRadius: 16, padding: 18, border: `1px solid ${S.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${TIER_MAP[tier] || '#888'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
              <div><div style={{ color: S.text, fontSize: 14, fontWeight: 700 }}>{u.name}</div><div style={{ display: 'flex', gap: 8, marginTop: 4 }}><span style={{ background: `${TIER_MAP[tier] || '#888'}22`, border: `1px solid ${TIER_MAP[tier] || '#888'}44`, borderRadius: 20, padding: '1px 8px', color: TIER_MAP[tier] || '#888', fontSize: 10, fontWeight: 700 }}>{tier}</span><span style={{ fontFamily: "'Bebas Neue',sans-serif", color: S.accent, fontSize: 18 }}>{pts.toLocaleString()} ⭐</span></div></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onEdit(u, 'add')} style={{ background: '#10b98122', border: '1px solid #10b98144', borderRadius: 10, padding: '8px 14px', color: S.green, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
              <button onClick={() => onEdit(u, 'sub')} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '8px 14px', color: S.red, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>−</button>
            </div>
          </div>);
        })}
      </div>
    </div>
  );
}

function PtsLogPage({ ptsLog }) {
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div style={{ color: S.text, fontSize: 22, fontWeight: 800, marginBottom: 6 }}>📝 سجل النقاط</div>
      <div style={{ color: S.muted, fontSize: 12, marginBottom: 16 }}>{ptsLog.length} عملية</div>
      <div style={{ background: S.card, borderRadius: 18, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr', padding: '12px 20px', borderBottom: `1px solid ${S.border}`, background: '#F8FBFF' }}>{['المستخدم', 'العملية', 'النقاط', 'السبب', 'التاريخ'].map((h) => <div key={h} style={{ color: S.muted, fontSize: 11, fontWeight: 700 }}>{h}</div>)}</div>
        {ptsLog.length === 0 ? <div style={{ color: S.muted, textAlign: 'center', padding: 40 }}>لا يوجد سجل</div> : ptsLog.map((l, i) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr', padding: '12px 20px', borderBottom: i < ptsLog.length - 1 ? `1px solid ${S.border}` : 'none', alignItems: 'center' }}>
            <div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{l.userName}</div>
            <span style={{ background: l.action === 'إضافة' ? '#10b98122' : '#ef444422', border: `1px solid ${l.action === 'إضافة' ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '2px 10px', color: l.action === 'إضافة' ? S.green : S.red, fontSize: 11, fontWeight: 700, display: 'inline-block' }}>{l.action === 'إضافة' ? '➕' : '➖'} {l.action}</span>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", color: l.action === 'إضافة' ? S.green : S.red, fontSize: 20 }}>{l.action === 'إضافة' ? '+' : '-'}{l.pts}</div>
            <div style={{ color: S.subtle, fontSize: 12 }}>{l.reason}</div>
            <div style={{ color: S.muted, fontSize: 12 }}>{l.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
