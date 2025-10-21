import { auth as _auth } from './init.js';
import {
  signOut as _signOut,
  GoogleAuthProvider as _GoogleAuthProvider,
  signInWithPopup as _signInWithPopup,
  createUserWithEmailAndPassword as _createUserWithEmailAndPassword,
  signInWithEmailAndPassword as _signInWithEmailAndPassword,
  signInAnonymously as _signInAnonymously,
  signInWithCustomToken as _signInWithCustomToken,
  sendEmailVerification as _sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Backwards-compatible wrapper: the modular SDK's onAuthStateChanged expects (auth, cb).
// Many places in the codebase call onAuthStateChanged(cb) without passing the auth
// instance. Export a wrapper that supports both forms:
// - onAuthStateChanged(cb) -> uses internal _auth
// - onAuthStateChanged(auth, cb) -> forwarded to underlying function
// Internal listener registry and polling fallback. We avoid calling the
// CDN-provided onAuthStateChanged to prevent cross-instance getModularInstance()
// errors when multiple firebase app instances exist on the page.
const _listeners = new Set();
let _polling = false;
let _lastUid = null;

function _startPolling() {
  if (_polling) return;
  _polling = true;
  const interval = 300;
  setInterval(() => {
    try {
      const current = _auth && _auth.currentUser ? _auth.currentUser : (window.__firebase_auth && window.__firebase_auth.currentUser) || null;
      const uid = current ? current.uid : null;
      if (uid !== _lastUid) {
        _lastUid = uid;
        _listeners.forEach(cb => {
          try { cb(current); } catch (e) { console.error('[Auth] listener threw', e); }
        });
      }
    } catch (e) {
      console.error('[Auth] polling error', e);
    }
  }, interval);
}

export function onAuthStateChanged(...args) {
  // Support both onAuthStateChanged(cb) and onAuthStateChanged(auth, cb)
  let cb = null;
  if (args.length === 1 && typeof args[0] === 'function') cb = args[0];
  else if (args.length === 2 && typeof args[1] === 'function') cb = args[1];
  else throw new Error('onAuthStateChanged requires a callback');

  // Register and call initially with current user snapshot
  _listeners.add(cb);
  try {
    const current = _auth && _auth.currentUser ? _auth.currentUser : (window.__firebase_auth && window.__firebase_auth.currentUser) || null;
    _lastUid = current ? current.uid : null;
    try { cb(current); } catch (e) { console.error('[Auth] initial listener invocation threw', e); }
  } catch (e) {
    console.error('[Auth] onAuthStateChanged initial check failed', e);
  }
  _startPolling();
  // Return an unsubscribe function for convenience
  return () => { _listeners.delete(cb); };
}
export const signOut = _signOut;
export const GoogleAuthProvider = _GoogleAuthProvider;
export const signInWithPopup = _signInWithPopup;
export const createUserWithEmailAndPassword = _createUserWithEmailAndPassword;
export const signInWithEmailAndPassword = _signInWithEmailAndPassword;
export const signInAnonymously = _signInAnonymously;
export const signInWithCustomToken = _signInWithCustomToken;
export const sendEmailVerification = _sendEmailVerification;

// Expose auth instance for code expecting window.auth
window.auth = _auth;

console.log('[Auth] Auth module loaded.');
