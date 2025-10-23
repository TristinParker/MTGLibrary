import { db, appId } from '../main/index.js';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast } from '../lib/ui.js';

export let modalVisibilitySettings = {
  count: true,
  finish: true,
  condition: true,
  purchasePrice: true,
  notes: true,
};

// UI preferences persisted per-user: gridSize, viewMode, hideInDecks
export let uiPreferences = {
  gridSize: 'md',
  viewMode: 'grid',
  hideInDecks: false,
};

export let savedViews = [];
export let activeViewId = null;

export async function loadSettingsForUser(userId) {
  if (!userId) return;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const settings = userDoc.data().settings;
      if (settings && settings.modalVisibility) modalVisibilitySettings = settings.modalVisibility;
      savedViews = settings.savedViews || [];
      activeViewId = settings.activeViewId || null;
      uiPreferences = settings.uiPreferences || uiPreferences;
    }
  } catch (e) {
    console.error('Error loading settings for user', e);
  }
  return { modalVisibilitySettings, savedViews, activeViewId };
}

export async function persistSettingsForUser(userId) {
  if (!userId) return;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    await setDoc(userDocRef, { settings: { ...( (await getDoc(userDocRef)).data()?.settings || {} ), savedViews, activeViewId, modalVisibility: modalVisibilitySettings, uiPreferences } }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving settings for user', e);
    return false;
  }
}

console.log('[Settings] Module loaded.');

// --- Saved Views and helper functions migrated here ---
export async function loadSavedViewsFromFirestore(userId) {
  console.debug('[Settings] loadSavedViewsFromFirestore called for userId=', userId);
  // Load saved views and active preferences from Firestore for the given userId.
  // If no userId is provided, do not load or attempt a local fallback — saved views are Firestore-only.
  if (!userId) {
    console.debug('[Settings] loadSavedViewsFromFirestore skipped: no userId (saved views are Firestore-only)');
    savedViews = [];
    activeViewId = null;
    try { if (typeof window !== 'undefined') { window.savedViews = savedViews; window.activeViewId = activeViewId; } } catch (e) {}
    return savedViews;
  }
  // Firestore-backed load
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const settings = userDoc.data().settings || {};
      // prefer per-view collection if present (backwards compat)
      savedViews = settings.savedViews || [];
      activeViewId = settings.activeViewId || null;
      uiPreferences = settings.uiPreferences || uiPreferences;
    } else {
      savedViews = [];
      activeViewId = null;
    }
    // If aggregated savedViews is empty, try loading from the per-view subcollection (backwards compat)
    try {
      if ((!savedViews || savedViews.length === 0)) {
        const base = `artifacts/${appId}/users/${userId}/views`;
        const colRef = collection(db, base);
        const snap = await getDocs(colRef);
        const docs = [];
        snap.forEach(d => docs.push(Object.assign({ id: d.id }, d.data())));
        if (docs.length) {
          savedViews = docs;
          console.debug('[Settings] loaded saved views from views subcollection, count=', docs.length);
        }
      }
    } catch (e) { console.debug('[Settings] fallback load from views subcollection failed', e); }
    console.debug('[Settings] loadSavedViewsFromFirestore completed for user', userId, 'viewsCount=', (savedViews||[]).length, 'activeViewId=', activeViewId);
    try { if (typeof window !== 'undefined') { window.savedViews = savedViews; window.activeViewId = activeViewId; window.uiPreferences = uiPreferences; } } catch (e) {}
    if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(savedViews);
    if (activeViewId && typeof setActiveViewById === 'function') setActiveViewById(activeViewId);
    return savedViews;
  } catch (err) {
    console.error('[Settings] loadSavedViewsFromFirestore error', err);
    showToast('Failed to load saved views.', 'error');
    return [];
  }
}

