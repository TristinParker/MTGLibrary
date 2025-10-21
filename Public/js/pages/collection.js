import { showToast } from '../lib/ui.js';
import { localCollection, cardDeckAssignments, updateCardAssignments } from '../lib/data.js';

// Local view state (seed from shared window state when available)
let collectionViewMode = (typeof window !== 'undefined' && window.collectionViewMode) ? window.collectionViewMode : 'grid';
let collectionGridSize = (typeof window !== 'undefined' && window.collectionGridSize) ? window.collectionGridSize : 'md';
let collectionSortState = (typeof window !== 'undefined' && window.collectionSortState) ? window.collectionSortState : { column: 'name', direction: 'asc' };
let collectionCurrentPage = 1;
const COLLECTION_PAGE_SIZE = 100;

function sortCards(cards) {
  const { column, direction } = collectionSortState;
  const sorted = [...cards].sort((a, b) => {
    let valA, valB;
    if (column === 'price') {
      valA = parseFloat(a.prices?.usd || 0);
      valB = parseFloat(b.prices?.usd || 0);
    } else if (column === 'count') {
      valA = a.count || 1;
      valB = b.count || 1;
    } else {
      valA = a[column] ?? '';
      valB = b[column] ?? '';
    }
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

function computeGroupCounts(items) {
  if (!items) return { unique: 0, copies: 0 };
  if (Array.isArray(items)) {
    const unique = items.length;
    const copies = items.reduce((acc, c) => acc + (c.count || 1), 0);
    return { unique, copies };
  }
  let totalUnique = 0;
  let totalCopies = 0;
  for (const key of Object.keys(items)) {
    const childCounts = computeGroupCounts(items[key]);
    totalUnique += childCounts.unique;
    totalCopies += childCounts.copies;
  }
  return { unique: totalUnique, copies: totalCopies };
}

function groupCardsRecursively(cards, groupByKeys) {
  if (!groupByKeys || !groupByKeys.length) return cards;
  const currentKey = groupByKeys[0];
  const remainingKeys = groupByKeys.slice(1);
  const groups = cards.reduce((acc, card) => {
    let key;
    if (currentKey === 'color_identity') {
      const colors = (card.color_identity || []).join('');
      key = colors === '' ? 'Colorless' : colors;
    } else if (currentKey === 'type_line') {
      key = (card.type_line || '').split(' — ')[0];
    } else if (currentKey === 'deck') {
      const assignment = (cardDeckAssignments[card.firestoreId] || [])[0];
      key = assignment ? assignment.deckName : 'Not in a Deck';
    } else {
      key = card[currentKey] ?? 'Other';
    }
    (acc[key] = acc[key] || []).push(card);
    return acc;
  }, {});
  if (remainingKeys.length > 0) {
    for (const groupName in groups) {
      groups[groupName] = groupCardsRecursively(groups[groupName], remainingKeys);
    }
  }
  return groups;
}

function renderCollectionCard(card) {
  const price = card.prices?.usd_foil && card.finish === 'foil' ? card.prices.usd_foil : card.prices?.usd;
  const assignment = (cardDeckAssignments[card.firestoreId] || [])[0];
  return `
    <div class="relative group rounded-lg overflow-hidden shadow-lg transition-transform transform hover:-translate-y-1 hover:shadow-indigo-500/40 collection-card-item" style="aspect-ratio:2/3">
      <div class="card-image-container">
        <img src="${card.image_uris?.normal}" alt="${card.name}" class="collection-card-img" loading="lazy">
      </div>
      <div class="absolute top-1 right-1 bg-gray-900/80 text-white text-sm font-bold px-2 py-1 rounded-full">${card.count || 1}</div>
      <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
        <p class="text-white text-xs font-bold truncate">${card.name}</p>
        ${assignment ? `<p class="text-indigo-400 text-xs font-semibold truncate">${assignment.deckName}</p>` : (price ? `<p class="text-green-400 text-xs font-semibold">$${price}</p>` : '')}
      </div>
      <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
        <button class="view-card-details-btn bg-white/20 backdrop-blur-sm text-white text-xs font-bold py-2 px-3 rounded-lg w-full" data-firestore-id="${card.firestoreId}">View</button>
        <button class="delete-button bg-red-600/50 hover:bg-red-600 backdrop-blur-sm text-white text-xs font-bold py-2 px-3 rounded-lg w-full" data-firestore-id="${card.firestoreId}">Delete</button>
      </div>
    </div>
  `;
}

// Expose helper for other modules that still reference it
export { renderCollectionCard };

function renderPaginationControls(totalPages) {
  const paginationDiv = document.getElementById('collection-pagination');
  if (!paginationDiv) return;
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === collectionCurrentPage ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600';
    html += `<button class="pagination-btn ${activeClass} font-bold py-2 px-4 rounded" data-page="${i}">${i}</button>`;
  }
  paginationDiv.innerHTML = html;
  paginationDiv.querySelectorAll('.pagination-btn').forEach(button => {
    button.addEventListener('click', () => {
      collectionCurrentPage = parseInt(button.dataset.page, 10);
      renderPaginatedCollection();
    });
  });
}

export function renderPaginatedCollection() {
  const contentDiv = document.getElementById('collection-content');
  const paginationDiv = document.getElementById('collection-pagination');
  const noCardsMsg = document.getElementById('no-cards-msg');
  if (!contentDiv) return;
  // synchronize view state from the global window so toolbar controls (which
  // mutate window.*) take effect immediately when they call renderPaginatedCollection
  try {
    if (typeof window !== 'undefined') {
      if (typeof window.collectionViewMode !== 'undefined') collectionViewMode = window.collectionViewMode;
      if (typeof window.collectionGridSize !== 'undefined') collectionGridSize = window.collectionGridSize;
      // ensure a canonical sort state exists on window and prefer it if present
      if (typeof window.collectionSortState !== 'undefined') collectionSortState = window.collectionSortState;
      else window.collectionSortState = collectionSortState;
    }
  } catch (syncErr) {
    console.warn('[Collection] failed to sync window state before render', syncErr);
  }
  let cards = Object.values(localCollection || {});
  if (document.getElementById('hide-in-deck-checkbox')?.checked) {
    cards = cards.filter(card => !cardDeckAssignments[card.firestoreId]);
  }

  if (cards.length === 0) {
    if (noCardsMsg) noCardsMsg.classList.remove('hidden');
    contentDiv.innerHTML = '';
    if (paginationDiv) paginationDiv.innerHTML = '';
    return;
  }
  if (noCardsMsg) noCardsMsg.classList.add('hidden');

  const filterText = document.getElementById('filter-text')?.value?.toLowerCase() || '';
  if (filterText) {
    cards = cards.filter(card => (card.name || '').toLowerCase().includes(filterText) || (card.type_line || '').toLowerCase().includes(filterText));
  }

  const groupByKeys = [document.getElementById('collection-group-by-1')?.value, document.getElementById('collection-group-by-2')?.value].filter(Boolean);

  if (groupByKeys.length > 0) {
    // Delegate grouped rendering to the more capable grid/table renderers
    paginationDiv && (paginationDiv.innerHTML = '');
    if (collectionViewMode === 'grid') {
      // renderCollectionGrid will handle nested groups correctly
      renderCollectionGrid(cards, groupByKeys);
    } else {
      // table view supports grouped rows
      renderCollectionTable(cards, groupByKeys);
    }
  } else {
    // No grouping: respect the selected view mode (grid or table) and paginate
    cards = sortCards(cards);
    const totalPages = Math.ceil(cards.length / COLLECTION_PAGE_SIZE) || 1;
    const start = (collectionCurrentPage - 1) * COLLECTION_PAGE_SIZE;
    const end = start + COLLECTION_PAGE_SIZE;
    const paginatedCards = totalPages > 1 ? cards.slice(start, end) : cards;

    if (totalPages > 1) {
      renderPaginationControls(totalPages);
    } else {
      paginationDiv && (paginationDiv.innerHTML = '');
    }

    if (collectionViewMode === 'table') {
      // Render a table for the current page
      renderCollectionTable(paginatedCards, []);
    } else {
      // Render grid using collectionGridSize
      renderCollectionGrid(paginatedCards, []);
    }
  }

  // attach listeners that other modules might depend on
  document.querySelectorAll('#collection-content .view-card-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const firestoreId = e.currentTarget.dataset.firestoreId;
      const evt = new CustomEvent('view-card-details', { detail: { firestoreId } });
      window.dispatchEvent(evt);
    });
  });

  // Update KPIs (total / unique / price / filtered summary)
  try {
    const allCards = Object.values(localCollection || {});
    const totalCopiesAll = allCards.reduce((acc, c) => acc + (c.count || 1), 0);
    const uniqueAll = allCards.length;
    const totalPriceAll = allCards.reduce((acc, c) => acc + ((parseFloat(c.prices?.usd) || 0) * (c.count || 1)), 0);
    const filteredCopies = cards.reduce((acc, c) => acc + (c.count || 1), 0);

    const totalEl = document.getElementById('kpi-total-cards');
    const uniqueEl = document.getElementById('kpi-unique-cards');
    const priceEl = document.getElementById('kpi-total-price');
    const filteredEl = document.getElementById('kpi-filtered-summary');

    if (totalEl) totalEl.textContent = String(totalCopiesAll);
    if (uniqueEl) uniqueEl.textContent = String(uniqueAll);
    if (priceEl) priceEl.textContent = `$${totalPriceAll.toFixed(2)}`;
    if (filteredEl) filteredEl.textContent = `${filteredCopies}/${totalCopiesAll}`;
  } catch (err) {
    console.warn('[Collection] KPI update failed', err);
  }
}

