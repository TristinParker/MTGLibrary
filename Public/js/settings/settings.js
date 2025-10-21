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
    await setDoc(userDocRef, { settings: { ...( (await getDoc(userDocRef)).data()?.settings || {} ), savedViews, activeViewId, modalVisibility: modalVisibilitySettings } }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving settings for user', e);
    return false;
  }
}

console.log('[Settings] Module loaded.');

// --- Saved Views and helper functions migrated here ---
export async function loadSavedViewsFromFirestore(userId) {
  if (!userId) return [];
  try {
    const viewsRef = collection(db, `artifacts/${appId}/users/${userId}/views`);
    const snapshot = await getDocs(viewsRef);
    const views = [];
    snapshot.forEach(d => views.push({ id: d.id, ...d.data() }));
    savedViews = views;
    if (typeof window.renderSavedViewsSelect === 'function') window.renderSavedViewsSelect(views);
    return views;
  } catch (err) {
    console.error('[Settings] loadSavedViewsFromFirestore error', err);
    showToast('Failed to load saved views.', 'error');
    return [];
  }
}

export async function persistSavedViewsToFirestore(userId) {
  if (!userId) return;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    await setDoc(userDocRef, { views: savedViews }, { merge: true });
    showToast('Saved views persisted.', 'success');
  } catch (err) {
    console.error('[Settings] persistSavedViewsToFirestore error', err);
    showToast('Failed to persist saved views.', 'error');
  }
}

export function renderSavedViewsSelect(views = savedViews) {
  const el = document.getElementById('saved-views-select');
  if (!el) return;
  el.innerHTML = `<option value="">(none)</option>` + views.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  el.addEventListener('change', (e) => {
    const vid = e.target.value;
    if (vid) setActiveViewById(vid);
  });
}

export function buildFilterPredicate(rule) {
  if (!rule) return () => true;
  switch ((rule.op||'').toLowerCase()) {
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
  if (!userId || !view) return null;
  try {
    if (!view.id) {
      const colRef = collection(db, `artifacts/${appId}/users/${userId}/views`);
      const docRef = await addDoc(colRef, view);
      const saved = { id: docRef.id, ...view };
      savedViews.push(saved);
      renderSavedViewsSelect();
      showToast('View saved.', 'success');
      return saved;
    } else {
      await persistSavedViewsToFirestore(userId);
      showToast('View updated.', 'success');
      return view;
    }
  } catch (err) {
    console.error('[Settings] saveViewToFirestore error', err);
    showToast('Failed to save view.', 'error');
    return null;
  }
}

export async function deleteViewFromFirestore(userId, viewId) {
  if (!userId || !viewId) return false;
  try {
    const viewRef = doc(db, `artifacts/${appId}/users/${userId}/views`, viewId);
    await deleteDoc(viewRef);
    savedViews = savedViews.filter(v => v.id !== viewId);
    renderSavedViewsSelect();
    showToast('Saved view deleted.', 'success');
    return true;
  } catch (err) {
    console.error('[Settings] deleteViewFromFirestore error', err);
    showToast('Failed to delete view.', 'error');
    return false;
  }
}

export function setActiveViewById(viewId) {
  activeViewId = viewId;
  if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
}

export function initSettingsModule() {
  if (typeof window !== 'undefined') {
    window.loadSavedViewsFromFirestore = loadSavedViewsFromFirestore;
    window.persistSavedViewsToFirestore = persistSavedViewsToFirestore;
    window.renderSavedViewsSelect = renderSavedViewsSelect;
    window.buildFilterPredicate = buildFilterPredicate;
    window.applySavedViewToCards = applySavedViewToCards;
    window.saveViewToFirestore = saveViewToFirestore;
    window.deleteViewFromFirestore = deleteViewFromFirestore;
    window.setActiveViewById = setActiveViewById;
  }
  console.log('[Settings] Module initialized');
}