export async function persistSavedViewsToFirestore(userId) {
  // Persist savedViews + activeViewId + uiPreferences to Firestore for the given userId.
  // Do not persist locally when no userId - saved views are Firestore-only.
  if (!userId) {
    console.debug('[Settings] persistSavedViewsToFirestore skipped: no userId (views are Firestore-only)');
    showToast('Sign in to persist saved views.', 'warning');
    return false;
  }
  try {
    // write aggregated settings to the user doc
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const current = (await getDoc(userDocRef)).data()?.settings || {};
    console.debug('[Settings] persistSavedViewsToFirestore: writing aggregated settings to user doc', userId, 'viewsCount=', (savedViews||[]).length);
    await setDoc(userDocRef, { settings: Object.assign({}, current, { savedViews: savedViews || [], activeViewId, uiPreferences, modalVisibility: modalVisibilitySettings }) }, { merge: true });
    // Also persist per-view documents to user's views collection for easier queries
    const base = `artifacts/${appId}/users/${userId}/views`;
    for (const v of (savedViews || [])) {
      if (!v.id) continue;
      const vRef = doc(db, base, v.id);
      console.debug('[Settings] persistSavedViewsToFirestore: writing view doc', v.id);
      await setDoc(vRef, v, { merge: true });
    }
    showToast('Saved views persisted.', 'success');
    return true;
  } catch (err) {
    console.error('[Settings] persistSavedViewsToFirestore error', err);
    showToast('Failed to persist saved views.', 'error');
    return false;
  }
}

export function renderSavedViewsSelect(views = savedViews) {
  const el = document.getElementById('saved-views-select');
  if (!el) return;
  // Prefer any up-to-date window-scoped state (other modules may set window.savedViews)
  try { if (typeof window !== 'undefined' && Array.isArray(window.savedViews) && window.savedViews.length) { views = window.savedViews; savedViews = window.savedViews; } } catch (e) {}
  // replace content and avoid stacking multiple listeners by using onchange
  el.innerHTML = `<option value="">(none)</option>` + (views || []).map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  // prefer window.activeViewId if set
  try { el.value = (typeof window !== 'undefined' && window.activeViewId) || activeViewId || ''; } catch (e) {}
  el.onchange = (e) => {
    const vid = e.target.value;
    if (vid) setActiveViewById(vid);
    else {
      activeViewId = null;
      try { if (typeof window !== 'undefined') window.activeViewId = null; } catch (er) {}
      if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
    }
  };
  // Keep global window state in sync after rendering
  try { if (typeof window !== 'undefined') { window.savedViews = savedViews; window.activeViewId = activeViewId; } } catch (e) {}
}

export function renderModalVisibilitySettings() {
  const container = document.getElementById('modal-visibility-settings');
  if (!container) return;
  container.innerHTML = '';
  // Ensure defaults exist
  const fields = Object.keys(modalVisibilitySettings || { count: true, finish: true, condition: true, purchasePrice: true, notes: true });
  fields.forEach(field => {
    const id = `modal-vis-${field}`;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2';
    div.innerHTML = `
      <label class="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" id="${id}" class="h-4 w-4" ${modalVisibilitySettings[field] ? 'checked' : ''} />
        <span class="capitalize">${field}</span>
      </label>
    `;
    container.appendChild(div);
    const cb = document.getElementById(id);
    if (!cb) return;
    cb.addEventListener('change', async (e) => {
      modalVisibilitySettings[field] = !!e.target.checked;
      // Trigger UI updates if renderers exist
      try { if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection(); } catch (err) {}
      try { if (typeof window.renderCardDetailsModal === 'function') window.renderCardDetailsModal(); } catch (err) {}
      // Persist settings for current user when possible
      try { if (window && window.userId) await persistSettingsForUser(window.userId); } catch (err) { console.debug('[Settings] persist modal visibility failed', err); }
    });
  });
}

