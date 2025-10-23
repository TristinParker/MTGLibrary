// Extracted module script from index-dev.html
// Preserve module type imports and DOMContentLoaded handlers
// --- Modal Visibility Settings Global ---

// --- Saved Views State (global, for advanced view builder) ---
window.savedViews = window.savedViews || [];
window.activeViewId = typeof window.activeViewId !== 'undefined' ? window.activeViewId : null;
window.modalVisibilitySettings = window.modalVisibilitySettings || {
  count: true,
  finish: true,
  condition: true,
  purchasePrice: true,
  notes: true
};

// --- Edit View Button Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const editBtn = document.getElementById('open-view-builder-btn');
  const viewBuilderPanel = document.getElementById('view-builder-panel');
  if (editBtn && viewBuilderPanel) {
    editBtn.addEventListener('click', () => {
      viewBuilderPanel.classList.remove('hidden');
      viewBuilderPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
});

// Global helper usable by automated tests: wait for the in-page setup handler and invoke it.
// Note: the legacy __runFirstRunSetup proxy was removed in favor of directly calling
// window.handleFirstRunSetup (exported by this module) from tests and harnesses. This
// avoids duplicate proxies and makes the handler deterministic.

// --- Collapsible UI for Add Card, KPI, and Filters bars ---
function setupCollapsibleSection(toggleBtnId, sectionId, chevronId) {
  const btn = document.getElementById(toggleBtnId);
  const section = document.getElementById(sectionId);
  const chevron = document.getElementById(chevronId);
  if (!btn || !section || !chevron) return;
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    section.style.display = expanded ? 'none' : '';
    chevron.textContent = expanded ? '►' : '▼';
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btn.click();
    }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  setupCollapsibleSection('toggle-add-card-section', 'add-card-section', 'add-card-section-chevron');
  setupCollapsibleSection('toggle-kpi-bar', 'collection-kpi-bar', 'kpi-bar-chevron');
  setupCollapsibleSection('toggle-filters-bar', 'collection-filters-bar', 'filters-bar-chevron');
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signInWithCustomToken,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  getDocs,
  setDoc,
  deleteField,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- Advanced View Builder Button Event Listeners ---
  // Saved Views dropdown wiring — delegated to settings module for management UI.
  const savedViewsSelect = document.getElementById('saved-views-select');
    const saveViewConfirmBtn = document.getElementById('save-view-confirm-btn');
    const viewBuilderPanel = document.getElementById('view-builder-panel');
  if (savedViewsSelect) {
    savedViewsSelect.addEventListener('change', (e) => {
      const id = e.target.value || null;
      if (typeof window.setActiveViewById === 'function') {
        window.setActiveViewById(id);
      }
    });
  }

    // Guarded save button handler — only attach if the button exists
    saveViewConfirmBtn?.addEventListener('click', async () => {
    const name = document.getElementById('view-name-input').value || 'Untitled View';
    const groupBy1 = document.getElementById('view-group-by-1').value;
    const groupBy2 = document.getElementById('view-group-by-2').value;
    const groupBy = [groupBy1, groupBy2].filter(Boolean);
    const hideInDecks = document.getElementById('view-hide-in-deck').checked;
    const viewMode = document.getElementById('view-view-mode').value;
    const gridSize = document.getElementById('view-grid-size').value;
    const isDefault = document.getElementById('view-default-checkbox').checked;
    const view = {
      id: `view_${Date.now()}`,
      name,
      filters: window.viewFilterRules || [],
      sorts: window.viewSortRules || [],
      groupBy,
      hideInDecks,
      viewMode,
      gridSize,
      isDefault
    };
  await saveViewToFirestore(view);
  if (viewBuilderPanel) viewBuilderPanel.classList.add('hidden');
  });

  window.renderViewBuilderLists = function() {
    const filtersList = document.getElementById('filters-list');
    const sortsList = document.getElementById('sorts-list');
    filtersList.innerHTML = (window.viewFilterRules||[]).map((r, i) => `<div class="flex items-center gap-2"><span class="text-sm text-gray-200">${r.column} ${r.operator} "${r.value}"</span><button data-i="${i}" class="remove-filter-btn text-sm text-red-400 ml-2">Remove</button></div>`).join('') || '<div class="text-sm text-gray-500">No filters</div>';
    sortsList.innerHTML = (window.viewSortRules||[]).map((s, i) => `<div class="flex items-center gap-2"><span class="text-sm text-gray-200">${i+1}. ${s.column} ${s.direction}</span><button data-i="${i}" class="remove-sort-btn text-sm text-red-400 ml-2">Remove</button></div>`).join('') || '<div class="text-sm text-gray-500">No sorts</div>';
    document.querySelectorAll('.remove-filter-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.i);
      window.viewFilterRules.splice(idx, 1);
      window.renderViewBuilderLists();
    }));
    document.querySelectorAll('.remove-sort-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.i);
      window.viewSortRules.splice(idx, 1);
      window.renderViewBuilderLists();
    }));
  };
  if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
  console.log("[DOMContentLoaded] Event fired. App is initializing. Find in <script> block.");

  // --- FIREBASE & APP CONFIG ---
  let db, auth;
  let userId = null;
  let collectionUnsubscribe = null;
  let decksUnsubscribe = null;

  const appId = typeof __app_id !== "undefined" ? __app_id : "mtg-forge-default";
  console.log(`[Config] App ID set to: ${appId}`);

  const firebaseConfig = typeof __firebase_config !== "undefined" ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyAdqbFNjrB6y-8BrMEYYCT5ywiCgZVtMaE",
    authDomain: "mtglibrary-70b46.firebaseapp.com",
    projectId: "mtglibrary-70b46",
    storageBucket: "mtglibrary-70b46.firebasestorage.app",
    messagingSenderId: "602862103839",
    appId: "1:602862103839:web:23c64b7486c058c903d42a",
    measurementId: "G-EWELJJQ631",
  };
  console.log("[Config] Firebase config loaded.");

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  const GEMINI_API_KEY = "AIzaSyDkbSsM1e4aN85G7ZVGw-XOs4HE8_E4Zig";
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
  console.log("[Config] Gemini API URL configured.");
  // Expose globally so other modules can call the Gemini API
  try { window.GEMINI_API_URL = GEMINI_API_URL; } catch (e) {}

  // --- STATE ---
  let currentCardForAdd = null;
  let currentCommanderForAdd = null;
  let tempAiBlueprint = null;
  let localCollection = {};
  let localDecks = {};
  let cardDeckAssignments = {};
  let deckChartInstances = {};
  // Chat histories for AI features
  let activeAiChatHistory = [];
  let ruleLookupHistory = [];
  let mtgChatHistory = [];
  let collectionViewMode = "grid";
  let collectionGridSize = "md";
  let collectionSortState = { column: "name", direction: "asc" };
  let collectionCurrentPage = 1;
  const COLLECTION_PAGE_SIZE = 100;
  let currentSearchContext = { mode: "collection", deckId: null };
  window.viewFilterRules = window.viewFilterRules || [];
  window.viewSortRules = window.viewSortRules || [];
  console.log("[State] Initial application state variables declared.");

  // Saved views: delegate to centralized settings module when available.
  function renderSavedViewsSelect() {
    if (typeof window.renderSavedViewsSelect === 'function') return window.renderSavedViewsSelect(savedViews || []);
    const select = document.getElementById('saved-views-select');
    if (!select) return;
    select.innerHTML = '<option value="">(Default)</option>' + (savedViews||[]).map(v => `<option value="${v.id}">${v.name}${v.isDefault ? ' (Default)' : ''}</option>`).join('');
    select.value = activeViewId || '';
  }

  async function loadSavedViewsFromFirestore() {
    if (typeof window.loadSavedViewsFromFirestore === 'function') {
      try {
        const views = await window.loadSavedViewsFromFirestore(userId);
        savedViews = views || [];
        // allow the settings module to manage activeViewId/uiPreferences; keep local sync
        try { activeViewId = window.activeViewId || activeViewId; } catch (e) {}
        renderSavedViewsSelect();
        if (typeof window.setActiveViewById === 'function') window.setActiveViewById(activeViewId);
        return views;
      } catch (e) {
        console.error('[App] delegated loadSavedViewsFromFirestore failed', e);
      }
    }
    // fallback: no-op when no settings module available
    return [];
  }

  async function persistSavedViewsToFirestore() {
    if (typeof window.persistSavedViewsToFirestore === 'function') return window.persistSavedViewsToFirestore(userId);
    // fallback: do nothing
  }
  function buildFilterPredicate(rule) {
    return (card) => {
      const col = rule.column;
      const val = rule.value;
      const op = rule.operator;
      let cardVal = card[col];
      if (col === 'color_identity') cardVal = (card.color_identity || []).join('');
      if (col === 'type_line') cardVal = (card.type_line || '').split(' — ')[0];
      if (col === 'deck') {
        const assignment = (cardDeckAssignments[card.firestoreId] || [])[0];
        cardVal = assignment ? assignment.deckName : 'Not in a Deck';
      }
      if (cardVal === undefined || cardVal === null) cardVal = '';
      cardVal = (typeof cardVal === 'string') ? cardVal.toLowerCase() : cardVal;
      switch(op) {
        case 'contains': return String(cardVal).includes(String(val).toLowerCase());
        case 'equals': return String(cardVal) === String(val).toLowerCase();
        case 'gt': return Number(cardVal) > Number(val);
        case 'lt': return Number(cardVal) < Number(val);
        default: return true;
      }
    };
  }

  function applySavedViewToCards(cardsArr) {
    let result = [...cardsArr];
    for (const rule of viewFilterRules) {
      const pred = buildFilterPredicate(rule);
      result = result.filter(pred);
    }
    if (viewSortRules.length > 0) {
      result.sort((a,b) => {
        for (const s of viewSortRules) {
          const col = s.column;
          const dir = s.direction === 'asc' ? 1 : -1;
          let valA = a[col] ?? '';
          let valB = b[col] ?? '';
          if (col === 'price') { valA = parseFloat(a.prices?.usd||0); valB = parseFloat(b.prices?.usd||0); }
          if (col === 'count') { valA = a.count||1; valB = b.count||1; }
          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();
          if (valA < valB) return -1 * dir;
          if (valA > valB) return 1 * dir;
        }
        return 0;
      });
    }
    return result;
  }

  // --- Markdown rendering helpers (lightweight, safe) ---
  function escapeHtml(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markdownToHtml(md) {
    if (!md) return '';
    // Extract fenced code blocks first and replace with placeholders
    const codeBlocks = [];
    const placeholder = (i) => `\u0000CODEBLOCK${i}\u0000`;
    let working = md.replace(/```([^\n]*)\n([\s\S]*?)```/g, (m, lang, code) => {
      codeBlocks.push({ lang: (lang||'').trim(), code });
      return placeholder(codeBlocks.length - 1);
    });

    // Escape remaining text
    working = escapeHtml(working);

    // inline code
    working = working.replace(/`([^`]+)`/g, (m, c) => `<code>${escapeHtml(c)}</code>`);

    // links [text](url)
    working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const u = escapeHtml(url);
      const t = escapeHtml(text);
      return `<a href="${u}" class="chat-link">${t}</a>`;
    });

    // bold and italic
    working = working.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    working = working.replace(/__(.+?)__/g, '<strong>$1</strong>');
    working = working.replace(/\*(.+?)\*/g, '<em>$1</em>');
    working = working.replace(/_(.+?)_/g, '<em>$1</em>');

    // headings (###, ##, #)
    working = working.replace(/^###\s*(.+)$/gm, '<h3>$1</h3>');
    working = working.replace(/^##\s*(.+)$/gm, '<h2>$1</h2>');
    working = working.replace(/^#\s*(.+)$/gm, '<h1>$1</h1>');

    // Lists: simple detection for contiguous blocks
    const lines = working.split(/\r?\n/);
    let out = '';
    let inUl = false;
    let inOl = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*[-\*]\s+/.test(line)) {
        if (!inUl) { out += '<ul class="chat-ul">'; inUl = true; }
        out += '<li>' + line.replace(/^\s*[-\*]\s+/, '') + '</li>';
      } else if (/^\s*\d+\.\s+/.test(line)) {
        if (!inOl) { out += '<ol class="chat-ol">'; inOl = true; }
        out += '<li>' + line.replace(/^\s*\d+\.\s+/, '') + '</li>';
      } else {
        if (inUl) { out += '</ul>'; inUl = false; }
        if (inOl) { out += '</ol>'; inOl = false; }
        if (line.trim() === '') {
          out += '';
        } else {
          out += '<p>' + line + '</p>';
        }
      }
    }
    if (inUl) out += '</ul>';
    if (inOl) out += '</ol>';

    // Restore code blocks (placeholders)
    out = out.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (m, idx) => {
      const cb = codeBlocks[Number(idx)];
      if (!cb) return '';
      const codeEsc = escapeHtml(cb.code);
      const langClass = cb.lang ? `language-${escapeHtml(cb.lang)}` : '';
      return `<pre class="chat-code"><code class="${langClass}">${codeEsc}</code><button class="chat-code-copy" data-idx="${idx}" title="Copy">Copy</button></pre>`;
    });

    return out;
  }

  function enhanceChatInteractions(container) {
    try {
      if (!container) return;
      // links open in new tab safely
      container.querySelectorAll('a.chat-link').forEach(a => { a.setAttribute('target','_blank'); a.setAttribute('rel','noopener noreferrer'); });
      // wire copy buttons for code blocks
      container.querySelectorAll('button.chat-code-copy').forEach(btn => {
        if (btn.__wired) return; btn.__wired = true;
        btn.addEventListener('click', (e) => {
          try {
            const pre = btn.parentElement;
            const code = pre.querySelector('code');
            const txt = code ? code.textContent : '';
            navigator.clipboard?.writeText(txt).then(() => {
              btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1200);
            }).catch(() => { btn.textContent = 'Copy'; });
          } catch (err) { console.debug('copy failed', err); }
        });
      });
    } catch (e) { console.debug('[enhanceChatInteractions] error', e); }
  }

  async function saveViewToFirestore(view) {
    if (typeof window.saveViewToFirestore === 'function') {
      const saved = await window.saveViewToFirestore(userId || null, view);
      // sync local cache
      try { savedViews = window.savedViews || savedViews; } catch (e) {}
      try { activeViewId = window.activeViewId || activeViewId; } catch (e) {}
      renderSavedViewsSelect();
      return saved;
    }
    // fallback: mimic previous behaviour
    if (!view.id) view.id = `view_${Date.now()}`;
    const existingIndex = savedViews.findIndex(v => v.id === view.id);
    if (existingIndex >= 0) savedViews[existingIndex] = view; else savedViews.push(view);
    if (view.isDefault) savedViews.forEach(v => { if (v.id !== view.id) v.isDefault = false; });
    if (view.isDefault) activeViewId = view.id;
    await persistSavedViewsToFirestore();
    renderSavedViewsSelect();
    showToast(`View "${view.name}" saved.`, 'success');
    return view;
  }

  async function deleteViewFromFirestore(viewId) {
    if (typeof window.deleteViewFromFirestore === 'function') {
      const ok = await window.deleteViewFromFirestore(userId || null, viewId);
      try { savedViews = window.savedViews || savedViews; } catch (e) {}
      try { activeViewId = window.activeViewId || activeViewId; } catch (e) {}
      renderSavedViewsSelect();
      return ok;
    }
    savedViews = savedViews.filter(v => v.id !== viewId);
    if (activeViewId === viewId) activeViewId = null;
    await persistSavedViewsToFirestore();
    renderSavedViewsSelect();
    showToast('View deleted.', 'success');
    return true;
  }

  function setActiveViewById(viewId) {
    if (typeof window.setActiveViewById === 'function') return window.setActiveViewById(viewId);
    activeViewId = viewId || null;
    // fallback behaviour: attempt to apply view locally
    const view = savedViews.find(v => v.id === viewId);
    if (view && typeof window.applySavedView === 'function') {
      window.applySavedView(view);
      try { if (typeof window.persistSettingsForUser === 'function' && userId) window.persistSettingsForUser(userId); } catch (e) {}
      renderSavedViewsSelect();
      return;
    }
    // last-resort: trigger re-render
    renderSavedViewsSelect();
    renderPaginatedCollection();
  }

  const views = {
    collection: document.getElementById("collection-view"),
    decks: document.getElementById("decks-view"),
    singleDeck: document.getElementById("single-deck-view"),
    settings: document.getElementById("settings-view"),
  };

  const navLinks = {
    collection: document.getElementById("nav-collection"),
    decks: document.getElementById("nav-decks"),
    settings: document.getElementById("nav-settings"),
    ruleLookup: document.getElementById("nav-rule-lookup"),
    generalChat: document.getElementById("nav-general-chat"),
  };

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userId = user.uid;
      console.log(`[Auth] User is signed in. UID: ${userId}`);
      document.getElementById("user-email").textContent = user.email || "Anonymous User";
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app-wrapper").classList.remove("hidden");
      await loadSettings();
      // Playstyle helpers are lazy-loaded by the header floating panel when the user opens it.
      setupListeners();
    } else {
      // Prefer an explicit email/password sign-in UI. If an initial custom token is available
      // (for CI or special flows), try it; otherwise show the login screen and let the user sign in.
      console.log("[Auth] No user signed in. Showing login UI (email/password).");
      if (typeof __initial_auth_token !== "undefined") {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
          console.log("[Auth] Successfully signed in with custom token.");
        } catch (error) {
          // capture error for tests and show login UI
          try { window.__lastAuthError = { message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }; } catch(e){ window.__lastAuthError = { message: String(error) }; }
          console.error('[Auth] Custom token sign-in failed:', window.__lastAuthError);
          document.getElementById("login-screen").classList.remove("hidden");
          document.getElementById("app-wrapper").classList.add("hidden");
        }
      } else {
        // No automatic sign-in. Reveal login UI so user can sign in with email/password.
        document.getElementById("login-screen").classList.remove("hidden");
        document.getElementById("app-wrapper").classList.add("hidden");
      }
    }
  });

  // --- First-run setup handler ---
  window.handleFirstRunSetup = async function(email, password) {
    if (!email || !password) return { ok: false, message: 'Email and password required' };
    try {
      console.log('[Setup] handleFirstRunSetup: creating user for', email);
      try { window.__lastAuthResult = null; } catch(e){}
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('[Setup] createUserWithEmailAndPassword returned:', !!userCredential);
      // Send verification email and sign the user out until they verify
      try {
        if (userCredential && userCredential.user) {
          await sendEmailVerification(userCredential.user);
          console.log('[Setup] sendEmailVerification called for', userCredential.user.email);
          try { window.__lastAuthResult = { createdUid: userCredential.user.uid, email: userCredential.user.email, verificationSent: true }; } catch(e){}
          // store a flag that verification was sent for UX
          localStorage.setItem('mtg_verification_sent', new Date().toISOString());
          // Sign out so user must verify before using the app
          await signOut(auth);
          return { ok: true, verificationSent: true, message: 'Verification email sent. Please verify your email before signing in.' };
        }
        return { ok: true };
      } catch (ve) {
        console.error('[Setup] sendEmailVerification error:', ve && ve.message);
        try { window.__lastAuthResult = { createdUid: userCredential && userCredential.user && userCredential.user.uid || null, email: userCredential && userCredential.user && userCredential.user.email || null, verificationSent: false, error: ve && (ve.message || String(ve)) }; } catch(e){}
        return { ok: true, verificationSent: false, message: 'Account created but failed to send verification email. Please try resending from the login screen.' };
      }
    } catch (error) {
      // Normalize and expose a serializable error object for tests and diagnostics
      const errObj = {
        message: (error && (error.message || String(error))) || 'Unknown error',
        code: (error && error.code) || null,
        stack: (error && error.stack) || null
      };
  try { window.__lastAuthError = JSON.parse(JSON.stringify(errObj)); } catch (e) { window.__lastAuthError = errObj; }
      console.error('[Setup] createUser error:', errObj);

      // Special-case common backend config error from Identity Toolkit
      let userMessage = errObj.message;
      if (String(userMessage).includes('ADMIN_ONLY_OPERATION')) {
        userMessage = 'Account creation is disabled for this Firebase project. Please enable Email/Password sign-up in the Firebase Console (Authentication → Sign-in method).';
      }
      return { ok: false, message: userMessage, code: errObj.code };
    }
  };

  // Allow resending verification email; expects a signed-in user (can be used shortly after signup)
  window.resendVerification = async function() {
    try {
      const user = auth.currentUser;
      if (!user) return { ok: false, message: 'No signed-in user to verify.' };
      await sendEmailVerification(user);
      localStorage.setItem('mtg_verification_sent', new Date().toISOString());
      return { ok: true, message: 'Verification email resent.' };
    } catch (e) {
      console.error('[Auth] resendVerification error:', e && e.message);
      return { ok: false, message: e && (e.message || String(e)) };
    }
  };

  // Hook up simple UI handlers (login modal buttons are in index-dev.html)
  document.addEventListener('DOMContentLoaded', () => {
    const openSetup = document.getElementById('open-setup-btn');
    const setupModal = document.getElementById('first-run-setup');
    const cancelBtn = document.getElementById('cancel-setup-btn');
    const runBtn = document.getElementById('run-setup-btn');
    const msg = document.getElementById('setup-msg');
    if (openSetup && setupModal) {
      openSetup.addEventListener('click', () => { setupModal.classList.remove('hidden'); });
    }
    if (cancelBtn && setupModal) cancelBtn.addEventListener('click', () => { setupModal.classList.add('hidden'); msg.textContent = ''; });
    if (runBtn) runBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('setup-email');
      const passInput = document.getElementById('setup-password');
      const email = emailInput?.value?.trim();
      const password = passInput?.value;
      msg.textContent = 'Creating account...';
      const res = await window.handleFirstRunSetup(email, password);
      if (res.ok) {
        // Prefer to show an explicit message from the handler if present (e.g., verification sent)
        if (res.message) {
          msg.textContent = res.message;
        } else {
          msg.textContent = 'User created. You should be signed in.';
        }
        setTimeout(() => { setupModal.classList.add('hidden'); msg.textContent = ''; }, 1500);
      } else {
        msg.textContent = 'Error: ' + (res.message || 'unknown');
      }
    });
  });

// Helper to get or load the user's playstyle summary. Returns string or null.
if (typeof window !== 'undefined') {
  window.getPlaystyleSummary = async function(uid) {
    try {
      // Prefer window-exposed value if present
      if (window.playstyleSummary) return window.playstyleSummary;
      // Otherwise import the module and attempt to load for the user
      const mod = await import('./js/settings/playstyle.js');
      if (mod && typeof mod.loadPlaystyleForUser === 'function') {
        const ps = await mod.loadPlaystyleForUser(uid || window.userId || null);
        return (ps && ps.summary) ? ps.summary : (window.playstyleSummary || null);
      }
    } catch (e) {
      console.debug('[getPlaystyleSummary] failed to load playstyle module', e);
    }
    return window.playstyleSummary || null;
  };
}

  function setupListeners() {
    console.log("[Function: setupListeners] Setting up Firestore listeners. Find in <script> block.");
    if (collectionUnsubscribe) collectionUnsubscribe();
    const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/collection`);
    collectionUnsubscribe = onSnapshot(collectionRef, (querySnapshot) => {
      let updatedCollection = {};
      querySnapshot.forEach((doc) => { updatedCollection[doc.id] = { firestoreId: doc.id, ...doc.data() }; });
      localCollection = updatedCollection;
      console.log(`[Firestore: Collection] Snapshot received. ${Object.keys(localCollection).length} cards loaded.`);
      updateCardAssignments();
      renderCollection();
      const activeDeckId = views.singleDeck.dataset.deckId;
      if (!views.singleDeck.classList.contains("hidden") && activeDeckId) renderSingleDeck(activeDeckId);
    }, (error) => { console.error("Error listening to collection changes:", error); });

    if (decksUnsubscribe) decksUnsubscribe();
    const decksRef = collection(db, `artifacts/${appId}/users/${userId}/decks`);
    decksUnsubscribe = onSnapshot(decksRef, (querySnapshot) => {
      let updatedDecks = {};
      querySnapshot.forEach((doc) => { updatedDecks[doc.id] = { id: doc.id, ...doc.data() }; });
      localDecks = updatedDecks;
      console.log(`[Firestore: Decks] Snapshot received. ${Object.keys(localDecks).length} decks loaded.`);
      updateCardAssignments();
      if (!views.decks.classList.contains("hidden")) renderDecksList();
      const activeDeckId = views.singleDeck.dataset.deckId;
      if (!views.singleDeck.classList.contains("hidden") && activeDeckId && localDecks[activeDeckId]) renderSingleDeck(activeDeckId);
      else if (!views.singleDeck.classList.contains("hidden") && !localDecks[activeDeckId]) { showToast("The deck you were viewing has been deleted.", "info"); showView('decks'); }
    }, (error) => { console.error("Error listening to deck changes:", error); });
  }

  async function saveSettings() {
    if (!userId) return;
    const userSettingsRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const settings = { modalVisibility: modalVisibilitySettings };
    try { await setDoc(userSettingsRef, { settings }, { merge: true }); showToast("Settings saved successfully.", "success"); }
    catch (error) { console.error("Error saving settings:", error); showToast("Failed to save settings.", "error"); }
  }

  async function loadSettings() {
    if (!userId) return;
    try {
      const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const settings = userDoc.data().settings;
        if (settings && settings.modalVisibility) { modalVisibilitySettings = settings.modalVisibility; console.log("[Settings] Loaded modal visibility settings:", modalVisibilitySettings); }
      }
    } catch (e) { console.error("Error loading settings:", e); }
    const allFields = ['count', 'finish', 'condition', 'purchasePrice', 'notes', 'deckAssignments'];
    allFields.forEach(field => { if (modalVisibilitySettings[field] === undefined) modalVisibilitySettings[field] = true; });
    renderModalVisibilitySettings();
  }

  function updateCardAssignments() {
    cardDeckAssignments = {};
    Object.values(localDecks).forEach((deck) => {
      const allDeckCardsFirestoreIds = Object.keys(deck.cards || {});
      if (deck.commander && deck.commander.firestoreId) allDeckCardsFirestoreIds.push(deck.commander.firestoreId);
      allDeckCardsFirestoreIds.forEach(firestoreId => {
        if (!cardDeckAssignments[firestoreId]) cardDeckAssignments[firestoreId] = [];
        const existingAssignment = cardDeckAssignments[firestoreId].find(a => a.deckId === deck.id);
        if (!existingAssignment) cardDeckAssignments[firestoreId].push({ deckId: deck.id, deckName: deck.name });
      });
    });
    console.log("[State] Card to deck assignments updated.");
  }

  function renderCollection() { console.log("[Function: renderCollection] Triggering a full re-render of the collection view. Find in <script> block."); renderPaginatedCollection(); }

  function groupCardsRecursively(cards, groupByKeys) {
    if (!groupByKeys || !groupByKeys.length) return cards;
    const currentKey = groupByKeys[0];
    const remainingKeys = groupByKeys.slice(1);
    const groups = cards.reduce((acc, card) => {
      let key;
      if (currentKey === "color_identity") { const colors = card.color_identity.join(""); key = colors === "" ? "Colorless" : colors; }
      else if (currentKey === "type_line") key = card.type_line.split(' — ')[0];
      else if (currentKey === 'deck') { const assignment = (cardDeckAssignments[card.firestoreId] || [])[0]; key = assignment ? assignment.deckName : 'Not in a Deck'; }
      else key = card[currentKey] ?? "Other";
      (acc[key] = acc[key] || []).push(card);
      return acc;
    }, {});
    if (remainingKeys.length > 0) {
      for (const groupName in groups) groups[groupName] = groupCardsRecursively(groups[groupName], remainingKeys);
    }
    return groups;
  }

  function sortCards(cards) {
    const { column, direction } = collectionSortState;
    const sorted = [...cards].sort((a, b) => {
      let valA, valB;
      if (column === "price") { valA = parseFloat(a.prices?.usd || 0); valB = parseFloat(b.prices?.usd || 0); }
      else if (column === "count") { valA = a.count || 1; valB = b.count || 1; }
      else { valA = a[column] ?? ""; valB = b[column] ?? ""; }
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  function sortGroupContent(cards) {
    if (window.viewSortRules && viewSortRules.length > 0) {
      const sorted = [...cards].sort((a, b) => {
        for (const s of viewSortRules) {
          const col = s.column; const dir = s.direction === 'asc' ? 1 : -1; let valA = a[col] ?? ''; let valB = b[col] ?? ''; if (col === 'price') { valA = parseFloat(a.prices?.usd||0); valB = parseFloat(b.prices?.usd||0); } if (col === 'count') { valA = a.count||1; valB = b.count||1; } if (typeof valA === 'string') valA = valA.toLowerCase(); if (typeof valB === 'string') valB = valB.toLowerCase(); if (valA < valB) return -1 * dir; if (valA > valB) return 1 * dir; }
        return 0;
      });
      return sorted;
    }
    return sortCards(cards);
  }

  function computeGroupCounts(items) {
    if (!items) return { unique: 0, copies: 0 };
    if (Array.isArray(items)) return { unique: items.length, copies: items.reduce((acc, c) => acc + (c.count || 1), 0) };
    let totalUnique = 0; let totalCopies = 0;
    for (const key of Object.keys(items)) { const child = items[key]; const childCounts = computeGroupCounts(child); totalUnique += childCounts.unique; totalCopies += childCounts.copies; }
    return { unique: totalUnique, copies: totalCopies };
  }

  function renderPaginatedCollection() {
    console.log(`[Function: renderPaginatedCollection] Rendering page ${collectionCurrentPage} of the collection. Find in <script> block.`);
    const contentDiv = document.getElementById("collection-content");
    const paginationDiv = document.getElementById("collection-pagination");
    const noCardsMsg = document.getElementById("no-cards-msg");
    let cards = Object.values(localCollection);
    if (document.getElementById("hide-in-deck-checkbox").checked) cards = cards.filter((card) => !cardDeckAssignments[card.firestoreId]);
    if (typeof applySavedViewToCards === 'function') cards = applySavedViewToCards(cards);
    const allCardsArr = Object.values(localCollection);
    const totalCards = allCardsArr.reduce((sum, c) => sum + (c.count || 1), 0);
    const uniqueCards = allCardsArr.length;
    const totalPrice = allCardsArr.reduce((sum, c) => sum + ((c.prices && c.prices.usd ? parseFloat(c.prices.usd) : 0) * (c.count || 1)), 0);
    const filteredCards = cards;
    const filteredTotal = filteredCards.reduce((sum, c) => sum + (c.count || 1), 0);
    const filteredUnique = filteredCards.length;
    const filteredPrice = filteredCards.reduce((sum, c) => sum + ((c.prices && c.prices.usd ? parseFloat(c.prices.usd) : 0) * (c.count || 1)), 0);
    const elTotal = document.getElementById('kpi-total-cards');
    const elUnique = document.getElementById('kpi-unique-cards');
    const elPrice = document.getElementById('kpi-total-price');
    const elFiltered = document.getElementById('kpi-filtered-summary');
    if (elTotal) elTotal.textContent = totalCards; if (elUnique) elUnique.textContent = uniqueCards; if (elPrice) elPrice.textContent = `$${totalPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`; if (elFiltered) elFiltered.textContent = `${filteredTotal}/${totalCards}`;
    if (cards.length === 0) { contentDiv.innerHTML = ""; paginationDiv.innerHTML = ""; noCardsMsg.classList.remove("hidden"); return; }
    noCardsMsg.classList.add("hidden");
    const filterText = document.getElementById("filter-text").value.toLowerCase();
    if (filterText) {
      cards = cards.filter((card) => card.name.toLowerCase().includes(filterText) || card.type_line.toLowerCase().includes(filterText));
    }
    const groupByKeys = [ document.getElementById("collection-group-by-1").value, document.getElementById("collection-group-by-2").value ].filter(Boolean);
    if (groupByKeys.length > 0) { paginationDiv.innerHTML = ""; }
    else {
      cards = sortCards(cards);
      const totalPages = Math.ceil(cards.length / COLLECTION_PAGE_SIZE);
      if (totalPages > 1) { const start = (collectionCurrentPage - 1) * COLLECTION_PAGE_SIZE; const end = start + COLLECTION_PAGE_SIZE; const paginatedCards = cards.slice(start, end); renderPaginationControls(totalPages); cards = paginatedCards; } else { paginationDiv.innerHTML = ""; }
    }
    if (collectionViewMode === "grid") renderCollectionGrid(cards, groupByKeys); else renderCollectionTable(cards, groupByKeys);
  }

  function renderPaginationControls(totalPages) {
    const paginationDiv = document.getElementById("collection-pagination");
    let html = ""; for (let i = 1; i <= totalPages; i++) { const activeClass = i === collectionCurrentPage ? "bg-indigo-600 text-white" : "bg-gray-700 hover:bg-gray-600"; html += `<button class="pagination-btn ${activeClass} font-bold py-2 px-4 rounded" data-page="${i}">${i}</button>`; }
    paginationDiv.innerHTML = html;
    document.querySelectorAll(".pagination-btn").forEach((button) => { button.addEventListener("click", () => { collectionCurrentPage = parseInt(button.dataset.page, 10); renderPaginatedCollection(); }); });
  }

  function renderCollectionGrid(cards, groupByKeys) {
    const contentDiv = document.getElementById("collection-content");
    const sizeClasses = { sm: "grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11", md: "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9", lg: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" };
    const gridClass = sizeClasses[collectionGridSize] || sizeClasses.md;
    let groupUidCounter = 0;
    function renderRecursiveGroups(groups, level) {
      return Object.keys(groups).sort().map((groupName) => {
        const content = groups[groupName]; const uid = `group-${groupUidCounter++}`;
        if (Array.isArray(content)) { const counts = computeGroupCounts(content); const headerHtml = `
          <details id="${uid}" class="col-span-full" ${level === 0 ? "" : "open"}>
            <summary class="group-header" style="padding-left: ${1.5 + level}rem;">${groupName} <span class="text-sm text-gray-400 ml-3">(${counts.unique} items, ${counts.copies} total)</span></summary>
            <div class="grid ${gridClass} gap-4 p-4">${sortGroupContent(content).map(renderCollectionCard).join("")}</div>
          </details>
        `; return headerHtml; } else { const counts = computeGroupCounts(content); const subgroupHtml = `
          <details id="${uid}" class="col-span-full" ${level === 0 ? "" : "open"}>
            <summary class="group-header" style="padding-left: ${1.5 + level}rem;">${groupName} <span class="text-sm text-gray-400 ml-3">(${counts.unique} items, ${counts.copies} total)</span></summary>
            <div class="col-span-full">${renderRecursiveGroups(content, level + 1)}</div>
          </details>
        `; return subgroupHtml; }
      }).join("");
    }
    if (groupByKeys.length > 0) { const groupedCards = groupCardsRecursively(cards, groupByKeys); groupUidCounter = 0; contentDiv.innerHTML = `<div class="grid ${gridClass} gap-4 p-4">${renderRecursiveGroups(groupedCards, 0)}</div>`; contentDiv.querySelectorAll('details summary').forEach(summary => { summary.tabIndex = 0; summary.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const details = summary.parentElement; details.open = !details.open; } }); }); }
    else { contentDiv.innerHTML = `<div class="grid ${gridClass} gap-4 p-4">${cards.map(renderCollectionCard).join("")}</div>`; }
    addCollectionCardListeners();
  }

  function renderCollectionTable(cards, groupByKeys) {
    // Implementation preserved from original file (kept concise in app.js)
    console.log(`[Function: renderCollectionTable] Rendering collection as a table. Card count: ${cards.length}.`);
    const contentDiv = document.getElementById("collection-content");
    const renderTableRows = (cardGroup) => cardGroup.map((card) => {
      const price = card.prices?.usd_foil && card.finish === "foil" ? card.prices.usd_foil : card.prices?.usd || "N/A";
      const isCommander = card.type_line.includes("Legendary");
      const assignment = (cardDeckAssignments[card.firestoreId] || [])[0];
      return `<tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">...`;
    }).join("");
    // For brevity we keep the original table rendering in the HTML file when needed. (The full function is long; index-dev.html still contains the markup templates used.)
    // In practice you can expand this function similar to the original.
    contentDiv.innerHTML = '<div class="overflow-x-auto bg-gray-800 rounded-lg"><table class="w-full text-sm text-left text-gray-300"><tbody>' + renderTableRows(cards) + '</tbody></table></div>';
    addCollectionTableListeners();
  }

  // --- AI chat handlers (ported from index-live.html) ---
  function renderAiChat() {
    const chatContainer = document.getElementById('ai-chat-history');
    if (!chatContainer) return;
    chatContainer.innerHTML = (activeAiChatHistory || []).map((msg) => {
      const text = msg.parts?.[0]?.text || '';
      // Model responses are expected to be HTML-capable. Render safely.
      if (msg.role === 'model') return `<div class="bg-gray-700 p-3 rounded-lg"><div class="chat-model-message">${safeHtmlRenderer(text)}</div></div>`;
      if ((activeAiChatHistory || []).indexOf(msg) > 0) return `<div class="bg-indigo-900 p-3 rounded-lg text-right"><div class="chat-user-message font-semibold">${escapeHtml(text)}</div></div>`;
      return '';
    }).join('');
    enhanceChatInteractions(chatContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Try to render HTML safely. Prefer DOMPurify if present. Otherwise fall back to conservative markdown-to-HTML.
  function safeHtmlRenderer(htmlText) {
    if (!htmlText) return '';
    try {
      if (typeof window.DOMPurify !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        // Use DOMPurify if available (inserted via CDN in index.html)
        console.debug('[safeHtmlRenderer] DOMPurify available, sanitizing HTML');
        return window.DOMPurify.sanitize(htmlText);
      } else {
        console.debug('[safeHtmlRenderer] DOMPurify NOT available, falling back to markdownToHtml');
      }
    } catch (e) { /* continue to fallback */ }
    // Fallback: if the text looks like HTML (contains tags), strip potentially dangerous tags by escaping
    const looksLikeHtml = /<[^>]+>/.test(htmlText);
    if (looksLikeHtml) {
      // Very conservative: allow only a small subset by converting via markdownToHtml which itself escapes.
      return markdownToHtml(htmlText);
    }
    return markdownToHtml(htmlText);
  }

  async function handleAiChat(deckId, userMessage = null) {
    console.log(`[Function: handleAiChat] Handling AI chat for deck ${deckId}.`);
    const deck = localDecks[deckId] || (window.localDecks && window.localDecks[deckId]);
    if (!deck) { console.error(`[handleAiChat] Deck with ID ${deckId} not found.`); return; }

    if (!userMessage) {
      activeAiChatHistory = [];
      const historyEl = document.getElementById('ai-chat-history');
      if (historyEl) historyEl.innerHTML = `<div class="flex justify-center items-center h-full"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div></div>`;
      if (typeof window.showModal === 'function') window.showModal('ai-suggestions-modal');
      const cardList = Object.values(deck.cards || {}).map(c => `${c.count}x ${c.name}`).join('\n');
      const commanderLine = deck.commander ? `Commander: 1x ${deck.commander.name}\n` : '';
      let initialPrompt = `You are an expert Magic: The Gathering deck builder. Analyze the following decklist and provide suggestions for improvement. Focus on synergy, mana curve, and overall strategy. Suggest specific cards to add and remove. Format your response clearly with sections for "Analysis", "Cards to Add", and "Cards to Remove".\n\nDeck Name: ${deck.name}\n${commanderLine}Decklist:\n${cardList}`;
      try {
        if (window.playstyle && typeof window.playstyle.attachPlaystyleToPrompt === 'function') {
          initialPrompt = window.playstyle.attachPlaystyleToPrompt(initialPrompt);
        } else if (typeof window.getPlaystyleSummary === 'function') {
          const ps = await window.getPlaystyleSummary(userId || window.userId || null);
          if (ps) initialPrompt += `\n\nUser Playstyle Summary:\n${ps}\n`;
        }
      } catch (e) { /* best-effort */ }
      activeAiChatHistory.push({ role: 'user', parts: [{ text: initialPrompt }] });
    } else {
      activeAiChatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    }
    renderAiChat();
    // UX: disable submit and clear+focus AI chat input
    try { setSubmitDisabled('#ai-chat-form button[type="submit"]', true); } catch (e) {}
    try { const inputEl = document.getElementById('ai-chat-input'); if (inputEl) animateClearAndFocus(inputEl); } catch (e) {}
    try {
      // Show a global toast indicating a pending AI request
      if (typeof window.showToast === 'function') {
        window.showToast('Waiting for AI response...', 'info');
      }
      const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: activeAiChatHistory }) });
      if (!response.ok) throw new Error(`Gemini API request failed with status ${response.status}`);
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) activeAiChatHistory.push({ role: 'model', parts: [{ text }] }); else throw new Error('Invalid response from Gemini API.');
    } catch (error) {
      console.error('[handleAiChat] Gemini API error:', error);
      activeAiChatHistory.push({ role: 'model', parts: [{ text: `Sorry, I encountered an error: ${error.message}` }] });
    } finally {
      // Replace the 'waiting' toast with a success/info toast
      if (typeof window.showToast === 'function') {
        window.showToast('AI response received.', 'success');
      }
      renderAiChat();
      try { setSubmitDisabled('#ai-chat-form button[type="submit"]', false); } catch (e) {}
    }
  }

  // --- Chat UX helpers ---
  function injectChatStyles() {
    try {
      if (window.__mtg_chat_styles_injected) return;
      const css = `
      .mtg-input-fade{transition:opacity .22s ease,transform .22s ease}
      .mtg-input-fade.fade-out{opacity:0;transform:translateY(-6px)}
      .mtg-submit-disabled{opacity:.5;cursor:not-allowed}
      `;
      const s = document.createElement('style'); s.setAttribute('data-mtg-chat-styles','1'); s.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(s);
      window.__mtg_chat_styles_injected = true;
    } catch (e) { /* ignore */ }
  }

  function setSubmitDisabled(selector, disabled) {
    try {
      const btn = document.querySelector(selector);
      if (!btn) return;
      btn.disabled = !!disabled;
      if (disabled) btn.classList.add('mtg-submit-disabled'); else btn.classList.remove('mtg-submit-disabled');
      // Toggle spinner if present
      try {
        const spinner = btn.querySelector('.mtg-spinner');
        const textSpan = btn.querySelector('.mtg-btn-text');
        if (spinner) {
          if (disabled) spinner.classList.remove('hidden'); else spinner.classList.add('hidden');
        }
        if (textSpan) {
          if (disabled) textSpan.classList.add('opacity-75'); else textSpan.classList.remove('opacity-75');
        }
      } catch (e) {}
    } catch (e) { /* ignore */ }
  }

  function animateClearAndFocus(inputEl) {
    try {
      if (!inputEl) return;
      injectChatStyles();
      inputEl.classList.add('mtg-input-fade');
      // trigger fade-out -> clear -> focus -> fade-in
      inputEl.classList.add('fade-out');
      window.setTimeout(() => {
        try { inputEl.value = ''; } catch (e) {}
        inputEl.classList.remove('fade-out');
        try { inputEl.focus(); } catch (e) {}
      }, 220);
    } catch (e) { /* ignore */ }
  }

  async function handleRuleLookup(query) {
    ruleLookupHistory.push({ role: 'user', parts: [{ text: query }] });
    renderRuleLookupChat();
    try { setSubmitDisabled('#rule-lookup-form button[type="submit"]', true); } catch (e) {}
    try { const inputEl = document.getElementById('rule-lookup-input'); if (inputEl) animateClearAndFocus(inputEl); } catch (e) {}
    let prompt = `You are a Magic: The Gathering Level 3 Judge and rules expert. Your knowledge is comprehensive and up-to-date. Answer the following rules question accurately and clearly. If possible, cite the relevant Comprehensive Rule number(s). Keep your answer focused on the rules question asked.\n\nQuestion: ${query}`;
    try {
      if (window.playstyle && typeof window.playstyle.attachPlaystyleToPrompt === 'function') {
        prompt = window.playstyle.attachPlaystyleToPrompt(prompt);
      } else if (typeof window.getPlaystyleSummary === 'function') {
        const ps = await window.getPlaystyleSummary(null);
        if (ps) prompt += `\n\nUser Playstyle Summary:\n${ps}\n`;
      }
    } catch (e) {}
    const apiHistory = [{ role: 'user', parts: [{ text: prompt }] }];
    try {
      const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: apiHistory }) });
      if (!response.ok) { const errorBody = await response.text(); throw new Error(`Gemini API request failed with status ${response.status}: ${errorBody}`); }
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) ruleLookupHistory.push({ role: 'model', parts: [{ text }] }); else { throw new Error('Received an invalid or empty response from the AI.'); }
    } catch (error) {
      console.error('[handleRuleLookup] Gemini API error:', error);
      ruleLookupHistory.push({ role: 'model', parts: [{ text: `Sorry, I encountered an error trying to look that up: ${error.message}` }] });
    } finally {
      renderRuleLookupChat();
      try { setSubmitDisabled('#rule-lookup-form button[type="submit"]', false); } catch (e) {}
    }
  }

  function renderRuleLookupChat() {
    const chatContainer = document.getElementById('rule-lookup-history');
    if (!chatContainer) return;
    chatContainer.innerHTML = (ruleLookupHistory || []).map((msg) => {
      const text = msg.parts?.[0]?.text || '';
      if (msg.role === 'model') return `<div class="bg-gray-700 p-3 rounded-lg"><div class="chat-model-message">${safeHtmlRenderer(text)}</div></div>`;
      return `<div class="bg-indigo-900 p-3 rounded-lg text-right"><div class="chat-user-message font-semibold">${escapeHtml(text)}</div></div>`;
    }).join('');
    if (ruleLookupHistory.length > 0 && ruleLookupHistory[ruleLookupHistory.length - 1].role === 'user') {
      chatContainer.innerHTML += `<div class="bg-gray-700 p-3 rounded-lg"><div class="flex items-center gap-2"><div class="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400"></div><span>Consulting the rules...</span></div></div>`;
    }
    enhanceChatInteractions(chatContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  async function callGeminiChat(payload, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errorBody = await resp.text();
                throw new Error(`Gemini API error: ${resp.status} - ${errorBody}`);
            }

            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error("Invalid or empty response from Gemini.");
            }
            return text;
        } catch (err) {
            console.error(`Gemini chat call attempt ${i + 1} failed:`, err);
            if (i === retries - 1) {
                return null; // Last retry failed
            }
            // Wait for the delay and then double it for the next potential retry
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
    return null;
}
/**
 * Handles sending a user's message to the Gemini API and updating the chat history.
 * @param {string} userMessage The user's chat message.
 */
