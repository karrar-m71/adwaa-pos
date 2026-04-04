import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  deleteBridgeGift,
  deleteBridgeOffer,
  deleteBridgeTechnician,
  getBridgeConfig,
  mobileBridgeCollections,
  publishGiftsToMobileBridge,
  publishOffersToMobileBridge,
  publishProductsToMobileBridge,
  publishSettingsToMobileBridge,
  publishTechniciansToMobileBridge,
  saveBridgeConfigPatch,
  saveBridgeGift,
  saveBridgeOffer,
  saveBridgeTechnician,
} from '../../utils/mobileBridge';

const fmt = (value) => (value || 0).toLocaleString('ar-IQ');
const IMGBB_KEY = '2cad24f273d54000b93b713da18f6315';

const emptyGift = {
  id: '',
  name: '',
  pts: '',
  cat: 'عام',
  desc: '',
  icon: '🎁',
  imageUrl: '',
  left: '',
  active: true,
};

const emptyOffer = {
  id: '',
  title: '',
  desc: '',
  badge: 'عرض خاص',
  icon: '🏷️',
  color: '#2a2400',
  active: true,
};

const emptyTechnician = {
  id: '',
  name: '',
  specialty: 'كهرباء عامة',
  address: '',
  province: '',
  phone: '',
  available: true,
  workHours: '٨ص — ٨م',
  visitFee: '',
  imageUrl: '',
  bio: '',
  workImages: '',
};

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #d9e2f2', padding: 18, marginBottom: 18 }}>
      <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%', color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
    />
  );
}

async function uploadToImgBB(file) {
  const form = new FormData();
  form.append('image', file);
  form.append('key', IMGBB_KEY);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || 'فشل رفع الصورة');
  }
  return data.data.url;
}

