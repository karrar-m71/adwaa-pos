import { useState, useCallback } from 'react';
import { createPasswordHash, verifyPasswordInput } from '../utils/auth';

// كلمات المرور الافتراضية — تُقرأ من localStorage إن وُجدت
const BUILTIN_USERS = [
  { id: 1, username: 'admin',   role: 'مدير',   color: '#F5C800', builtin: true },
  { id: 2, username: 'cashier', role: 'كاشير',  color: '#10b981', builtin: true },
  { id: 3, username: 'account', role: 'محاسب',  color: '#3b82f6', builtin: true },
];

const BUILTIN_FORCE_CHANGE_PREFIX = 'adwaa_force_pwd_change_';

function loadBuiltinConfig(username) {
  try {
    return JSON.parse(localStorage.getItem(`adwaa_user_config_${username}`) || '{}');
  } catch {
    return {};
  }
}

function resolveBuiltinUser(base) {
  const cfg = loadBuiltinConfig(base.username);
  return {
    ...base,
    name:        cfg.name        || (base.username === 'admin' ? 'المدير' : base.username === 'cashier' ? 'الكاشير' : 'المحاسب'),
    extraAccess: cfg.extraAccess || [],
  };
}

function readBuiltinForceChange(username) {
  return localStorage.getItem(`${BUILTIN_FORCE_CHANGE_PREFIX}${username}`) === '1';
}

function writeBuiltinForceChange(username, value) {
  if (value) localStorage.setItem(`${BUILTIN_FORCE_CHANGE_PREFIX}${username}`, '1');
  else localStorage.removeItem(`${BUILTIN_FORCE_CHANGE_PREFIX}${username}`);
}

async function readBuiltinPasswordRecord(username) {
  const hashKey = `adwaa_pwd_hash_${username}`;
  const raw = localStorage.getItem(hashKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.h && parsed?.s) return { passwordHash: parsed };
    } catch {
      // ignore malformed local entry
    }
  }

  const legacyKey = `adwaa_pwd_${username}`;
  const legacyPassword = localStorage.getItem(legacyKey) || '';
  if (!legacyPassword) return {};
  return { password: legacyPassword };
}

