import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getErrorMessage } from '../../utils/helpers';
import { createPasswordHash } from '../../utils/auth';

const ROLES       = ['مدير','كاشير','محاسب'];
const ROLE_COLORS = { مدير:'#F5C800', كاشير:'#10b981', محاسب:'#3b82f6' };

// كل الأقسام في الشريط الجانبي مع أدوارها الافتراضية
const ALL_SECTIONS = [
  { id:'home',          label:'الرئيسية',           defaultRoles:['مدير','محاسب','كاشير'] },
  { id:'pos_quick',     label:'نقطة البيع',          defaultRoles:['مدير','كاشير'] },
  { id:'warehouse',     label:'المخزن',              defaultRoles:['مدير','محاسب'] },
  { id:'sales',         label:'البيع',               defaultRoles:['مدير','كاشير'] },
  { id:'purchase',      label:'الشراء',              defaultRoles:['مدير','محاسب'] },
  { id:'vouchers_menu', label:'السندات',             defaultRoles:['مدير','محاسب'] },
  { id:'customers_menu',label:'الزبائن',             defaultRoles:['مدير','كاشير','محاسب'] },
  { id:'suppliers_menu',label:'الموردون',            defaultRoles:['مدير','محاسب'] },
  { id:'expenses_menu', label:'المصروفات',           defaultRoles:['مدير','محاسب'] },
  { id:'acc_reports',   label:'تقارير الحسابات',     defaultRoles:['مدير','محاسب'] },
  { id:'profit_reports',label:'تقارير الأرباح',      defaultRoles:['مدير','محاسب'] },
  { id:'item_reports',  label:'تقارير المواد',       defaultRoles:['مدير','محاسب'] },
  { id:'audit',         label:'تقارير المتابعة',     defaultRoles:['مدير'] },
  { id:'users_menu',    label:'المستخدمين',          defaultRoles:['مدير'] },
  { id:'tools',         label:'الأدوات',             defaultRoles:['مدير'] },
];

const empty = { name:'', username:'', password:'', role:'كاشير', phone:'', notes:'', extraAccess:[] };

const BUILTIN = [
  { id:'admin',   name:'كرار عبد الرضا', username:'admin',   role:'مدير',   phone:'07714424355', builtin:true },
  { id:'cashier', name:'الكاشير',         username:'cashier', role:'كاشير',  phone:'', builtin:true },
  { id:'account', name:'المحاسب',         username:'account', role:'محاسب',  phone:'', builtin:true },
];

// تحميل إعدادات مستخدم مدمج من localStorage
function loadBuiltinConfig(username) {
  try { return JSON.parse(localStorage.getItem(`adwaa_user_config_${username}`) || '{}'); }
  catch { return {}; }
}

function saveBuiltinConfig(username, cfg) {
  localStorage.setItem(`adwaa_user_config_${username}`, JSON.stringify(cfg));
}