export function buildFilterPredicate(rule) {
  if (!rule) return () => true;
  const op = (rule.op || rule.operator || '').toLowerCase();
  switch (op) {
    case 'contains': return (c) => (c[rule.field] || '').toString().toLowerCase().includes((rule.value||'').toString().toLowerCase());
    case 'equals': return (c) => (c[rule.field]||'').toString().toLowerCase() === (rule.value||'').toString().toLowerCase();
    case 'gt': return (c) => parseFloat(c[rule.field]||0) > parseFloat(rule.value||0);
    case 'lt': return (c) => parseFloat(c[rule.field]||0) < parseFloat(rule.value||0);
    default: return () => true;
  }
}

export function applySavedViewToCards(cardsArr) {
  if (!activeViewId) return cardsArr;
  const view = savedViews.find(v => v.id === activeViewId);
  if (!view) return cardsArr;
  let filtered = cardsArr;
  if (Array.isArray(view.filters) && view.filters.length) {
    const predicates = view.filters.map(buildFilterPredicate);
    filtered = filtered.filter(card => predicates.every(pred => pred(card)));
  }
  if (Array.isArray(view.sorts) && view.sorts.length) {
    const sorts = view.sorts;
    filtered = [...filtered].sort((a,b) => {
      for (const s of sorts) {
        const col = s.column; const dir = s.direction === 'asc' ? 1 : -1;
        let va = a[col] ?? ''; let vb = b[col] ?? '';
        if (col === 'price') { va = parseFloat(a.prices?.usd||0); vb = parseFloat(b.prices?.usd||0); }
        if (col === 'count') { va = a.count||1; vb = b.count||1; }
        if (typeof va === 'string') va = va.toLowerCase(); if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return -1 * dir; if (va > vb) return 1 * dir;
      }
      return 0;
    });
  }
  return filtered;
}

export async function saveViewToFirestore(userId, view) {
  if (!view) return null;
  // normalize known keys (compat: operator vs op)
  try {
    view.filters = (view.filters || []).map(f => ({ field: f.column || f.field, operator: f.operator || f.op, value: f.value }));
    view.sorts = (view.sorts || []).map(s => ({ column: s.column, direction: s.direction || s.dir || 'asc' }));
    view.groupBy = Array.isArray(view.groupBy) ? view.groupBy.filter(Boolean) : [];
  } catch (e) { /* best-effort normalize */ }
  // Require userId (Firestore) for persistence
  if (!userId) {
    console.debug('[Settings] saveViewToFirestore skipped: no userId (views are Firestore-only)');
    showToast('Sign in to save views.', 'warning');
    return null;
  }
  // Firestore-backed save
  try {
    const base = `artifacts/${appId}/users/${userId}/views`;
    console.debug('[Settings] saveViewToFirestore: saving view for user', userId, view && view.id);
    if (!view.id) {
      // create new doc
      const colRef = collection(db, base);
      const docRef = await addDoc(colRef, view);
      const saved = Object.assign({ id: docRef.id }, view);
      console.debug('[Settings] saveViewToFirestore: created view doc', docRef.id);
      savedViews.push(saved);
      // update aggregated settings on user doc
      await persistSavedViewsToFirestore(userId);
      try { if (typeof window !== 'undefined') window.savedViews = savedViews; } catch (e) {}
      if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(savedViews);
      showToast('View saved.', 'success');
      return saved;
    } else {
      const vRef = doc(db, base, view.id);
      await setDoc(vRef, view, { merge: true });
      console.debug('[Settings] saveViewToFirestore: updated view doc', view.id);
      const idx = savedViews.findIndex(v => v.id === view.id);
      const updated = Object.assign({ id: view.id }, view);
      if (idx >= 0) savedViews[idx] = updated; else savedViews.push(updated);
      await persistSavedViewsToFirestore(userId);
      try { if (typeof window !== 'undefined') window.savedViews = savedViews; } catch (e) {}
      if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(savedViews);
      showToast('View updated.', 'success');
      return updated;
    }
  } catch (err) {
    console.error('[Settings] saveViewToFirestore error', err);
    showToast('Failed to save view.', 'error');
    return null;
  }
}