export function initCollectionModule() {
  // Expose render to window for compatibility
  window.renderPaginatedCollection = renderPaginatedCollection;
  window.renderCollection = renderPaginatedCollection;
  window.renderCollectionGrid = renderCollectionGrid;
  window.renderCollectionTable = renderCollectionTable;
  window.computeTableHeaderTop = computeTableHeaderTop;
  // Seed global window state for legacy boot wiring if not already present
  try {
    if (typeof window !== 'undefined') {
      if (typeof window.collectionViewMode === 'undefined') window.collectionViewMode = collectionViewMode;
      if (typeof window.collectionGridSize === 'undefined') window.collectionGridSize = collectionGridSize;
      if (typeof window.collectionSortState === 'undefined') window.collectionSortState = collectionSortState;
    }
  } catch (e) {
    console.warn('[Collection] could not seed window state', e);
  }

  // Expose an applySavedView helper so the settings module can tell the
  // collection to apply a saved view's configuration (grid size, view mode,
  // sorts, groupings). This keeps cross-module wiring minimal.
  try {
    if (typeof window !== 'undefined') {
      window.applySavedView = function(view) {
        try {
          if (!view) return;
          // view may contain: gridSize, viewMode, sorts, filters, groupBy
          if (view.gridSize) {
            window.collectionGridSize = view.gridSize;
            collectionGridSize = view.gridSize;
            // update visual active state for grid buttons if present
            document.querySelectorAll('.grid-size-btn').forEach(b => { b.classList.remove('bg-indigo-600','text-white'); if (b.dataset && b.dataset.size === collectionGridSize) b.classList.add('bg-indigo-600','text-white'); });
          }
          if (view.viewMode) {
            window.collectionViewMode = view.viewMode;
            collectionViewMode = view.viewMode;
            const gridBtn = document.getElementById('view-toggle-grid');
            const tableBtn = document.getElementById('view-toggle-table');
            if (view.viewMode === 'grid') { if (gridBtn) gridBtn.classList.add('bg-indigo-600','text-white'); if (tableBtn) tableBtn.classList.remove('bg-indigo-600','text-white'); }
            else { if (tableBtn) tableBtn.classList.add('bg-indigo-600','text-white'); if (gridBtn) gridBtn.classList.remove('bg-indigo-600','text-white'); }
          }
          // apply sorts if present
          if (Array.isArray(view.sorts) && view.sorts.length) {
            // store canonical sort state as the first sort rule
            const s = view.sorts[0];
            window.collectionSortState = { column: s.column || 'name', direction: s.direction || 'asc' };
            collectionSortState = window.collectionSortState;
          }
          // apply group-by selection UI if present
          try {
            if (Array.isArray(view.groupBy) && view.groupBy.length) {
              const g1 = view.groupBy[0] || '';
              const g2 = view.groupBy[1] || '';
              const el1 = document.getElementById('collection-group-by-1');
              const el2 = document.getElementById('collection-group-by-2');
              if (el1) el1.value = g1;
              if (el2) el2.value = g2;
            }
          } catch (e) { /* ignore */ }

          // update saved-views-select active value if present
          try { const sel = document.getElementById('saved-views-select'); if (sel && view.id) sel.value = view.id; } catch (e) {}

          // finally, re-render
          if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
        } catch (err) { console.warn('[applySavedView] error', err); }
      };
    }
  } catch (e) { console.debug('[Collection] could not expose applySavedView', e); }
  // Provide a default KPI toggle handler so clicks never silently fail
  if (!window.toggleKpiMetric) {
    window.toggleKpiMetric = function(metric) {
      try {
        console.log('[Collection] default toggleKpiMetric called for', metric);
        const id = 'kpi-' + String(metric || '').replace(/_/g, '-');
        const el = document.getElementById(id);
        if (el) {
          el.classList.toggle('kpi-active');
          if (el.classList.contains('kpi-active')) el.style.outline = '3px solid rgba(99,102,241,0.6)'; else el.style.outline = '';
        }
      } catch (e) { console.error('[Collection] toggleKpiMetric error', e); }
      if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
    };
  }
  // Attach collection-specific listeners when module initializes
  // (listeners are idempotent if called multiple times)
  if (!window.__collection_listeners_installed) {
    try {
      addCollectionCardListeners();
      addCollectionTableListeners();
      // install floating header sync if not already
      try { installFloatingHeaderSync(); } catch(e) { console.warn('[Collection] installFloatingHeaderSync failed', e); }
    } catch (e) {
      console.warn('[Collection] Could not install listeners during init:', e);
    }
    window.__collection_listeners_installed = true;
  }
  console.log('[Collection] Module initialized. window.renderPaginatedCollection present=', typeof window.renderPaginatedCollection === 'function');
}