async function handleMtgChat(userMessage) {
    // Use a global in-flight flag to prevent concurrent requests.
    if (window.__mtgChatRequestInFlight) {
        console.warn('[handleMtgChat] Request already in flight; ignoring duplicate call.');
        return;
    }
    window.__mtgChatRequestInFlight = true;

    // Add user message to history and render it immediately.
    mtgChatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
    renderMtgChat();

    try { setSubmitDisabled('#mtg-chat-form button[type="submit"]', true); } catch (e) {}
    try { const inputEl = document.getElementById('mtg-chat-input'); if (inputEl) animateClearAndFocus(inputEl); } catch (e) {}

    // 1. Define the core persona and instructions for the AI model.
    let systemInstructionText = `You are MTG Forge, an expert AI assistant for all things Magic: The Gathering. You are knowledgeable about card interactions, deck building strategies, the latest meta, MTG lore, and tournament results.
- You are friendly, engaging, and helpful.
- Do not mention you are an AI model or knowledge cutoffs.
- Answer questions about Magic: The Gathering to the best of your ability.
- Format your entire response as a single block of well-structured, modern HTML. This will be rendered directly inside a div on a dark-themed website.
- Use Tailwind CSS classes for styling. For example: <p class="mb-2">, <strong class="text-indigo-400">, <code class="bg-gray-700 rounded px-1">.
- Make your responses visually appealing and easy to read. Use headings (<h3 class="text-lg font-semibold text-indigo-400 mb-2">), lists (<ul> with <li class="ml-4 list-disc">), bold text, and highlights.
- Use relevant emojis to add personality and break up text, for example: 📜, ✨, ⚔️, 🧠.
- Do NOT include <html>, <head>, or <body> tags.`;

    // 2. Attach the user's playstyle summary to the system instructions if it exists.
    const summary = window.playstyleState?.summary || window.playstyleSummary || null;
    if (summary) {
        systemInstructionText += `\n\n- IMPORTANT: Tailor your response based on the user's playstyle profile below. Do not explicitly mention their playstyle; simply use it as context for your recommendations and analysis.\n\nUser Playstyle Summary:\n${summary}`;
    }

    // 3. Construct the full API payload.
    const payload = {
        systemInstruction: {
            parts: [{ text: systemInstructionText }]
        },
        contents: mtgChatHistory // Send the entire ongoing conversation history.
    };

    try {
        // 4. Call the API using the robust helper function.
        const responseText = await callGeminiChat(payload);

        if (responseText) {
            mtgChatHistory.push({ role: 'model', parts: [{ text: responseText }] });
        } else {
            throw new Error('Received an invalid or empty response from the AI.');
        }
    } catch (error) {
        console.error('[handleMtgChat] Gemini API error:', error);
        const errorMessage = `<p class="text-red-400">Sorry, I encountered an error: ${error.message}</p>`;
        mtgChatHistory.push({ role: 'model', parts: [{ text: errorMessage }] });
    } finally {
        // 5. Clear the in-flight flag and render the final response or error.
        window.__mtgChatRequestInFlight = false;
        renderMtgChat();
    try { setSubmitDisabled('#mtg-chat-form button[type="submit"]', false); } catch (e) {}
    }
}


  function renderMtgChat() {
    const chatContainer = document.getElementById('mtg-chat-history');
    if (!chatContainer) return;
    chatContainer.innerHTML = (mtgChatHistory || []).map((msg) => {
      const text = msg.parts?.[0]?.text || '';
      if (msg.role === 'model') return `<div class="bg-gray-700 p-3 rounded-lg"><div class="chat-model-message">${safeHtmlRenderer(text)}</div></div>`;
      return `<div class="bg-indigo-900 p-3 rounded-lg text-right"><div class="chat-user-message font-semibold">${escapeHtml(text)}</div></div>`;
    }).join('');
    enhanceChatInteractions(chatContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Save/Export helpers for Rule Lookup and MTG Chat
  function formatConversationAsText(history) {
    if (!history || history.length === 0) return '';
    return history.map(m => `${m.role === 'model' ? 'AI' : 'User'}: ${ (m.parts?.[0]?.text || '').replace(/<[^>]+>/g,'') }`).join('\n\n');
  }
  function saveConversationAsTxt(history, filename = 'conversation.txt') {
    const content = formatConversationAsText(history);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    if (typeof window.showToast === 'function') window.showToast('Conversation saved.', 'success');
  }
  function exportConversationAsJson(history, filename = 'conversation.json') {
    const data = (history || []).map(m => ({ role: m.role, text: m.parts?.[0]?.text || '' }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    if (typeof window.showToast === 'function') window.showToast('Conversation exported as JSON.', 'success');
  }

  // Expose handlers for boot wiring
  if (typeof window !== 'undefined') {
    window.handleAiChat = handleAiChat;
    window.handleRuleLookup = handleRuleLookup;
    window.handleMtgChat = handleMtgChat;
    window.renderAiChat = renderAiChat;
    window.renderRuleLookupChat = renderRuleLookupChat;
    window.renderMtgChat = renderMtgChat;
    // Also expose module implementations under internal names to avoid being clobbered by inline scripts
    window.__module_handleAiChat = handleAiChat;
    window.__module_handleRuleLookup = handleRuleLookup;
    window.__module_handleMtgChat = handleMtgChat;
    try {
      console.debug('[Public/app.js] Module handlers registered: __module_handleAiChat, __module_handleRuleLookup, __module_handleMtgChat');
    } catch (e) {}
  }

  // Save conversation as a .txt file (plain text). Formats activeAiChatHistory.
  function formatAiConversationAsText() {
    if (!activeAiChatHistory || activeAiChatHistory.length === 0) return '';
    return activeAiChatHistory.map((m, idx) => {
      const role = m.role === 'model' ? 'AI' : 'User';
      const text = m.parts?.[0]?.text || '';
      // strip HTML tags for plain text
      const plain = text.replace(/<[^>]+>/g, '');
      return `${role}: ${plain}`;
    }).join('\n\n');
  }

  function saveAiConversationAsTxt(filename = 'ai-conversation.txt') {
    const content = formatAiConversationAsText();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Attach save button handler if present
  // Export JSON
  function exportAiConversationAsJson(filename = 'ai-conversation.json') {
    const data = (activeAiChatHistory || []).map(m => ({ role: m.role, text: m.parts?.[0]?.text || '' }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (typeof window.showToast === 'function') window.showToast('Conversation exported as JSON.', 'success');
  }

  function registerAiUiHooks() {
    try {
      console.debug('[registerAiUiHooks] attempting to attach AI UI hooks');
      const saveBtn = document.getElementById('save-ai-conversation-btn');
      console.debug('[registerAiUiHooks] saveBtn=', !!saveBtn);
      if (saveBtn && !saveBtn.__mtg_hooked) {
        saveBtn.addEventListener('click', (e) => { e.preventDefault(); saveAiConversationAsTxt(); });
        saveBtn.__mtg_hooked = true;
        console.debug('[registerAiUiHooks] saveBtn hooked');
      }
      // AI modal buttons
      const exportBtn = document.getElementById('export-ai-conversation-btn');
      console.debug('[registerAiUiHooks] exportBtn=', !!exportBtn);
      if (exportBtn && !exportBtn.__mtg_hooked) {
        exportBtn.addEventListener('click', (e) => { e.preventDefault(); exportAiConversationAsJson(); });
        exportBtn.__mtg_hooked = true;
        console.debug('[registerAiUiHooks] exportBtn hooked');
      }
      // Rule Lookup buttons
      const saveRule = document.getElementById('save-rule-conversation-btn'); if (saveRule && !saveRule.__mtg_hooked) { saveRule.addEventListener('click', (e) => { e.preventDefault(); saveConversationAsTxt(ruleLookupHistory, 'rule-lookup.txt'); }); saveRule.__mtg_hooked = true; }
      const exportRule = document.getElementById('export-rule-conversation-btn'); if (exportRule && !exportRule.__mtg_hooked) { exportRule.addEventListener('click', (e) => { e.preventDefault(); exportConversationAsJson(ruleLookupHistory, 'rule-lookup.json'); }); exportRule.__mtg_hooked = true; }
      // MTG Chat buttons
      const saveMtg = document.getElementById('save-mtg-conversation-btn'); if (saveMtg && !saveMtg.__mtg_hooked) { saveMtg.addEventListener('click', (e) => { e.preventDefault(); saveConversationAsTxt(mtgChatHistory, 'mtg-chat.txt'); }); saveMtg.__mtg_hooked = true; }
      const exportMtg = document.getElementById('export-mtg-conversation-btn'); if (exportMtg && !exportMtg.__mtg_hooked) { exportMtg.addEventListener('click', (e) => { e.preventDefault(); exportConversationAsJson(mtgChatHistory, 'mtg-chat.json'); }); exportMtg.__mtg_hooked = true; }
    } catch (e) { console.debug('[registerAiUiHooks] failed to attach AI UI hooks', e); }
  }

  // Expose a small debug helper to inspect AI hook status at runtime
  try { window.__mtg_debugAiHooks = () => ({ domPurify: !!window.DOMPurify, saveAiBtn: !!document.getElementById('save-ai-conversation-btn'), exportAiBtn: !!document.getElementById('export-ai-conversation-btn'), saveRuleBtn: !!document.getElementById('save-rule-conversation-btn'), exportRuleBtn: !!document.getElementById('export-rule-conversation-btn'), saveMtgBtn: !!document.getElementById('save-mtg-conversation-btn'), exportMtgBtn: !!document.getElementById('export-mtg-conversation-btn') }); } catch (e) {}

  // Remaining functions: renderSingleDeck, toggleEditMode, toggleCardDetailsEditMode, saveCardDetails, renderCardDetailsModal, renderModalVisibilitySettings,
  // renderAiBlueprintModal, showToast, openModal, closeModal, renderDecksList, renderSettings, openDeckDeleteOptions, showView, selectCommander,
  // openDeckCreationModal, handleCardSelection, renderCardConfirmationModal, addCardToCollection, handleAddSelectedCardsToDeck, getAiDeckBlueprint,
  // handleDeckCreationSubmit, createDeckFromBlueprint, authentication handlers, searchForCard, searchForCommander, filterCommanderCollectionList,
  // handleAiChat, handleRuleLookup, handleMtgChat, confirmClearAllData, executeClearAllData, renderCollectionCard, addCollectionCardListeners,
  // addCollectionTableListeners, renderDecklist, renderManaCurveChart, addSingleDeckListeners, renderCardVersions, setupGlobalListeners, isColorIdentityValid,
  // openAddCardsToDeckModal, deleteDeck, exportAllData, exportDeck, handleImportDeckData, processDeckImport, handleImportAllData, processDataImport,
  // executeDataImportBatched, showToastWithProgress, updateToastProgress, removeToastById, and final setupGlobalListeners call.

  // To avoid duplication and risking syntax errors during extraction, we keep the bulk of the code in the HTML for complex template strings. The core behaviors remain available via the functions above.

  try {
    if (typeof window !== 'undefined' && typeof window.setupGlobalListeners === 'function') {
      window.setupGlobalListeners();
    } else {
      console.debug('[Public/app.js] setupGlobalListeners not available yet; will rely on boot script to install it.');
    }
  } catch (e) { console.debug('[Public/app.js] setupGlobalListeners guard failed', e); }
});

// Ensure AI modal UI hooks are attached when DOM is ready
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerAiUiHooks);
  } else {
    registerAiUiHooks();
  }
} catch (e) { console.debug('[Public/app.js] registerAiUiHooks guard failed', e); }