export default function MobileBridge({ user }) {
  const [sourceCount, setSourceCount] = useState(0);
  const [bridgeProductCount, setBridgeProductCount] = useState(0);
  const [bridgeGiftCount, setBridgeGiftCount] = useState(0);
  const [bridgeOfferCount, setBridgeOfferCount] = useState(0);
  const [bridgeTechnicianCount, setBridgeTechnicianCount] = useState(0);
  const [settingsExists, setSettingsExists] = useState(false);
  const [meta, setMeta] = useState(null);
  const [publishing, setPublishing] = useState('');
  const [flash, setFlash] = useState(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [uploadingGiftImage, setUploadingGiftImage] = useState(false);

  const [giftForm, setGiftForm] = useState(emptyGift);
  const [offerForm, setOfferForm] = useState(emptyOffer);
  const [technicianForm, setTechnicianForm] = useState(emptyTechnician);

  const bridgeConfig = useMemo(() => getBridgeConfig(), [configVersion]);
  const gifts = bridgeConfig.gifts || [];
  const offers = bridgeConfig.offers || [];
  const technicians = bridgeConfig.technicians || [];

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'pos_products'), (snap) => setSourceCount(snap.size));
    const unsubBridgeProducts = onSnapshot(collection(db, mobileBridgeCollections.products), (snap) => setBridgeProductCount(snap.size));
    const unsubBridgeGifts = onSnapshot(collection(db, mobileBridgeCollections.gifts), (snap) => setBridgeGiftCount(snap.size));
    const unsubBridgeOffers = onSnapshot(collection(db, mobileBridgeCollections.offers), (snap) => setBridgeOfferCount(snap.size));
    const unsubBridgeTechnicians = onSnapshot(collection(db, mobileBridgeCollections.technicians), (snap) => setBridgeTechnicianCount(snap.size));
    const unsubSettings = onSnapshot(
      doc(db, mobileBridgeCollections.settings, mobileBridgeCollections.settingsDoc),
      (snap) => setSettingsExists(snap.exists())
    );
    const unsubMeta = onSnapshot(
      doc(db, mobileBridgeCollections.metaCollection, mobileBridgeCollections.metaDoc),
      (snap) => setMeta(snap.exists() ? snap.data() : null)
    );

    return () => {
      unsubProducts();
      unsubBridgeProducts();
      unsubBridgeGifts();
      unsubBridgeOffers();
      unsubBridgeTechnicians();
      unsubSettings();
      unsubMeta();
    };
  }, []);

  const touchConfig = () => setConfigVersion((value) => value + 1);

  const runPublish = async (key, job, successMessage) => {
    setPublishing(key);
    setFlash(null);
    try {
      const result = await job();
      setFlash({ ok: true, message: successMessage(result) });
    } catch (error) {
      setFlash({ ok: false, message: error?.message || 'تعذر تنفيذ العملية.' });
    } finally {
      setPublishing('');
    }
  };

  const saveConfig = (patch) => {
    saveBridgeConfigPatch(patch);
    touchConfig();
  };

  const saveGift = async () => {
    if (!giftForm.name.trim()) {
      setFlash({ ok: false, message: 'اسم الهدية مطلوب.' });
      return;
    }
    await saveBridgeGift(giftForm);
    setGiftForm(emptyGift);
    touchConfig();
    setFlash({ ok: true, message: 'تم حفظ الهدية محلياً. انشر الجسر لتصل للموبايل.' });
  };

  const uploadGiftImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setFlash({ ok: false, message: 'حجم صورة الهدية كبير جداً. الحد الأقصى 8MB.' });
      event.target.value = '';
      return;
    }

    setUploadingGiftImage(true);
    setFlash({ ok: true, message: 'جارٍ رفع صورة الهدية...' });
    try {
      const imageUrl = await uploadToImgBB(file);
      setGiftForm((current) => ({ ...current, imageUrl }));
      setFlash({ ok: true, message: 'تم رفع صورة الهدية.' });
    } catch (error) {
      setFlash({ ok: false, message: error?.message || 'تعذر رفع صورة الهدية.' });
    } finally {
      setUploadingGiftImage(false);
      event.target.value = '';
    }
  };

  const saveOffer = async () => {
    if (!offerForm.title.trim()) {
      setFlash({ ok: false, message: 'عنوان العرض مطلوب.' });
      return;
    }
    await saveBridgeOffer(offerForm);
    setOfferForm(emptyOffer);
    touchConfig();
    setFlash({ ok: true, message: 'تم حفظ العرض محلياً. انشر الجسر لتصل للموبايل.' });
  };

  const saveTechnician = async () => {
    if (!technicianForm.name.trim()) {
      setFlash({ ok: false, message: 'اسم الفني مطلوب.' });
      return;
    }
    await saveBridgeTechnician(technicianForm);
    setTechnicianForm(emptyTechnician);
    touchConfig();
    setFlash({ ok: true, message: 'تم حفظ الفني محلياً. انشر الفنيين ليظهروا في الموبايل.' });
  };

  const lastPublishedAt = meta?.updatedAt?.toDate?.()
    ? meta.updatedAt.toDate().toLocaleString('ar-IQ')
    : 'لم يتم النشر بعد';

  return (
    <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl', maxWidth: 980 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>ربط تطبيق الموبايل</div>
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
          هذه الصفحة تنشر البيانات مباشرة إلى مجموعات تطبيق الموبايل الحالية: المنتجات، الهدايا، العروض، وسعر التوصيل.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginBottom: 18 }}>
        {[
          ['📦', 'مواد المصدر', fmt(sourceCount), '#3b82f6'],
          ['📱', 'مواد الجسر', fmt(bridgeProductCount), '#10b981'],
          ['🎁', 'هدايا الجسر', fmt(bridgeGiftCount), '#f59e0b'],
          ['🏷️', 'عروض الجسر', fmt(bridgeOfferCount), '#a855f7'],
          ['👷', 'فنيون الموبايل', fmt(bridgeTechnicianCount), '#06b6d4'],
          ['⚙️', 'إعدادات الجسر', settingsExists ? 'منشورة' : 'غير منشورة', '#F5C800'],
        ].map(([icon, label, value, color]) => (
          <div key={label} style={{ background: '#ffffff', borderRadius: 16, padding: 16, border: '1px solid #d9e2f2' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>{label}</div>
            <div style={{ color, fontSize: 15, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>

      {flash && (
        <div
          style={{
            background: flash.ok ? '#10b98115' : '#ef444415',
            border: `1px solid ${flash.ok ? '#10b98133' : '#ef444433'}`,
            borderRadius: 12,
            padding: 12,
            color: flash.ok ? '#047857' : '#b91c1c',
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {flash.message}
        </div>
      )}

      <Card title="نشر المنتجات" subtitle={`آخر نشر: ${lastPublishedAt}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => runPublish('products', publishProductsToMobileBridge, (result) => `تم نشر ${fmt(result.publishedCount)} مادة إلى ${result.targetCollection}`)}
            disabled={publishing === 'products'}
            style={{ background: publishing === 'products' ? '#94a3b8' : '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 20px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}
          >
            {publishing === 'products' ? '...جاري النشر' : 'نشر كتالوج المواد'}
          </button>
          <div style={{ color: '#64748b', fontSize: 12 }}>المنفذ الحالي: {user?.name || 'غير معروف'}</div>
        </div>
      </Card>

      <Card title="إعدادات الموبايل المباشرة" subtitle="تُسحب من إعدادات المتجر الحالية مع حقول دعم مستقبلية وسعر توصيل مباشر للموبايل.">
        <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>
          المزامنة المباشرة المتاحة الآن من تطبيق الموبايل الحالي هي: <b>سعر التوصيل فقط</b>.
          أما رقم الدعم وواتساب الدعم فما زالا ثابتين داخل كود تطبيق الموبايل الحالي، لذلك حفظهما هنا يفيدنا لاحقاً لكنه لا يغيّر التطبيق الحالي فوراً.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
          <div>
          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>رقم الدعم المستقبلي</div>
          <TextInput value={bridgeConfig.supportPhone || ''} onChange={(e) => saveConfig({ supportPhone: e.target.value })} placeholder="07xxxxxxxxx" />
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>واتساب الدعم المستقبلي</div>
          <TextInput value={bridgeConfig.supportWhatsApp || ''} onChange={(e) => saveConfig({ supportWhatsApp: e.target.value })} placeholder="https://wa.me/..." />
        </div>
          <div>
            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>سعر التوصيل</div>
            <TextInput type="number" value={bridgeConfig.deliveryPrice || ''} onChange={(e) => saveConfig({ deliveryPrice: e.target.value })} placeholder="0" />
          </div>
        </div>
        <button
          onClick={() => runPublish('settings', publishSettingsToMobileBridge, (result) => `تم نشر الإعدادات إلى ${result.targetCollection}`)}
          disabled={publishing === 'settings'}
          style={{ background: publishing === 'settings' ? '#94a3b8' : '#F5C800', color: '#000', border: 'none', borderRadius: 12, padding: '11px 20px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}
        >
          {publishing === 'settings' ? '...جاري النشر' : 'نشر إعدادات الموبايل'}
        </button>
      </Card>

      <Card title="الهدايا المباشرة" subtitle="هذه الهدايا تُنشر الآن مباشرة إلى مجموعة الهدايا التي يقرأها تطبيق الموبايل.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
          <TextInput value={giftForm.name} onChange={(e) => setGiftForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الهدية" />
          <TextInput type="number" value={giftForm.pts} onChange={(e) => setGiftForm((f) => ({ ...f, pts: e.target.value }))} placeholder="نقاط الهدية" />
          <TextInput value={giftForm.cat} onChange={(e) => setGiftForm((f) => ({ ...f, cat: e.target.value }))} placeholder="التصنيف" />
          <TextInput value={giftForm.icon} onChange={(e) => setGiftForm((f) => ({ ...f, icon: e.target.value }))} placeholder="🎁" />
          <TextInput value={giftForm.imageUrl} onChange={(e) => setGiftForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="رابط الصورة" />
          <TextInput type="number" value={giftForm.left} onChange={(e) => setGiftForm((f) => ({ ...f, left: e.target.value }))} placeholder="الكمية المتبقية" />
          <div style={{ gridColumn: 'span 2' }}>
            <TextInput value={giftForm.desc} onChange={(e) => setGiftForm((f) => ({ ...f, desc: e.target.value }))} placeholder="وصف الهدية" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ background: '#06b6d4', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: uploadingGiftImage ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: uploadingGiftImage ? 0.7 : 1 }}>
            {uploadingGiftImage ? 'جارٍ رفع الصورة...' : 'رفع صورة الهدية'}
            <input type="file" accept="image/*" onChange={uploadGiftImage} style={{ display: 'none' }} disabled={uploadingGiftImage} />
          </label>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            نقاط الهدية الحالية: <b>{fmt(giftForm.pts || 0)}</b>
          </div>
          {giftForm.imageUrl && (
            <>
              <img src={giftForm.imageUrl} alt="gift" style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 10, border: '1px solid #d9e2f2' }} />
              <button onClick={() => setGiftForm((f) => ({ ...f, imageUrl: '' }))} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>
                حذف الصورة
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button onClick={saveGift} disabled={uploadingGiftImage} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: uploadingGiftImage ? 'not-allowed' : 'pointer', fontFamily: "'Cairo'", fontWeight: 800, opacity: uploadingGiftImage ? 0.7 : 1 }}>
            {giftForm.id ? 'تحديث الهدية' : 'حفظ هدية'}
          </button>
          <button onClick={() => setGiftForm(emptyGift)} style={{ background: '#f8fbff', color: '#64748b', border: '1px solid #cdd8ec', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 700 }}>
            تفريغ
          </button>
          <button
            onClick={() => runPublish('gifts', publishGiftsToMobileBridge, (result) => `تم نشر ${fmt(result.publishedCount)} هدية إلى ${result.targetCollection}`)}
            disabled={publishing === 'gifts'}
            style={{ background: publishing === 'gifts' ? '#94a3b8' : '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}
          >
            {publishing === 'gifts' ? '...جاري النشر' : 'نشر الهدايا'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {gifts.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>لا توجد هدايا محفوظة محلياً بعد.</div>}
          {gifts.map((gift) => (
            <div key={gift.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {gift.imageUrl ? (
                  <img src={gift.imageUrl} alt={gift.name} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 10, border: '1px solid #d9e2f2' }} />
                ) : (
                  <div style={{ fontSize: 22 }}>{gift.icon || '🎁'}</div>
                )}
                <div>
                  <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 800 }}>{gift.name}</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>{fmt(gift.pts)} نقطة • {gift.cat}</div>
                  {gift.left !== '' && gift.left != null && (
                    <div style={{ color: '#64748b', fontSize: 11 }}>المتبقي: {fmt(gift.left)}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setGiftForm({ ...emptyGift, ...gift, pts: String(gift.pts || ''), left: String(gift.left || '') })} style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}>تعديل</button>
                <button onClick={async () => { await deleteBridgeGift(gift.id); touchConfig(); setFlash({ ok: true, message: 'تم حذف الهدية من الجسر.' }); }} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="العروض المباشرة" subtitle="هذه العروض تُنشر الآن مباشرة إلى مجموعة العروض التي يقرأها تطبيق الموبايل.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
          <TextInput value={offerForm.title} onChange={(e) => setOfferForm((f) => ({ ...f, title: e.target.value }))} placeholder="عنوان العرض" />
          <TextInput value={offerForm.badge} onChange={(e) => setOfferForm((f) => ({ ...f, badge: e.target.value }))} placeholder="الشارة" />
          <TextInput value={offerForm.icon} onChange={(e) => setOfferForm((f) => ({ ...f, icon: e.target.value }))} placeholder="🏷️" />
          <TextInput value={offerForm.color} onChange={(e) => setOfferForm((f) => ({ ...f, color: e.target.value }))} placeholder="#2a2400" />
          <div style={{ gridColumn: 'span 4' }}>
            <TextInput value={offerForm.desc} onChange={(e) => setOfferForm((f) => ({ ...f, desc: e.target.value }))} placeholder="وصف العرض" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button onClick={saveOffer} style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}>
            {offerForm.id ? 'تحديث العرض' : 'حفظ عرض'}
          </button>
          <button onClick={() => setOfferForm(emptyOffer)} style={{ background: '#f8fbff', color: '#64748b', border: '1px solid #cdd8ec', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 700 }}>
            تفريغ
          </button>
          <button
            onClick={() => runPublish('offers', publishOffersToMobileBridge, (result) => `تم نشر ${fmt(result.publishedCount)} عرض إلى ${result.targetCollection}`)}
            disabled={publishing === 'offers'}
            style={{ background: publishing === 'offers' ? '#94a3b8' : '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}
          >
            {publishing === 'offers' ? '...جاري النشر' : 'نشر العروض'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {offers.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>لا توجد عروض محفوظة محلياً بعد.</div>}
          {offers.map((offer) => (
            <div key={offer.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 22 }}>{offer.icon || '🏷️'}</div>
                <div>
                  <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 800 }}>{offer.title}</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>{offer.badge}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOfferForm({ ...emptyOffer, ...offer })} style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}>تعديل</button>
                <button onClick={async () => { await deleteBridgeOffer(offer.id); touchConfig(); setFlash({ ok: true, message: 'تم حذف العرض من الجسر.' }); }} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="الفنيون المباشرون" subtitle="هذه البيانات تُنشر الآن مباشرة إلى مجموعة الفنيين التي يقرأها تطبيق الموبايل.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
          <TextInput value={technicianForm.name} onChange={(e) => setTechnicianForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الفني" />
          <TextInput value={technicianForm.specialty} onChange={(e) => setTechnicianForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="الاختصاص" />
          <TextInput value={technicianForm.phone} onChange={(e) => setTechnicianForm((f) => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" />
          <TextInput value={technicianForm.province} onChange={(e) => setTechnicianForm((f) => ({ ...f, province: e.target.value }))} placeholder="المحافظة" />
          <TextInput value={technicianForm.address} onChange={(e) => setTechnicianForm((f) => ({ ...f, address: e.target.value }))} placeholder="العنوان" />
          <TextInput value={technicianForm.workHours} onChange={(e) => setTechnicianForm((f) => ({ ...f, workHours: e.target.value }))} placeholder="ساعات العمل" />
          <TextInput type="number" value={technicianForm.visitFee} onChange={(e) => setTechnicianForm((f) => ({ ...f, visitFee: e.target.value }))} placeholder="أجرة الكشف" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 10, padding: '10px 12px' }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>الحالة</span>
            <button onClick={() => setTechnicianForm((f) => ({ ...f, available: !f.available }))} style={{ background: technicianForm.available ? '#10b98122' : '#ef444422', border: `1px solid ${technicianForm.available ? '#10b98144' : '#ef444444'}`, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Cairo'" }}>
              {technicianForm.available ? 'متاح' : 'مشغول'}
            </button>
          </div>
          <div style={{ gridColumn: 'span 4' }}>
            <TextInput value={technicianForm.imageUrl} onChange={(e) => setTechnicianForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="رابط الصورة الرئيسية" />
          </div>
          <div style={{ gridColumn: 'span 4' }}>
            <textarea
              value={technicianForm.bio}
              onChange={(e) => setTechnicianForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="نبذة عن الفني"
              style={{ width: '100%', minHeight: 90, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
            />
          </div>
          <div style={{ gridColumn: 'span 4' }}>
            <textarea
              value={technicianForm.workImages}
              onChange={(e) => setTechnicianForm((f) => ({ ...f, workImages: e.target.value }))}
              placeholder="روابط صور الأعمال، كل رابط في سطر"
              style={{ width: '100%', minHeight: 100, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button onClick={saveTechnician} style={{ background: '#06b6d4', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}>
            {technicianForm.id ? 'تحديث الفني' : 'حفظ فني'}
          </button>
          <button onClick={() => setTechnicianForm(emptyTechnician)} style={{ background: '#f8fbff', color: '#64748b', border: '1px solid #cdd8ec', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 700 }}>
            تفريغ
          </button>
          <button
            onClick={() => runPublish('technicians', publishTechniciansToMobileBridge, (result) => `تم نشر ${fmt(result.publishedCount)} فني إلى ${result.targetCollection}`)}
            disabled={publishing === 'technicians'}
            style={{ background: publishing === 'technicians' ? '#94a3b8' : '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}
          >
            {publishing === 'technicians' ? '...جاري النشر' : 'نشر الفنيين'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {technicians.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>لا يوجد فنيون محفوظون محلياً بعد.</div>}
          {technicians.map((technician) => (
            <div key={technician.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '10px 12px' }}>
              <div>
                <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 800 }}>{technician.name}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>{technician.specialty} • {technician.phone || 'بدون هاتف'} • {technician.province || 'بدون محافظة'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTechnicianForm({ ...emptyTechnician, ...technician, visitFee: String(technician.visitFee || ''), workImages: Array.isArray(technician.workImages) ? technician.workImages.join('\n') : (technician.workImages || '') })} style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}>تعديل</button>
                <button onClick={async () => { await deleteBridgeTechnician(technician.id); touchConfig(); setFlash({ ok: true, message: 'تم حذف الفني.' }); }} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="المجموعات الفعلية" subtitle="هذه هي المجموعات التي تُحدَّث الآن مباشرة من تطبيق سطح المكتب.">
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            ['مواد الموبايل', mobileBridgeCollections.products],
            ['هدايا الموبايل', mobileBridgeCollections.gifts],
            ['عروض الموبايل', mobileBridgeCollections.offers],
            ['فنيون الموبايل', mobileBridgeCollections.technicians],
            ['سعر التوصيل', `${mobileBridgeCollections.settings}/${mobileBridgeCollections.settingsDoc}`],
            ['بيانات حالة النشر', `${mobileBridgeCollections.metaCollection}/${mobileBridgeCollections.metaDoc}`],
          ].map(([label, value]) => (
            <div key={label} style={{ background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{label}</div>
              <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700, direction: 'ltr', textAlign: 'left' }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