// Migrate searchForCard from inline HTML into module
export async function searchForCard(mode, deckId = null) {
  console.log(`[Collection.searchForCard] Initiating search in mode: ${mode}`);
  // use global state variables defined in app; these variables are kept in sync by window shims
  window.currentSearchContext = { mode, deckId };
  const input = document.getElementById(mode === 'commander' ? 'commander-search-input' : 'card-search-input');
  if (!input) return;
  const query = input.value.trim();
  if (query.length < 3) {
    showToast('Please enter at least 3 characters to search.', 'warning');
    return;
  }

  let scryfallQuery = query;
  if (mode === 'commander') scryfallQuery += ' t:legendary (t:creature or t:planeswalker)';

  const searchButton = document.getElementById(mode === 'commander' ? 'commander-search-btn' : 'search-card-btn');
  const searchIcon = document.getElementById('search-icon');
  const searchSpinner = document.getElementById('search-spinner');
  const searchText = document.getElementById('search-text');

  if (searchButton) searchButton.disabled = true;
  if (searchIcon) searchIcon.classList.add('hidden');
  if (searchSpinner) searchSpinner.classList.remove('hidden');
  if (searchText) searchText.textContent = 'Searching...';

  try {
    const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&unique=prints`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || 'Card not found.');
    }
    const data = await response.json();
    if (mode === 'commander') {
      const resultsContainer = document.getElementById('commander-search-results');
      if (!resultsContainer) return;
      resultsContainer.innerHTML = data.data.map(card => `
        <div class="cursor-pointer select-commander-from-search-btn rounded-md overflow-hidden" data-card-id='${card.id}' tabindex="0" role="button" aria-label="Select ${card.name}" style="aspect-ratio:2/3; position:relative">
          <img src="${card.image_uris?.art_crop}" class="commander-search-img">
          <button type="button" class="commander-select-btn absolute bottom-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1 px-2 rounded" data-card-id='${card.id}'>Select</button>
        </div>
      `).join('');

      // Delegated handlers
      resultsContainer.onclick = (e) => {
        const selectBtn = e.target.closest('.commander-select-btn');
        if (selectBtn) {
          const cardId = selectBtn.dataset.cardId || selectBtn.dataset.firestoreId;
          const card = data.data.find(c => c.id === cardId);
          if (card) return window.selectCommander ? window.selectCommander(card) : null;
        }
        const btn = e.target.closest('.select-commander-from-search-btn');
        if (!btn) return;
        const cardId = btn.dataset.cardId;
        const card = data.data.find(c => c.id === cardId);
        if (card) window.selectCommander && window.selectCommander(card);
      };
      resultsContainer.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const btn = e.target.closest('.select-commander-from-search-btn');
          if (!btn) return;
          e.preventDefault();
          const cardId = btn.dataset.cardId;
          const card = data.data.find(c => c.id === cardId);
          if (card) window.selectCommander && window.selectCommander(card);
        }
      };
      resultsContainer.querySelectorAll('.commander-select-btn').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); const cardId = b.dataset.cardId || b.dataset.firestoreId; const card = data.data.find(c => c.id === cardId); if (card) window.selectCommander && window.selectCommander(card); }));
    } else {
      // reuse module's render helpers for card versions
      if (typeof renderCardVersions === 'function') renderCardVersions(data.data);
      window.openModal && window.openModal('card-versions-modal');
    }
  } catch (err) {
    console.error('Scryfall API error:', err);
    showToast(err.message || String(err), 'error');
  } finally {
    if (searchButton) searchButton.disabled = false;
    if (searchIcon) searchIcon.classList.remove('hidden');
    if (searchSpinner) searchSpinner.classList.add('hidden');
    if (searchText) searchText.textContent = 'Search';
  }
}

// Migrate renderCardVersions helper
export function renderCardVersions(cards) {
  const grid = document.getElementById('card-versions-grid');
  const loading = document.getElementById('versions-loading');
  if (!grid) return;
  grid.innerHTML = '';
  grid.onclick = null;
  loading && loading.classList.remove('hidden');

  grid.innerHTML = cards.map(card => {
    const price = card.prices?.usd ? `$${card.prices.usd}` : (card.prices?.usd_foil ? `$${card.prices.usd_foil} (Foil)` : 'N/A');
    return `
      <div class="relative group rounded-lg overflow-hidden cursor-pointer card-version-item" data-card-id="${card.id}" style="aspect-ratio:2/3">
        <img src="${card.image_uris?.large}" alt="${card.name}" class="card-version-img">
        <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 text-white">
          <p class="font-bold">${card.set_name}</p>
          <p class="text-sm">${price}</p>
        </div>
      </div>
    `;
  }).join('');

  const hoverPreview = document.getElementById('card-hover-preview');
  const hoverImage = hoverPreview && hoverPreview.querySelector('img');

  grid.querySelectorAll('.card-version-item').forEach(item => {
    item.addEventListener('mouseenter', (e) => {
      const imgSrc = e.currentTarget.querySelector('img')?.src;
      if (imgSrc && hoverImage && hoverPreview) {
        hoverImage.src = imgSrc;
        hoverPreview.classList.remove('hidden');
      }
    });
    item.addEventListener('mouseleave', () => {
      if (hoverPreview && hoverImage) { hoverPreview.classList.add('hidden'); hoverImage.src = ''; }
    });
  });

  grid.onclick = function(event) {
    const cardItem = event.target.closest('.card-version-item');
    if (!cardItem) return;
    const cardId = cardItem.dataset.cardId;
    const selectedCard = cards.find(c => c.id === cardId);
    if (selectedCard) {
      // prefer window handler if present
      if (typeof window.handleCardSelection === 'function') return window.handleCardSelection(selectedCard);
      // otherwise dispatch event
      window.dispatchEvent && window.dispatchEvent(new CustomEvent('card-selected', { detail: { card: selectedCard } }));
    }
  };

  loading && loading.classList.add('hidden');
}

// Migrate handleCardSelection and renderCardConfirmationModal
export function handleCardSelection(card) {
  console.log(`[Collection.handleCardSelection] Card selected: ${card.name} (${card.id})`);
  // set a window-scoped currentCardForAdd for existing code paths
  try { window.currentCardForAdd = card; } catch (e) {}
  // close versions modal if available, render confirmation modal and open it
  window.closeModal && window.closeModal('card-versions-modal');
  renderCardConfirmationModal(card);
  window.openModal && window.openModal('card-confirmation-modal');
}

export function renderCardConfirmationModal(card) {
  const contentDiv = document.getElementById('card-confirmation-content');
  if (!contentDiv) return;
  const cleanedCard = {
    id: card.id, name: card.name,
    image_uris: { small: card.image_uris?.small, normal: card.image_uris?.normal, art_crop: card.image_uris?.art_crop },
    mana_cost: card.mana_cost, cmc: card.cmc, type_line: card.type_line, oracle_text: card.oracle_text,
    power: card.power, toughness: card.toughness, colors: card.colors, color_identity: card.color_identity,
    keywords: card.keywords, set: card.set, set_name: card.set_name, rarity: card.rarity,
    prices: card.prices, legalities: card.legalities
  };

  contentDiv.innerHTML = `
    <div class="flex justify-center md:justify-start md:col-span-1">
      <img src="${card.image_uris?.normal}" alt="${card.name}" class="rounded-lg shadow-lg w-full max-w-[360px] h-auto max-h-[640px] object-contain">
    </div>
    <div class="space-y-4 md:col-span-1">
      <h3 class="text-3xl font-bold">${card.name}</h3>
      <form id="add-card-form">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="card-quantity" class="block text-sm font-medium text-gray-300">Quantity</label>
            <input type="number" id="card-quantity" value="1" min="1" class="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2">
          </div>
          <div>
            <label for="card-finish" class="block text-sm font-medium text-gray-300">Finish</label>
            <select id="card-finish" class="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2">
              <option value="nonfoil" ${!card.foil ? 'selected' : ''}>Non-Foil</option>
              <option value="foil" ${card.foil ? 'selected' : ''}>Foil</option>
            </select>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-4">
          <button type="button" id="cancel-add-card-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">Cancel</button>
          <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Add Card</button>
        </div>
      </form>
    </div>
  `;

  const cancelBtn = document.getElementById('cancel-add-card-btn');
  cancelBtn && cancelBtn.addEventListener('click', () => { window.closeModal && window.closeModal('card-confirmation-modal'); window.openModal && window.openModal('card-versions-modal'); });

  const addForm = document.getElementById('add-card-form');
  addForm && addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const quantity = parseInt(document.getElementById('card-quantity').value, 10) || 1;
    const finish = document.getElementById('card-finish').value;
    const current = window.currentCardForAdd || null;
    if (!current) {
      showToast && showToast('Error: No card selected.', 'error');
      return;
    }
    const cardToAdd = { ...current, count: quantity, finish, addedAt: new Date().toISOString() };
    try { await addCardToCollection(cardToAdd); } catch (err) { console.error('[Collection] addCardToCollection error', err); }
    window.closeModal && window.closeModal('card-confirmation-modal');
  });
}

// --- Additional rendering helpers migrated from inline HTML ---
function sortGroupContent(cards) {
  if (window.viewSortRules && window.viewSortRules.length > 0) {
    const sorted = [...cards].sort((a, b) => {
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
    return sorted;
  }
  return sortCards(cards);
}

function renderCollectionGrid(cards, groupByKeys) {
  const contentDiv = document.getElementById('collection-content');
  if (!contentDiv) return;
  const sizeClasses = {
    sm: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11',
    md: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9',
    lg: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  };
  const gridClass = sizeClasses[collectionGridSize] || sizeClasses.md;

  let groupUidCounter = 0;
  function renderRecursiveGroups(groups, level) {
    return Object.keys(groups).sort().map((groupName) => {
      const content = groups[groupName];
      const uid = `group-${groupUidCounter++}`;
      // render caret + title with indentation; top-level groups open by default,
      // deeper subgroups start closed for a cleaner UX
      const counts = computeGroupCounts(content);
      const isLeaf = Array.isArray(content);
      const openAttr = level === 0 ? 'open' : '';
      const padding = `${1.5 + level}rem`;
      // include data-level so styling can target nested depth
      if (isLeaf) {
        return `
          <details id="${uid}" class="col-span-full collection-group level-${level}" data-level="${level}" ${openAttr}>
            <summary class="group-header" style="padding-left: ${padding}; display:flex; align-items:center; gap:0.5rem;">
              <span class="caret" aria-hidden="true">▾</span>
              <span class="group-title">${groupName}</span>
              <span class="counts">(${counts.unique} items, ${counts.copies} total)</span>
            </summary>
            <div class="grid ${gridClass} gap-4 p-4 group-content level-content-${level}">${sortGroupContent(content).map(renderCollectionCard).join('')}</div>
          </details>
        `;
      } else {
        return `
          <details id="${uid}" class="col-span-full collection-group level-${level}" data-level="${level}" ${openAttr}>
            <summary class="group-header" style="padding-left: ${padding}; display:flex; align-items:center; gap:0.5rem;">
              <span class="caret" aria-hidden="true">▾</span>
              <span class="group-title">${groupName}</span>
              <span class="counts">(${counts.unique} items, ${counts.copies} total)</span>
            </summary>
            <div class="col-span-full group-content level-content-${level}">${renderRecursiveGroups(content, level + 1)}</div>
          </details>
        `;
      }
    }).join('');
  }

  if (groupByKeys && groupByKeys.length > 0) {
    const groupedCards = groupCardsRecursively(cards, groupByKeys);
    groupUidCounter = 0;
    // enhanced nested-level styles: alternating tones, left connector, badges
    contentDiv.innerHTML = `
      <style>
        .collection-group { margin: 0.5rem 0; }
        .collection-group summary.group-header {
          display:flex; align-items:center; gap:0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          transition: background 0.12s ease, transform 0.06s ease;
        }
        .collection-group summary.group-header:hover { background: rgba(255,255,255,0.02); }
        /* level-based backgrounds for better hierarchy recognition */
        .collection-group.level-0 summary.group-header { background: linear-gradient(180deg, rgba(99,102,241,0.06), rgba(99,102,241,0.03)); border:1px solid rgba(99,102,241,0.12); }
        .collection-group.level-1 summary.group-header { background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border:1px solid rgba(255,255,255,0.02); }
        .collection-group.level-2 summary.group-header { background: linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.01)); border:1px solid rgba(255,255,255,0.01); }
        .collection-group .caret { transition: transform 0.18s ease; display:inline-flex; align-items:center; justify-content:center; width:1.1rem; height:1.1rem; border-radius:4px; background: rgba(255,255,255,0.03); color:#fff; }
        .collection-group:not([open]) .caret { transform: rotate(-90deg); }
        .collection-group[open] .caret { transform: rotate(0deg); }
        .group-title { font-weight:600; color:#EDF2FF; }
        .collection-group summary .counts { color:#9CA3AF; margin-left:auto; font-size:0.9rem; padding:0.15rem 0.45rem; background: rgba(0,0,0,0.12); border-radius:999px; }
        /* left connector line for nested groups */
        .group-content { margin-top:0.5rem; }
        .group-content.level-content-1 { border-left: 2px solid rgba(99,102,241,0.08); padding-left: 0.75rem; }
        .group-content.level-content-2 { border-left: 2px solid rgba(99,102,241,0.05); padding-left: 0.75rem; }
        .group-content.level-content-3 { border-left: 2px dashed rgba(99,102,241,0.04); padding-left: 0.75rem; }
      </style>
      <div class="grid ${gridClass} gap-4 p-4">${renderRecursiveGroups(groupedCards, 0)}</div>`;
    // add keyboard handlers for toggling details
    contentDiv.querySelectorAll('details summary').forEach(summary => {
      summary.tabIndex = 0;
      summary.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const details = summary.parentElement;
          details.open = !details.open;
        }
      });
    });
  } else {
    contentDiv.innerHTML = `<div class="grid ${gridClass} gap-4 p-4">${cards.map(renderCollectionCard).join('')}</div>`;
  }
  addCollectionCardListeners();
}

function computeTableHeaderTop(container) {
  try {
    const appHeader = document.querySelector('header');
    const containerRect = container.getBoundingClientRect();
    let topOffset = 0;
    if (appHeader) {
      const rect = appHeader.getBoundingClientRect();
      topOffset = Math.max(0, Math.ceil(rect.bottom - containerRect.top));
    }
    const banner = document.querySelector('.page-banner');
    if (banner) {
      const bRect = banner.getBoundingClientRect();
      topOffset = Math.max(topOffset, Math.ceil(bRect.bottom - containerRect.top));
    }
    topOffset = Math.max(0, topOffset);
    container.querySelectorAll('table thead').forEach(thead => { thead.style.top = `${topOffset}px`; });
    return topOffset;
  } catch (err) {
    console.error('[computeTableHeaderTop] error', err);
    return 0;
  }
}

function renderCollectionTable(cards, groupByKeys) {
  const contentDiv = document.getElementById('collection-content');
  if (!contentDiv) return;

  const renderTableRows = (cardGroup) => cardGroup.map((card) => {
    const price = card.prices?.usd_foil && card.finish === 'foil' ? card.prices.usd_foil : card.prices?.usd || 'N/A';
    const isCommander = (card.type_line || '').includes('Legendary');
    const assignment = (cardDeckAssignments[card.firestoreId] || [])[0];
    return `<tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
      <td class="px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="w-10 flex-shrink-0">
            <div class="card-image-container rounded-md overflow-hidden">
              <img src="${card.image_uris?.small}" class="card-image" loading="lazy" alt="${card.name}">
            </div>
          </div>
          <div>
            <div class="font-bold">${card.name}</div>
            <div class="text-sm text-gray-400">${card.set_name}</div>
          </div>
        </div>
      </td>
      <td class="px-6 py-4 text-center">${card.count || 1}</td>
      <td class="px-6 py-4">${card.type_line}</td>
      <td class="px-6 py-4">${assignment ? assignment.deckName : 'None'}</td>
      <td class="px-6 py-4">${card.rarity}</td>
      <td class="px-6 py-4 text-center">${card.cmc || 0}</td>
      <td class="px-6 py-4 text-right">$${price}</td>
      <td class="px-6 py-4 text-right">
        <button class="p-2 hover:bg-gray-600 rounded-full view-card-details-btn" data-firestore-id="${card.firestoreId}"></button>
        ${isCommander ? `<button class="p-2 hover:bg-gray-600 rounded-full create-deck-from-commander-btn" data-firestore-id="${card.firestoreId}" title="Create Commander Deck"></button>` : ''}
        <button class="p-2 hover:bg-red-800 rounded-full delete-button" data-firestore-id="${card.firestoreId}"></button>
      </td>
    </tr>`;
  }).join('');

  function renderRecursiveRows(groups, level) {
    return Object.keys(groups).sort().map((groupName) => {
      const content = groups[groupName];
      const topOffset = 114 + (level * 44);
      const headerRow = `
        <tr class="bg-gray-700">
          <th colspan="8" class="px-6 py-2 text-left text-lg font-bold text-gray-300 sticky bg-gray-700" style="top: ${topOffset}px; padding-left: ${1 + level}rem; z-index: 5;">
            ${groupName}
          </th>
        </tr>`;
      if (Array.isArray(content)) {
        return headerRow + renderTableRows(content);
      } else {
        return headerRow + renderRecursiveRows(content, level + 1);
      }
    }).join('');
  }

  const tableHeader = `
    <thead class="text-xs text-gray-400 uppercase sticky bg-gray-800" style="top: 72px; z-index: 6;">
      <tr>
        <th scope="col" class="px-6 py-3 sortable" data-sort="name">Name / Info</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="count">#</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="type_line">Type</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="deck">Deck</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="rarity">Rarity</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="cmc">Mana</th>
        <th scope="col" class="px-6 py-3 sortable" data-sort="price">Price</th>
        <th scope="col" class="px-6 py-3"></th>
      </tr>
    </thead>`;

  if (groupByKeys && groupByKeys.length > 0) {
    const groupedCards = groupCardsRecursively(cards, groupByKeys);

    // Build one table per (sub)group so each group has its own sticky header
    function renderGroupTables(groups, level) {
      return Object.keys(groups).sort().map((groupName) => {
        const content = groups[groupName];
        const counts = computeGroupCounts(content);
        const titlePadding = `${1 + level}rem`;
        if (Array.isArray(content)) {
          // table for this leaf group
          return `
            <div class="group-table-wrapper mb-4" data-open="true">
              <div class="group-table-title px-4 py-2 rounded-t flex items-center justify-between" style="padding-left:${titlePadding}; background:linear-gradient(180deg, rgba(0,0,0,0.04), transparent);">
                <div class="flex items-center gap-3">
                  <button type="button" class="group-toggle-btn text-sm text-gray-300" aria-expanded="true" aria-label="Toggle group ${groupName}">▾</button>
                  <strong class="text-lg">${groupName}</strong>
                  <span class="ml-2 text-sm text-gray-400">(${counts.unique} items, ${counts.copies} total)</span>
                </div>
                <div class="group-title-actions"></div>
              </div>
              <div class="group-table-body overflow-x-auto bg-gray-800 rounded-b-lg">
                <table class="w-full text-sm text-left text-gray-300">
                  ${tableHeader}
                  <tbody>
                    ${renderTableRows(content)}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        } else {
          // nested groups: render title then nested group tables
          return `
            <div class="group-nest-wrapper mb-4" data-open="true">
              <div class="group-table-title px-4 py-2 rounded-t flex items-center justify-between" style="padding-left:${titlePadding}; background:linear-gradient(180deg, rgba(0,0,0,0.02), transparent);">
                <div class="flex items-center gap-3">
                  <button type="button" class="group-toggle-btn text-sm text-gray-300" aria-expanded="true" aria-label="Toggle group ${groupName}">▾</button>
                  <strong class="text-lg">${groupName}</strong>
                  <span class="ml-2 text-sm text-gray-400">(${counts.unique} items, ${counts.copies} total)</span>
                </div>
                <div class="group-title-actions"></div>
              </div>
              <div class="group-nested-tables" style="padding-left:0.5rem">
                ${renderGroupTables(content, level + 1)}
              </div>
            </div>
          `;
        }
      }).join('');
    }

    contentDiv.innerHTML = `<div class="grouped-tables w-full p-2">${renderGroupTables(groupedCards, 0)}</div>`;

    // After DOM insertion, compute correct sticky header top offsets
    try {
      const top = computeTableHeaderTop(contentDiv);
      // Create or update floating group label overlay
      let overlay = document.getElementById('collection-group-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'collection-group-overlay';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.zIndex = '40';
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.padding = '6px 16px';
        overlay.style.gap = '12px';
        overlay.innerHTML = `<div id="collection-group-overlay-content" style="margin-left:1rem;color:#E6EEF8;font-weight:600;"></div>`;
        document.body.appendChild(overlay);
      }
      overlay.style.top = `${top}px`;

      // Update overlay based on scroll position inside the collection content
      const updateOverlay = () => {
        try {
          const wrappers = Array.from(contentDiv.querySelectorAll('.group-table-wrapper, .group-nest-wrapper'));
          const viewportTop = window.scrollY + top + 2; // slight offset inside
          let currentTitle = '';
          let currentSub = '';
          for (const w of wrappers) {
            const rect = w.getBoundingClientRect();
            const absTop = window.scrollY + rect.top;
            if (absTop <= viewportTop) {
              const titleEl = w.querySelector('.group-table-title strong');
              if (titleEl) currentTitle = titleEl.textContent.trim();
              // if nested, find immediate child group header under this wrapper
              const subEl = w.querySelector('.group-nested-tables .group-table-title strong');
              if (subEl) currentSub = subEl.textContent.trim();
            }
          }
          const content = document.getElementById('collection-group-overlay-content');
          if (content) content.textContent = currentTitle + (currentSub ? (' — ' + currentSub) : '');
          overlay.style.display = currentTitle ? 'flex' : 'none';
        } catch (err) { console.debug('[Collection] updateOverlay error', err); }
      };

      // Wire scroll and resize updates (debounced)
      let ovTimer = null;
      const ovHandler = () => { clearTimeout(ovTimer); ovTimer = setTimeout(updateOverlay, 60); };
      window.removeEventListener('scroll', window.__collection_group_overlay_handler || (() => {}));
      window.__collection_group_overlay_handler = ovHandler;
      window.addEventListener('scroll', ovHandler, { passive: true });
      window.addEventListener('resize', ovHandler);
      // initial update
      updateOverlay();

      // Wire group collapse/expand toggle buttons
      try {
        contentDiv.querySelectorAll('.group-toggle-btn').forEach(btn => {
          btn.removeEventListener('click', btn._groupToggleHandler || (() => {}));
          const handler = (e) => {
            const wrapper = e.currentTarget.closest('.group-table-wrapper, .group-nest-wrapper');
            if (!wrapper) return;
            const body = wrapper.querySelector('.group-table-body, .group-nested-tables');
            const isOpen = wrapper.getAttribute('data-open') !== 'false';
            if (isOpen) {
              wrapper.setAttribute('data-open', 'false');
              if (body) body.style.display = 'none';
              e.currentTarget.setAttribute('aria-expanded', 'false');
              e.currentTarget.textContent = '▸';
            } else {
              wrapper.setAttribute('data-open', 'true');
              if (body) body.style.display = '';
              e.currentTarget.setAttribute('aria-expanded', 'true');
              e.currentTarget.textContent = '▾';
            }
            // recompute overlay and header offsets after collapse change
            try { const top = computeTableHeaderTop(contentDiv); overlay.style.top = `${top}px`; ovHandler(); } catch (err) { console.debug('group toggle recompute failed', err); }
          };
          btn.addEventListener('click', handler);
          btn._groupToggleHandler = handler;
          // keyboard accessibility
          btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn._groupToggleHandler(e); } });
        });
      } catch (err) { console.debug('[Collection] wire group-toggle-btn failed', err); }
    } catch (err) { console.debug('[Collection] computeTableHeaderTop failed after grouped table render', err); }
  } else {
    contentDiv.innerHTML = `<div class="overflow-x-auto bg-gray-800 rounded-lg"><table class="w-full text-sm text-left text-gray-300">${tableHeader}<tbody>${renderTableRows(cards)}</tbody></table></div>`;
    try { computeTableHeaderTop(contentDiv); } catch (err) { console.debug('[Collection] computeTableHeaderTop failed after table render', err); }
  }

  addCollectionTableListeners();
}

