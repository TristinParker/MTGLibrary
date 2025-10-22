import './index.js'; // ensures firebase, auth, settings are loaded and window globals set
import { initCollectionModule } from '../pages/collection.js';
import { initDecksModule } from '../pages/decks.js';
import { initSingleDeckModule } from '../pages/singleDeck.js';

export function bootApp() {
  initCollectionModule();
  initDecksModule();
  initSingleDeckModule();
  // Ensure playstyle module is loaded at boot so Settings can render the widget immediately
  try {
    import('../settings/playstyle.js').then(mod => { if (window.userId && typeof mod.loadPlaystyleForUser === 'function') mod.loadPlaystyleForUser(window.userId); }).catch(e => {});
  } catch (e) { /* ignore */ }
  // Attempt to load saved views for the signed-in user so the Saved Views
  // dropdown is populated and any active view can be applied early.
  try {
    if (typeof window !== 'undefined' && window.userId && typeof window.loadSavedViewsFromFirestore === 'function') {
      window.loadSavedViewsFromFirestore(window.userId).then((views) => {
        // if there's an active view in settings, apply it via setActiveViewById
        try {
          if (typeof window.setActiveViewById === 'function') {
            // window.settings module will set activeViewId when loaded; try to use its value
            const active = window.activeViewId || null;
            if (active) window.setActiveViewById(active);
          }
        } catch (err) { console.debug('[Boot] apply active saved view failed', err); }
        // After saved views load, apply any persisted UI preferences (grid size, view mode, hide-in-deck)
        try {
          const applyPrefs = () => {
            try {
              if (typeof window.uiPreferences !== 'undefined') {
                const prefs = window.uiPreferences || {};
                // Grid size
                const size = prefs.gridSize || window.collectionGridSize || 'md';
                const btn = document.querySelector(`.grid-size-btn[data-size="${size}"]`);
                if (btn) {
                  document.querySelectorAll('.grid-size-btn').forEach((b) => b.classList.remove('bg-indigo-600','text-white'));
                  btn.classList.add('bg-indigo-600','text-white');
                  window.collectionGridSize = size;
                }
                // View mode
                const mode = prefs.viewMode || window.collectionViewMode || 'grid';
                if (mode === 'grid') {
                  const g = document.getElementById('view-toggle-grid');
                  const t = document.getElementById('view-toggle-table');
                  if (t) t.classList.remove('bg-indigo-600','text-white');
                  if (g) g.classList.add('bg-indigo-600','text-white');
                  window.collectionViewMode = 'grid';
                } else {
                  const g = document.getElementById('view-toggle-grid');
                  const t = document.getElementById('view-toggle-table');
                  if (g) g.classList.remove('bg-indigo-600','text-white');
                  if (t) t.classList.add('bg-indigo-600','text-white');
                  window.collectionViewMode = 'table';
                }
                // hide in decks
                try {
                  const hid = document.getElementById('hide-in-deck-checkbox');
                  if (hid && typeof prefs.hideInDecks !== 'undefined') hid.checked = !!prefs.hideInDecks;
                } catch (e) {}
                // Trigger initial render so UI reflects preferences
                if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
              }
            } catch (e) { console.debug('[Boot] applyUIPreferences failed', e); }
          };
          // Delay slightly to allow any other init handlers to finish mounting UI
          setTimeout(applyPrefs, 50);
        } catch (e) { console.debug('[Boot] apply uiPreferences skipped', e); }
      }).catch(err => { console.debug('[Boot] loadSavedViewsFromFirestore failed', err); });
    }
  } catch (e) { console.debug('[Boot] saved views auto-load skipped', e); }
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
  // Also expose setupGlobalListeners to legacy inline scripts that expect a global function
  window.setupGlobalListeners = setupGlobalListeners;
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
              // If user opened Settings, ensure playstyle module is loaded and rendered
              if (key === 'settings') {
                try { import('../settings/playstyle.js').then(mod => { if (window.userId && typeof mod.loadPlaystyleForUser === 'function') mod.loadPlaystyleForUser(window.userId); }); } catch (e) {}
              }
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
      navSettings.onclick = (e) => { try { console.debug('[Boot][FB] nav-settings onclick fallback'); if (typeof window.showView === 'function') window.showView('settings'); else renderSettings(); if (typeof window.renderSettingsSavedViews === 'function') window.renderSettingsSavedViews(); try { import('../settings/playstyle.js').then(mod => { if (window.userId && typeof mod.loadPlaystyleForUser === 'function') mod.loadPlaystyleForUser(window.userId); }); } catch (e) {} } catch (err) { console.error('[Boot][FB] nav-settings onclick error', err); } };
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
          // persist hide-in-deck preference
          if (id === 'hide-in-deck-checkbox') {
            try { if (typeof window.uiPreferences !== 'undefined') window.uiPreferences.hideInDecks = !!e.target.checked; } catch (pe) {}
            try { if (window.userId && typeof window.persistSettingsForUser === 'function') window.persistSettingsForUser(window.userId); } catch(pe) {}
          }
          if (typeof window.renderPaginatedCollection === 'function') { window.renderPaginatedCollection(); }
        } catch (err) { console.error('[Boot][ERR] filter change handler threw', err); }
      });
      el.addEventListener('input', (e) => {
        try {
          if (id === 'filter-text' && typeof window.applyCollectionFilter === 'function') {
            window.applyCollectionFilter(e.target.value || '');
          }
          // persist hide-in-deck preference for input events as well
          if (id === 'hide-in-deck-checkbox') {
            try { if (typeof window.uiPreferences !== 'undefined') window.uiPreferences.hideInDecks = !!e.target.checked; } catch (pe) {}
            try { if (window.userId && typeof window.persistSettingsForUser === 'function') window.persistSettingsForUser(window.userId); } catch(pe) {}
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
        try { if (typeof window.uiPreferences !== 'undefined') window.uiPreferences.gridSize = window.collectionGridSize; } catch(e){}
        try { if (window.userId && typeof window.persistSettingsForUser === 'function') window.persistSettingsForUser(window.userId); } catch(e){}
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
        try { if (typeof window.uiPreferences !== 'undefined') window.uiPreferences.viewMode = window.collectionViewMode; } catch(e){}
        try { if (window.userId && typeof window.persistSettingsForUser === 'function') window.persistSettingsForUser(window.userId); } catch(e){}
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
    const mtgForm = document.getElementById('mtg-chat-form');
    try {
      if (mtgForm && !window.__boot_mtg_listener_installed) {
        mtgForm.addEventListener('submit', (e) => { try { e.preventDefault(); const input = document.getElementById('mtg-chat-input'); const m = input ? input.value : null; if (typeof window.handleMtgChat === 'function') window.handleMtgChat(m); } catch (err) { console.error('[Boot] mtgForm submit handler error', err); } });
        window.__boot_mtg_listener_installed = true;
      }
    } catch (err) { console.debug('[Boot] failed to install mtgForm submit listener', err); }
    // Fallback: if some other listener prevents form submission, ensure button click still triggers module handler
    try {
      const aiSubmitBtn = document.querySelector('#ai-chat-form button[type="submit"]');
      if (aiSubmitBtn) aiSubmitBtn.addEventListener('click', (ev) => { try { ev.preventDefault(); const input = document.getElementById('ai-chat-input'); const msg = input ? input.value : null; if (typeof window.__module_handleAiChat === 'function') window.__module_handleAiChat(null, msg); } catch (e) { console.error('AI submit button fallback error', e); } });
      const ruleSubmitBtn = document.querySelector('#rule-lookup-form button[type="submit"]');
      if (ruleSubmitBtn) ruleSubmitBtn.addEventListener('click', (ev) => { try { ev.preventDefault(); const input = document.getElementById('rule-lookup-input'); const q = input ? input.value : null; if (typeof window.__module_handleRuleLookup === 'function') window.__module_handleRuleLookup(q); } catch (e) { console.error('Rule submit button fallback error', e); } });
  const mtgSubmitBtn = document.querySelector('#mtg-chat-form button[type="submit"]');
  if (mtgSubmitBtn) mtgSubmitBtn.addEventListener('click', (ev) => { try { ev.preventDefault(); const input = document.getElementById('mtg-chat-input'); const m = input ? input.value : null; if (typeof window.handleMtgChat === 'function') window.handleMtgChat(m); } catch (e) { console.error('MTG submit button fallback error', e); } });
    } catch (err) { console.warn('Failed to install button-level fallback click handlers', err); }
    const closeNewPlayer = document.getElementById('close-new-player-guide-modal-btn'); if (closeNewPlayer) closeNewPlayer.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('new-player-guide-modal'); });

    // Confirmation modals
    const cancelActionBtn = document.getElementById('cancel-action-btn'); if (cancelActionBtn) cancelActionBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('confirmation-modal'); });
    const notificationClose = document.getElementById('notification-close-btn'); if (notificationClose) notificationClose.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('notification-modal'); });

    const cancelDeleteDeckBtn = document.getElementById('cancel-delete-deck-btn'); if (cancelDeleteDeckBtn) cancelDeleteDeckBtn.addEventListener('click', () => { if (typeof window.closeModal === 'function') window.closeModal('deck-delete-options-modal'); });
    const deleteDeckOnly = document.getElementById('delete-deck-only-btn'); if (deleteDeckOnly) deleteDeckOnly.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId || e.currentTarget.dataset.id; if (typeof window.deleteDeck === 'function') window.deleteDeck(id, false); });
    const deleteDeckAndCards = document.getElementById('delete-deck-and-cards-btn'); if (deleteDeckAndCards) deleteDeckAndCards.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId || e.currentTarget.dataset.id; if (typeof window.deleteDeck === 'function') window.deleteDeck(id, true); });

    // Settings & Data Management
    const logoutBtn = document.getElementById('logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', () => { if (typeof window.signOut === 'function') { window.signOut(window.auth).then(() => { location.reload(); }).catch(() => { location.reload(); }); } else { location.reload(); } });
    const clearDataBtn = document.getElementById('clear-data-btn'); if (clearDataBtn) clearDataBtn.addEventListener('click', () => {
      // Prefer the new centralized data API if available
      if (typeof window.clearAllUserData === 'function' && window.userId) {
        // Ask inline confirmation first to preserve UX
        if (confirm && confirm('This will permanently delete all your account data. Continue?')) {
          window.clearAllUserData(window.userId).then(ok => { if (ok) { try { if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection(); } catch(e){} } });
        }
        return;
      }
      if (typeof window.confirmClearAllData === 'function') window.confirmClearAllData();
    });
    const exportBtn = document.getElementById('export-all-data-btn'); if (exportBtn) exportBtn.addEventListener('click', () => { if (typeof window.exportAllData === 'function') window.exportAllData(); });
    const importAllInput = document.getElementById('import-all-data-input'); if (importAllInput) importAllInput.addEventListener('change', (e) => { if (typeof window.handleImportAllData === 'function') window.handleImportAllData(e); });
    const importDeckInput = document.getElementById('import-deck-data-input'); if (importDeckInput) importDeckInput.addEventListener('change', (e) => { if (typeof window.handleImportDeckData === 'function') window.handleImportDeckData(e); });

    // Manage Saved Views modal wiring
    try {
      const manageBtn = document.getElementById('manage-views-btn');
      const manageModal = document.getElementById('manage-views-modal');
      const manageList = document.getElementById('manage-views-list');
      const closeManageBtn = document.getElementById('close-manage-views-modal-btn');

      const openModal = (id) => {
        if (typeof window.openModal === 'function') return window.openModal(id);
        const m = document.getElementById(id); if (!m) return; m.classList.remove('hidden');
      };
      const closeModal = (id) => {
        if (typeof window.closeModal === 'function') return window.closeModal(id);
        const m = document.getElementById(id); if (!m) return; m.classList.add('hidden');
      };

          async function renderManageViews() {
        try {
              // Ensure saved views are loaded (support local fallback even without userId)
              if ((!window.savedViews || !window.savedViews.length) && typeof window.loadSavedViewsFromFirestore === 'function') {
                await window.loadSavedViewsFromFirestore(window.userId);
              }
          const views = window.savedViews || [];
          if (!manageList) return;
          if (views.length === 0) {
            manageList.innerHTML = '<div class="text-sm text-gray-400">No saved views</div>';
            return;
          }
          manageList.innerHTML = views.map(v => `
            <div class="flex items-center justify-between bg-gray-900 p-2 rounded">
              <div class="flex items-center gap-2">
                <strong class="manage-view-name">${v.name}</strong>
              </div>
              <div class="flex items-center gap-2">
                <button data-id="${v.id}" class="apply-view-btn bg-indigo-600 text-white px-2 py-1 rounded text-sm">Apply</button>
                <button data-id="${v.id}" class="rename-view-btn bg-gray-600 text-white px-2 py-1 rounded text-sm">Rename</button>
                <button data-id="${v.id}" class="delete-view-btn bg-red-700 text-white px-2 py-1 rounded text-sm">Delete</button>
              </div>
            </div>
          `).join('');

          // Wire buttons
          manageList.querySelectorAll('.apply-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id; if (!id) return; try { if (typeof window.setActiveViewById === 'function') window.setActiveViewById(id); } catch (err) { console.debug('apply view failed', err); }
          }));

          manageList.querySelectorAll('.delete-view-btn').forEach(btn => btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id; if (!id) return;
            if (!confirm('Delete this saved view?')) return;
            try {
              if (typeof window.deleteViewFromFirestore === 'function') {
                await window.deleteViewFromFirestore(window.userId, id);
              } else {
                window.savedViews = (window.savedViews||[]).filter(v=>v.id !== id);
                if (typeof window.persistSavedViewsToFirestore === 'function') await window.persistSavedViewsToFirestore(window.userId);
              }
              await renderManageViews();
              if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(window.savedViews||[]);
            } catch (err) { console.error('delete saved view failed', err); }
          }));

          manageList.querySelectorAll('.rename-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id; if (!id) return;
            // find the nearest ancestor that contains the .manage-view-name element
            let cur = e.currentTarget.parentElement;
            while (cur && !cur.querySelector('.manage-view-name')) cur = cur.parentElement;
            const nameNode = cur ? cur.querySelector('.manage-view-name') : null;
            const oldName = nameNode ? nameNode.textContent : '';
            // Replace name with input + save/cancel
            const input = document.createElement('input'); input.type = 'text'; input.value = oldName; input.className = 'bg-gray-700 border border-gray-600 px-2 py-1 rounded text-sm';
            const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save'; saveBtn.className = 'bg-green-600 text-white px-2 py-1 rounded text-sm ml-2';
            const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.className = 'bg-gray-600 text-white px-2 py-1 rounded text-sm ml-2';
            const container = nameNode ? nameNode.parentElement : null;
            container.innerHTML = '';
            container.appendChild(input); container.appendChild(saveBtn); container.appendChild(cancelBtn);

            saveBtn.addEventListener('click', async () => {
              const newName = input.value || oldName;
              try {
                const vIdx = (window.savedViews||[]).findIndex(x => x.id === id);
                if (vIdx >= 0) {
                  window.savedViews[vIdx].name = newName;
                  // Persist change (allow settings module to handle local fallback)
                  if (typeof window.persistSavedViewsToFirestore === 'function') {
                    await window.persistSavedViewsToFirestore(window.userId);
                  }
                  if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(window.savedViews||[]);
                }
              } catch (err) { console.error('rename save failed', err); }
              await renderManageViews();
            });
            cancelBtn.addEventListener('click', () => { renderManageViews(); });
          }));

        } catch (err) { console.error('renderManageViews failed', err); }
      }

      manageBtn?.addEventListener('click', async () => { openModal('manage-views-modal'); await renderManageViews(); });
      closeManageBtn?.addEventListener('click', () => { closeModal('manage-views-modal'); });
    } catch (err) { console.debug('[Boot] manage views wiring failed', err); }

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
