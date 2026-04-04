import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

const MOBILE_PRODUCTS_COLLECTION = 'products';
const MOBILE_GIFTS_COLLECTION = 'gifts';
const MOBILE_OFFERS_COLLECTION = 'offers';
const MOBILE_TECHNICIANS_COLLECTION = 'technicians';
const MOBILE_SETTINGS_COLLECTION = 'settings';
const MOBILE_DELIVERY_DOC = 'delivery';
const BRIDGE_META_COLLECTION = 'bridge_meta';
const PRODUCT_META_DOC = 'mobile_catalog';
const BATCH_LIMIT = 400;

const toNum = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeProduct(product = {}) {
  const stockCount = Math.max(0, toNum(product.stock));

  return {
    source: 'adwaa-pos',
    sourceId: product.id || '',
    syncVersion: 1,
    name: product.name || '',
    price: toNum(product.sellPrice),
    cat: product.cat || 'أخرى',
    brand: product.brand || '',
    unit: product.unit || 'قطعة',
    pts: toNum(product.pts),
    desc: product.desc || '',
    img: product.img || '📦',
    imageUrl: product.imgUrl || product.imageUrl || '',
    barcode: product.barcode || '',
    hasPackage: Boolean(product.hasPackage),
    packageName: product.packageName || '',
    packageQty: product.packageQty != null ? toNum(product.packageQty) : null,
    packagePrice: product.packagePrice != null ? toNum(product.packagePrice) : null,
    stock: stockCount > 0,
    stockCount,
    minStock: toNum(product.minStock),
    sellPrice: toNum(product.sellPrice),
    wholesalePrice: toNum(product.wholesalePrice),
    updatedAt: serverTimestamp(),
  };
}

function readJsonStorage(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function readMobileBridgeConfig() {
  return readJsonStorage('adwaa_mobile_bridge_config', {
    deliveryPrice: '0',
    supportPhone: '',
    supportWhatsApp: '',
    gifts: [],
    offers: [],
  });
}

function writeMobileBridgeConfig(nextConfig) {
  localStorage.setItem('adwaa_mobile_bridge_config', JSON.stringify(nextConfig));
}

function normalizeGift(gift = {}, index = 0) {
  return {
    id: gift.id || `gift_${index + 1}`,
    name: gift.name || '',
    pts: toNum(gift.pts),
    cat: gift.cat || 'الكل',
    desc: gift.desc || '',
    icon: gift.icon || '🎁',
    imageUrl: gift.imageUrl || '',
    left: toNum(gift.left),
    active: gift.active !== false,
    updatedAt: serverTimestamp(),
  };
}

function normalizeOffer(offer = {}, index = 0) {
  return {
    id: offer.id || `offer_${index + 1}`,
    title: offer.title || '',
    desc: offer.desc || '',
    badge: offer.badge || 'عرض خاص',
    icon: offer.icon || '🏷️',
    color: offer.color || '#2a2400',
    active: offer.active !== false,
    updatedAt: serverTimestamp(),
  };
}

function normalizeTechnician(technician = {}, index = 0) {
  const workImages = String(technician.workImages || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    id: technician.id || `tech_${index + 1}`,
    name: technician.name || '',
    specialty: technician.specialty || 'كهرباء عامة',
    address: technician.address || '',
    province: technician.province || '',
    phone: technician.phone || '',
    available: technician.available !== false,
    workHours: technician.workHours || '٨ص — ٨م',
    visitFee: toNum(technician.visitFee),
    imageUrl: technician.imageUrl || '',
    bio: technician.bio || '',
    workImages,
    ratings: Array.isArray(technician.ratings) ? technician.ratings : [],
    updatedAt: serverTimestamp(),
  };
}

function normalizeSettings() {
  const appSettings = readJsonStorage('adwaa_settings', {
    storeName: 'أضواء المدينة',
    storePhone: '07714424355',
    storeWhatsApp: '',
    storeAddress: 'كربلاء، العراق',
  });
  const bridgeConfig = readMobileBridgeConfig();

  return {
    storeName: appSettings.storeName || 'أضواء المدينة',
    storePhone: bridgeConfig.supportPhone || appSettings.storePhone || '',
    supportWhatsApp: bridgeConfig.supportWhatsApp || appSettings.storeWhatsApp || '',
    storeAddress: appSettings.storeAddress || '',
    deliveryPrice: toNum(bridgeConfig.deliveryPrice),
    updatedAt: serverTimestamp(),
    source: 'adwaa-pos',
  };
}

async function commitChunks(ops = []) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    chunk.forEach((apply) => apply(batch));
    await batch.commit();
  }
}