// --- Migration: collection listeners moved from inline HTML ---
export function addCollectionCardListeners() {
  try {
    document.querySelectorAll('#collection-content .view-card-details-btn').forEach(btn => {
      btn.removeEventListener('click', handleViewCardClick);
      btn.addEventListener('click', handleViewCardClick);
    });
    document.querySelectorAll('#collection-content .delete-button').forEach(btn => {
      btn.removeEventListener('click', handleDeleteCardClick);
      btn.addEventListener('click', handleDeleteCardClick);
    });
    document.querySelectorAll('#collection-content .create-deck-from-commander-btn').forEach(btn => {
      btn.removeEventListener('click', handleCreateDeckFromCommanderClick);
      btn.addEventListener('click', handleCreateDeckFromCommanderClick);
    });
  } catch (err) {
    console.warn('[Collection.addCollectionCardListeners] error', err);
  }
}

function handleViewCardClick(e) {
  const firestoreId = e.currentTarget.dataset.firestoreId;
  const card = window.localCollection ? window.localCollection[firestoreId] : null;
  if (card) {
    if (typeof window.renderCardDetailsModal === 'function') window.renderCardDetailsModal(card);
    if (typeof window.openModal === 'function') window.openModal('card-details-modal');
  }
}

async function handleDeleteCardClick(e) {
  const firestoreId = e.currentTarget.dataset.firestoreId;
  if (!firestoreId) return;
  try {
    if (typeof window.db !== 'undefined' && typeof window.appId !== 'undefined' && typeof window.userId !== 'undefined') {
      const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      await deleteDoc(doc(window.db, `artifacts/${window.appId}/users/${window.userId}/collection`, firestoreId));
      if (typeof window.showToast === 'function') window.showToast('Card removed from collection.', 'success');
    } else {
      console.warn('[Collection.handleDeleteCardClick] firestore context missing');
    }
  } catch (err) {
    console.error('[Collection.handleDeleteCardClick] error', err);
    if (typeof window.showToast === 'function') window.showToast('Failed to remove card from collection.', 'error');
  }
}

