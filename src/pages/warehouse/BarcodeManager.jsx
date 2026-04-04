import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const fmt = n=>(n||0).toLocaleString('ar-IQ')+' د.ع';

function drawBarcode(canvas, text) {
  if(!canvas||!text)return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const bars=[];let x=10;
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i);
    const widths=[(code>>5&1)?3:1,(code>>4&1)?2:1,(code>>3&1)?3:1,(code>>2&1)?1:2,(code>>1&1)?3:1,(code&1)?2:1];
    widths.forEach((w,j)=>{bars.push({x,w:w*2,black:j%2===0});x+=w*2;});
  }
  const scale=(W-20)/x;let cx=10;
  bars.forEach(b=>{if(b.black){ctx.fillStyle='#000';ctx.fillRect(cx,5,b.w*scale,H-25);}cx+=b.w*scale;});
  ctx.fillStyle='#000';ctx.font=`bold ${Math.max(8,H*0.15)}px monospace`;ctx.textAlign='center';ctx.fillText(text,W/2,H-4);
}

function BarcodePreview({text,width=160,height=60}){
  const ref=useRef();
  useEffect(()=>{if(ref.current)drawBarcode(ref.current,text);},[text]);
  return <canvas ref={ref} width={width} height={height} style={{maxWidth:'100%',display:'block'}}/>;
}