// Helper for debugging: force reload saved views for current user
export function forceLoadSavedViews(userId) {
  try { return loadSavedViewsFromFirestore(userId || window.userId || null); } catch (e) { console.debug('[Settings] forceLoadSavedViews failed', e); }
}

export async function deleteViewFromFirestore(userId, viewId) {
  if (!viewId) return false;
  if (!userId) {
    console.debug('[Settings] deleteViewFromFirestore skipped: no userId (views are Firestore-only)');
    showToast('Sign in to delete saved views.', 'warning');
    return false;
  }
  try {
    const viewRef = doc(db, `artifacts/${appId}/users/${userId}/views`, viewId);
    await deleteDoc(viewRef);
    savedViews = savedViews.filter(v => v.id !== viewId);
    if (activeViewId === viewId) activeViewId = null;
    await persistSavedViewsToFirestore(userId);
    try { if (typeof window !== 'undefined') window.savedViews = savedViews; } catch (e) {}
    if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(savedViews);
    showToast('Saved view deleted.', 'success');
    return true;
  } catch (err) {
    console.error('[Settings] deleteViewFromFirestore error', err);
    showToast('Failed to delete view.', 'error');
    return false;
  }
}

export async function setActiveViewById(viewId) {
  activeViewId = viewId || null;
  try { if (typeof window !== 'undefined') window.activeViewId = activeViewId; } catch (e) {}
  const view = savedViews.find(v => v.id === viewId) || null;
  // copy view preferences into uiPreferences
  if (view) {
    uiPreferences.gridSize = view.gridSize || uiPreferences.gridSize;
    uiPreferences.viewMode = view.viewMode || uiPreferences.viewMode;
    uiPreferences.hideInDecks = typeof view.hideInDecks !== 'undefined' ? !!view.hideInDecks : uiPreferences.hideInDecks;
    try { if (typeof window !== 'undefined') window.uiPreferences = uiPreferences; } catch (e) {}
  }
  // persist active view + prefs
  try {
    if (typeof window !== 'undefined' && window.userId) {
      await persistSettingsForUser(window.userId);
    } else {
      try { localStorage.setItem('mtglibrary.activeViewId', activeViewId || ''); localStorage.setItem('mtglibrary.uiPreferences', JSON.stringify(uiPreferences || {})); } catch (e) {}
    }
  } catch (e) { console.debug('[Settings] persist active view failed', e); }
  // apply the view through collection/app hook
  try {
    if (typeof window.applySavedView === 'function') { window.applySavedView(view); return; }
  } catch (e) { console.debug('[Settings] applySavedView hook failed', e); }
  if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
}

export function initSettingsModule() {
  if (typeof window !== 'undefined') {
    window.loadSavedViewsFromFirestore = loadSavedViewsFromFirestore;
    window.persistSavedViewsToFirestore = persistSavedViewsToFirestore;
    window.renderSavedViewsSelect = renderSavedViewsSelect;
    window.renderModalVisibilitySettings = renderModalVisibilitySettings;
    window.buildFilterPredicate = buildFilterPredicate;
    window.applySavedViewToCards = applySavedViewToCards;
    window.uiPreferences = uiPreferences;
    window.saveViewToFirestore = saveViewToFirestore;
    window.deleteViewFromFirestore = deleteViewFromFirestore;
    window.setActiveViewById = setActiveViewById;
    // expose current saved views and active id for legacy inline code
    try { window.savedViews = savedViews; window.activeViewId = activeViewId; } catch (e) {}
    // Removed localStorage fallback: saved views are Firestore-only. UI will be updated after loadSavedViewsFromFirestore is called with a valid userId.
  }
  console.log('[Settings] Module initialized');
}

