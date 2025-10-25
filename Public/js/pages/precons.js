import { showToast } from '../lib/ui.js';

// Simple precons index viewer. Expects a JSON index at /precons/index.json with entries:
// [{ "name": "Commander 2019 - Sample", "file": "/precons/Commander2019.json", "cover": "/precons/covers/cmd19.jpg" }, ...]

let currentGridSize = 'md';
const sizeClassMap = {
  sm: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11',
  md: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9',
  lg: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
};

export async function initPreconsModule() {
  try {
    if (typeof window.showView === 'function') window.showView('precons');
  } catch (e) {}

  const container = document.getElementById('precons-content');
  const filterInput = document.getElementById('precons-filter-text');
  const searchInput = document.getElementById('precons-search-input');
  const refreshBtn = document.getElementById('refresh-precons-btn');
  const noMsg = document.getElementById('no-precons-msg');

  if (!container) return;

  // wire controls
  document.querySelectorAll('.precons-grid-size-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.precons-grid-size-btn').forEach(x => x.classList.remove('bg-indigo-600','text-white'));
      b.classList.add('bg-indigo-600','text-white');
      currentGridSize = b.dataset.size || 'md';
      applyGridSize(container, currentGridSize);
    });
  });

  document.querySelectorAll('#precons-view .view-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'precons-view-toggle-grid') {
        // no-op: grid is default
      } else {
        // table view not implemented yet; just show toast
        showToast('Table view for Precons not implemented yet.', 'info');
      }
    });
  });

  if (refreshBtn) refreshBtn.addEventListener('click', () => { render(); });

  const doFilter = () => {
    const q = (filterInput?.value || '').trim().toLowerCase();
    const s = (searchInput?.value || '').trim().toLowerCase();
    Array.from(container.children || []).forEach(card => {
      const name = (card.dataset && card.dataset.name || '').toLowerCase();
      const fname = (card.dataset && card.dataset.file || '').toLowerCase();
      const show = (!q || name.includes(q) || fname.includes(q)) && (!s || name.includes(s) || fname.includes(s));
      card.style.display = show ? '' : 'none';
    });
    // update empty state
    const anyVisible = Array.from(container.children || []).some(c => c.style.display !== 'none');
    if (!anyVisible) noMsg && noMsg.classList.remove('hidden'); else noMsg && noMsg.classList.add('hidden');
  };

  filterInput && filterInput.addEventListener('input', () => doFilter());
  searchInput && searchInput.addEventListener('input', () => doFilter());

  // initial apply grid
  applyGridSize(container, currentGridSize);

  await render();

  async function render() {
    container.innerHTML = '';
    noMsg && noMsg.classList.add('hidden');
      try {
      // Primary: try the generated index created by the repository helper script
      let res = await fetch('/precons/index.generated.json');
      if (!res.ok) {
        // Fallback: try a user-provided index.json
        try { res = await fetch('/precons/index.json'); } catch (e) { /* ignore */ }
      }
      if (!res || !res.ok) {
        // No index found: show helpful message
        noMsg && noMsg.classList.remove('hidden');
        // Also log a helpful hint for local dev
        console.warn('Precons index not found. To generate one, run: node scripts\\generate-precons-index.js');
        return;
      }
      const idx = await res.json();
      if (!Array.isArray(idx) || idx.length === 0) {
        noMsg && noMsg.classList.remove('hidden');
        console.warn('Precons index JSON did not contain an array. If you placed a single deck as index.json, run the generator to create index.generated.json.');
        return;
      }

      const html = idx.map(item => {
        const name = item.name || item.title || 'Unnamed Precon';
        const cover = item.cover || item.coverImage || item.image || '';
        const file = item.file || item.path || '';
        const img = cover ? `<img src="${cover}" class="rounded-lg w-full h-full object-cover" loading="lazy"/>` : `<div class="w-full h-full bg-gray-800 flex items-center justify-center text-sm text-gray-400">No cover</div>`;
        return `
          <div class="cursor-pointer rounded-lg overflow-hidden shadow-md bg-gray-800 p-2 precon-item" data-file="${file}" data-name="${name}" style="aspect-ratio:2/3;position:relative">
            <div class="h-[72%] w-full rounded-md overflow-hidden">${img}</div>
            <div class="mt-2">
              <div class="text-sm font-semibold truncate">${name}</div>
              <div class="text-xs text-gray-400 truncate">${file}</div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = html;

      container.querySelectorAll('.precon-item').forEach(el => {
        el.addEventListener('click', async (e) => {
          const file = el.dataset.file;
          const name = el.dataset.name;
          if (!file) {
            showToast('This precon has no file path. Add a "file" property in /precons/index.json.', 'warning');
            return;
          }
          try {
            const mod = await import('./preconView.js');
            if (mod && typeof mod.initPreconView === 'function') {
              mod.initPreconView(file, name);
            }
          } catch (err) {
            console.error('Failed to load precon view module', err);
            showToast('Failed to open precon view.', 'error');
          }
        });
      });

      // run filter once
      doFilter();
    } catch (err) {
      console.error('Failed to load precons index', err);
      noMsg && noMsg.classList.remove('hidden');
    }
  }
}

function applyGridSize(container, size) {
  try {
    const cls = sizeClassMap[size] || sizeClassMap.md;
    // remove existing grid-cols-* classes crudely by resetting the class to base grid + cls
    // keep padding classes
    const base = 'grid gap-4 p-2';
    container.className = base + ' ' + cls;
  } catch (e) { console.debug('applyGridSize error', e); }
}