export default function BarcodeManager({user}){
  const [products,setProducts]=useState([]);
  const [packages,setPackages]=useState([]);
  const [search,setSearch]=useState('');
  const [editId,setEditId]=useState(null);
  const [editForm,setEditForm]=useState({barcode:'',packageBarcode:''});
  const [filter,setFilter]=useState('all');
  const [saving,setSaving]=useState(false);
  const [scanMode,setScanMode]=useState(false);
  const [scanBuf,setScanBuf]=useState('');
  const [scanResult,setScanResult]=useState(null);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'),s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_packages'),s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>{u1();u2();};
  },[]);

  const barcodes=products.map(p=>p.barcode).filter(Boolean);
  const duplicates=barcodes.filter((b,i)=>barcodes.indexOf(b)!==i);

  const filtered=products.filter(p=>{
    const ms=!search||p.name?.includes(search)||p.barcode?.includes(search)||p.packageBarcode?.includes(search);
    if(filter==='missing')return ms&&(!p.barcode||p.barcode.trim()==='');
    if(filter==='duplicate')return ms&&p.barcode&&duplicates.includes(p.barcode);
    return ms;
  });

  const startEdit=(p)=>{setEditId(p.id);setEditForm({barcode:p.barcode||'',packageBarcode:p.packageBarcode||''});};

  const saveBarcode=async()=>{
    if(!editId)return;
    const dup=products.find(p=>p.id!==editId&&p.barcode&&p.barcode===editForm.barcode);
    if(dup&&editForm.barcode)return alert(`⚠️ الباركود مستخدم بالفعل للمادة: ${dup.name}`);
    setSaving(true);
    await updateDoc(doc(db,'pos_products',editId),{barcode:editForm.barcode.trim(),packageBarcode:editForm.packageBarcode.trim()});
    setSaving(false);setEditId(null);
  };

  const generateBarcode=(isPackage=false)=>{
    const prefix=isPackage?'PKG':'ITM';
    const code=`${prefix}${Date.now().toString().slice(-8)}`;
    if(isPackage)setEditForm(f=>({...f,packageBarcode:code}));
    else setEditForm(f=>({...f,barcode:code}));
  };

  useEffect(()=>{
    if(!scanMode)return;
    const handleKey=(e)=>{
      if(e.key==='Enter'){
        const val=scanBuf.trim();
        if(val){
          const found=products.find(p=>p.barcode===val||p.packageBarcode===val);
          setScanResult(found?{product:found,type:found.barcode===val?'unit':'package'}:{notFound:true,code:val});
          setTimeout(()=>setScanResult(null),4000);
        }
        setScanBuf('');
      }else if(e.key.length===1){setScanBuf(b=>b+e.key);}
    };
    window.addEventListener('keydown',handleKey);
    return()=>window.removeEventListener('keydown',handleKey);
  },[scanMode,scanBuf,products]);

  const missingCount=products.filter(p=>!p.barcode||p.barcode.trim()==='').length;
  const dupCount=products.filter(p=>p.barcode&&duplicates.includes(p.barcode)).length;

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#fff',fontSize:22,fontWeight:800}}>📊 إدارة الباركود</div>
          <div style={{color:'#64748b',fontSize:13}}>{products.length} مادة</div>
        </div>
        <button onClick={()=>{setScanMode(!scanMode);setScanBuf('');setScanResult(null);}}
          style={{background:scanMode?'#10b981':'#ffffff',color:scanMode?'#000':'#1e293b',border:`1px solid ${scanMode?'#10b981':'#cdd8ec'}`,borderRadius:12,padding:'10px 20px',fontWeight:700,cursor:'pointer',fontSize:13}}>
          {scanMode?'🟢 نمط المسح فعال':'📷 فحص بمسح الباركود'}
        </button>
      </div>

      {scanMode&&(
        <div style={{background:'#10b98122',border:'2px solid #10b98144',borderRadius:16,padding:20,marginBottom:20,textAlign:'center'}}>
          <div style={{color:'#10b981',fontSize:16,fontWeight:700,marginBottom:8}}>📷 نمط فحص الباركود</div>
          <div style={{color:'#64748b',fontSize:13,marginBottom:12}}>امسح أي باركود بقارئ الباركود للتحقق منه</div>
          {scanResult&&(
            scanResult.notFound
              ?<div style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:12,padding:16,display:'inline-block'}}>
                <div style={{color:'#ef4444',fontSize:14,fontWeight:700}}>❌ باركود غير موجود</div>
                <div style={{color:'#64748b',fontSize:12,marginTop:4,fontFamily:'monospace'}}>{scanResult.code}</div>
              </div>
              :<div style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:12,padding:16,display:'inline-block'}}>
                <div style={{color:'#10b981',fontSize:14,fontWeight:700}}>✅ تم العثور على المادة</div>
                <div style={{color:'#fff',fontSize:15,fontWeight:800,marginTop:4}}>{scanResult.product.name}</div>
                <div style={{color:'#a78bfa',fontSize:12}}>{scanResult.type==='package'?'📦 باركود التعبئة':'🔹 باركود المفرد'}</div>
                <div style={{color:'#F5C800',fontSize:14,fontWeight:700,marginTop:4}}>
                  {scanResult.type==='package'
                    ?fmt(scanResult.product.packagePrice||(scanResult.product.sellPrice*(scanResult.product.packageQty||1)))
                    :fmt(scanResult.product.sellPrice)}
                </div>
              </div>
          )}
          {!scanResult&&<div style={{color:'#64748b',fontSize:13,marginTop:8}}>في انتظار المسح...</div>}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[['📊','إجمالي المواد',products.length,'#3b82f6','all'],['✅','لها باركود',products.filter(p=>p.barcode).length,'#10b981','all'],['❌','بدون باركود',missingCount,'#ef4444','missing'],['⚠️','باركود مكرر',dupCount,'#f59e0b','duplicate']].map(([icon,label,val,color,f])=>(
          <div key={label} onClick={()=>setFilter(f)}
            style={{background:'#ffffff',borderRadius:14,padding:16,border:`1px solid ${filter===f?color+'44':'#d9e2f2'}`,textAlign:'center',cursor:'pointer',transition:'border .2s'}}>
            <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
            <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>{label}</div>
            <div style={{color,fontSize:18,fontWeight:800}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الباركود..."
          style={{flex:1,color:'#0f172a',fontSize:13,outline:'none'}}/>
        {[['all','الكل'],['missing','بدون باركود'],['duplicate','مكررة']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{background:filter===v?'#F5C800':'#ffffff',color:filter===v?'#000':'#64748b',border:`1px solid ${filter===v?'#F5C800':'#cdd8ec'}`,borderRadius:20,padding:'8px 16px',fontSize:12,cursor:'pointer',fontWeight:filter===v?700:400}}>{l}</button>
        ))}
      </div>

      <div style={{background:'#ffffff',borderRadius:16,border:'1px solid #d9e2f2',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr 1fr',padding:'12px 20px',background:'#f8fbff',borderBottom:'1px solid #e2e8f7'}}>
          {['المادة','باركود المفرد','باركود التعبئة','سعر المفرد','سعر التعبئة','إجراء'].map(h=>(
            <div key={h} style={{color:'#64748b',fontSize:11,fontWeight:700}}>{h}</div>
          ))}
        </div>

        {filtered.length===0
          ?<div style={{color:'#cdd8ec',textAlign:'center',padding:60}}>لا توجد نتائج</div>
          :filtered.map((p,i)=>{
            const pkg=packages.find(pk=>pk.id===p.packageTypeId);
            const isDup=p.barcode&&duplicates.includes(p.barcode);
            const isEdit=editId===p.id;
            return(
              <div key={p.id}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1.5fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid #ffffff',alignItems:'center',background:isDup?'#f59e0b08':isEdit?'#F5C80008':'transparent'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:18}}>{p.img||'📦'}</span>
                    <div>
                      <div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{p.name}</div>
                      <div style={{color:'#64748b',fontSize:10}}>{p.cat}</div>
                    </div>
                  </div>

                  <div>
                    {isEdit
                      ?<div style={{display:'flex',gap:4}}>
                        <input value={editForm.barcode} onChange={e=>setEditForm(f=>({...f,barcode:e.target.value}))}
                          placeholder="أدخل الباركود"
                          style={{flex:1,background:'#f8fbff',border:`1px solid ${isDup?'#f59e0b':'#cdd8ec'}`,borderRadius:8,padding:'6px 8px',color:'#0f172a',fontSize:11,outline:'none',fontFamily:'monospace'}}/>
                        <button onClick={()=>generateBarcode(false)} title="توليد تلقائي"
                          style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:6,padding:'5px 7px',color:'#3b82f6',cursor:'pointer',fontSize:11}}>🎲</button>
                      </div>
                      :<div>
                        {p.barcode
                          ?<div>
                            <div style={{fontFamily:'monospace',color:isDup?'#f59e0b':'#10b981',fontSize:11}}>{p.barcode}</div>
                            {isDup&&<div style={{color:'#f59e0b',fontSize:9}}>⚠️ مكرر</div>}
                          </div>
                          :<div style={{color:'#ef4444',fontSize:11}}>❌ لا يوجد</div>
                        }
                      </div>
                    }
                  </div>

                  <div>
                    {isEdit&&p.hasPackage
                      ?<div style={{display:'flex',gap:4}}>
                        <input value={editForm.packageBarcode} onChange={e=>setEditForm(f=>({...f,packageBarcode:e.target.value}))}
                          placeholder="باركود التعبئة"
                          style={{flex:1,background:'#f8fbff',border:'1px solid #cdd8ec',borderRadius:8,padding:'6px 8px',color:'#a78bfa',fontSize:11,outline:'none',fontFamily:'monospace'}}/>
                        <button onClick={()=>generateBarcode(true)}
                          style={{background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:6,padding:'5px 7px',color:'#a78bfa',cursor:'pointer',fontSize:11}}>🎲</button>
                      </div>
                      :p.hasPackage&&pkg
                      ?<div style={{fontFamily:'monospace',color:'#a78bfa',fontSize:11}}>{p.packageBarcode||<span style={{color:'#64748b'}}>—</span>}</div>
                      :<span style={{color:'#cdd8ec',fontSize:10}}>—</span>
                    }
                  </div>

                  <div style={{color:'#F5C800',fontSize:12,fontWeight:700}}>{fmt(p.sellPrice)}</div>
                  <div style={{color:'#a78bfa',fontSize:12}}>{p.hasPackage&&pkg?fmt(p.packagePrice||(p.sellPrice*(p.packageQty||pkg.qty))):'—'}</div>

                  <div style={{display:'flex',gap:6}}>
                    {!isEdit
                      ?<button onClick={()=>startEdit(p)} style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:8,padding:'5px 10px',color:'#F5C800',fontSize:12,cursor:'pointer'}}>✏️</button>
                      :<>
                        <button onClick={saveBarcode} disabled={saving}
                          style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 10px',color:'#10b981',fontSize:12,cursor:'pointer',opacity:saving?0.6:1}}>
                          {saving?'⏳':'💾'}
                        </button>
                        <button onClick={()=>setEditId(null)}
                          style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:8,padding:'5px 10px',color:'#ef4444',fontSize:12,cursor:'pointer'}}>✕</button>
                      </>
                    }
                  </div>
                </div>

                {isEdit&&(editForm.barcode||editForm.packageBarcode)&&(
                  <div style={{padding:'12px 20px',background:'#ffffff',borderBottom:'1px solid #ffffff',display:'flex',gap:20}}>
                    {editForm.barcode&&(
                      <div style={{textAlign:'center'}}>
                        <div style={{color:'#64748b',fontSize:10,marginBottom:4}}>معاينة باركود المفرد</div>
                        <div style={{background:'#fff',borderRadius:8,padding:8,display:'inline-block'}}>
                          <BarcodePreview text={editForm.barcode} width={150} height={50}/>
                        </div>
                      </div>
                    )}
                    {editForm.packageBarcode&&(
                      <div style={{textAlign:'center'}}>
                        <div style={{color:'#a78bfa',fontSize:10,marginBottom:4}}>معاينة باركود التعبئة</div>
                        <div style={{background:'#fff',borderRadius:8,padding:8,display:'inline-block'}}>
                          <BarcodePreview text={editForm.packageBarcode} width={150} height={50}/>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
