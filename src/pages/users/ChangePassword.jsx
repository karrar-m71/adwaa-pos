import { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { createPasswordHash, verifyPasswordInput } from '../../utils/auth';

const BUILTIN_FORCE_CHANGE_PREFIX = 'adwaa_force_pwd_change_';

async function ensureBuiltinPasswordRecord(username) {
  const hashKey = `adwaa_pwd_hash_${username}`;
  const raw = localStorage.getItem(hashKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.h && parsed?.s) return { passwordHash: parsed };
    } catch {
      // ignore malformed local value
    }
  }
  const legacyKey = `adwaa_pwd_${username}`;
  const legacyPassword = localStorage.getItem(legacyKey) || '';
  if (!legacyPassword) return {};
  const passwordHash = await createPasswordHash(legacyPassword);
  if (passwordHash) {
    localStorage.setItem(hashKey, JSON.stringify(passwordHash));
    localStorage.removeItem(legacyKey);
    return { passwordHash };
  }
  return { password: legacyPassword };
}

export default function ChangePassword({ user }) {
  const [oldPass,    setOldPass]    = useState('');
  const [newPass,    setNewPass]    = useState('');
  const [confirmPass,setConfirmPass]= useState('');
  const [show,       setShow]       = useState({old:false,new:false,con:false});
  const [msg,        setMsg]        = useState(null);

  const toggle=(k)=>setShow(s=>({...s,[k]:!s[k]}));

  const isBuiltinUser = ['admin', 'cashier', 'account'].includes(String(user?.username || '').trim());

  const handleChange = async () => {
    setMsg(null);
    if(!oldPass||!newPass||!confirmPass) return setMsg({type:'error',text:'يرجى ملء جميع الحقول'});
    if(newPass.length<6) return setMsg({type:'error',text:'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'});
    if(newPass!==confirmPass) return setMsg({type:'error',text:'كلمة المرور الجديدة وتأكيدها غير متطابقتين'});
    if(oldPass===newPass) return setMsg({type:'error',text:'كلمة المرور الجديدة يجب أن تختلف عن القديمة'});

    try {
      if (isBuiltinUser) {
        const authRecord = await ensureBuiltinPasswordRecord(user.username);
        const oldVerdict = await verifyPasswordInput(oldPass, authRecord);
        if (!oldVerdict.ok) return setMsg({type:'error',text:'كلمة المرور الحالية غير صحيحة'});
        const passwordHash = await createPasswordHash(newPass);
        if (!passwordHash) return setMsg({type:'error',text:'تعذر توليد تشفير كلمة المرور'});
        localStorage.setItem(`adwaa_pwd_hash_${user.username}`, JSON.stringify(passwordHash));
        localStorage.removeItem(`adwaa_pwd_${user.username}`);
        localStorage.removeItem(`${BUILTIN_FORCE_CHANGE_PREFIX}${user.username}`);
      } else {
        if (!user?.id) return setMsg({type:'error',text:'تعذر تحديد المستخدم الحالي'});
        const ref = doc(db, 'pos_users', user.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return setMsg({type:'error',text:'المستخدم غير موجود'});
        const data = snap.data() || {};
        const oldVerdict = await verifyPasswordInput(oldPass, data);
        if (!oldVerdict.ok) return setMsg({type:'error',text:'كلمة المرور الحالية غير صحيحة'});
        const passwordHash = await createPasswordHash(newPass);
        if (!passwordHash) return setMsg({type:'error',text:'تعذر توليد تشفير كلمة المرور'});
        await updateDoc(ref, {
          passwordHash,
          password: '',
          forcePasswordChange: false,
          updatedAt: new Date().toISOString(),
        });
      }
      setMsg({type:'success',text:'✅ تم تغيير كلمة المرور بنجاح'});
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
    } catch {
      setMsg({type:'error',text:'تعذر تغيير كلمة المرور حالياً'});
    }
  };

  const strength=(p)=>{
    if(!p)return null;
    let score=0;
    if(p.length>=8)score++;if(p.length>=12)score++;
    if(/[A-Z]/.test(p))score++;if(/[0-9]/.test(p))score++;if(/[^A-Za-z0-9]/.test(p))score++;
    return score<=1?{l:'ضعيفة',c:'#ef4444',w:'25%'}:score<=3?{l:'متوسطة',c:'#f59e0b',w:'60%'}:{l:'قوية',c:'#10b981',w:'100%'};
  };

  const s=strength(newPass);

  const inputStyle={width:'100%',color:'#0f172a',outline:'none',boxSizing:'border-box',fontSize:14};

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl',maxWidth:500}}>
      <div style={{color:'#fff',fontSize:22,fontWeight:800,marginBottom:6}}>🔑 تغيير كلمة المرور</div>
      <div style={{color:'#64748b',fontSize:13,marginBottom:24}}>تغيير كلمة مرور: {user.name} ({user.role})</div>

      <div style={{background:'#ffffff',borderRadius:16,padding:24,border:'1px solid #d9e2f2'}}>
        {/* كلمة المرور الحالية */}
        {[['كلمة المرور الحالية','old',oldPass,setOldPass],['كلمة المرور الجديدة','new',newPass,setNewPass],['تأكيد كلمة المرور الجديدة','con',confirmPass,setConfirmPass]].map(([label,k,val,setter])=>(
          <div key={k} style={{marginBottom:16}}>
            <label style={{color:'#64748b',fontSize:12,display:'block',marginBottom:6}}>{label}</label>
            <div style={{position:'relative'}}>
              <input type={show[k]?'text':'password'} value={val} onChange={e=>setter(e.target.value)}
                style={inputStyle}/>
              <button onClick={()=>toggle(k)} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:18}}>
                {show[k]?'🙈':'👁️'}
              </button>
            </div>
          </div>
        ))}

        {/* قوة كلمة المرور */}
        {newPass&&s&&(
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{color:'#64748b',fontSize:12}}>قوة كلمة المرور</span>
              <span style={{color:s.c,fontSize:12,fontWeight:700}}>{s.l}</span>
            </div>
            <div style={{height:6,background:'#d9e2f2',borderRadius:3,overflow:'hidden'}}>
              <div style={{width:s.w,height:'100%',background:s.c,borderRadius:3,transition:'width .3s'}}/>
            </div>
          </div>
        )}

        {/* نصائح */}
        <div style={{background:'#f8fbff',borderRadius:10,padding:12,marginBottom:16}}>
          <div style={{color:'#64748b',fontSize:11,marginBottom:6}}>نصائح لكلمة مرور قوية:</div>
          {['8 أحرف على الأقل','أحرف كبيرة وصغيرة','أرقام ورموز خاصة','لا تستخدم معلومات شخصية'].map(tip=>(
            <div key={tip} style={{color:'#475569',fontSize:11,marginBottom:3}}>• {tip}</div>
          ))}
        </div>

        {/* رسالة الحالة */}
        {msg&&(
          <div style={{background:msg.type==='error'?'#ef444422':'#10b98122',border:`1px solid ${msg.type==='error'?'#ef444444':'#10b98144'}`,borderRadius:10,padding:12,marginBottom:16,textAlign:'center'}}>
            <div style={{color:msg.type==='error'?'#ef4444':'#10b981',fontSize:13,fontWeight:700}}>{msg.text}</div>
          </div>
        )}

        <button onClick={handleChange}
          style={{width:'100%',background:'linear-gradient(135deg,#06b6d4,#0891b2)',color:'#fff',border:'none',borderRadius:12,padding:14,fontWeight:800,cursor:'pointer',fontFamily:"'Cairo'",fontSize:15}}>
          🔑 تغيير كلمة المرور
        </button>
      </div>
    </div>
  );
}