function handleCreateDeckFromCommanderClick(e) {
  const firestoreId = e.currentTarget.dataset.firestoreId;
  const card = window.localCollection ? window.localCollection[firestoreId] : null;
  if (card && typeof window.openDeckCreationModal === 'function') window.openDeckCreationModal(card);
}

// --- Additional helpers migrated from inline HTML ---
export function toggleCardDetailsEditMode() {
  try {
    const wrapper = document.getElementById('card-details-modal-content-wrapper');
    if (!wrapper) return;
    const isEditing = wrapper.classList.toggle('card-modal-edit-mode');
    if (isEditing) {
      showToast && showToast('Card edit mode enabled.', 'info');
    } else {
      const firestoreId = wrapper.dataset.firestoreId;
      if (firestoreId) saveCardDetails(firestoreId).catch(err => console.error('[Collection] saveCardDetails error', err));
    }
  } catch (err) {
    console.error('[Collection] toggleCardDetailsEditMode error', err);
  }
}

export async function saveCardDetails(firestoreId) {
  try {
    if (!firestoreId) {
      showToast && showToast('Cannot save changes. Card not found in collection.', 'error');
      return;
    }
    // dynamic import of firestore helpers to avoid top-level dependency
    const { doc, updateDoc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const userId = window.userId || null;
    const appId = window.appId || null;
    if (!userId || !appId) {
      console.warn('[Collection.saveCardDetails] missing user/app context');
      return;
    }
    const cardRef = doc(window.db, `artifacts/${appId}/users/${userId}/collection`, firestoreId);

  const modalVisibility = (typeof window !== 'undefined' && window.modalVisibilitySettings) ? window.modalVisibilitySettings : { count: true, finish: true, condition: true, purchasePrice: true, notes: true };
  const newCount = modalVisibility.count ? (parseInt(document.getElementById('modal-edit-count')?.value, 10) || 0) : (localCollection[firestoreId]?.count || 0);
    if (newCount <= 0) {
      await deleteDoc(cardRef);
      showToast && showToast('Card removed from collection as count was set to 0.', 'success');
      closeModal && closeModal('card-details-modal');
      return;
    }

    const updatedData = { count: newCount };
  if (modalVisibility.finish) updatedData.finish = document.getElementById('modal-edit-finish')?.value;
  if (modalVisibility.condition) updatedData.condition = document.getElementById('modal-edit-condition')?.value.trim() || null;
  if (modalVisibility.purchasePrice) updatedData.purchasePrice = parseFloat(document.getElementById('modal-edit-purchasePrice')?.value) || null;
  if (modalVisibility.notes) updatedData.notes = document.getElementById('modal-edit-notes')?.value.trim() || null;

    await updateDoc(cardRef, updatedData);
    showToast && showToast('Card details saved!', 'success');
    const wrapper = document.getElementById('card-details-modal-content-wrapper');
    wrapper && wrapper.classList.remove('card-modal-edit-mode');
  } catch (err) {
    console.error('[Collection.saveCardDetails] error', err);
    showToast && showToast('Failed to save card details.', 'error');
  }
}

export function renderCardDetailsModal(card) {
  try {
    const contentDiv = document.getElementById('card-details-content');
    const wrapper = document.getElementById('card-details-modal-content-wrapper');
    if (!contentDiv || !wrapper) return;
    wrapper.dataset.firestoreId = card.firestoreId;
    wrapper.classList.remove('card-modal-edit-mode');
    const assignments = (cardDeckAssignments || {})[card.firestoreId] || [];
    const modalVisibility = (typeof window !== 'undefined' && window.modalVisibilitySettings) ? window.modalVisibilitySettings : { count: true, finish: true, condition: true, purchasePrice: true, notes: true };

    contentDiv.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="md:col-span-1">
          <img src="${card.image_uris?.normal}" class="rounded-lg w-full">
        </div>
        <div class="md:col-span-2 space-y-4">
          <h3 class="text-3xl font-bold">${card.name} ${card.mana_cost || ''}</h3>
          <p class="text-lg text-gray-400">${card.type_line}</p>
          <div class="text-gray-300 space-y-2 whitespace-pre-wrap">${card.oracle_text || ''}</div>
          ${card.power && card.toughness ? `<p class="text-xl font-bold">${card.power}/${card.toughness}</p>` : ''}
          <hr class="border-gray-600">
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <p><strong>Set:</strong> ${card.set_name} (${(card.set||'').toUpperCase()})</p>
            <p><strong>Rarity:</strong> ${card.rarity || ''}</p>
            ${modalVisibility.count ? `<div><strong>Count:</strong><span class="card-modal-value-display">${card.count || 1}</span><input id="modal-edit-count" type="number" value="${card.count || 1}" min="0" class="card-modal-value-input mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm"></div>` : ''}
            ${modalVisibility.finish ? `<div><strong>Finish:</strong><span class="card-modal-value-display">${card.finish || 'nonfoil'}</span><select id="modal-edit-finish" class="card-modal-value-input mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm"><option value="nonfoil" ${card.finish === 'nonfoil' ? 'selected' : ''}>Non-Foil</option><option value="foil" ${card.finish === 'foil' ? 'selected' : ''}>Foil</option><option value="etched" ${card.finish === 'etched' ? 'selected' : ''}>Etched</option></select></div>` : ''}
            ${modalVisibility.condition ? `<div><strong>Condition:</strong><span class="card-modal-value-display">${card.condition || 'Not Set'}</span><input id="modal-edit-condition" type="text" value="${card.condition || ''}" placeholder="e.g., Near Mint" class="card-modal-value-input mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm"></div>` : ''}
            ${modalVisibility.purchasePrice ? `<div><strong>Purchase Price:</strong><span class="card-modal-value-display">$${(card.purchasePrice || 0).toFixed(2)}</span><input id="modal-edit-purchasePrice" type="number" value="${card.purchasePrice || ''}" step="0.01" placeholder="e.g., 4.99" class="card-modal-value-input mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm"></div>` : ''}
          </div>
          ${modalVisibility.notes ? `<div class="col-span-2"><strong>Notes:</strong><p class="card-modal-value-display text-gray-400 whitespace-pre-wrap">${card.notes || 'No notes.'}</p><textarea id="modal-edit-notes" placeholder="Add notes here..." class="card-modal-value-input mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm h-24">${card.notes || ''}</textarea></div>` : ''}
          ${modalVisibility.deckAssignments && assignments.length > 0 ? `<div class="col-span-2"><hr class="border-gray-600 my-2"><p><strong>In Decks:</strong></p><ul class="list-disc list-inside text-gray-400">${assignments.map(a => `<li>${a.deckName}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('[Collection.renderCardDetailsModal] error', err);
  }
}

export function selectCommander(card) {
  try {
    try { window.currentCommanderForAdd = card; } catch(e) { currentCommanderForAdd = card; }
    const previewContainer = document.getElementById('selected-commander-preview');
    if (!previewContainer) return;
    previewContainer.innerHTML = `
      <img src="${card.image_uris?.art_crop}" class="w-16 h-12 object-cover rounded-sm">
      <div class="flex-grow"><p class="font-bold">${card.name}</p><p class="text-xs text-gray-400">${card.type_line}</p></div>
      <button type="button" id="clear-selected-commander" class="p-1 text-red-400 hover:text-red-200 text-2xl font-bold">&times;</button>
    `;
    previewContainer.classList.remove('hidden');
    const clearBtn = document.getElementById('clear-selected-commander');
    clearBtn && clearBtn.addEventListener('click', () => {
      try { window.currentCommanderForAdd = null; } catch(e) { currentCommanderForAdd = null; }
      previewContainer.innerHTML = '';
      previewContainer.classList.add('hidden');
    });
  } catch (err) {
    console.error('[Collection.selectCommander] error', err);
  }
}

export function openDeckCreationModal(commanderCard = null) {
  try {
    const form = document.getElementById('deck-creation-form');
    form && form.reset();
    try { window.currentCommanderForAdd = null; } catch(e) { currentCommanderForAdd = null; }
    try { window.tempAiBlueprint = null; } catch(e) { tempAiBlueprint = null; }
    const preview = document.getElementById('selected-commander-preview');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }

    const commanderListContainer = document.getElementById('commander-collection-list');
    const legendaryCreatures = Object.values(localCollection || {}).filter(c => (c.type_line||'').includes('Legendary') && (c.type_line||'').includes('Creature'));
    if (legendaryCreatures.length > 0) {
      commanderListContainer.innerHTML = legendaryCreatures.map(c => `
        <div class="flex items-center gap-2 p-1 rounded-md hover:bg-gray-700 cursor-pointer select-commander-from-collection-btn" data-firestore-id='${c.firestoreId}' tabindex="0" role="button" aria-label="Select ${c.name}">
          <div style="width:64px;height:48px;position:relative;flex-shrink:0;"><img src="${c.image_uris?.art_crop}" class="collection-card-img rounded-sm" style="position:absolute;inset:0;object-fit:cover;" /></div>
          <span class="flex-grow">${c.name}</span>
          <button type="button" class="commander-select-btn bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-2 rounded ml-2" data-firestore-id='${c.firestoreId}'>Select</button>
        </div>
      `).join('');

      commanderListContainer.onclick = (e) => {
        const selectBtn = e.target.closest('.commander-select-btn');
        if (selectBtn) {
          const firestoreId = selectBtn.dataset.firestoreId;
          const card = localCollection[firestoreId];
          if (card) return selectCommander(card);
        }
        const btn = e.target.closest('.select-commander-from-collection-btn');
        if (!btn) return;
        const firestoreId = btn.dataset.firestoreId;
        const card = localCollection[firestoreId];
        if (card) selectCommander(card);
      };
      commanderListContainer.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const btn = e.target.closest('.select-commander-from-collection-btn');
          if (!btn) return;
          e.preventDefault();
          const firestoreId = btn.dataset.firestoreId;
          const card = localCollection[firestoreId];
          if (card) selectCommander(card);
        }
      };
    } else {
      commanderListContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">No legendary creatures in your collection.</p>';
    }

    if (commanderCard) selectCommander(commanderCard);
    openModal && openModal('deck-creation-modal');
  } catch (err) {
    console.error('[Collection.openDeckCreationModal] error', err);
  }
}

