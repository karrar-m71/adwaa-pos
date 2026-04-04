const HASH_VERSION = 1;
const PBKDF2_ITERATIONS = 120000;
const SALT_BYTES = 16;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function equalConstantTime(a = '', b = '') {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function canUseCrypto() {
  return typeof crypto !== 'undefined' && Boolean(crypto?.subtle);
}

async function deriveHash(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: Number(iterations) || PBKDF2_ITERATIONS,
      salt: saltBytes,
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPasswordHash(password) {
  if (!canUseCrypto()) return null;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hashBytes = await deriveHash(password, salt, PBKDF2_ITERATIONS);
  return {
    v: HASH_VERSION,
    algo: 'pbkdf2-sha256',
    i: PBKDF2_ITERATIONS,
    s: bytesToBase64(salt),
    h: bytesToBase64(hashBytes),
  };
}

export async function verifyPasswordHash(password, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.algo !== 'pbkdf2-sha256' || !payload.s || !payload.h) return false;
  if (!canUseCrypto()) return false;
  try {
    const salt = base64ToBytes(payload.s);
    const hashBytes = await deriveHash(password, salt, Number(payload.i) || PBKDF2_ITERATIONS);
    return equalConstantTime(bytesToBase64(hashBytes), payload.h);
  } catch {
    return false;
  }
}

export async function verifyPasswordInput(password, record = {}) {
  if (record.passwordHash) {
    const okHashed = await verifyPasswordHash(password, record.passwordHash);
    if (okHashed) return { ok: true, needsMigration: false };
  }
  if (typeof record.password === 'string' && record.password.length > 0) {
    const okLegacy = equalConstantTime(String(password || ''), record.password);
    return { ok: okLegacy, needsMigration: okLegacy };
  }
  return { ok: false, needsMigration: false };
}
