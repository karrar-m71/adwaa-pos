import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildSalePricesFromBuyPrice, readPricingSettings } from '../utils/pricing';
import { attachOfflineImageTarget, getOfflineImagePreview, isOfflineImageRef, queueOfflineImage } from '../utils/offlineImageQueue';
import { canUser } from '../utils/permissions';

const fmt = n => (n||0).toLocaleString('ar-IQ') + ' د.ع';
const CATS = ['إلكترونيات','إضاءة','كابلات','قواطع','مفاتيح','أسلاك','أدوات','أخرى'];
const EMOJIS = ['📦','💡','🔌','⚡','🔧','🔲','📏','🟡','🔒','🔬'];
const IMGBB_KEY = import.meta.env.VITE_IMGBB_KEY || '';
async function uploadToImgBB(file) {
  if (!IMGBB_KEY) throw new Error('مفتاح ImgBB غير مضبوط في إعدادات البيئة');
  const form = new FormData();
  form.append('image', file);
  form.append('key', IMGBB_KEY);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || 'فشل رفع صورة المادة');
  }
  return data.data.url;
}
const resolveImageUrl = (value = '') => (isOfflineImageRef(value) ? getOfflineImagePreview(value) : value);

// ── مزامنة مادة مع تطبيق الموبايل ────────────
async function syncToMobile(id, data) {
  try {
    await setDoc(doc(db, 'products', id), {
      name:        data.name        || '',
      sellPrice:   data.sellPrice   || 0,
      buyPrice:    data.buyPrice    || 0,
      wholesalePrice: data.wholesalePrice || 0,
      specialPrice: data.specialPrice || 0,
      stock:       data.stock       || 0,
      barcode:     data.barcode     || '',
      cat:         data.cat         || '',
      img:         data.img         || '📦',
      imgUrl:      data.imgUrl      || '',
      desc:        data.desc        || '',
      hasPackage:  data.hasPackage  || false,
      packageTypeId:   data.packageTypeId   || '',
      packageQty:      data.packageQty      || null,
      packagePrice:    data.packagePrice    || null,
      packageBarcode:  data.packageBarcode  || '',
      minStock:    data.minStock    || 5,
      updatedAt:   new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn('Mobile sync failed:', e.message);
  }
}

export default function Products({ user, embedded = false, initialSearch = '', openCreateOnMount = false, onProductSaved, onClose }) {
  const canCreate = canUser(user, 'products_create');
  const canEdit = canUser(user, 'products_edit');
  const canDelete = canUser(user, 'products_delete');
  const [products, setProducts]   = useState([]);
  const [packages, setPackages]   = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editing,  setEditing]    = useState(null);
  const [search,   setSearch]     = useState('');
  const [catFilter,setCatFilter]  = useState('الكل');
  const [pkgFilter,setPkgFilter]  = useState('الكل');
  const [saving,   setSaving]     = useState(false);
  const [syncMsg,  setSyncMsg]    = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pricingSettings, setPricingSettings] = useState(() => readPricingSettings());

  const empty = {
    name:'', barcode:'', cat:'إضاءة', img:'📦', imgUrl:'',
    buyPrice:'', sellPrice:'', wholesalePrice:'', specialPrice:'',
    stock:'', minStock:'5', desc:'',
    hasPackage:false, packageTypeId:'',
    packageQty:'', packagePrice:'', packageBarcode:'',
  };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    setSearch(initialSearch || '');
  }, [initialSearch]);

  useEffect(() => {
    if (!openCreateOnMount) return;
    setForm((current) => ({
      ...empty,
      name: initialSearch || current.name || '',
    }));
    setEditing(null);
    setShowForm(true);
  }, [openCreateOnMount, initialSearch]);

  useEffect(()=>{
    const u1=onSnapshot(collection(db,'pos_products'), s=>setProducts(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2=onSnapshot(collection(db,'pos_packages'), s=>setPackages(s.docs.map(d=>({...d.data(),id:d.id}))));
    return()=>{u1();u2();};
  },[]);

  useEffect(() => {
    const syncMargin = () => setPricingSettings(readPricingSettings());
    window.addEventListener('storage', syncMargin);
    window.addEventListener('focus', syncMargin);
    return () => {
      window.removeEventListener('storage', syncMargin);
      window.removeEventListener('focus', syncMargin);
    };
  }, []);

  const selPackage = packages.find(p=>p.id===form.packageTypeId);
  const buyPriceValue = Number(form.buyPrice || 0);
  const sellPriceValue = Number(form.sellPrice || 0);
  const wholesalePriceValue = Number(form.wholesalePrice || 0);
  const specialPriceValue = Number(form.specialPrice || 0);
  const retailProfitPercent = buyPriceValue > 0
    ? (((sellPriceValue - buyPriceValue) / buyPriceValue) * 100)
    : 0;
  const wholesaleProfitPercent = buyPriceValue > 0
    ? (((wholesalePriceValue - buyPriceValue) / buyPriceValue) * 100)
    : 0;
  const specialProfitPercent = buyPriceValue > 0
    ? (((specialPriceValue - buyPriceValue) / buyPriceValue) * 100)
    : 0;

  const filtered = products.filter(p=>{
    const matchCat    = catFilter==='الكل'||p.cat===catFilter;
    const matchPkg    = pkgFilter==='الكل'||(pkgFilter==='معبأ'&&p.hasPackage)||(pkgFilter==='غير معبأ'&&!p.hasPackage);
    const matchSearch = !search||p.name?.includes(search)||p.barcode?.includes(search);
    return matchCat&&matchPkg&&matchSearch;
  });

  const save = async () => {
    if (!(editing ? canEdit : canCreate)) return alert('ليس لديك صلاحية لتعديل المواد');
    if (!form.name?.trim()) return alert('يرجى إدخال اسم المادة');
    if (!form.sellPrice || Number(form.sellPrice) <= 0) return alert('يرجى إدخال سعر البيع (يجب أن يكون أكبر من صفر)');
    if (Number(form.buyPrice) < 0) return alert('سعر الشراء لا يمكن أن يكون سالباً');
    if (Number(form.stock) < 0) return alert('المخزون لا يمكن أن يكون سالباً');
    if (form.hasPackage && (!form.packageQty || Number(form.packageQty) < 1)) return alert('يرجى إدخال كمية التعبئة (أكبر من صفر)');
    setSaving(true);
    try {
      let savedProduct = null;
      const data = {
        ...form,
        buyPrice:       Number(form.buyPrice),
        sellPrice:      Number(form.sellPrice),
        wholesalePrice: Number(form.wholesalePrice),
        specialPrice:   Number(form.specialPrice),
        stock:          Number(form.stock),
        minStock:       Number(form.minStock),
        packageQty:     form.hasPackage ? Number(form.packageQty) : null,
        packagePrice:   form.hasPackage && form.packagePrice ? Number(form.packagePrice) : null,
      };

      if (editing) {
        // تحديث في الديسكتوب
        await updateDoc(doc(db,'pos_products',editing), data);
        if (isOfflineImageRef(data.imgUrl)) {
          attachOfflineImageTarget(data.imgUrl, { collection: 'pos_products', docId: editing, field: 'imgUrl' });
        }
        // مزامنة مع الموبايل
        await syncToMobile(editing, data);
        savedProduct = { id: editing, ...data };
      } else {
        // إضافة في الديسكتوب
        const ref = await addDoc(collection(db,'pos_products'), {
          ...data, soldCount:0, createdAt:new Date().toISOString()
        });
        if (isOfflineImageRef(data.imgUrl)) {
          attachOfflineImageTarget(data.imgUrl, { collection: 'pos_products', docId: ref.id, field: 'imgUrl' });
        }
        // مزامنة مع الموبايل بنفس الـ ID
        await syncToMobile(ref.id, data);
        savedProduct = { id: ref.id, ...data, soldCount: 0, createdAt: new Date().toISOString() };
      }

      setSyncMsg('✅ تم الحفظ ومزامنة الموبايل');
      setTimeout(()=>setSyncMsg(''), 3000);
      setForm(empty); setEditing(null); setShowForm(false);
      onProductSaved?.(savedProduct);
    } catch (e) {
      console.error('[Products.save]', e);
      alert('خطأ في حفظ المادة: ' + (e?.message || 'حدث خطأ غير متوقع'));
    }
    setSaving(false);
  };

  const uploadProductImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('حجم صورة المادة كبير جداً. الحد الأقصى 8MB.');
      event.target.value = '';
      return;
    }

    setUploadingImage(true);
    setSyncMsg('⏳ جاري رفع صورة المادة...');
    try {
      if (!navigator.onLine) {
        const offlineRef = await queueOfflineImage(file);
        setForm((current) => ({ ...current, imgUrl: offlineRef }));
        setSyncMsg('📦 تم حفظ الصورة محليًا وستُرفع تلقائيًا عند توفر الإنترنت');
        setTimeout(() => setSyncMsg(''), 3500);
        return;
      }
      const imgUrl = await uploadToImgBB(file);
      setForm((current) => ({ ...current, imgUrl }));
      setSyncMsg('✅ تم رفع صورة المادة');
      setTimeout(() => setSyncMsg(''), 3000);
    } catch (error) {
      try {
        const offlineRef = await queueOfflineImage(file);
        setForm((current) => ({ ...current, imgUrl: offlineRef }));
        setSyncMsg('📦 الرفع متعذر الآن. حُفظت محليًا وستُرفع لاحقًا تلقائيًا');
        setTimeout(() => setSyncMsg(''), 3500);
      } catch {
        alert(error?.message || 'تعذر رفع صورة المادة');
        setSyncMsg('');
      }
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const del = async (id, name) => {
    if (!canDelete) return alert('ليس لديك صلاحية لحذف المواد');
    if (!confirm(`هل أنت متأكد من حذف المادة "${name}"؟\nلا يمكن التراجع عن هذه العملية.`)) return;
    try {
      await deleteDoc(doc(db, 'pos_products', id));
      await setDoc(doc(db, 'products', id), { stock:0, active:false }, { merge:true });
    } catch (e) {
      console.error('[Products.del]', e);
      alert('خطأ في حذف المادة: ' + (e?.message || 'حدث خطأ'));
    }
  };

  const edit = (p) => {
    if (!canEdit) {
      alert('صلاحية تعديل المواد متاحة للمدير والمحاسب فقط');
      return;
    }
    setForm({
      ...p,
      buyPrice:       String(p.buyPrice||''),
      sellPrice:      String(p.sellPrice||''),
      wholesalePrice: String(p.wholesalePrice||''),
      specialPrice:   String(p.specialPrice||''),
      stock:          String(p.stock||''),
      minStock:       String(p.minStock||5),
      packageQty:     String(p.packageQty||''),
      packagePrice:   String(p.packagePrice||''),
      packageBarcode: p.packageBarcode||'',
      imgUrl:         p.imgUrl||'',
    });
    setEditing(p.id); setShowForm(true);
  };

  // نسخ كل pos_products إلى products مرة واحدة
  const syncAll = async () => {
    if(!confirm(`مزامنة ${products.length} مادة مع تطبيق الموبايل؟`)) return;
    setSyncMsg('⏳ جاري المزامنة...');
    let count = 0;
    for(const p of products){
      await syncToMobile(p.id, p);
      count++;
      setSyncMsg(`⏳ ${count}/${products.length}`);
    }
    setSyncMsg(`✅ تمت مزامنة ${count} مادة مع الموبايل!`);
    setTimeout(()=>setSyncMsg(''), 5000);
  };

  const autoPackagePrice = form.packageQty && form.sellPrice
    ? Number(form.sellPrice) * Number(form.packageQty) : null;
  const priceHints = buildSalePricesFromBuyPrice(form.buyPrice, pricingSettings);

  return(
    <div style={{padding:24,fontFamily:"'Cairo'",direction:'rtl',height:embedded?'100%':undefined,overflow:embedded?'auto':undefined,background:'#f8fbff'}}>
      {/* رأس الصفحة */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{color:'#18243A',fontSize:22,fontWeight:800}}>إدارة المواد</div>
          <div style={{color:'#64748B',fontSize:13}}>{products.length} مادة • {products.filter(p=>p.hasPackage).length} معبّأة</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          {embedded && (
            <button onClick={onClose}
              style={{background:'#fff',border:'1px solid #d9e2f2',borderRadius:12,padding:'10px 16px',color:'#334155',cursor:'pointer',fontFamily:"'Cairo'",fontSize:13,fontWeight:700}}>
              إغلاق
            </button>
          )}
          {/* زر مزامنة الكل */}
          <button onClick={syncAll}
            style={{background:'#3b82f622',border:'1px solid #3b82f644',borderRadius:12,padding:'10px 16px',color:'#3b82f6',cursor:'pointer',fontFamily:"'Cairo'",fontSize:13,fontWeight:700}}>
            📱 مزامنة الموبايل
          </button>
          <button onClick={()=>{
            if (!canCreate) {
              alert('صلاحية إضافة المواد متاحة للمدير والمحاسب فقط');
              return;
            }
            setForm(empty);setEditing(null);setShowForm(true);
          }}
            style={{background:'#F5C800',color:'#000',border:'none',borderRadius:12,padding:'10px 20px',fontWeight:800,cursor:'pointer',fontSize:14}}>
            + إضافة مادة
          </button>
        </div>
      </div>

      {/* رسالة المزامنة */}
      {syncMsg&&(
        <div style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:10,padding:'10px 16px',marginBottom:14,color:'#10b981',fontSize:13,fontWeight:700,textAlign:'center'}}>
          {syncMsg}
        </div>
      )}

      {/* فلاتر */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..."
          style={{flex:1,minWidth:200,background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 14px',color:'#18243A',fontSize:13,outline:'none'}}/>
        {['الكل','معبأ','غير معبأ'].map(f=>(
          <button key={f} onClick={()=>setPkgFilter(f)}
            style={{background:pkgFilter===f?'#a78bfa':'#fff',color:pkgFilter===f?'#fff':'#64748B',border:`1px solid ${pkgFilter===f?'#a78bfa':'#D9E2F2'}`,borderRadius:20,padding:'8px 14px',fontSize:12,cursor:'pointer',fontWeight:pkgFilter===f?700:400}}>
            {f==='معبأ'?'📦 معبأ':f==='غير معبأ'?'🔹 غير معبأ':'الكل'}
          </button>
        ))}
        {['الكل',...CATS].map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)}
            style={{background:catFilter===c?'#F5C800':'#fff',color:catFilter===c?'#000':'#64748B',border:`1px solid ${catFilter===c?'#F5C800':'#D9E2F2'}`,borderRadius:20,padding:'6px 14px',fontSize:12,cursor:'pointer'}}>
            {c}
          </button>
        ))}
      </div>

      {/* نموذج الإضافة / التعديل */}
      {showForm&&(
        <div style={{background:'#FFFFFF',borderRadius:16,padding:24,border:'1px solid #E8EEF8',marginBottom:20,boxShadow:'0 10px 30px rgba(15,23,42,0.05)'}}>
          <div style={{color:'#F5C800',fontSize:16,fontWeight:800,marginBottom:20}}>{editing?'✏️ تعديل مادة':'➕ إضافة مادة'}</div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
            {[['اسم المادة *','name'],['باركود المفرد','barcode'],['رابط صورة المادة (imgUrl)','imgUrl'],['الوصف','desc']].map(([lb,k])=>(
              <div key={k} style={{gridColumn:k==='imgUrl'?'1/-1':undefined}}>
                <label style={{color:'#64748B',fontSize:12,display:'block',marginBottom:5}}>{lb}</label>
                <input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                  placeholder={k==='imgUrl'?'https://i.ibb.co/...':''}
                  style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#18243A',outline:'none',boxSizing:'border-box',fontFamily:"'Cairo'"}}/>
              </div>
            ))}

            {/* معاينة الصورة */}
            {form.imgUrl&&(
              <div style={{gridColumn:'1/-1',display:'flex',gap:12,alignItems:'center'}}>
                <img src={resolveImageUrl(form.imgUrl)} alt="معاينة" style={{width:60,height:60,borderRadius:10,objectFit:'cover',border:'1px solid #333'}}
                  onError={e=>{e.target.style.display='none';}}/>
                <span style={{color:'#10b981',fontSize:12}}>✅ الصورة محمّلة</span>
              </div>
            )}

            <div style={{gridColumn:'1/-1',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <label style={{background:'#06b6d4',color:'#fff',borderRadius:10,padding:'8px 14px',cursor:uploadingImage?'not-allowed':'pointer',fontSize:12,fontWeight:700,opacity:uploadingImage?0.7:1}}>
                {uploadingImage ? 'جارٍ رفع الصورة...' : 'رفع صورة من الجهاز'}
                <input type="file" accept="image/*" onChange={uploadProductImage} style={{display:'none'}} disabled={uploadingImage}/>
              </label>
              {form.imgUrl && (
                <button onClick={()=>setForm(f=>({...f,imgUrl:''}))}
                  style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:10,padding:'8px 12px',color:'#ef4444',cursor:'pointer',fontFamily:"'Cairo'"}}>
                  حذف الصورة
                </button>
              )}
            </div>

            {[['سعر الشراء (د.ع)','buyPrice'],['سعر البيع المفرد *','sellPrice'],['سعر الجملة','wholesalePrice'],['السعر الخاص','specialPrice'],['المخزون','stock'],['الحد الأدنى','minStock']].map(([lb,k])=>(
              <div key={k}>
                <label style={{color:'#64748B',fontSize:12,display:'block',marginBottom:5}}>{lb}</label>
                <input
                  type="number"
                  value={form[k]}
                  onChange={e=>setForm(f=>{
                    const nextValue = e.target.value;
                    if (k !== 'buyPrice') return { ...f, [k]: nextValue };
                    const nextPrices = buildSalePricesFromBuyPrice(nextValue, pricingSettings);
                    return {
                      ...f,
                      buyPrice: nextValue,
                      sellPrice: String(nextPrices.sellPrice || ''),
                      wholesalePrice: String(nextPrices.wholesalePrice || ''),
                      specialPrice: String(nextPrices.specialPrice || ''),
                    };
                  })}
                  style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#18243A',outline:'none',boxSizing:'border-box'}}/>
                {k === 'buyPrice' && (
                  <div style={{color:'#64748B',fontSize:10,marginTop:5}}>
                    مفرد {pricingSettings.retailMargin}% • جملة {pricingSettings.wholesaleMargin}% • خاص {pricingSettings.specialMargin}%
                    {priceHints.sellPrice ? ` • المقترح: ${Number(priceHints.sellPrice).toLocaleString('ar-IQ')} / ${Number(priceHints.wholesalePrice).toLocaleString('ar-IQ')} / ${Number(priceHints.specialPrice).toLocaleString('ar-IQ')}` : ''}
                  </div>
                )}
              </div>
            ))}

            <div style={{gridColumn:'1/-1',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
              <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:12,padding:'12px 14px'}}>
                <div style={{color:'#9A3412',fontSize:11,marginBottom:4}}>نسبة ربح المفرد</div>
                <div style={{color:'#C2410C',fontSize:18,fontWeight:900}}>
                  {buyPriceValue > 0 ? `${retailProfitPercent.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:'12px 14px'}}>
                <div style={{color:'#1D4ED8',fontSize:11,marginBottom:4}}>نسبة ربح الجملة</div>
                <div style={{color:'#2563EB',fontSize:18,fontWeight:900}}>
                  {buyPriceValue > 0 && wholesalePriceValue > 0 ? `${wholesaleProfitPercent.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div style={{background:'#F3E8FF',border:'1px solid #D8B4FE',borderRadius:12,padding:'12px 14px'}}>
                <div style={{color:'#7C3AED',fontSize:11,marginBottom:4}}>نسبة ربح السعر الخاص</div>
                <div style={{color:'#6D28D9',fontSize:18,fontWeight:900}}>
                  {buyPriceValue > 0 && specialPriceValue > 0 ? `${specialProfitPercent.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>

            <div>
              <label style={{color:'#64748B',fontSize:12,display:'block',marginBottom:5}}>التصنيف</label>
              <select value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}
                style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#18243A',outline:'none'}}>
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={{color:'#64748B',fontSize:12,display:'block',marginBottom:5}}>الأيقونة</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {EMOJIS.map(e=>(
                  <button key={e} onClick={()=>setForm(f=>({...f,img:e}))}
                    style={{width:36,height:36,borderRadius:8,border:`2px solid ${form.img===e?'#F5C800':'#D9E2F2'}`,background:form.img===e?'#F5C80022':'#fff',fontSize:18,cursor:'pointer'}}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* التعبئة */}
          <div style={{marginTop:20,borderTop:'1px solid #E8EEF8',paddingTop:20}}>
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
              <div style={{color:'#a78bfa',fontSize:15,fontWeight:800}}>📦 التعبئة</div>
              <button onClick={()=>setForm(f=>({...f,hasPackage:!f.hasPackage}))}
                style={{display:'flex',alignItems:'center',gap:8,background:form.hasPackage?'#a78bfa22':'#fff',border:`2px solid ${form.hasPackage?'#a78bfa':'#D9E2F2'}`,borderRadius:20,padding:'6px 16px',cursor:'pointer'}}>
                <div style={{width:20,height:20,borderRadius:10,background:form.hasPackage?'#a78bfa':'#333',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#fff'}}>
                  {form.hasPackage?'✓':''}
                </div>
                <span style={{color:form.hasPackage?'#a78bfa':'#64748B',fontSize:13,fontWeight:700}}>
                  {form.hasPackage?'هذه المادة معبّأة ✓':'تفعيل التعبئة'}
                </span>
              </button>
            </div>

            {form.hasPackage&&(
              <div style={{background:'#F8FBFF',borderRadius:14,padding:20,border:'1px solid #DDD6FE'}}>
                <div style={{marginBottom:14}}>
                  <label style={{color:'#a78bfa',fontSize:12,display:'block',marginBottom:8}}>نوع التعبئة *</label>
                  {packages.length===0
                    ?<div style={{color:'#ef4444',fontSize:12,padding:10}}>لا توجد أنواع تعبئة — أضف من قسم التعبئات أولاً</div>
                    :<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                      {packages.map(pk=>(
                        <div key={pk.id} onClick={()=>setForm(f=>({...f,packageTypeId:pk.id}))}
                          style={{padding:'10px 12px',borderRadius:12,border:`2px solid ${form.packageTypeId===pk.id?'#a78bfa':'#D9E2F2'}`,background:form.packageTypeId===pk.id?'#a78bfa11':'#fff',cursor:'pointer',textAlign:'center'}}>
                          <div style={{fontSize:24,marginBottom:4}}>📦</div>
                          <div style={{color:form.packageTypeId===pk.id?'#a78bfa':'#18243A',fontSize:12,fontWeight:700}}>{pk.name}</div>
                          <div style={{color:'#64748B',fontSize:10}}>{pk.qty} {pk.unit||'وحدة'}</div>
                        </div>
                      ))}
                    </div>
                  }
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
                  <div>
                    <label style={{color:'#a78bfa',fontSize:12,display:'block',marginBottom:5}}>
                      عدد الوحدات {selPackage&&<span style={{color:'#555',fontSize:10}}>(افتراضي: {selPackage.qty})</span>}
                    </label>
                    <input type="number" value={form.packageQty} onChange={e=>setForm(f=>({...f,packageQty:e.target.value}))}
                      placeholder={selPackage?String(selPackage.qty):''}
                      style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#7C3AED',fontSize:14,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <label style={{color:'#a78bfa',fontSize:12,display:'block',marginBottom:5}}>
                      سعر بيع التعبئة {autoPackagePrice&&!form.packagePrice&&<span style={{color:'#555',fontSize:10}}>(تلقائي: {autoPackagePrice.toLocaleString('ar-IQ')})</span>}
                    </label>
                    <input type="number" value={form.packagePrice} onChange={e=>setForm(f=>({...f,packagePrice:e.target.value}))}
                      placeholder={autoPackagePrice?String(autoPackagePrice):''}
                      style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#10B981',fontSize:14,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <label style={{color:'#a78bfa',fontSize:12,display:'block',marginBottom:5}}>باركود التعبئة</label>
                    <input value={form.packageBarcode} onChange={e=>setForm(f=>({...f,packageBarcode:e.target.value}))}
                      style={{width:'100%',background:'#fff',border:'1px solid #D9E2F2',borderRadius:10,padding:'10px 12px',color:'#18243A',outline:'none',boxSizing:'border-box'}}/>
                  </div>
                </div>

                {selPackage&&(form.packageQty||selPackage.qty)&&(
                  <div style={{marginTop:14,background:'#a78bfa11',borderRadius:12,padding:14,border:'1px solid #a78bfa33',display:'flex',gap:16,alignItems:'center'}}>
                    <div style={{fontSize:32}}>📦</div>
                    <div>
                      <div style={{color:'#a78bfa',fontSize:13,fontWeight:700,marginBottom:4}}>معاينة التعبئة</div>
                      <div style={{color:'#334155',fontSize:12}}>
                        {selPackage.name} يحتوي على{' '}
                        <span style={{color:'#a78bfa',fontWeight:800}}>{form.packageQty||selPackage.qty}</span>
                        {' '}{selPackage.unit||'وحدة'} من {form.name||'المادة'}
                      </div>
                      <div style={{color:'#10b981',fontSize:12,marginTop:4}}>
                        سعر التعبئة:{' '}
                        <span style={{fontWeight:800}}>
                          {form.packagePrice
                            ? `${Number(form.packagePrice).toLocaleString('ar-IQ')} د.ع`
                            : autoPackagePrice
                            ? `${autoPackagePrice.toLocaleString('ar-IQ')} د.ع (تلقائي)`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button onClick={()=>{setShowForm(false);setForm(empty);setEditing(null);}}
              style={{flex:1,background:'#fff',border:'1px solid #D9E2F2',borderRadius:12,padding:12,color:'#64748B',cursor:'pointer'}}>إلغاء</button>
            <button onClick={save} disabled={saving || uploadingImage}
              style={{flex:2,background:saving?'#E2E8F0':'linear-gradient(135deg,#F5C800,#d4a800)',color:saving?'#64748B':'#000',border:'none',borderRadius:12,padding:12,fontWeight:800,cursor:saving?'not-allowed':'pointer',opacity:saving?0.6:1}}>
              {saving?'⏳ جاري الحفظ والمزامنة...':(editing?'💾 حفظ':'✅ إضافة')}
            </button>
          </div>
        </div>
      )}

      {/* جدول المواد */}
      <div style={{background:'#FFFFFF',borderRadius:16,border:'1px solid #E8EEF8',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:'1px solid #E8EEF8',background:'#F8FBFF'}}>
          {['المادة','التصنيف','سعر الشراء','سعر المفرد','التعبئة','المخزون','إجراء'].map(h=>(
            <div key={h} style={{color:'#64748B',fontSize:11,fontWeight:700}}>{h}</div>
          ))}
        </div>
        {filtered.length===0
          ?<div style={{color:'#94A3B8',textAlign:'center',padding:60}}>لا توجد مواد</div>
          :filtered.map((p,i)=>{
            const pkg=packages.find(pk=>pk.id===p.packageTypeId);
            return(
              <div key={p.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 20px',borderBottom:i<filtered.length-1?'1px solid #F1F5F9':'none',alignItems:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {p.imgUrl
                    ?<img src={resolveImageUrl(p.imgUrl)} alt="" style={{width:32,height:32,borderRadius:6,objectFit:'cover'}} onError={e=>e.target.style.display='none'}/>
                    :<span style={{fontSize:22}}>{p.img||'📦'}</span>}
                  <div>
                    <div style={{color:'#18243A',fontSize:13,fontWeight:600}}>{p.name}</div>
                    <div style={{display:'flex',gap:5,marginTop:2}}>
                      {p.barcode&&<span style={{color:'#94A3B8',fontSize:10}}>{p.barcode}</span>}
                      {p.hasPackage&&<span style={{background:'#a78bfa22',border:'1px solid #a78bfa44',borderRadius:20,padding:'1px 6px',color:'#a78bfa',fontSize:9,fontWeight:700}}>معبأ</span>}
                    </div>
                  </div>
                </div>
                <div style={{color:'#64748B',fontSize:12}}>{p.cat}</div>
                <div style={{color:'#64748B',fontSize:12}}>{fmt(p.buyPrice)}</div>
                <div style={{color:'#F5C800',fontSize:13,fontWeight:700}}>{fmt(p.sellPrice)}</div>
                <div>
                  {p.hasPackage&&pkg
                    ?<div style={{background:'#a78bfa22',borderRadius:8,padding:'4px 8px'}}>
                      <div style={{color:'#a78bfa',fontSize:11,fontWeight:700}}>{pkg.name}</div>
                      <div style={{color:'#64748B',fontSize:10}}>{p.packageQty||pkg.qty} {pkg.unit}</div>
                      {p.packagePrice&&<div style={{color:'#10b981',fontSize:10}}>{fmt(p.packagePrice)}</div>}
                    </div>
                    :<span style={{color:'#94A3B8',fontSize:11}}>—</span>}
                </div>
                <div>
                  <span style={{background:(p.stock||0)<=(p.minStock||5)?'#ef444422':'#10b98122',border:`1px solid ${(p.stock||0)<=(p.minStock||5)?'#ef444444':'#10b98144'}`,borderRadius:20,padding:'3px 10px',color:(p.stock||0)<=(p.minStock||5)?'#ef4444':'#10b981',fontSize:12,fontWeight:700}}>
                    {p.stock||0}
                  </span>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>edit(p)}
                    style={{background:'#F5C80022',border:'1px solid #F5C80044',borderRadius:8,padding:'5px 10px',color:'#F5C800',fontSize:12,cursor:'pointer'}}>✏️</button>
                  {canDelete&&(
                    <button onClick={()=>del(p.id,p.name)}
                      style={{background:'#ef444422',border:'1px solid #ef444444',borderRadius:8,padding:'5px 10px',color:'#ef4444',fontSize:12,cursor:'pointer'}}>🗑️</button>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}