export function searchForCommander() {
  try {
    const queryInput = document.getElementById('commander-search-input');
    const q = queryInput?.value?.trim();
    if (!q || q.length < 3) return showToast && showToast('Please enter at least 3 characters to search.', 'warning');
    // reuse collection search but with commander restrictions
    return searchForCard('commander');
  } catch (err) {
    console.error('[Collection.searchForCommander] error', err);
  }
}

export function filterCommanderCollectionList() {
  try {
    const filter = document.getElementById('commander-collection-filter')?.value?.toLowerCase() || '';
    const list = document.getElementById('commander-collection-list');
    if (!list) return;
    const items = Array.from(list.children || []);
    items.forEach(item => {
      const text = (item.textContent || '').toLowerCase();
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  } catch (err) {
    console.error('[Collection.filterCommanderCollectionList] error', err);
  }
}

export function addCollectionTableListeners() {
  try {
    // Re-use card listeners for table buttons
    addCollectionCardListeners();

    const table = document.querySelector('#collection-content table');
      if (!table) return;

      // attach to all tables inside the collection content area
      document.querySelectorAll('#collection-content table thead th.sortable').forEach(th => {
        th.removeEventListener('click', handleTableHeaderSortClick);
        th.addEventListener('click', handleTableHeaderSortClick);
      });
  } catch (err) {
    console.warn('[Collection.addCollectionTableListeners] error', err);
  }
}

function handleTableHeaderSortClick(e) {
  const th = e.currentTarget;
  if (document.body.classList.contains('edit-mode')) return;

  const column = th.dataset.sort;
  document.querySelectorAll('thead th.sortable').forEach(otherTh => {
    if (otherTh !== th) otherTh.classList.remove('sort-asc','sort-desc');
  });

  if (window.collectionSortState && window.collectionSortState.column === column) {
    window.collectionSortState.direction = window.collectionSortState.direction === 'asc' ? 'desc' : 'asc';
    // mirror into module state
    collectionSortState = window.collectionSortState;
  } else {
    window.collectionSortState = window.collectionSortState || { column: 'name', direction: 'asc' };
    window.collectionSortState.column = column;
    window.collectionSortState.direction = 'asc';
    // mirror into module state
    collectionSortState = window.collectionSortState;
  }

  th.classList.remove('sort-asc','sort-desc');
  th.classList.add(window.collectionSortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');

  if (typeof window.renderPaginatedCollection === 'function') window.renderPaginatedCollection();
}

// Floating header sync and resize/scroll handler migrated from inline HTML
export function installFloatingHeaderSync() {
  try {
    const handler = () => {
      document.querySelectorAll('.overflow-x-auto').forEach(container => {
        try {
          // prefer lib/ui.js computeTableHeaderTop if available
          if (typeof window.computeTableHeaderTop === 'function') {
            window.computeTableHeaderTop(container);
          } else {
            // fallback: adjust any thead top values based on header height
            const appHeader = document.querySelector('header');
            const containerRect = container.getBoundingClientRect();
            let topOffset = 0;
            if (appHeader) {
              const rect = appHeader.getBoundingClientRect();
              topOffset = Math.max(0, Math.ceil(rect.bottom - containerRect.top));
            }
            const banner = document.querySelector('.page-banner');
            if (banner) {
              const bRect = banner.getBoundingClientRect();
              topOffset = Math.max(topOffset, Math.ceil(bRect.bottom - containerRect.top));
            }
            topOffset = Math.max(0, topOffset);
            container.querySelectorAll('table thead').forEach(thead => { thead.style.top = `${topOffset}px`; });
          }
        } catch (err) {
          console.warn('[FloatingHeaderSync] inner handler error', err);
        }
      });
    };

    let timer = null;
    const resizeHandler = () => { clearTimeout(timer); timer = setTimeout(handler, 120); };
    const scrollHandler = () => { if (timer) return; timer = setTimeout(() => { handler(); timer = null; }, 150); };

    window.addEventListener('resize', resizeHandler);
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // expose for potential manual sync
    window.__collection_floating_header_sync = { handler, resizeHandler, scrollHandler };
  } catch (err) {
    console.error('[installFloatingHeaderSync] error', err);
  }
}

// Expose legacy/global shims for backwards compatibility with inline scripts
// and other non-module code. Do not overwrite existing window handlers if
// they were already provided by delegators; only set missing ones.
(function exposeLegacyAPIs() {
  try {
    const safeAssign = (name, fn) => {
      try {
        if (typeof window[name] === 'undefined' || window[name] === null) {
          window[name] = fn;
        }
      } catch (e) {
        // ignore assignment errors (some environments may have frozen globals)
      }
    };

  safeAssign('addCollectionCardListeners', addCollectionCardListeners);
    safeAssign('addCollectionTableListeners', addCollectionTableListeners);
    safeAssign('handleCardSelection', handleCardSelection);
    safeAssign('renderCardConfirmationModal', renderCardConfirmationModal);
    safeAssign('renderCardVersions', renderCardVersions);
    safeAssign('renderPaginatedCollection', renderPaginatedCollection);
    safeAssign('renderCollectionCard', renderCollectionCard);
    safeAssign('initCollectionModule', initCollectionModule);
    safeAssign('installFloatingHeaderSync', installFloatingHeaderSync);

  // Additional helpers migrated from inline HTML
  safeAssign('toggleCardDetailsEditMode', toggleCardDetailsEditMode);
  safeAssign('saveCardDetails', saveCardDetails);
  safeAssign('renderCardDetailsModal', renderCardDetailsModal);
  safeAssign('selectCommander', selectCommander);
  safeAssign('openDeckCreationModal', openDeckCreationModal);
  safeAssign('searchForCard', searchForCard);
  safeAssign('searchForCommander', searchForCommander);
  safeAssign('filterCommanderCollectionList', filterCommanderCollectionList);

    // Mark the module as loaded for delegators that poll for availability
    try { window.__collection_module_loaded = true; } catch (e) {}
  } catch (err) {
    console.warn('[Collection] exposeLegacyAPIs failed', err);
  }
})();