// Render saved views management UI inside the Settings page
export function renderSettingsSavedViews(containerId = 'settings-saved-views-list') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  // Prefer any up-to-date window-scoped state (Collection may have written to window.savedViews)
  try { if (typeof window !== 'undefined' && Array.isArray(window.savedViews) && window.savedViews.length) { savedViews = window.savedViews; activeViewId = window.activeViewId || activeViewId; } } catch (e) {}

  // If we have no saved views yet but a userId might arrive shortly, wait briefly (poll) for up to 2s
  const ensureLoadedAndRender = async () => {
    if ((!savedViews || savedViews.length === 0) && typeof window !== 'undefined' && !window.userId) {
      // poll for userId for up to 2s
      const start = Date.now();
      while (!window.userId && (Date.now() - start) < 2000) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
    // if userId available, attempt to load saved views from Firestore
    if ((!savedViews || savedViews.length === 0) && typeof loadSavedViewsFromFirestore === 'function' && window.userId) {
      try {
        await loadSavedViewsFromFirestore(window.userId);
      } catch (e) { console.debug('[Settings] renderSettingsSavedViews loadSavedViewsFromFirestore failed', e); }
    }

    // continue rendering below after any attempted load
    doRender();
  };

  const doRender = () => {
  // Add header controls: New View
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-3 gap-3';
  header.innerHTML = `<div class="text-lg font-semibold">Saved Views</div><div class="flex items-center gap-2"><select id="settings-edit-select" class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"><option value="">Edit selected...</option>` + (savedViews||[]).map(v => `<option value="${v.id}">${v.name}</option>`).join('') + `</select><button id="new-settings-view-btn" class="bg-green-600 text-white px-3 py-1 rounded text-sm">New View</button></div>`;
  container.appendChild(header);
  // wire header select to open builder for chosen view
  const headerSelect = header.querySelector('#settings-edit-select');
  if (headerSelect) headerSelect.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    const ev = new CustomEvent('settings:editView', { detail: { viewId: id } });
    window.dispatchEvent(ev);
    // reset selection back to placeholder
    headerSelect.value = '';
  });
  const list = document.createElement('div');
  list.className = 'space-y-2';
  (savedViews || []).forEach(v => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 bg-gray-800 rounded';
    // left: default radio + name + meta
    const left = document.createElement('div');
    left.className = 'flex items-center gap-3';
    const radioWrap = document.createElement('label');
    radioWrap.className = 'flex items-center gap-2';
    radioWrap.innerHTML = `<input type="radio" name="default-view" class="default-view-radio" data-id="${v.id}" ${v.isDefault ? 'checked' : ''} />`;
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flex items-center gap-2';
    nameWrap.innerHTML = `<div class="view-name text-sm font-medium">${v.name || '(unnamed)'}</div>` + `<div class="text-xs text-gray-400">${(v.viewMode||'grid').toUpperCase()} ${v.gridSize ? v.gridSize.toUpperCase() : ''}</div>`;
    left.appendChild(radioWrap);
    left.appendChild(nameWrap);

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2';
    right.innerHTML = `<button data-id="${v.id}" class="apply-view-btn bg-indigo-600 text-white text-sm px-2 py-1 rounded">Apply</button>
                       <button data-id="${v.id}" class="edit-view-btn bg-gray-600 text-white text-sm px-2 py-1 rounded">Edit</button>
                       <button data-id="${v.id}" class="rename-view-btn bg-yellow-500 text-white text-sm px-2 py-1 rounded">Rename</button>
                       <button data-id="${v.id}" class="delete-view-btn bg-red-600 text-white text-sm px-2 py-1 rounded">Delete</button>`;

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
    container.appendChild(list);
    // Keep window in sync after rendering
    try { if (typeof window !== 'undefined') { window.savedViews = savedViews; window.activeViewId = activeViewId; } } catch (e) {}

    // --- Wire UI handlers AFTER DOM is created ---
    // new view button
    const newBtn = document.getElementById('new-settings-view-btn');
    if (newBtn) newBtn.addEventListener('click', () => {
      // Clear builder inputs and open
      window.viewFilterRules = [];
      window.viewSortRules = [];
      try { document.getElementById('view-name-input').value = ''; } catch(e) {}
      try { document.getElementById('view-group-by-1').value = ''; } catch(e) {}
      try { document.getElementById('view-group-by-2').value = ''; } catch(e) {}
      try { document.getElementById('view-hide-in-deck').checked = false; } catch(e) {}
      try { document.getElementById('view-view-mode').value = 'grid'; } catch(e) {}
      try { document.getElementById('view-grid-size').value = 'md'; } catch(e) {}
      window.__editingSavedViewId = null;
      const panel = document.getElementById('view-builder-panel'); if (panel) panel.classList.remove('hidden');
      if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
    });

    // apply
    container.querySelectorAll('.apply-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      if (typeof setActiveViewById === 'function') setActiveViewById(id);
    }));
    // delete
    container.querySelectorAll('.delete-view-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      const id = btn.dataset.id;
      if (confirm('Delete this saved view?')) {
        await deleteViewFromFirestore(window.userId || null, id);
        renderSettingsSavedViews(containerId);
      }
    }));
    // edit (open builder)
    container.querySelectorAll('.edit-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const ev = new CustomEvent('settings:editView', { detail: { viewId: id } });
      window.dispatchEvent(ev);
    }));
    // rename (inline)
    container.querySelectorAll('.rename-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const row = btn.closest('div[ class ]');
      if (!row) return;
      const nameEl = row.querySelector('.view-name');
      if (!nameEl) return;
      const current = nameEl.textContent || '';
      // replace with input + save/cancel
      const input = document.createElement('input');
      input.type = 'text'; input.value = current; input.className = 'bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm';
      const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save'; saveBtn.className = 'bg-green-600 text-white px-2 py-1 rounded text-sm';
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.className = 'bg-gray-600 text-white px-2 py-1 rounded text-sm';
      nameEl.style.display = 'none';
      nameEl.parentElement.appendChild(input);
      nameEl.parentElement.appendChild(saveBtn);
      nameEl.parentElement.appendChild(cancelBtn);
      input.focus();
      saveBtn.addEventListener('click', async () => {
        const newName = input.value || '(unnamed)';
        const view = (savedViews || []).find(v => v.id === id);
        if (!view) return;
        view.name = newName;
        try {
          await saveViewToFirestore(window.userId || null, view);
          await loadSavedViewsFromFirestore(window.userId || null);
          renderSettingsSavedViews(containerId);
        } catch (err) { console.error('[Settings] rename failed', err); }
      });
      cancelBtn.addEventListener('click', () => {
        input.remove(); saveBtn.remove(); cancelBtn.remove(); nameEl.style.display = '';
      });
    }));
    // default radio toggle
    container.querySelectorAll('.default-view-radio').forEach(r => r.addEventListener('change', async (e) => {
      const id = r.dataset.id;
      if (!id) return;
      (savedViews || []).forEach(v => { v.isDefault = (v.id === id); });
      try {
        // persist aggregate
        await persistSavedViewsToFirestore(window.userId || null);
        // set active view
        await setActiveViewById(id);
        renderSettingsSavedViews(containerId);
      } catch (err) { console.error('[Settings] set default failed', err); }
    }));
  };

  // kick off the ensure+render flow
  ensureLoadedAndRender().catch(err => { console.debug('[Settings] renderSettingsSavedViews ensureLoadedAndRender failed', err); doRender(); });
  // new view button
  const newBtn = document.getElementById('new-settings-view-btn');
  if (newBtn) newBtn.addEventListener('click', () => {
    // Clear builder inputs and open
    window.viewFilterRules = [];
    window.viewSortRules = [];
    try { document.getElementById('view-name-input').value = ''; } catch(e) {}
    try { document.getElementById('view-group-by-1').value = ''; } catch(e) {}
    try { document.getElementById('view-group-by-2').value = ''; } catch(e) {}
    try { document.getElementById('view-hide-in-deck').checked = false; } catch(e) {}
    try { document.getElementById('view-view-mode').value = 'grid'; } catch(e) {}
    try { document.getElementById('view-grid-size').value = 'md'; } catch(e) {}
    window.__editingSavedViewId = null;
    const panel = document.getElementById('view-builder-panel'); if (panel) panel.classList.remove('hidden');
    if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
  });
  // wire buttons
  container.querySelectorAll('.apply-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const id = btn.dataset.id;
    if (typeof setActiveViewById === 'function') setActiveViewById(id);
  }));
  // delete
  container.querySelectorAll('.delete-view-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = btn.dataset.id;
    if (confirm('Delete this saved view?')) {
      await deleteViewFromFirestore(window.userId || null, id);
      renderSettingsSavedViews(containerId);
    }
  }));
  // edit (open builder)
  container.querySelectorAll('.edit-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const id = btn.dataset.id;
    const ev = new CustomEvent('settings:editView', { detail: { viewId: id } });
    window.dispatchEvent(ev);
  }));
  // rename (inline)
  container.querySelectorAll('.rename-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
    const id = btn.dataset.id;
    const row = btn.closest('div[ class ]');
    if (!row) return;
    const nameEl = row.querySelector('.view-name');
    if (!nameEl) return;
    const current = nameEl.textContent || '';
    // replace with input + save/cancel
    const input = document.createElement('input');
    input.type = 'text'; input.value = current; input.className = 'bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm';
    const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save'; saveBtn.className = 'bg-green-600 text-white px-2 py-1 rounded text-sm';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.className = 'bg-gray-600 text-white px-2 py-1 rounded text-sm';
    nameEl.style.display = 'none';
    nameEl.parentElement.appendChild(input);
    nameEl.parentElement.appendChild(saveBtn);
    nameEl.parentElement.appendChild(cancelBtn);
    input.focus();
    saveBtn.addEventListener('click', async () => {
      const newName = input.value || '(unnamed)';
      const view = (savedViews || []).find(v => v.id === id);
      if (!view) return;
      view.name = newName;
      try {
        await saveViewToFirestore(window.userId || null, view);
        await loadSavedViewsFromFirestore(window.userId || null);
        renderSettingsSavedViews(containerId);
      } catch (err) { console.error('[Settings] rename failed', err); }
    });
    cancelBtn.addEventListener('click', () => {
      input.remove(); saveBtn.remove(); cancelBtn.remove(); nameEl.style.display = '';
    });
  }));
  // default radio toggle
  container.querySelectorAll('.default-view-radio').forEach(r => r.addEventListener('change', async (e) => {
    const id = r.dataset.id;
    if (!id) return;
    (savedViews || []).forEach(v => { v.isDefault = (v.id === id); });
    try {
      // persist aggregate
      await persistSavedViewsToFirestore(window.userId || null);
      // set active view
      await setActiveViewById(id);
      renderSettingsSavedViews(containerId);
    } catch (err) { console.error('[Settings] set default failed', err); }
  }));
}

