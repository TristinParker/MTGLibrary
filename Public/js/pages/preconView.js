import { showToast } from '../lib/ui.js';
import { renderCollectionCard } from './collection.js';

// Render a single preconstructed deck JSON file into #precon-content
export async function initPreconView(filePath, displayName) {
  try { if (typeof window.showView === 'function') window.showView('precon'); } catch (e) {}
  const container = document.getElementById('precon-content');
  const title = document.getElementById('precon-title');
  const backBtn = document.getElementById('precon-back-btn');
  const noMsg = document.getElementById('no-precon-msg');
  if (title) title.textContent = displayName || filePath || 'Precon';
  if (backBtn) backBtn.onclick = () => { try { if (typeof window.showView === 'function') window.showView('precons'); } catch (e) {} };
  if (!container) return;
  container.innerHTML = '';
  noMsg && noMsg.classList.add('hidden');

  try {
    let res = await fetch(filePath);
    if (!res.ok) {
      // try relative path
      try { res = await fetch('/' + filePath.replace(/^\/+/, '')); } catch (e) { /* ignore */ }
    }
    if (!res || !res.ok) {
      noMsg && noMsg.classList.remove('hidden');
      showToast('Could not fetch precon file: ' + filePath, 'error');
      return;
    }
    const json = await res.json();

    // Several possible shapes: { cards: [...] } or { deck: { cards: [...] } } or array of cards
    let cards = null;
    if (Array.isArray(json)) cards = json;
    else if (Array.isArray(json.cards)) cards = json.cards;
    else if (json.deck && Array.isArray(json.deck.cards)) cards = json.deck.cards;
    else if (json?.card_list && Array.isArray(json.card_list)) cards = json.card_list;

    if (!cards || cards.length === 0) {
      // If the file contains only names in an object map: try to heuristically build array
      const possible = [];
      for (const k in json) {
        if (typeof json[k] === 'object' && json[k] && (json[k].name || json[k].count || json[k].image_uris)) possible.push(json[k]);
      }
      if (possible.length > 0) cards = possible;
    }

    if (!cards || cards.length === 0) {
      noMsg && noMsg.classList.remove('hidden');
      showToast('No card list found inside precon file.', 'warning');
      return;
    }

    // Normalize simple entries into Scryfall-like card objects where possible
    const normalized = cards.map(c => {
      if (!c) return null;
      if (typeof c === 'string') return { name: c };
      if (c.name && (c.image_uris || c.card_faces || c.set_name || c.set)) return c; // looks like full card
      // maybe shape: { "count": 2, "name": "Sol Ring" }
      if (c.name) return { name: c.name, count: c.count || 1, image_uris: c.image_uris || null };
      // last resort: include whatever fields exist
      return c;
    }).filter(Boolean);

    // Render grid of cards - prefer using renderCollectionCard where card object resembles expected shape
    const html = normalized.map(card => {
      try {
        // If card has image_uris or card_faces, it's safe to use renderCollectionCard (it expects some fields)
        if (card.image_uris || card.card_faces || card.set_name || card.set) {
          return renderCollectionCard(card);
        }
      } catch (e) { /* fall back */ }
      // fallback simple tile
      const name = card.name || card.title || 'Unknown';
      const count = card.count || '';
      return `
        <div class="relative group rounded-lg overflow-hidden shadow-lg transition-transform transform hover:-translate-y-1 hover:shadow-indigo-500/40 collection-card-item" style="aspect-ratio:2/3">
          <div class="w-full h-full flex items-center justify-center bg-gray-800 text-gray-300 p-2">${name}</div>
          <div class="absolute top-1 right-1 bg-gray-900/80 text-white text-sm font-bold px-2 py-1 rounded-full">${count}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 p-2">${html}</div>`;

    // wire any view buttons inside rendered collection-card-item
    try { if (typeof window.initializeDfsWrappers === 'function') window.initializeDfsWrappers(); } catch (e) {}

  } catch (err) {
    console.error('initPreconView error', err);
    noMsg && noMsg.classList.remove('hidden');
    showToast('Failed to load precon: ' + String(err), 'error');
  }
}