async function replaceCollectionDocs(targetCollection, items) {
  const targetSnap = await getDocs(collection(db, targetCollection));
  const existingIds = new Set(targetSnap.docs.map((entry) => entry.id));
  const nextIds = new Set(items.map((item) => item.id));
  const ops = [];

  items.forEach((item) => {
    const targetRef = doc(db, targetCollection, item.id);
    ops.push((batch) => batch.set(targetRef, item, { merge: true }));
  });

  existingIds.forEach((id) => {
    if (!nextIds.has(id)) {
      const staleRef = doc(db, targetCollection, id);
      ops.push((batch) => batch.delete(staleRef));
    }
  });

  await commitChunks(ops);

  return {
    publishedCount: items.length,
    removedCount: [...existingIds].filter((id) => !nextIds.has(id)).length,
  };
}

export async function publishProductsToMobileBridge() {
  const sourceSnap = await getDocs(collection(db, 'pos_products'));
  const sourceProducts = sourceSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const normalizedProducts = sourceProducts.map((product) => normalizeProduct(product));
  const publishInfo = await replaceCollectionDocs(MOBILE_PRODUCTS_COLLECTION, normalizedProducts);

  const metaRef = doc(db, BRIDGE_META_COLLECTION, PRODUCT_META_DOC);
  await setDoc(metaRef, {
    sourceCollection: 'pos_products',
    targetCollection: MOBILE_PRODUCTS_COLLECTION,
    sourceCount: sourceProducts.length,
    publishedCount: publishInfo.publishedCount,
    removedCount: publishInfo.removedCount,
    updatedAt: serverTimestamp(),
    updatedBy: 'manual_publish',
  }, { merge: true });

  return {
    sourceCount: sourceProducts.length,
    publishedCount: publishInfo.publishedCount,
    removedCount: publishInfo.removedCount,
    targetCollection: MOBILE_PRODUCTS_COLLECTION,
  };
}

export async function publishSettingsToMobileBridge() {
  const payload = normalizeSettings();
  const targetRef = doc(db, MOBILE_SETTINGS_COLLECTION, MOBILE_DELIVERY_DOC);
  await setDoc(targetRef, {
    price: payload.deliveryPrice,
    updatedAt: payload.updatedAt,
    source: payload.source,
  }, { merge: true });
  return {
    targetCollection: `${MOBILE_SETTINGS_COLLECTION}/${MOBILE_DELIVERY_DOC}`,
  };
}

export async function publishGiftsToMobileBridge() {
  const config = readMobileBridgeConfig();
  const normalizedGifts = (config.gifts || []).map((gift, index) => normalizeGift(gift, index));
  const publishInfo = await replaceCollectionDocs(MOBILE_GIFTS_COLLECTION, normalizedGifts);
  return {
    targetCollection: MOBILE_GIFTS_COLLECTION,
    ...publishInfo,
  };
}

export async function publishOffersToMobileBridge() {
  const config = readMobileBridgeConfig();
  const normalizedOffers = (config.offers || []).map((offer, index) => normalizeOffer(offer, index));
  const publishInfo = await replaceCollectionDocs(MOBILE_OFFERS_COLLECTION, normalizedOffers);
  return {
    targetCollection: MOBILE_OFFERS_COLLECTION,
    ...publishInfo,
  };
}