// Playstyle rendering is handled by the header floating panel (boot.js) so we no longer render it from Settings.

// Handler: when settings wants to edit a view, populate the builder and open it
window.addEventListener('settings:editView', async (e) => {
  try {
    const viewId = e?.detail?.viewId;
    if (!viewId) return;
    // ensure savedViews loaded
    if ((!savedViews || !savedViews.length) && typeof loadSavedViewsFromFirestore === 'function' && window.userId) await loadSavedViewsFromFirestore(window.userId);
    const view = (savedViews || []).find(v => v.id === viewId);
    if (!view) return;
    window.viewFilterRules = JSON.parse(JSON.stringify(view.filters || []));
    window.viewSortRules = JSON.parse(JSON.stringify(view.sorts || []));
    try { document.getElementById('view-name-input').value = view.name || ''; } catch(e) {}
    try { document.getElementById('view-group-by-1').value = (view.groupBy && view.groupBy[0]) || ''; } catch(e) {}
    try { document.getElementById('view-group-by-2').value = (view.groupBy && view.groupBy[1]) || ''; } catch(e) {}
    try { document.getElementById('view-hide-in-deck').checked = !!view.hideInDecks; } catch(e) {}
    try { document.getElementById('view-view-mode').value = view.viewMode || 'grid'; } catch(e) {}
    try { document.getElementById('view-grid-size').value = view.gridSize || 'md'; } catch(e) {}
    try { document.getElementById('view-default-checkbox').checked = !!view.isDefault; } catch(e) {}
    window.__editingSavedViewId = view.id;
    const panel = document.getElementById('view-builder-panel'); if (panel) panel.classList.remove('hidden');
    if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
  } catch (err) { console.debug('[Settings] settings:editView handler failed', err); }
});

