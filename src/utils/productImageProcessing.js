import { hasLocalApi, localImageCacheGet, localImageCacheSet } from '../data/api/localApi';

const DEFAULT_MAX_SIDE = 800;
const DEFAULT_QUALITY = 0.7;
const DEFAULT_OUTPUT_TYPE = 'image/webp';
const REMOVE_BG_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';
const CACHE_STORAGE_KEY = 'adwaa_product_image_bg_cache_v1';
const MAX_CACHE_ITEMS = 30;

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('adwaa_settings') || '{}');
  } catch {
    return {};
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore cache write failures
  }
}

function trimCache(cache = {}) {
  const entries = Object.entries(cache);
  if (entries.length <= MAX_CACHE_ITEMS) return cache;
  const sorted = entries.sort(([, a], [, b]) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));
  return Object.fromEntries(sorted.slice(0, MAX_CACHE_ITEMS));
}

function canUseLocalStorageCache() {
  return !hasLocalApi();
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة الصورة'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type = DEFAULT_OUTPUT_TYPE, quality = DEFAULT_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        if (type !== 'image/jpeg') {
          canvas.toBlob((jpegBlob) => {
            if (!jpegBlob) {
              reject(new Error('تعذر تحويل الصورة'));
              return;
            }
            resolve(jpegBlob);
          }, 'image/jpeg', quality);
          return;
        }
        reject(new Error('تعذر تحويل الصورة'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fileName = 'product-image.webp') {
  const [meta, body] = String(dataUrl || '').split(',');
  const mimeMatch = /data:(.*?);base64/.exec(meta || '');
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const bytes = atob(body || '');
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new File([buffer], fileName, { type: mimeType });
}

async function sha256OfFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getCachedProcessedImage(hash) {
  if (!hash) return null;
  let entry = null;
  if (hasLocalApi()) {
    entry = await localImageCacheGet(hash);
  } else if (canUseLocalStorageCache()) {
    const cache = readCache();
    entry = cache[hash] || null;
    if (entry?.dataUrl) {
      entry.updatedAt = new Date().toISOString();
      cache[hash] = entry;
      writeCache(trimCache(cache));
    }
  }
  if (!entry?.dataUrl) return null;
  return {
    hash,
    file: dataUrlToFile(entry.dataUrl, entry.fileName || 'product-image.jpg'),
    dataUrl: entry.dataUrl,
  };
}

async function setCachedProcessedImage(hash, file) {
  if (!hash || !file) return null;
  const dataUrl = await fileToDataUrl(file);
  const entry = {
    hash,
    fileName: file.name || 'product-image.jpg',
    mimeType: file.type || 'image/jpeg',
    dataUrl,
    updatedAt: new Date().toISOString(),
  };
  if (hasLocalApi()) {
    return localImageCacheSet(hash, entry);
  }
  if (canUseLocalStorageCache()) {
    const cache = readCache();
    cache[hash] = entry;
    writeCache(trimCache(cache));
    return cache[hash];
  }
  return entry;
}

export function readProductImageEnhancerConfig() {
  const settings = readSettings();
  return {
    enabled: Boolean(settings.productImageAutoRemoveBg),
    provider: settings.productImageBgProvider || 'remove_bg',
    apiKey: settings.productImageBgApiKey || import.meta.env.VITE_REMOVEBG_API_KEY || '',
  };
}

export async function compressImageFile(file, options = {}) {
  const maxSide = Number(options.maxSide || DEFAULT_MAX_SIDE) || DEFAULT_MAX_SIDE;
  const quality = Number(options.quality || DEFAULT_QUALITY) || DEFAULT_QUALITY;
  const image = await blobToImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, DEFAULT_OUTPUT_TYPE, quality);
  const isWebp = blob.type === 'image/webp';
  return new File([blob], (file?.name || 'product-image').replace(/\.\w+$/, '') + (isWebp ? '.webp' : '.jpg'), { type: blob.type || (isWebp ? 'image/webp' : 'image/jpeg') });
}

export async function removeBackgroundWithRemoveBg(file, apiKey) {
  if (!apiKey) throw new Error('مفتاح remove.bg غير مضبوط');
  const form = new FormData();
  form.append('image_file', file);
  form.append('size', 'auto');

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    let message = 'فشل إزالة خلفية الصورة';
    try {
      const details = await response.json();
      message = details?.errors?.[0]?.title || details?.errors?.[0]?.detail || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.blob();
}

export async function flattenImageOnWhite(blob, fileName = 'product-image.webp') {
  const image = await blobToImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const flattened = await canvasToBlob(canvas, DEFAULT_OUTPUT_TYPE, DEFAULT_QUALITY);
  const isWebp = flattened.type === 'image/webp';
  return new File([flattened], fileName.replace(/\.\w+$/, '') + (isWebp ? '.webp' : '.jpg'), { type: flattened.type || (isWebp ? 'image/webp' : 'image/jpeg') });
}

export async function prepareProductImage(file, hooks = {}) {
  const onStatus = typeof hooks.onStatus === 'function' ? hooks.onStatus : () => {};
  const config = readProductImageEnhancerConfig();

  onStatus('⏳ جاري تحسين الصورة...');
  const compressedOriginal = await compressImageFile(file);
  const imageHash = await sha256OfFile(compressedOriginal);
  const shouldUseBackgroundRemoval = Boolean(config.enabled && config.apiKey && navigator.onLine);
  if (shouldUseBackgroundRemoval) {
    const cached = await getCachedProcessedImage(imageHash);
    if (cached) {
      onStatus('⚡ تم استخدام نسخة معالجة محفوظة مسبقًا');
      return {
        file: cached.file,
        usedBackgroundRemoval: true,
        fallbackReason: '',
        fromCache: true,
        hash: imageHash,
      };
    }
  }

  if (!shouldUseBackgroundRemoval) {
    return {
      file: compressedOriginal,
      usedBackgroundRemoval: false,
      fallbackReason: !config.enabled ? 'disabled' : (!config.apiKey ? 'missing_key' : 'offline'),
      fromCache: false,
      hash: imageHash,
    };
  }

  try {
    onStatus('⏳ جاري إزالة خلفية الصورة...');
    const transparentBlob = await removeBackgroundWithRemoveBg(compressedOriginal, config.apiKey);
    onStatus('⏳ جاري تجهيز الخلفية البيضاء...');
    const finalFile = await flattenImageOnWhite(transparentBlob, compressedOriginal.name);
    await setCachedProcessedImage(imageHash, finalFile);
    return {
      file: finalFile,
      usedBackgroundRemoval: true,
      fallbackReason: '',
      fromCache: false,
      hash: imageHash,
    };
  } catch (error) {
    console.error('[product-image] Background removal failed', error);
    return {
      file: compressedOriginal,
      usedBackgroundRemoval: false,
      fallbackReason: error?.message || 'remove_bg_failed',
      fromCache: false,
      hash: imageHash,
    };
  }
}
