import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { attachOfflineImageTarget, getOfflineImagePreview, isOfflineImageRef, queueOfflineImage } from '../utils/offlineImageQueue';
import { uploadToImgBB } from '../utils/imgbb';

const fmt = (value) => (value || 0).toLocaleString('ar-IQ');

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

const MAX_FIRESTORE_DOC_BYTES = 900 * 1024;
const MAX_WORK_IMAGES = 6;
const IRAQ_PROVINCES = [
  'بغداد',
  'البصرة',
  'نينوى',
  'أربيل',
  'النجف',
  'كربلاء',
  'السليمانية',
  'دهوك',
  'كركوك',
  'الأنبار',
  'بابل',
  'ديالى',
  'ذي قار',
  'صلاح الدين',
  'واسط',
  'ميسان',
  'المثنى',
  'القادسية',
];

function estimatePayloadBytes(payload) {
  return new Blob([JSON.stringify(payload)]).size;
}

const resolveImageUrl = (value = '') => (isOfflineImageRef(value) ? getOfflineImagePreview(value) : value);

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

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ width: '100%', color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function normalizeTechnicianForm(form) {
  return {
    name: form.name.trim(),
    specialty: form.specialty.trim() || 'كهرباء عامة',
    address: form.address.trim(),
    province: form.province.trim(),
    phone: form.phone.trim(),
    available: form.available !== false,
    workHours: form.workHours.trim() || '٨ص — ٨م',
    visitFee: Number(form.visitFee || 0) || 0,
    imageUrl: String(form.imageUrl || '').trim(),
    bio: form.bio.trim(),
    workImages: Array.isArray(form.workImages)
      ? form.workImages.map((item) => String(item || '').trim()).filter(Boolean)
      : String(form.workImages || '')
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
  };
}

