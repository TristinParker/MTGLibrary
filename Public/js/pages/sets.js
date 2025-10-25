// Public/js/pages/sets.js
// Module to fetch Scryfall sets and render a browsable UI with filter / sort / display controls.

let setsData = [];
let currentView = 'grid'; // 'grid' or 'table'
let currentSize = 'md';

async function fetchSets() {
  try {
    const res = await fetch('https://api.scryfall.com/sets');
    const json = await res.json();
    setsData = Array.isArray(json.data) ? json.data : (json || []);
  } catch (err) {
    console.error('Failed to fetch sets', err);
    setsData = [];
  }
}

function chooseIcon(setObj) {
  // prefer svg icon if available
  return setObj.icon_svg_uri || setObj.icon_svg || setObj.icon_uri || '';
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(); } catch (e) { return d; }
}

function applyGridSize(el, size) {
  // size: sm, md, lg -> change min width used in grid
  if (!el) return;
  let min = '150px';
  if (size === 'sm') min = '110px';
  if (size === 'lg') min = '220px';
  el.style.gridTemplateColumns = `repeat(auto-fill, minmax(${min}, 1fr))`;
}

function renderGrid(container, items) {
  // Ensure container is a grid so items flow into multiple columns
  try { container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4'; } catch (e) {}
  container.innerHTML = '';
  if (!items.length) {
    document.getElementById('no-sets-msg').classList.remove('hidden');
    return;
  }
  document.getElementById('no-sets-msg').classList.add('hidden');
  const frag = document.createDocumentFragment();
  for (const s of items) {
    const card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-lg p-3 flex flex-col items-center gap-2 cursor-pointer hover:bg-gray-700';
    card.setAttribute('data-set-code', s.code);
    const imgWrap = document.createElement('div');
    imgWrap.className = 'w-full flex items-center justify-center';
    const img = document.createElement('img');
    img.alt = s.name;
    img.src = chooseIcon(s) || '';
    img.className = 'max-h-20 object-contain';
    img.onerror = () => { img.style.display = 'none'; };
    imgWrap.appendChild(img);
    const name = document.createElement('div');
    name.className = 'text-sm font-semibold text-center text-gray-200';
    name.textContent = s.name;
    const meta = document.createElement('div');
    meta.className = 'text-xs text-gray-400 text-center';
    meta.innerHTML = `<span class="mr-2">${s.code.toUpperCase()}</span> <span class="mx-2">•</span> <span>${s.card_count || '?'}</span>`;
    card.appendChild(imgWrap);
    card.appendChild(name);
    card.appendChild(meta);
    card.addEventListener('click', () => {
      if (window.showSetView) window.showSetView(s.code);
    });
    frag.appendChild(card);
  }
  container.appendChild(frag);
}

function renderTable(container, items) {
  try { container.className = 'p-4'; } catch (e) {}
  container.innerHTML = '';
  if (!items.length) {
    document.getElementById('no-sets-msg').classList.remove('hidden');
    return;
  }
  document.getElementById('no-sets-msg').classList.add('hidden');
  const table = document.createElement('table');
  table.className = 'w-full text-left';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr class="text-sm text-gray-400"><th class="p-2">Set</th><th class="p-2">Code</th><th class="p-2">Released</th><th class="p-2">Cards</th></tr>`;
  const tbody = document.createElement('tbody');
  for (const s of items) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-800';
    tr.innerHTML = `
      <td class="p-2 py-3 text-gray-200">${s.name}</td>
      <td class="p-2 text-gray-400">${s.code.toUpperCase()}</td>
      <td class="p-2 text-gray-400">${formatDate(s.released_at)}</td>
      <td class="p-2 text-gray-400">${s.card_count || ''}</td>
    `;
    tr.addEventListener('click', () => { if (window.showSetView) window.showSetView(s.code); });
    tbody.appendChild(tr);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderSets() {
  const container = document.getElementById('sets-content');
  if (!container) return;
  const q1 = (document.getElementById('sets-search-input') || { value: '' }).value.trim().toLowerCase();
  const q2 = (document.getElementById('sets-filter-text') || { value: '' }).value.trim().toLowerCase();
  const filterText = `${q1} ${q2}`.trim();
  let items = setsData.slice();
  if (filterText) {
    items = items.filter(s => (s.name || '').toLowerCase().includes(filterText) || (s.code || '').toLowerCase().includes(filterText));
  }
  const sortBy = (document.getElementById('sets-sort-select') || { value: 'name' }).value;
  items.sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'released') return new Date(b.released_at || 0) - new Date(a.released_at || 0);
    if (sortBy === 'card_count') return (b.card_count || 0) - (a.card_count || 0);
    return 0;
  });

  // Group by set_type with collapsed groupings
  const shouldGroupByType = true; // always group sets by set_type per request
  if (shouldGroupByType) {
    // Build groups keyed by set_type
    const groups = items.reduce((acc, s) => {
      const key = s.set_type || 'Other';
      (acc[key] = acc[key] || []).push(s);
      return acc;
    }, {});

    // Clear container and render each group as a collapsed <details>
    container.innerHTML = '';
    // Ensure container uses vertical flow for groups
    try { container.className = 'space-y-4 p-4'; } catch (e) {}

    Object.keys(groups).sort().forEach((type) => {
      const list = groups[type];
      const details = document.createElement('details');
      details.className = 'bg-gray-900/40 rounded-lg overflow-hidden';
      // collapsed by default (no open attr)
      const summary = document.createElement('summary');
      summary.className = 'px-4 py-3 font-semibold text-gray-200 flex items-center gap-3';
      summary.textContent = `${type} • ${list.length} sets`;
      details.appendChild(summary);

      const gridWrap = document.createElement('div');
      // Render the group's sets into this inner container using existing renderer
      renderGrid(gridWrap, list);
      // Apply the selected grid size to this inner grid so cards have correct min widths
      applyGridSize(gridWrap, currentSize);
      details.appendChild(gridWrap);
      container.appendChild(details);
    });
    return;
  }

  if (currentView === 'table') renderTable(container, items);
  else renderGrid(container, items);
  applyGridSize(container, currentSize);
}

function wireControls() {
  const searchInput = document.getElementById('sets-search-input');
  const filterInput = document.getElementById('sets-filter-text');
  const refreshBtn = document.getElementById('refresh-sets-btn');
  const sortSelect = document.getElementById('sets-sort-select');
  const resetBtn = document.getElementById('sets-reset-filters-btn');
  const gridBtns = Array.from(document.getElementsByClassName('sets-grid-size-btn'));
  const gridToggle = document.getElementById('sets-view-toggle-grid');
  const tableToggle = document.getElementById('sets-view-toggle-table');

  if (searchInput) searchInput.addEventListener('input', debounce(renderSets, 150));
  if (filterInput) filterInput.addEventListener('input', debounce(renderSets, 150));
  if (sortSelect) sortSelect.addEventListener('change', renderSets);
  if (refreshBtn) refreshBtn.addEventListener('click', async () => { refreshBtn.disabled = true; await fetchSets(); renderSets(); refreshBtn.disabled = false; });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (filterInput) filterInput.value = '';
    if (sortSelect) sortSelect.value = 'name';
    currentView = 'grid';
    currentSize = 'md';
    renderSets();
  });
  gridBtns.forEach(b => b.addEventListener('click', (ev) => {
    gridBtns.forEach(x => x.classList.remove('bg-indigo-600', 'text-white'));
    ev.currentTarget.classList.add('bg-indigo-600', 'text-white');
    currentSize = ev.currentTarget.getAttribute('data-size') || 'md';
    try { if (typeof window !== 'undefined') window.collectionGridSize = currentSize; } catch (e) {}
    renderSets();
  }));
  if (gridToggle) gridToggle.addEventListener('click', () => { currentView = 'grid'; try { if (typeof window !== 'undefined') window.collectionViewMode = 'grid'; } catch(e){} renderSets(); });
  if (tableToggle) tableToggle.addEventListener('click', () => { currentView = 'table'; try { if (typeof window !== 'undefined') window.collectionViewMode = 'table'; } catch(e){} renderSets(); });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export default async function initSetsModule() {
  // Called by boot when the Sets page is requested.
  const container = document.getElementById('sets-content');
  if (!container) return;
  // wire controls (idempotent)
  // Initialize size/view from global collection preferences if present
  try {
    if (typeof window !== 'undefined') {
      if (window.collectionGridSize) currentSize = window.collectionGridSize;
      if (window.collectionViewMode) currentView = window.collectionViewMode;
    }
  } catch (e) {}
  wireControls();
  // Ensure grid buttons reflect currentSize
  try {
    const btn = document.querySelector(`.sets-grid-size-btn[data-size="${currentSize}"]`);
    if (btn) { document.querySelectorAll('.sets-grid-size-btn').forEach(b => b.classList.remove('bg-indigo-600','text-white')); btn.classList.add('bg-indigo-600','text-white'); }
    // view toggles
    if (currentView === 'grid') { const g = document.getElementById('sets-view-toggle-grid'); const t = document.getElementById('sets-view-toggle-table'); if (g) g.classList.add('bg-indigo-600','text-white'); if (t) t.classList.remove('bg-indigo-600','text-white'); }
    else { const g = document.getElementById('sets-view-toggle-grid'); const t = document.getElementById('sets-view-toggle-table'); if (t) t.classList.add('bg-indigo-600','text-white'); if (g) g.classList.remove('bg-indigo-600','text-white'); }
  } catch(e) {}
  // fetch and render
  const loader = document.createElement('div');
  loader.className = 'text-center text-gray-400';
  loader.textContent = 'Loading sets…';
  container.innerHTML = '';
  container.appendChild(loader);
  await fetchSets();
  renderSets();
}

// Expose for debugging and manual calls
window.initSetsModule = initSetsModule;
// Also provide a named export so legacy boot code can call mod.initSetsModule()
export { initSetsModule };
 