export async function publishTechniciansToMobileBridge() {
  const config = readMobileBridgeConfig();
  const normalizedTechnicians = (config.technicians || []).map((technician, index) => normalizeTechnician(technician, index));
  const publishInfo = await replaceCollectionDocs(MOBILE_TECHNICIANS_COLLECTION, normalizedTechnicians);
  return {
    targetCollection: MOBILE_TECHNICIANS_COLLECTION,
    ...publishInfo,
  };
}

export async function saveBridgeGift(gift) {
  const config = readMobileBridgeConfig();
  const gifts = [...(config.gifts || [])];
  const nextGift = {
    ...gift,
    id: gift.id || `gift_${Date.now()}`,
  };
  const index = gifts.findIndex((item) => item.id === nextGift.id);

  if (index >= 0) gifts[index] = nextGift;
  else gifts.push(nextGift);

  writeMobileBridgeConfig({ ...config, gifts });
  return nextGift;
}

export async function deleteBridgeGift(giftId) {
  const config = readMobileBridgeConfig();
  const gifts = (config.gifts || []).filter((gift) => gift.id !== giftId);
  writeMobileBridgeConfig({ ...config, gifts });
  const targetRef = doc(db, MOBILE_GIFTS_COLLECTION, giftId);
  await deleteDoc(targetRef).catch(() => {});
}

export async function saveBridgeOffer(offer) {
  const config = readMobileBridgeConfig();
  const offers = [...(config.offers || [])];
  const nextOffer = {
    ...offer,
    id: offer.id || `offer_${Date.now()}`,
  };
  const index = offers.findIndex((item) => item.id === nextOffer.id);

  if (index >= 0) offers[index] = nextOffer;
  else offers.push(nextOffer);

  writeMobileBridgeConfig({ ...config, offers });
  return nextOffer;
}

export async function deleteBridgeOffer(offerId) {
  const config = readMobileBridgeConfig();
  const offers = (config.offers || []).filter((offer) => offer.id !== offerId);
  writeMobileBridgeConfig({ ...config, offers });
  const targetRef = doc(db, MOBILE_OFFERS_COLLECTION, offerId);
  await deleteDoc(targetRef).catch(() => {});
}

export async function saveBridgeTechnician(technician) {
  const config = readMobileBridgeConfig();
  const technicians = [...(config.technicians || [])];
  const nextTechnician = {
    ...technician,
    id: technician.id || `tech_${Date.now()}`,
  };
  const index = technicians.findIndex((item) => item.id === nextTechnician.id);

  if (index >= 0) technicians[index] = nextTechnician;
  else technicians.push(nextTechnician);

  writeMobileBridgeConfig({ ...config, technicians });
  return nextTechnician;
}

export async function deleteBridgeTechnician(technicianId) {
  const config = readMobileBridgeConfig();
  const technicians = (config.technicians || []).filter((technician) => technician.id !== technicianId);
  writeMobileBridgeConfig({ ...config, technicians });
  const targetRef = doc(db, MOBILE_TECHNICIANS_COLLECTION, technicianId);
  await deleteDoc(targetRef).catch(() => {});
}

export function getBridgeConfig() {
  return readMobileBridgeConfig();
}

export function saveBridgeConfigPatch(patch) {
  const current = readMobileBridgeConfig();
  const next = { ...current, ...patch };
  writeMobileBridgeConfig(next);
  return next;
}

export const mobileBridgeCollections = {
  products: MOBILE_PRODUCTS_COLLECTION,
  gifts: MOBILE_GIFTS_COLLECTION,
  offers: MOBILE_OFFERS_COLLECTION,
  technicians: MOBILE_TECHNICIANS_COLLECTION,
  settings: MOBILE_SETTINGS_COLLECTION,
  settingsDoc: MOBILE_DELIVERY_DOC,
  metaCollection: BRIDGE_META_COLLECTION,
  metaDoc: PRODUCT_META_DOC,
};
