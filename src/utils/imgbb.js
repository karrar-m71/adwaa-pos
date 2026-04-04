export function getImgBBKey() {
  return String(import.meta.env.VITE_IMGBB_KEY || '').trim();
}

export async function uploadToImgBB(file, fallbackMessage = 'فشل رفع الصورة') {
  const imgbbKey = getImgBBKey();
  if (!imgbbKey) {
    throw new Error('VITE_IMGBB_KEY غير مضبوط');
  }

  const form = new FormData();
  form.append('image', file);
  form.append('key', imgbbKey);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data?.error?.message || fallbackMessage);
  }
  return data.data.url;
}