function getWorkImages(value) {
  return Array.isArray(value)
    ? value
    : String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

export default function Technicians({ user }) {
  const [technicians, setTechnicians] = useState([]);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingWork, setUploadingWork] = useState(false);
  const [form, setForm] = useState(emptyTechnician);

  const uploadMainImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setFlash({ ok: false, message: 'حجم الصورة الرئيسية كبير جداً. الحد الأقصى 8MB.' });
      return;
    }

    setUploadingMain(true);
    try {
      setFlash({ ok: true, message: 'جارٍ رفع صورة الفني...' });
      if (!navigator.onLine) {
        const offlineRef = await queueOfflineImage(file);
        setForm((current) => ({ ...current, imageUrl: offlineRef }));
        setFlash({ ok: true, message: '📦 تم حفظ الصورة محليًا وستُرفع تلقائيًا عند توفر الإنترنت.' });
        return;
      }
      const imageUrl = await uploadToImgBB(file, 'فشل رفع الصورة');
      setForm((current) => ({ ...current, imageUrl }));
      setFlash({ ok: true, message: 'تم رفع صورة الفني.' });
    } catch (error) {
      try {
        const offlineRef = await queueOfflineImage(file);
        setForm((current) => ({ ...current, imageUrl: offlineRef }));
        setFlash({ ok: true, message: '📦 تعذر الرفع الآن. حُفظت الصورة محليًا وستُرفع لاحقًا تلقائيًا.' });
      } catch {
        setFlash({ ok: false, message: error?.message || 'تعذر رفع الصورة الرئيسية.' });
      }
    } finally {
      setUploadingMain(false);
      event.target.value = '';
    }
  };

  const uploadWorkImages = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
      if (oversized) {
        setFlash({ ok: false, message: `الصورة "${oversized.name}" أكبر من 8MB.` });
        return;
      }

      setUploadingWork(true);
      setFlash({ ok: true, message: 'جارٍ رفع صور الأعمال...' });
      const images = !navigator.onLine
        ? await Promise.all(files.slice(0, MAX_WORK_IMAGES).map((file) => queueOfflineImage(file)))
        : await Promise.all(files.slice(0, MAX_WORK_IMAGES).map((file) => uploadToImgBB(file, 'فشل رفع الصورة')));
      setForm((current) => {
        const nextImages = [...getWorkImages(current.workImages), ...images].slice(0, MAX_WORK_IMAGES);
        return { ...current, workImages: nextImages };
      });
      setFlash({
        ok: true,
        message: navigator.onLine
          ? `تم رفع ${Math.min(files.length, MAX_WORK_IMAGES)} صورة أعمال.`
          : `📦 تم حفظ ${Math.min(files.length, MAX_WORK_IMAGES)} صورة محليًا وستُرفع تلقائيًا عند توفر الإنترنت.`,
      });
    } catch (error) {
      setFlash({ ok: false, message: error?.message || 'تعذر رفع صور الأعمال.' });
    } finally {
      setUploadingWork(false);
      event.target.value = '';
    }
  };

  const removeWorkImage = (index) => {
    setForm((current) => {
      const images = [...getWorkImages(current.workImages)];
      images.splice(index, 1);
      return { ...current, workImages: images };
    });
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'technicians'), (snap) => {
      setTechnicians(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
    return () => unsub();
  }, []);

  const save = async () => {
    if (!form.name.trim()) {
      setFlash({ ok: false, message: 'اسم الفني مطلوب.' });
      return;
    }

    setSaving(true);
    setFlash(null);
    try {
      const technicianId = form.id || doc(collection(db, 'technicians')).id;
      const normalized = normalizeTechnicianForm(form);
      const payload = {
        ...normalized,
        workImages: normalized.workImages.slice(0, MAX_WORK_IMAGES),
      };
      const estimatedBytes = estimatePayloadBytes(payload);

      if (estimatedBytes > MAX_FIRESTORE_DOC_BYTES) {
        setFlash({
          ok: false,
          message: 'حجم بيانات الفني ما زال كبيراً. قلل عدد الصور أو الروابط.',
        });
        setSaving(false);
        return;
      }

      if (form.id) {
        await updateDoc(doc(db, 'technicians', form.id), payload);
        if (isOfflineImageRef(payload.imageUrl)) {
          attachOfflineImageTarget(payload.imageUrl, { collection: 'technicians', docId: form.id, field: 'imageUrl' });
        }
        payload.workImages.forEach((imageRef, index) => {
          if (isOfflineImageRef(imageRef)) {
            attachOfflineImageTarget(imageRef, { collection: 'technicians', docId: form.id, field: 'workImages', index });
          }
        });
        setFlash({ ok: true, message: 'تم تحديث الفني مباشرة في تطبيق الموبايل.' });
      } else {
        await setDoc(doc(db, 'technicians', technicianId), {
          ...payload,
          ratings: [],
          createdAt: new Date().toISOString(),
        });
        if (isOfflineImageRef(payload.imageUrl)) {
          attachOfflineImageTarget(payload.imageUrl, { collection: 'technicians', docId: technicianId, field: 'imageUrl' });
        }
        payload.workImages.forEach((imageRef, index) => {
          if (isOfflineImageRef(imageRef)) {
            attachOfflineImageTarget(imageRef, { collection: 'technicians', docId: technicianId, field: 'workImages', index });
          }
        });
        setFlash({ ok: true, message: 'تمت إضافة الفني مباشرة إلى تطبيق الموبايل.' });
      }

      setForm(emptyTechnician);
    } catch (error) {
      setFlash({ ok: false, message: error?.message || 'تعذر حفظ الفني.' });
    } finally {
      setSaving(false);
    }
  };

  const editTechnician = (technician) => {
    setForm({
      ...emptyTechnician,
      ...technician,
      visitFee: String(technician.visitFee || ''),
      workImages: Array.isArray(technician.workImages) ? technician.workImages : [],
    });
  };

  const removeTechnician = async (technicianId) => {
    try {
      await deleteDoc(doc(db, 'technicians', technicianId));
      setFlash({ ok: true, message: 'تم حذف الفني من تطبيق الموبايل.' });
      if (form.id === technicianId) setForm(emptyTechnician);
    } catch (error) {
      setFlash({ ok: false, message: error?.message || 'تعذر حذف الفني.' });
    }
  };

  const workImages = getWorkImages(form.workImages);

  return (
    <div style={{ padding: 24, fontFamily: "'Cairo'", direction: 'rtl', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>إدارة الفنيين</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            هذه الصفحة مرتبطة مباشرة بمجموعة `technicians` التي يقرأها تطبيق الموبايل.
          </div>
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #d9e2f2', padding: 18 }}>
          <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 800, marginBottom: 14 }}>
            {form.id ? 'تعديل فني' : 'إضافة فني'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 12 }}>
            <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الفني" />
            <TextInput value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="الاختصاص" />
            <TextInput value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" />
            <SelectInput value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} options={IRAQ_PROVINCES} placeholder="اختر المحافظة" />
            <div style={{ gridColumn: 'span 2' }}>
              <TextInput value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="العنوان" />
            </div>
            <TextInput value={form.workHours} onChange={(e) => setForm((f) => ({ ...f, workHours: e.target.value }))} placeholder="ساعات العمل" />
            <TextInput type="number" value={form.visitFee} onChange={(e) => setForm((f) => ({ ...f, visitFee: e.target.value }))} placeholder="أجرة الكشف" />
            <div style={{ gridColumn: 'span 2' }}>
              <TextInput value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="رابط الصورة الرئيسية" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ background: '#06b6d4', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {uploadingMain ? 'جارٍ رفع الصورة...' : 'رفع صورة الفني'}
              <input type="file" accept="image/*" onChange={uploadMainImage} style={{ display: 'none' }} disabled={uploadingMain} />
            </label>
            {form.imageUrl && (
              <>
                <img src={resolveImageUrl(form.imageUrl)} alt="main" style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 10, border: '1px solid #d9e2f2' }} />
                <button onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>
                  حذف الصورة
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>الحالة</span>
            <button
              onClick={() => setForm((f) => ({ ...f, available: !f.available }))}
              style={{ background: form.available ? '#10b98122' : '#ef444422', border: `1px solid ${form.available ? '#10b98144' : '#ef444444'}`, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Cairo'" }}
            >
              {form.available ? 'متاح' : 'مشغول'}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="نبذة عن الفني"
              style={{ width: '100%', minHeight: 90, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <label style={{ background: '#10b981', color: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {uploadingWork ? 'جارٍ رفع الصور...' : 'رفع صور الأعمال'}
                <input type="file" accept="image/*" multiple onChange={uploadWorkImages} style={{ display: 'none' }} disabled={uploadingWork} />
              </label>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                يمكنك أيضاً لصق روابط صور، كل رابط في سطر. الحد الأقصى 6 صور.
              </div>
            </div>
            <textarea
              value={Array.isArray(form.workImages) ? form.workImages.join('\n') : form.workImages}
              onChange={(e) => setForm((f) => ({ ...f, workImages: e.target.value }))}
              placeholder="روابط صور الأعمال، كل رابط في سطر"
              style={{ width: '100%', minHeight: 110, color: '#0f172a', outline: 'none', boxSizing: 'border-box', fontFamily: "'Cairo'" }}
            />
            {workImages.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 10 }}>
                {workImages.map((image, index) => (
                  <div key={`${index}_${image.slice(0, 20)}`} style={{ position: 'relative', background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 10, padding: 6 }}>
                    <img src={resolveImageUrl(image)} alt={`work-${index + 1}`} style={{ width: '100%', height: 88, objectFit: 'cover', borderRadius: 8 }} />
                    <button onClick={() => removeWorkImage(index)} style={{ position: 'absolute', top: 10, left: 10, background: '#ef4444', border: 'none', borderRadius: 999, width: 22, height: 22, color: '#fff', cursor: 'pointer', fontSize: 11 }}>
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving || uploadingMain || uploadingWork} style={{ background: saving ? '#94a3b8' : '#06b6d4', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Cairo'", fontWeight: 800 }}>
              {saving ? '...جاري الحفظ' : form.id ? 'تحديث الفني' : 'حفظ فني'}
            </button>
            <button onClick={() => setForm(emptyTechnician)} style={{ background: '#f8fbff', color: '#64748b', border: '1px solid #cdd8ec', borderRadius: 12, padding: '10px 18px', cursor: 'pointer', fontFamily: "'Cairo'", fontWeight: 700 }}>
              تفريغ
            </button>
            <div style={{ color: '#64748b', fontSize: 12, alignSelf: 'center' }}>المنفذ الحالي: {user?.name || 'غير معروف'}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #d9e2f2', padding: 18 }}>
          <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 800, marginBottom: 14 }}>
            قائمة الفنيين الحالية
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {technicians.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>لا يوجد فنيون حالياً في قاعدة بيانات الموبايل.</div>
            )}
            {technicians.map((technician) => (
              <div key={technician.id} style={{ background: '#f8fbff', border: '1px solid #d9e2f2', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 800 }}>{technician.name}</div>
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      {technician.specialty} • {technician.phone || 'بدون هاتف'} • {technician.province || 'بدون محافظة'}
                    </div>
                    {technician.address && (
                      <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{technician.address}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <button onClick={() => editTechnician(technician)} style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}>تعديل</button>
                    <button onClick={() => removeTechnician(technician.id)} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 10, padding: '6px 10px', color: '#ef4444', cursor: 'pointer' }}>حذف</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: technician.available ? '#10b98122' : '#ef444422', border: `1px solid ${technician.available ? '#10b98144' : '#ef444444'}`, borderRadius: 20, padding: '3px 8px', color: technician.available ? '#10b981' : '#ef4444', fontSize: 11 }}>
                    {technician.available ? 'متاح' : 'مشغول'}
                  </span>
                  <span style={{ background: '#06b6d422', border: '1px solid #06b6d444', borderRadius: 20, padding: '3px 8px', color: '#0891b2', fontSize: 11 }}>
                    أجرة الكشف: {fmt(Number(technician.visitFee || 0))} د.ع
                  </span>
                  <span style={{ background: '#F5C80022', border: '1px solid #F5C80044', borderRadius: 20, padding: '3px 8px', color: '#b45309', fontSize: 11 }}>
                    التقييمات: {Array.isArray(technician.ratings) ? technician.ratings.length : 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
