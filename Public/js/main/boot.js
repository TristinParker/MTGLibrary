import './index.js'; // ensures firebase, auth, settings are loaded and window globals set
import { initCollectionModule } from '../pages/collection.js';
import { initDecksModule } from '../pages/decks.js';
import { initSingleDeckModule } from '../pages/singleDeck.js';

export function bootApp() {
  initCollectionModule();
  initDecksModule();
  initSingleDeckModule();
  // Attach global DOM listeners (idempotent)
  try {
    if (!window.__global_listeners_installed) {
      console.debug('[Boot] Calling setupGlobalListeners(). window.renderPaginatedCollection=', typeof window.renderPaginatedCollection === 'function');
      setupGlobalListeners();
      window.__global_listeners_installed = true;
    }
  } catch (e) {
    // safe fallback: log and continue
    console.warn('[Boot] setupGlobalListeners failed', e);
  }
  console.debug('[Boot] Application modules initialized.');
}

// Auto-boot for existing HTML relying on global execution order
if (typeof window !== 'undefined') {
  window.bootApp = bootApp;
}

// --- Global listener wiring (migrated from inline HTML) ---
export function setupGlobalListeners() {
  // Be defensive: make no assumptions about which functions exist yet (legacy inline may still provide them)
  try {
  console.debug('[Boot] setupGlobalListeners() start. window.renderPaginatedCollection=', typeof window.renderPaginatedCollection === 'function');
  console.debug('[Boot] Installing global UI listeners');

    const navLinks = {
      collection: document.getElementById('nav-collection'),
      decks: document.getElementById('nav-decks'),
      settings: document.getElementById('nav-settings'),
      ruleLookup: document.getElementById('nav-rule-lookup'),
      generalChat: document.getElementById('nav-general-chat')
    };

    Object.keys(navLinks).forEach((key) => {
      const el = navLinks[key];
      if (!el) return;
      el.addEventListener('click', () => {
        try {
          console.debug('[Boot] nav click handler invoked for', key, 'showView=', typeof window.showView, 'renderPaginatedCollection=', typeof window.renderPaginatedCollection);
          if (key === 'ruleLookup') {
            if (typeof window.openModal === 'function') window.openModal('rule-lookup-modal');
          } else if (key === 'generalChat') {
            if (typeof window.openModal === 'function') window.openModal('mtg-chat-modal');
          } else {
            if (typeof window.showView === 'function') {
              console.debug('[Boot] calling window.showView for', key);
              window.showView(key);
            } else if (typeof window.renderPaginatedCollection === 'function' && key === 'collection') {
              // fallback to rendering collection view
              if (typeof window.showView === 'function') window.showView('collection');
              window.renderPaginatedCollection();
            } else {
              console.debug('[Boot] No showView or renderPaginatedCollection available for', key);
            }
          }
        } catch (e) {
          console.error('[Boot] nav click handler error for', key, e);
        }
      });
    });

    // Fallback: ensure nav buttons have direct onclick handlers and pointer-events enabled
    try {
      const navDecks = document.getElementById('nav-decks');
      const navSettings = document.getElementById('nav-settings');
      if (navDecks) {
  navDecks.style.pointerEvents = 'auto';
  navDecks.onclick = (e) => { try { console.debug('[Boot][FB] nav-decks onclick fallback'); if (typeof window.showView === 'function') window.showView('decks'); else renderDecksList(); } catch (err) { console.error('[Boot][FB] nav-decks onclick error', err); } };
  console.debug('[Boot][FB] nav-decks fallback onclick installed');
      }
      if (navSettings) {
  navSettings.style.pointerEvents = 'auto';
  navSettings.onclick = (e) => { try { console.debug('[Boot][FB] nav-settings onclick fallback'); if (typeof window.showView === 'function') window.showView('settings'); else renderSettings(); } catch (err) { console.error('[Boot][FB] nav-settings onclick error', err); } };
  console.debug('[Boot][FB] nav-settings fallback onclick installed');
      }
    } catch (err) { console.error('[Boot][FB] nav fallback install error', err); }

    // Header buttons
    const editBtn = document.getElementById('edit-mode-toggle');
    if (editBtn) editBtn.addEventListener('click', () => { if (typeof window.toggleEditMode === 'function') window.toggleEditMode(); else console.debug('[Boot] toggleEditMode not available'); });
    const newPlayerBtn = document.getElementById('new-player-guide-btn');
    if (newPlayerBtn) newPlayerBtn.addEventListener('click', () => { if (typeof window.openModal === 'function') window.openModal('new-player-guide-modal'); });

    // Collection search & filters
    const searchBtn = document.getElementById('search-card-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => { if (typeof window.searchForCard === 'function') window.searchForCard('collection'); });
    const cardSearchInput = document.getElementById('card-search-input');
    if (cardSearchInput) cardSearchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter' && typeof window.searchForCard === 'function') window.searchForCard('collection'); });

    ['filter-text','collection-group-by-1','collection-group-by-2','hide-in-deck-checkbox'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', (e) => {
        try {
          if (id === 'filter-text' && typeof window.applyCollectionFilter === 'function') {
            window.applyCollectionFilter(e.target.value || '');
          }
          if (typeof window.renderPaginatedCollection === 'function') { window.renderPaginatedCollection(); }
        } catch (err) { console.error('[Boot][ERR] filter change handler threw', err); }
      });
      el.addEventListener('input', (e) => {
        try {
          if (id === 'filter-text' && typeof window.applyCollectionFilter === 'function') {
            window.applyCollectionFilter(e.target.value || '');
          }
          if (typeof window.renderPaginatedCollection === 'function') { window.renderPaginatedCollection(); }
        } catch (err) { console.error('[Boot][ERR] filter input handler threw', err); }
      });
    });

    // KPI toggles debug wiring: log clicks and invoke toggle if present
    try {
      // Use event delegation for KPI bar so newly-inserted KPI items are handled
      const kpiBar = document.getElementById('collection-kpi-bar');
      if (kpiBar) {
        kpiBar.addEventListener('click', (e) => {
          const target = e.target.closest('[data-metric]');
          console.debug('[Boot][DBG] KPI bar click, target=', target);
          if (!target) return;
          const metric = target.dataset.metric;
          try {
            if (metric && typeof window.toggleKpiMetric === 'function') {
              window.toggleKpiMetric(metric);
              console.debug('[Boot][DBG] toggleKpiMetric invoked for', metric);
            } else if (!metric) {
              console.warn('[Boot][DBG] KPI target missing data-metric attribute', target);
            } else {
              console.warn('[Boot][DBG] toggleKpiMetric not present on window');
            }
          } catch (err) { console.error('[Boot][ERR] KPI delegation handler threw', err); }
        });
      }
    } catch (err) { console.error('[Boot][ERR] KPI wiring failed', err); }

    // Grid size buttons
    document.querySelectorAll('.grid-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.grid-size-btn').forEach((b) => b.classList.remove('bg-indigo-600','text-white'));
        btn.classList.add('bg-indigo-600','text-white');
        if (btn.dataset && btn.dataset.size) window.collectionGridSize = btn.dataset.size;
        if (typeof window.renderPaginatedCollection === 'function' && window.collectionViewMode === 'grid') window.renderPaginatedCollection();
      });
    });

    // View toggles
    document.querySelectorAll('.view-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.id === 'view-toggle-grid') {
          window.collectionViewMode = 'grid';
          const other = document.getElementById('view-toggle-table'); if (other) other.classList.remove('bg-indigo-600','text-white');
          btn.classList.add('bg-indigo-600','text-white');
        } else {
          window.collectionViewMode = 'table';
          const other = document.getElementById('view-toggle-grid'); if (other) other.classList.remove('bg-indigo-600','text-white');
          btn.classList.add('bg-indigo-600','text-white');
        }
        if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
      });
    });

    const resetFilters = document.getElementById('reset-filters-btn');
    if (resetFilters) resetFilters.addEventListener('click', () => {
      const ft = document.getElementById('filter-text'); if (ft) ft.value = '';
      const g1 = document.getElementById('collection-group-by-1'); if (g1) g1.value = '';
      const g2 = document.getElementById('collection-group-by-2'); if (g2) g2.value = '';
      const hid = document.getElementById('hide-in-deck-checkbox'); if (hid) hid.checked = false;
      if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
    });

    // Modal backdrops
    document.querySelectorAll('.modal-backdrop').forEach((modal) => {
      modal.addEventListener('click', (e) => { if (e.target === modal && typeof window.closeModal === 'function') window.closeModal(modal.id); });
    });

    // Close buttons & common modal controls (best-effort)
    const closeMap = [
      ['close-versions-modal-btn','card-versions-modal'],
      ['close-card-details-btn','card-details-modal'],
      ['edit-card-details-btn', null] // toggle handled elsewhere
    ];
    closeMap.forEach(([btnId, modalId]) => {
      const b = document.getElementById(btnId);
      if (!b) return;
      b.addEventListener('click', () => { if (modalId && typeof window.closeModal === 'function') window.closeModal(modalId); if (btnId === 'edit-card-details-btn' && typeof window.toggleCardDetailsEditMode === 'function') window.toggleCardDetailsEditMode(); });
    });

    // Add cards to deck modal basic listeners (close/cancel)
    const closeAdd = document.getElementById('close-add-cards-modal-btn'); if (closeAdd) closeAdd.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('add-cards-to-deck-modal'); });
    const cancelAdd = document.getElementById('cancel-add-cards-to-deck-btn'); if (cancelAdd) cancelAdd.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('add-cards-to-deck-modal'); });

    // Deck creation, form submit and related
    const createDeckBtn = document.getElementById('create-deck-btn'); if (createDeckBtn) createDeckBtn.addEventListener('click', () => { if (typeof window.openDeckCreationModal === 'function') window.openDeckCreationModal(); });
    const deckForm = document.getElementById('deck-creation-form'); if (deckForm) deckForm.addEventListener('submit', (e) => { e.preventDefault(); if (typeof window.handleDeckCreationSubmit === 'function') window.handleDeckCreationSubmit(e); });
    const cancelDeckBtn = document.getElementById('cancel-deck-btn'); if (cancelDeckBtn) cancelDeckBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('deck-creation-modal'); });
    const deckFormatSelect = document.getElementById('deck-format-select'); if (deckFormatSelect) deckFormatSelect.addEventListener('change', (e) => { const container = document.getElementById('commander-selection-container'); if (!container) return; if (e.target.value === 'commander') container.classList.remove('hidden'); else container.classList.add('hidden'); });

    document.querySelectorAll('.commander-source-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.commander-source-btn').forEach((b) => { b.classList.remove('border-indigo-500','text-white'); b.classList.add('border-transparent','text-gray-400'); });
        e.currentTarget.classList.add('border-indigo-500','text-white');
        e.currentTarget.classList.remove('border-transparent','text-gray-400');
        const fromCollection = e.currentTarget.id === 'commander-source-collection-btn';
        const coll = document.getElementById('commander-from-collection');
        const search = document.getElementById('commander-from-search');
        if (fromCollection) { if (coll) coll.classList.remove('hidden'); if (search) search.classList.add('hidden'); } else { if (coll) coll.classList.add('hidden'); if (search) search.classList.remove('hidden'); }
      });
    });

    const commanderSearchBtn = document.getElementById('commander-search-btn'); if (commanderSearchBtn) commanderSearchBtn.addEventListener('click', () => { if (typeof window.searchForCommander === 'function') window.searchForCommander(); });
    const commanderSearchInput = document.getElementById('commander-search-input'); if (commanderSearchInput) commanderSearchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter' && typeof window.searchForCommander === 'function') window.searchForCommander(); });
    const commanderFilter = document.getElementById('commander-collection-filter'); if (commanderFilter) commanderFilter.addEventListener('input', () => { if (typeof window.filterCommanderCollectionList === 'function') window.filterCommanderCollectionList(); });

    // AI Blueprint Modal
    const closeBlueprint = document.getElementById('close-blueprint-modal-btn'); if (closeBlueprint) closeBlueprint.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('ai-blueprint-modal'); });
    const cancelBlueprint = document.getElementById('cancel-blueprint-btn'); if (cancelBlueprint) cancelBlueprint.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('ai-blueprint-modal'); });
    const confirmBlueprint = document.getElementById('confirm-blueprint-btn'); if (confirmBlueprint) confirmBlueprint.addEventListener('click', () => { if (typeof window.createDeckFromBlueprint === 'function') window.createDeckFromBlueprint(); });

    // AI chat / rules / mtg chat handlers
    const closeAi = document.getElementById('close-ai-modal-btn'); if (closeAi) closeAi.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('ai-suggestions-modal'); });
    const aiForm = document.getElementById('ai-chat-form'); if (aiForm) aiForm.addEventListener('submit', (e) => { e.preventDefault(); if (typeof window.handleAiChat === 'function') window.handleAiChat(e); });
    const closeRule = document.getElementById('close-rule-lookup-modal-btn'); if (closeRule) closeRule.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('rule-lookup-modal'); });
    const ruleForm = document.getElementById('rule-lookup-form'); if (ruleForm) ruleForm.addEventListener('submit', (e) => { e.preventDefault(); if (typeof window.handleRuleLookup === 'function') window.handleRuleLookup(e); });
    const closeMtg = document.getElementById('close-mtg-chat-modal-btn'); if (closeMtg) closeMtg.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('mtg-chat-modal'); });
    const mtgForm = document.getElementById('mtg-chat-form'); if (mtgForm) mtgForm.addEventListener('submit', (e) => { e.preventDefault(); if (typeof window.handleMtgChat === 'function') window.handleMtgChat(e); });
    const closeNewPlayer = document.getElementById('close-new-player-guide-modal-btn'); if (closeNewPlayer) closeNewPlayer.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('new-player-guide-modal'); });

    // Confirmation modals
    const cancelActionBtn = document.getElementById('cancel-action-btn'); if (cancelActionBtn) cancelActionBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('confirmation-modal'); });
    const notificationClose = document.getElementById('notification-close-btn'); if (notificationClose) notificationClose.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('notification-modal'); });

    const cancelDeleteDeckBtn = document.getElementById('cancel-delete-deck-btn'); if (cancelDeleteDeckBtn) cancelDeleteDeckBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('deck-delete-options-modal'); });
    const deleteDeckOnly = document.getElementById('delete-deck-only-btn'); if (deleteDeckOnly) deleteDeckOnly.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId || e.currentTarget.dataset.id; if (typeof window.deleteDeck === 'function') window.deleteDeck(id, false); });
    const deleteDeckAndCards = document.getElementById('delete-deck-and-cards-btn'); if (deleteDeckAndCards) deleteDeckAndCards.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId || e.currentTarget.dataset.id; if (typeof window.deleteDeck === 'function') window.deleteDeck(id, true); });

    // Settings & Data Management
    const logoutBtn = document.getElementById('logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', () => { if (typeof window.signOut === 'function') { window.signOut(window.auth).then(() => { location.reload(); }).catch(() => { location.reload(); }); } else { location.reload(); } });
    const clearDataBtn = document.getElementById('clear-data-btn'); if (clearDataBtn) clearDataBtn.addEventListener('click', () => { if (typeof window.confirmClearAllData === 'function') window.confirmClearAllData(); });
    const exportBtn = document.getElementById('export-all-data-btn'); if (exportBtn) exportBtn.addEventListener('click', () => { if (typeof window.exportAllData === 'function') window.exportAllData(); });
    const importAllInput = document.getElementById('import-all-data-input'); if (importAllInput) importAllInput.addEventListener('change', (e) => { if (typeof window.handleImportAllData === 'function') window.handleImportAllData(e); });
    const importDeckInput = document.getElementById('import-deck-data-input'); if (importDeckInput) importDeckInput.addEventListener('change', (e) => { if (typeof window.handleImportDeckData === 'function') window.handleImportDeckData(e); });

    // Data import modal actions
    const cancelImportBtn = document.getElementById('cancel-import-btn'); if (cancelImportBtn) cancelImportBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('data-import-options-modal'); });
    const importMergeBtn = document.getElementById('import-merge-btn'); if (importMergeBtn) importMergeBtn.addEventListener('click', () => { if (typeof window.processDataImport === 'function') window.processDataImport(false); });
    const importReplaceBtn = document.getElementById('import-replace-btn'); if (importReplaceBtn) importReplaceBtn.addEventListener('click', () => { if (typeof window.processDataImport === 'function') window.processDataImport(true); });

    // Login handlers
    const emailLoginBtn = document.getElementById('email-login-btn'); if (emailLoginBtn) emailLoginBtn.addEventListener('click', () => { if (typeof window.handleEmailLogin === 'function') window.handleEmailLogin(); });
    const signupBtn = document.getElementById('signup-btn'); if (signupBtn) signupBtn.addEventListener('click', () => { if (typeof window.handleEmailSignup === 'function') window.handleEmailSignup(); });
    const googleLoginBtn = document.getElementById('login-with-google-btn'); if (googleLoginBtn) googleLoginBtn.addEventListener('click', () => { if (typeof window.handleGoogleLogin === 'function') window.handleGoogleLogin(); });

    // Development debug: global click capture to diagnose why nav clicks may be inert
    // Removed verbose global click capture used during debugging.
    // If further click diagnostics are needed, re-enable locally in dev.

  } catch (err) {
    console.error('[Boot.setupGlobalListeners] error', err);
  }
}
