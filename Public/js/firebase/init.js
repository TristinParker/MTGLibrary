// Firebase initialization module
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'mtg-forge-default';
console.log(`[Config] App ID set to: ${appId}`);

export const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAdqbFNjrB6y-8BrMEYYCT5ywiCgZVtMaE",
  authDomain: "mtglibrary-70b46.firebaseapp.com",
  projectId: "mtglibrary-70b46",
  storageBucket: "mtglibrary-70b46.firebasestorage.app",
  messagingSenderId: "602862103839",
  appId: "1:602862103839:web:23c64b7486c058c903d42a",
  measurementId: "G-EWELJJQ631",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Ensure auth persistence is set to LOCAL so users remain signed in across sessions
try {
  setPersistence(auth, browserLocalPersistence).then(() => {
    console.log('[Firebase] Auth persistence set to LOCAL.');
  }).catch((err) => {
    console.warn('[Firebase] Failed to set auth persistence to LOCAL', err);
  });
} catch (e) {
  console.warn('[Firebase] setPersistence not available or failed', e);
}

// Expose to window for legacy code that expects globals
window.__firebase_app = app;
window.__firebase_db = db;
window.__firebase_auth = auth;
window.__app_id = appId;

// Gemini config (placeholder key; keep existing behavior)
// NOTE: Gemini API keys must be provided per-user at runtime. Do NOT hard-code
// a shared key in source. Use the per-user helper module at
// Public/js/firebase/gemini.js to save/retrieve an encrypted API key from
// Firestore and to build request URLs at runtime.

console.log('[Firebase] Initialized and exported db/auth/app.');

export { app, db, auth };