export default function UsersManage({ user }) {
  const [users,    setUsers]    = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);  // id أو 'builtin:username'
  const [form,     setForm]     = useState(empty);
  const [search,   setSearch]   = useState('');
  const [showPass, setShowPass] = useState({});
  const [saving,   setSaving]   = useState(false);
  const [showPerms, setShowPerms] = useState(false);

  useEffect(() => {
    const u = onSnapshot(collection(db, 'pos_users'), s => setUsers(s.docs.map(d => ({ ...d.data(), id:d.id }))));
    return () => u();
  }, []);

  // دمج المستخدمين المدمجين مع إعداداتهم المخصصة
  const builtinWithConfig = useMemo(() => BUILTIN.map(b => {
    const cfg = loadBuiltinConfig(b.username);
    return { ...b, name: cfg.name || b.name, extraAccess: cfg.extraAccess || [] };
  }), [users]);

  const allUsers = useMemo(() =>
    [...builtinWithConfig, ...users].filter(u =>
      !search || u.name?.includes(search) || u.username?.includes(search)
    ),
  [builtinWithConfig, users, search]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleExtraAccess = (id) => {
    setForm(f => {
      const cur = f.extraAccess || [];
      return { ...f, extraAccess: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });
  };

  const save = async () => {
    if (!form.name || !form.username) return alert('يرجى إدخال الاسم واسم المستخدم');
    const allForCheck = [...BUILTIN, ...users];
    const dup = allForCheck.find(u => u.username === form.username && u.id !== editing?.replace('builtin:',''));
    if (dup && editing !== `builtin:${form.username}`) return alert('اسم المستخدم مستخدم بالفعل!');
    if (!editing && !form.password) return alert('يرجى إدخال كلمة المرور للمستخدم الجديد');
    if (form.password && form.password.length < 6) return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    setSaving(true);
    try {
      if (editing?.startsWith('builtin:')) {
        // مستخدم مدمج → حفظ في localStorage فقط
        const uname = editing.replace('builtin:', '');
        saveBuiltinConfig(uname, { name:form.name, extraAccess:form.extraAccess || [] });
      } else if (editing) {
        const payload = {
          name:form.name, username:form.username,
          role:form.role, phone:form.phone, notes:form.notes,
          extraAccess:form.extraAccess || [],
          updatedAt: new Date().toISOString(),
        };
        if (form.password) {
          const passwordHash = await createPasswordHash(form.password);
          if (!passwordHash) throw new Error('تعذر توليد تشفير كلمة المرور');
          payload.passwordHash = passwordHash;
          payload.password = '';
          payload.forcePasswordChange = true;
        }
        await updateDoc(doc(db, 'pos_users', editing), {
          ...payload,
        });
      } else {
        const passwordHash = await createPasswordHash(form.password);
        if (!passwordHash) throw new Error('تعذر توليد تشفير كلمة المرور');
        await addDoc(collection(db, 'pos_users'), {
          ...form,
          password: '',
          passwordHash,
          forcePasswordChange: true,
          extraAccess: form.extraAccess || [],
          createdAt: new Date().toISOString(),
          createdBy: user.name,
          active: true,
        });
      }
      setForm(empty);
      setEditing(null);
      setShowForm(false);
      setShowPerms(false);
    } catch(e) {
      alert(getErrorMessage(e, 'فشل حفظ بيانات المستخدم'));
    } finally {
      setSaving(false);
    }
  };

  const del = async (u) => {
    if (u.builtin) return alert('لا يمكن حذف المستخدمين الأساسيين');
    if (u.username === user.username) return alert('لا يمكنك حذف حسابك الحالي');
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${u.name}"؟`)) return;
    try {
      await deleteDoc(doc(db, 'pos_users', u.id));
    } catch(e) {
      alert(getErrorMessage(e, 'فشل حذف المستخدم'));
    }
  };

  const edit = (u) => {
    if (u.builtin) {
      const cfg = loadBuiltinConfig(u.username);
      setForm({ name:cfg.name || u.name, username:u.username, password:'', role:u.role, phone:u.phone||'', notes:u.notes||'', extraAccess:cfg.extraAccess||[] });
      setEditing(`builtin:${u.username}`);
    } else {
      setForm({ name:u.name, username:u.username, password:'', role:u.role, phone:u.phone||'', notes:u.notes||'', extraAccess:u.extraAccess||[] });
      setEditing(u.id);
    }
    setShowForm(true);
    setShowPerms(false);
  };

  const togglePass = (id) => setShowPass(p => ({ ...p, [id]: !p[id] }));

  return (
    <div style={{ padding:24, fontFamily:"'Cairo'", direction:'rtl' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ color:'#fff', fontSize:22, fontWeight:800 }}>👥 إدارة المستخدمين</div>
          <div style={{ color:'#64748b', fontSize:13 }}>{allUsers.length} مستخدم</div>
        </div>
        <button onClick={() => { setForm(empty); setEditing(null); setShowForm(true); setShowPerms(false); }}
          style={{ background:'#06b6d4', color:'#fff', border:'none', borderRadius:12, padding:'10px 20px', fontWeight:800, cursor:'pointer', fontSize:14 }}>
          + إضافة مستخدم
        </button>
      </div>

      {/* الإحصائيات */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        {[['👥','إجمالي المستخدمين', allUsers.length,'#3b82f6'],
          ...ROLES.map(r => [r==='مدير'?'👑':r==='كاشير'?'🛒':'📊', r, allUsers.filter(u=>u.role===r).length, ROLE_COLORS[r]])
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ background:'#ffffff', borderRadius:14, padding:16, border:`1px solid ${color}33`, textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
            <div style={{ color:'#64748b', fontSize:11, marginBottom:4 }}>{label}</div>
            <div style={{ color, fontSize:18, fontWeight:800 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* نموذج الإضافة/التعديل */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#ffffff', borderRadius:20, padding:28, width:'100%', maxWidth:580, border:'1px solid #06b6d444', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ color:'#06b6d4', fontSize:18, fontWeight:800, marginBottom:20 }}>
              {editing ? '✏️ تعديل مستخدم' : '➕ إضافة مستخدم'}
              {editing?.startsWith('builtin:') && <span style={{ fontSize:11, color:'#f59e0b', marginRight:8 }}>• مستخدم أساسي</span>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {/* الاسم */}
              <div>
                <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>الاسم الكامل *</label>
                <input value={form.name} onChange={e => setF('name', e.target.value)}
                  style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'" }}/>
              </div>
              {/* اسم المستخدم */}
              <div>
                <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>اسم المستخدم *</label>
                <input value={form.username} onChange={e => setF('username', e.target.value)}
                  disabled={editing?.startsWith('builtin:')}
                  style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'", opacity:editing?.startsWith('builtin:')?0.5:1 }}/>
              </div>
              {/* الهاتف */}
              <div>
                <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>رقم الهاتف</label>
                <input value={form.phone} onChange={e => setF('phone', e.target.value)}
                  style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'" }}/>
              </div>
              {/* ملاحظات */}
              <div>
                <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>ملاحظات</label>
                <input value={form.notes} onChange={e => setF('notes', e.target.value)}
                  style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box', fontFamily:"'Cairo'" }}/>
              </div>
              {/* كلمة المرور */}
              {!editing?.startsWith('builtin:') && (
                <div>
                  <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>
                    {editing ? 'كلمة المرور الجديدة (اختياري)' : 'كلمة المرور *'}
                  </label>
                  <div style={{ position:'relative' }}>
                    <input type={showPass['form']?'text':'password'} value={form.password} onChange={e => setF('password', e.target.value)}
                      placeholder={editing ? 'اتركه فارغًا بدون تغيير' : ''}
                      style={{ width:'100%', color:'#0f172a', outline:'none', boxSizing:'border-box' }}/>
                    <button onClick={() => togglePass('form')} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:16 }}>
                      {showPass['form'] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}
              {/* الصلاحية */}
              {!editing?.startsWith('builtin:') && (
                <div>
                  <label style={{ color:'#64748b', fontSize:12, display:'block', marginBottom:5 }}>الصلاحية</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {ROLES.map(r => (
                      <button key={r} onClick={() => setF('role', r)}
                        style={{ flex:1, background:form.role===r?`${ROLE_COLORS[r]}22`:'#f8fbff', color:form.role===r?ROLE_COLORS[r]:'#64748b', border:`2px solid ${form.role===r?ROLE_COLORS[r]:'#cdd8ec'}`, borderRadius:10, padding:'8px 0', fontWeight:700, cursor:'pointer', fontSize:12 }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* قسم الصلاحيات الإضافية */}
            <div style={{ marginTop:18, borderTop:'1px solid #e2e8f7', paddingTop:14 }}>
              <button onClick={() => setShowPerms(!showPerms)}
                style={{ background:'#f1f5f9', border:'1px solid #d9e2f2', borderRadius:10, padding:'8px 14px', color:'#334155', cursor:'pointer', fontFamily:"'Cairo'", fontSize:12, fontWeight:700, width:'100%', textAlign:'right', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>🔐 الوصول الإضافي للأقسام</span>
                <span style={{ fontSize:10, color:'#64748b' }}>
                  {form.extraAccess?.length ? `${form.extraAccess.length} قسم ممنوح` : 'لا يوجد وصول إضافي'}
                  {showPerms ? ' ▲' : ' ▼'}
                </span>
              </button>

              {showPerms && (
                <div style={{ marginTop:10, background:'#f8fbff', borderRadius:10, padding:14, border:'1px solid #e2e8f7' }}>
                  <div style={{ color:'#64748b', fontSize:11, marginBottom:10 }}>
                    حدد الأقسام التي تريد منح وصول إضافي لها (فوق صلاحية الدور الافتراضي)
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {ALL_SECTIONS.map(sec => {
                      const hasDefault = sec.defaultRoles.includes(form.role);
                      const hasExtra   = (form.extraAccess || []).includes(sec.id);
                      return (
                        <div key={sec.id}
                          onClick={() => !hasDefault && toggleExtraAccess(sec.id)}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, cursor:hasDefault?'default':'pointer', background:hasDefault?'#f0fdf4':hasExtra?'#eff6ff':'#fff', border:`1px solid ${hasDefault?'#bbf7d0':hasExtra?'#bfdbfe':'#e2e8f7'}` }}>
                          <div style={{ width:16, height:16, borderRadius:4, background:hasDefault?'#10b981':hasExtra?'#3b82f6':'#e2e8f7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {(hasDefault || hasExtra) && <span style={{ color:'#fff', fontSize:10, lineHeight:1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize:11, color:hasDefault?'#15803d':hasExtra?'#1d4ed8':'#475569', flex:1 }}>{sec.label}</span>
                          {hasDefault && <span style={{ fontSize:9, color:'#10b981' }}>افتراضي</span>}
                          {hasExtra && !hasDefault && <span style={{ fontSize:9, color:'#3b82f6' }}>ممنوح</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => { setShowForm(false); setForm(empty); setEditing(null); setShowPerms(false); }}
                style={{ flex:1, background:'#f8fbff', border:'1px solid #cdd8ec', borderRadius:12, padding:12, color:'#64748b', cursor:'pointer', fontFamily:"'Cairo'" }}>إلغاء</button>
              <button onClick={save} disabled={saving}
                style={{ flex:2, background:'#06b6d4', color:'#000', border:'none', borderRadius:12, padding:12, fontWeight:800, cursor:'pointer', fontFamily:"'Cairo'", fontSize:14, opacity:saving?0.6:1 }}>
                {saving ? '⏳ جاري...' : '✅ حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بحث */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو اسم المستخدم..."
        style={{ width:'100%', color:'#0f172a', fontSize:13, outline:'none', marginBottom:16, boxSizing:'border-box' }}/>

      {/* قائمة المستخدمين */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
        {allUsers.map(u => (
          <div key={u.id} style={{ background:'#ffffff', borderRadius:16, border:`1px solid ${u.builtin?ROLE_COLORS[u.role]+'33':'#d9e2f2'}`, overflow:'hidden' }}>
            <div style={{ padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:`${ROLE_COLORS[u.role]}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                    {u.role==='مدير'?'👑':u.role==='كاشير'?'🛒':'📊'}
                  </div>
                  <div>
                    <div style={{ color:'#1e293b', fontSize:14, fontWeight:800 }}>{u.name}</div>
                    <div style={{ color:ROLE_COLORS[u.role], fontSize:11, fontWeight:700 }}>{u.role}</div>
                    {u.extraAccess?.length > 0 && (
                      <div style={{ color:'#3b82f6', fontSize:9, marginTop:2 }}>🔐 +{u.extraAccess.length} وصول إضافي</div>
                    )}
                  </div>
                </div>
                {u.builtin && <span style={{ background:'#F5C80022', border:'1px solid #F5C80044', borderRadius:20, padding:'3px 10px', color:'#F5C800', fontSize:10, fontWeight:700 }}>أساسي</span>}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div style={{ background:'#f8fbff', borderRadius:10, padding:10 }}>
                  <div style={{ color:'#64748b', fontSize:10, marginBottom:4 }}>اسم المستخدم</div>
                  <div style={{ color:'#1e293b', fontSize:12, fontWeight:700, fontFamily:'monospace' }}>{u.username}</div>
                </div>
                <div style={{ background:'#f8fbff', borderRadius:10, padding:10 }}>
                  <div style={{ color:'#64748b', fontSize:10, marginBottom:4 }}>حماية كلمة المرور</div>
                  <div style={{ color:'#10b981', fontSize:11, fontWeight:700 }}>
                    {u.builtin ? 'تدار من صفحة تغيير كلمة المرور' : (u.passwordHash ? 'مشفّرة (PBKDF2)' : 'بحاجة ترحيل')}
                  </div>
                </div>
              </div>

              {u.phone && <div style={{ color:'#64748b', fontSize:11, marginBottom:8 }}>📞 {u.phone}</div>}
              {u.notes && <div style={{ color:'#475569', fontSize:11, marginBottom:8 }}>📝 {u.notes}</div>}
            </div>
            <div style={{ display:'flex', borderTop:'1px solid #e2e8f7' }}>
              <button onClick={() => edit(u)}
                style={{ flex:1, background:'none', border:'none', borderLeft:'1px solid #e2e8f7', padding:'9px', color:'#06b6d4', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                ✏️ تعديل
              </button>
              <button onClick={() => del(u)} disabled={u.builtin || u.username === user.username}
                style={{ flex:1, background:'none', border:'none', padding:'9px', color:u.builtin||u.username===user.username?'#cdd8ec':'#ef4444', fontSize:12, fontWeight:700, cursor:u.builtin||u.username===user.username?'default':'pointer' }}>
                🗑️ حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
