import { db, appId } from '../main/index.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Minimal client-side encryption helpers using Web Crypto API.
// WARNING: Deriving a key from the Firebase UID is obfuscation only — the UID
// is not a secret. For production secrecy use a server-side proxy and KMS.

function toBase64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromBase64(b64) { const s = atob(b64); const arr = new Uint8Array(s.length); for (let i=0;i<s.length;i++) arr[i]=s.charCodeAt(i); return arr.buffer; }

async function deriveKeyFromPassphrase(passphrase, salt, iterations = 200000) {
  const enc = new TextEncoder();
  const passKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );
}

export async function encryptApiKeyForUser(uid, apiKeyPlain) {
  if (!uid) throw new Error('uid required to encrypt');
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassphrase(uid, salt.buffer);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKeyPlain));
  return { cipher: toBase64(cipher), iv: toBase64(iv), salt: toBase64(salt) };
}

export async function decryptApiKeyForUser(uid, encryptedObj) {
  if (!uid || !encryptedObj) return null;
  try {
    const { cipher, iv, salt } = encryptedObj;
    const key = await deriveKeyFromPassphrase(uid, fromBase64(salt));
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(cipher));
    const dec = new TextDecoder();
    return dec.decode(plainBuf);
  } catch (e) {
    console.error('[gemini] decrypt failed', e);
    return null;
  }
}

export async function saveGeminiKeyForUser(uid, apiKeyPlain) {
  if (!uid) throw new Error('uid required');
  const enc = await encryptApiKeyForUser(uid, apiKeyPlain);
  const userDocRef = doc(db, `artifacts/${appId}/users/${uid}`);
  const snap = await getDoc(userDocRef);
  const current = snap.exists() ? snap.data().settings || {} : {};
  current.gemini = { encrypted: enc, savedAt: new Date().toISOString() };
  await setDoc(userDocRef, { settings: current }, { merge: true });
  return true;
}

export async function clearGeminiKeyForUser(uid) {
  if (!uid) throw new Error('uid required');
  const userDocRef = doc(db, `artifacts/${appId}/users/${uid}`);
  const snap = await getDoc(userDocRef);
  const current = snap.exists() ? snap.data().settings || {} : {};
  current.gemini = null;
  await setDoc(userDocRef, { settings: current }, { merge: true });
  return true;
}

export async function getDecryptedGeminiKey(uid) {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${uid}`);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) return null;
    const settings = snap.data().settings || {};
    const gem = settings.gemini || null;
    if (!gem || !gem.encrypted) return null;
    return await decryptApiKeyForUser(uid, gem.encrypted);
  } catch (e) {
    console.error('[gemini] getDecryptedGeminiKey error', e);
    return null;
  }
}

export async function getGeminiUrlForCurrentUser() {
  const uid = (typeof window !== 'undefined' && window.userId) ? window.userId : null;
  if (!uid) return null;
  const key = await getDecryptedGeminiKey(uid);
  if (!key) return null;
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${encodeURIComponent(key)}`;
}

// Expose a convenience wrapper on window
if (typeof window !== 'undefined') {
  window.getGeminiUrlForCurrentUser = getGeminiUrlForCurrentUser;
}

export default {
  encryptApiKeyForUser,
  decryptApiKeyForUser,
  saveGeminiKeyForUser,
  clearGeminiKeyForUser,
  getDecryptedGeminiKey,
  getGeminiUrlForCurrentUser
};
