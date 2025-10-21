import { db, appId } from './index.js';
import { collection, onSnapshot, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { onAuthStateChanged } from '../firebase/auth.js';
import { auth } from '../firebase/init.js';
import { setLocalCollection, setLocalDecks } from '../lib/data.js';
import { showToast } from '../lib/ui.js';

let collectionUnsubscribe = null;
let decksUnsubscribe = null;
let currentUserId = null;

function setupListenersForUser(userId) {
  if (collectionUnsubscribe) collectionUnsubscribe();
  const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/collection`);
  collectionUnsubscribe = onSnapshot(collectionRef, (querySnapshot) => {
    const updated = {};
    querySnapshot.forEach(doc => { updated[doc.id] = { firestoreId: doc.id, ...doc.data() }; });
    setLocalCollection(updated);
    console.log('[App] Collection snapshot updated', Object.keys(updated).length);
    try {
      // Ensure UI re-renders after the shared data module is updated
      if (typeof window.updateCardAssignments === 'function') {
        try { window.updateCardAssignments(); } catch (e) { /* best-effort */ }
      }
      if (typeof window.renderPaginatedCollection === 'function') {
        try { window.renderPaginatedCollection(); } catch (e) { console.debug('[App] renderPaginatedCollection call failed', e); }
      }
    } catch (e) {
      console.debug('[App] post-snapshot UI sync failed', e);
    }
  }, (err) => console.error('Collection snapshot error', err));

  if (decksUnsubscribe) decksUnsubscribe();
  const decksRef = collection(db, `artifacts/${appId}/users/${userId}/decks`);
  decksUnsubscribe = onSnapshot(decksRef, (querySnapshot) => {
    const updated = {};
    querySnapshot.forEach(doc => { updated[doc.id] = { id: doc.id, ...doc.data() }; });
    setLocalDecks(updated);
    console.log('[App] Decks snapshot updated', Object.keys(updated).length);
    try {
      // Trigger decks UI update if available
      if (typeof window.renderDecksList === 'function') {
        try { window.renderDecksList(); } catch (e) { console.debug('[App] renderDecksList call failed', e); }
      }
      // also refresh collection view in case deck assignments changed
      if (typeof window.renderPaginatedCollection === 'function') {
        try { window.renderPaginatedCollection(); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      console.debug('[App] post-decks snapshot UI sync failed', e);
    }
  }, (err) => console.error('Decks snapshot error', err));
}

// Ensure the UI matches the current auth state. This is a defensive sync used
// when auth restoration from persistence may lag the initial boot sequence.
export function ensureUiMatchesAuth() {
  try {
    const current = (auth && auth.currentUser) || (window.__firebase_auth && window.__firebase_auth.currentUser) || null;
    if (current) {
      // Hide login screen and show app UI if necessary
      try { document.getElementById('login-screen').classList.add('hidden'); } catch(e){}
      try { document.getElementById('app-wrapper').classList.remove('hidden'); } catch(e){}
      // Start listeners for this user if not already running
      if (current.uid && current.uid !== currentUserId) {
        setupListenersForUser(current.uid);
      }
    } else {
      try { document.getElementById('login-screen').classList.remove('hidden'); } catch(e){}
      try { document.getElementById('app-wrapper').classList.add('hidden'); } catch(e){}
    }
  } catch (e) {
    console.debug('[App] ensureUiMatchesAuth failed', e);
  }
}

// Retry calling ensureUiMatchesAuth a few times over a short window to
// work around race conditions where other scripts toggle the UI after
// auth restoration completes. Lightweight and idempotent.
function startUiSyncRetry() {
  try {
    const attempts = [0, 150, 400, 900, 1800];
    attempts.forEach(ms => setTimeout(() => {
      try { ensureUiMatchesAuth(); } catch (e) { /* best-effort */ }
    }, ms));
  } catch (e) {
    console.debug('[App] startUiSyncRetry failed', e);
  }
}

// Diagnostics: observe visibility (class attribute) changes on login/app
// wrapper elements and log concise info. Exposed to window for toggling in
// a live debugging session.
function installVisibilityObserver() {
  try {
    const watchIds = ['login-screen','app-wrapper'];
    const elems = watchIds.map(id => document.getElementById(id)).filter(Boolean);
    if (!elems.length) return null;
    const obs = new MutationObserver((records) => {
      records.forEach(r => {
        if (r.attributeName === 'class') {
          const target = r.target;
          const hidden = target.classList && target.classList.contains && target.classList.contains('hidden');
          console.info('[UI-DIAG] visibility change:', target.id, 'hidden=', !!hidden, 'class=', target.className);
        }
      });
    });
    elems.forEach(el => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
    return obs;
  } catch (e) {
    console.debug('[App] installVisibilityObserver failed', e);
    return null;
  }
}

export function initAppListeners() {
  // Shared handler used by both the SDK listener and the polling fallback
  const authHandler = async (authUser) => {
    try {
      if (authUser) {
        currentUserId = authUser.uid;
        console.log('[App] User signed in', currentUserId);
        setupListenersForUser(currentUserId);
      } else {
        console.log('[App] No user signed in');
        // will wait for inline script to handle anonymous/custom token sign-in if present
      }
    } catch (innerErr) {
      console.error('[App] Error in authHandler', innerErr);
    }
  };

  // Try attaching the modular SDK listener. If it throws or is unavailable,
  // fall back to a short polling loop against auth.currentUser.
  try {
    if (typeof onAuthStateChanged === 'function') {
      try {
        onAuthStateChanged(auth, authHandler);
        // Defensive UI sync in case restoration from persistence happens slowly
        try { ensureUiMatchesAuth(); } catch(e) {}
        // Schedule a few retry attempts to handle late UI toggles by other scripts
        try { startUiSyncRetry(); } catch(e) {}
        // Expose a simple visibility diagnostics helper to toggle a MutationObserver
        try {
          window.startUiVisibilityDiagnostics = () => { if (window.__uiVisibilityObserver) return window.__uiVisibilityObserver; window.__uiVisibilityObserver = installVisibilityObserver(); return window.__uiVisibilityObserver; };
          window.stopUiVisibilityDiagnostics = () => { try { if (window.__uiVisibilityObserver) { window.__uiVisibilityObserver.disconnect(); window.__uiVisibilityObserver = null; return true; } } catch(e){} return false; };
        } catch(e) {}
        return;
      } catch (attachErr) {
        console.warn('[App] onAuthStateChanged attach failed, falling back to polling', attachErr);
      }
    } else {
      console.warn('[App] onAuthStateChanged is not a function; using polling fallback');
    }
  } catch (e) {
    console.warn('[App] Unexpected error when attempting onAuthStateChanged attach', e);
  }

  // Polling fallback: check auth.currentUser periodically for changes
  try {
    let lastUid = null;
    const pollInterval = 500;
    const maxPollTime = 15000; // 15s
    let elapsed = 0;
    const iv = setInterval(() => {
      elapsed += pollInterval;
      try {
        const current = (auth && auth.currentUser) || (window.auth && window.auth.currentUser) || null;
        const uid = current ? current.uid : null;
        if (uid !== lastUid) {
          lastUid = uid;
          try { authHandler(current); } catch (hErr) { console.error('[App] authHandler (poll) error', hErr); }
          // also ensure UI sync retries run when polling detects a change
          try { startUiSyncRetry(); } catch(e) {}
        }
      } catch (pollErr) {
        console.warn('[App] Polling auth.currentUser error', pollErr);
      }
      if (elapsed >= maxPollTime) {
        clearInterval(iv);
      }
    }, pollInterval);
  } catch (e) {
    console.error('[App] Failed to start polling fallback for auth state', e);
  }
}

// expose for boot sequence
if (typeof window !== 'undefined') {
  window.initAppListeners = initAppListeners;
}