async function verifyFirestoreUser(username, password) {
  try {
    const { collection, getDocs, query, where, updateDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const q = query(collection(db, 'pos_users'), where('username', '==', username));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const userDoc = snap.docs[0];
    const data = { id: userDoc.id, ...userDoc.data() };
    const verdict = await verifyPasswordInput(password, data);
    if (!verdict.ok) return null;
    let mustChangePassword = Boolean(data.forcePasswordChange);
    if (verdict.needsMigration) {
      const passwordHash = await createPasswordHash(password);
      if (passwordHash) {
        try {
          await updateDoc(doc(db, 'pos_users', userDoc.id), {
            passwordHash,
            password: '',
            forcePasswordChange: true,
            updatedAt: new Date().toISOString(),
          });
          mustChangePassword = true;
        } catch {
          // ignore migration failure, login should continue
        }
      }
    }
    return { ...data, mustChangePassword };
  } catch {
    return null;
  }
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [setupUser, setSetupUser] = useState('');
  const [setupPass, setSetupPass] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');

  const handle = useCallback(async () => {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) return setError('يرجى إدخال اسم المستخدم وكلمة المرور');
    setLoading(true);
    setError('');

    try {
      // 1) تحقق من المستخدمين المدمجين
      const builtin = BUILTIN_USERS.find(b => b.username === u);
      if (builtin) {
        const resolved = resolveBuiltinUser(builtin);
        const authRecord = await readBuiltinPasswordRecord(u);
        const hasRecord = Boolean(authRecord.passwordHash || authRecord.password);
        if (!hasRecord) {
          setSetupUser(u);
          setSetupMsg('');
          setError('هذا الحساب يحتاج تهيئة كلمة مرور قبل أول دخول');
          return;
        }
        const verdict = await verifyPasswordInput(p, authRecord);
        if (verdict.ok) {
          let mustChangePassword = readBuiltinForceChange(u);
          if (verdict.needsMigration) {
            const passwordHash = await createPasswordHash(p);
            if (passwordHash) {
              localStorage.setItem(`adwaa_pwd_hash_${u}`, JSON.stringify(passwordHash));
              localStorage.removeItem(`adwaa_pwd_${u}`);
              writeBuiltinForceChange(u, true);
              mustChangePassword = true;
            }
          }
          return onLogin({ ...resolved, mustChangePassword });
        }
        setError('كلمة المرور غير صحيحة');
        return;
      }

      // 2) تحقق من مستخدمي Firestore
      const fsUser = await verifyFirestoreUser(u, p);
      if (fsUser) {
        return onLogin(fsUser);
      }

      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
    }
  }, [username, password, onLogin]);

  const handleKey = (e) => { if (e.key === 'Enter') handle(); };

  const handleSetupBuiltin = useCallback(async () => {
    const u = String(setupUser || '').trim();
    if (!u) return;
    if (!setupPass || !setupConfirm) {
      setSetupMsg('يرجى إدخال كلمة المرور وتأكيدها');
      return;
    }
    if (setupPass.length < 6) {
      setSetupMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (setupPass !== setupConfirm) {
      setSetupMsg('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }
    setSetupLoading(true);
    try {
      const payload = await createPasswordHash(setupPass);
      if (!payload) {
        setSetupMsg('تعذر تهيئة كلمة المرور');
        return;
      }
      localStorage.setItem(`adwaa_pwd_hash_${u}`, JSON.stringify(payload));
      localStorage.removeItem(`adwaa_pwd_${u}`);
      writeBuiltinForceChange(u, false);
      setSetupMsg('تمت تهيئة كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.');
      setPassword('');
      setSetupPass('');
      setSetupConfirm('');
    } finally {
      setSetupLoading(false);
    }
  }, [setupUser, setupPass, setupConfirm]);

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Cairo',sans-serif", direction:'rtl' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Bebas+Neue&display=swap'); @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ width:'100%', maxWidth:420, padding:20 }}>
        {/* لوجو */}
        <div style={{ textAlign:'center', marginBottom:32, animation:'fadeIn .5s ease' }}>
          {(() => {
            const logo = localStorage.getItem('adwaa_logo');
            return logo
              ? <img src={logo} style={{ width:80, height:80, borderRadius:20, objectFit:'contain', margin:'0 auto 16px', display:'block' }} alt="logo"/>
              : <div style={{ width:80, height:80, borderRadius:20, background:'linear-gradient(135deg,#F5C800,#d4a800)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 16px', boxShadow:'0 8px 32px #F5C80044' }}>💡</div>;
          })()}
          {(() => {
            try {
              const s = JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
              return <div style={{ fontFamily:"'Bebas Neue'", color:'#F5C800', fontSize:32, letterSpacing:3 }}>{s.storeName || 'أضواء المدينة'}</div>;
            } catch {
              return <div style={{ fontFamily:"'Bebas Neue'", color:'#F5C800', fontSize:32, letterSpacing:3 }}>أضواء المدينة</div>;
            }
          })()}
          <div style={{ color:'#94a3b8', fontSize:13, marginTop:4 }}>نظام نقطة البيع والمحاسبة</div>
        </div>

        {/* نموذج */}
        <div style={{ background:'rgba(255,255,255,0.05)', backdropFilter:'blur(10px)', borderRadius:20, padding:32, border:'1px solid rgba(255,255,255,0.1)', animation:'fadeIn .6s ease', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ color:'#ffffff', fontSize:18, fontWeight:800, marginBottom:24, textAlign:'center' }}>تسجيل الدخول</div>

          <div style={{ marginBottom:16 }}>
            <label style={{ color:'#94a3b8', fontSize:12, display:'block', marginBottom:6 }}>اسم المستخدم</label>
            <input
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); if (setupUser && setupUser !== e.target.value.trim()) setSetupUser(''); }}
              onKeyDown={handleKey}
              autoComplete="username"
              placeholder="أدخل اسم المستخدم"
              style={{ width:'100%', background:'rgba(255,255,255,0.08)', border:`1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.15)'}`, borderRadius:12, padding:'12px 14px', color:'#ffffff', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'", transition:'border-color .2s' }}
            />
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={{ color:'#94a3b8', fontSize:12, display:'block', marginBottom:6 }}>كلمة المرور</label>
            <div style={{ position:'relative' }}>
              <input
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={handleKey}
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                style={{ width:'100%', background:'rgba(255,255,255,0.08)', border:`1px solid ${error ? '#ef4444' : 'rgba(255,255,255,0.15)'}`, borderRadius:12, padding:'12px 44px 12px 14px', color:'#ffffff', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'", transition:'border-color .2s' }}
              />
              <button
                onClick={() => setShowPass(s => !s)}
                style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8', padding:0 }}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)', borderRadius:10, padding:'10px 14px', color:'#fca5a5', fontSize:13, marginBottom:16, textAlign:'center' }}>
              ⚠️ {error}
            </div>
          )}

          {setupUser && (
            <div style={{ background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.4)', borderRadius:10, padding:'10px 12px', marginBottom:14 }}>
              <div style={{ color:'#a7f3d0', fontSize:12, marginBottom:8 }}>
                تهيئة كلمة المرور لأول مرة للحساب: <b>{setupUser}</b>
              </div>
              <input
                type="password"
                value={setupPass}
                onChange={(e) => { setSetupPass(e.target.value); setSetupMsg(''); }}
                placeholder="كلمة المرور الجديدة"
                style={{ width:'100%', marginBottom:8, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 12px', color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'" }}
              />
              <input
                type="password"
                value={setupConfirm}
                onChange={(e) => { setSetupConfirm(e.target.value); setSetupMsg(''); }}
                placeholder="تأكيد كلمة المرور"
                style={{ width:'100%', marginBottom:8, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 12px', color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'" }}
              />
              {setupMsg && <div style={{ color:'#d1fae5', fontSize:11, marginBottom:8 }}>{setupMsg}</div>}
              <button
                onClick={handleSetupBuiltin}
                disabled={setupLoading}
                style={{ width:'100%', background:'#10b981', color:'#052e16', border:'none', borderRadius:10, padding:10, fontWeight:800, fontSize:13, cursor:setupLoading ? 'not-allowed' : 'pointer', fontFamily:"'Cairo'" }}
              >
                {setupLoading ? 'جاري التهيئة...' : 'تهيئة كلمة المرور'}
              </button>
            </div>
          )}

          <button
            onClick={handle}
            disabled={loading}
            style={{ width:'100%', background: loading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#F5C800,#d4a800)', color: loading ? '#64748b' : '#000', border:'none', borderRadius:14, padding:14, fontWeight:800, fontSize:16, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:"'Cairo'", transition:'all .2s', boxShadow: loading ? 'none' : '0 4px 20px #F5C80044' }}>
            {loading ? '⏳ جاري التحقق...' : 'دخول ←'}
          </button>

          {/* معلومات النسخة */}
          <div style={{ marginTop:20, textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:10 }}>
            نظام أضواء المدينة للمحاسبة
          </div>
        </div>
      </div>
    </div>
  );
}