// Auto-initialize when module is loaded so legacy inline code can call functions
try { initSettingsModule(); } catch (e) { console.debug('[Settings] auto-init failed', e); }

// Wire builder Save/Cancel when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-view-confirm-btn');
  const cancelBtn = document.getElementById('cancel-view-builder-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('view-name-input')?.value || 'Untitled View';
      const groupBy1 = document.getElementById('view-group-by-1')?.value || '';
      const groupBy2 = document.getElementById('view-group-by-2')?.value || '';
      const groupBy = [groupBy1, groupBy2].filter(Boolean);
      const hideInDecks = !!document.getElementById('view-hide-in-deck')?.checked;
      const viewMode = document.getElementById('view-view-mode')?.value || 'grid';
      const gridSize = document.getElementById('view-grid-size')?.value || 'md';
      const isDefault = !!document.getElementById('view-default-checkbox')?.checked;
      const editingId = window.__editingSavedViewId || null;
      const view = {
        id: editingId || `view_${Date.now()}`,
        name,
        filters: window.viewFilterRules || [],
        sorts: window.viewSortRules || [],
        groupBy,
        hideInDecks,
        viewMode,
        gridSize,
        isDefault
      };
      try {
        const uid = window.userId || null;
        const saved = await saveViewToFirestore(uid, view);
        // reload views and UI
        await loadSavedViewsFromFirestore(uid);
        if (typeof renderSettingsSavedViews === 'function') renderSettingsSavedViews();
        if (typeof renderSavedViewsSelect === 'function') renderSavedViewsSelect(savedViews);
        if (saved && saved.isDefault) await setActiveViewById(saved.id);
      } catch (err) {
        console.error('[Settings] builder save failed', err);
      }
      window.__editingSavedViewId = null;
      const panel = document.getElementById('view-builder-panel'); if (panel) panel.classList.add('hidden');
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', () => { const panel = document.getElementById('view-builder-panel'); if (panel) panel.classList.add('hidden'); window.__editingSavedViewId = null; });
  // Add filter rule button
  const addFilterBtn = document.getElementById('add-filter-rule-btn');
  if (addFilterBtn) {
    addFilterBtn.addEventListener('click', () => {
      const col = document.getElementById('filter-column-select')?.value || 'name';
      const op = document.getElementById('filter-op-select')?.value || 'contains';
      const valEl = document.getElementById('filter-value-input');
      const val = valEl ? (valEl.value || '') : '';
      window.viewFilterRules = window.viewFilterRules || [];
      window.viewFilterRules.push({ column: col, operator: op, value: val });
      if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
      if (valEl) valEl.value = '';
    });
  }
  // Add sort rule button
  const addSortBtn = document.getElementById('add-sort-rule-btn');
  if (addSortBtn) {
    addSortBtn.addEventListener('click', () => {
      const col = document.getElementById('sort-column-select')?.value || 'name';
      const dir = document.getElementById('sort-dir-select')?.value || 'asc';
      window.viewSortRules = window.viewSortRules || [];
      window.viewSortRules.push({ column: col, direction: dir });
      if (typeof renderViewBuilderLists === 'function') renderViewBuilderLists();
    });
  }
});
