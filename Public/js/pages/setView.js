import { showToast } from '../lib/ui.js';
import { renderCollectionCard } from './collection.js';

async function fetchAllCardsForSet(code) {
  const encoded = encodeURIComponent(`set:${code}`);
  let url = `https://api.scryfall.com/cards/search?q=${encoded}&order=collector_number&unique=prints`;
  const results = [];
  try {
    while (url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch set cards');
      const data = await res.json();
      if (Array.isArray(data.data)) results.push(...data.data);
      if (data.has_more && data.next_page) url = data.next_page;
      else url = null;
      // be polite and avoid tight loops
      await new Promise(r => setTimeout(r, 30));
    }
  } catch (err) {
    console.error('fetchAllCardsForSet error', err);
    showToast('Failed to load cards for set.', 'error');
  }
  return results;
}

function chooseCardImage(card) {
  try {
    if (Array.isArray(card.card_faces) && card.card_faces.length > 0) {
      return card.card_faces[0].image_uris?.normal || card.card_faces[0].image_uris?.large || card.card_faces[0].image_uris?.art_crop || null;
    }
    return card.image_uris?.normal || card.image_uris?.large || card.image_uris?.art_crop || null;
  } catch (e) { return null; }
}

export async function showSetView(code) {
  try {
    // Ensure sets view is visible
    if (typeof window.showView === 'function') window.showView('sets');
    const content = document.getElementById('sets-content');
    if (!content) return;
    // Replace with loading UI
    content.innerHTML = `<div class="col-span-full p-6 flex flex-col items-center justify-center"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div><div class="text-gray-400">Loading cards for ${code.toUpperCase()}...</div></div>`;

    const cards = await fetchAllCardsForSet(code);
    if (!cards || cards.length === 0) {
      content.innerHTML = '';
      const noMsg = document.getElementById('no-sets-msg');
      if (noMsg) { noMsg.textContent = 'No cards found for this set.'; noMsg.classList.remove('hidden'); }
      return;
    }

    // Title bar: add back button and set title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = `${code.toUpperCase()} — Set`; 

    // Render a simple back button above the grid
    const backHtml = `<div id="sets-back-button" class="mb-4 flex items-center gap-3"><button class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-1 px-3 rounded">← Back to Sets</button><div class="text-sm text-gray-400">${cards.length} cards</div></div>`;

    // Render grid using the same card markup and grid sizing as the Collection page
    const sizeClasses = {
      sm: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11',
      md: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9',
      lg: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    };
    const gridSize = (typeof window !== 'undefined' && window.collectionGridSize) ? window.collectionGridSize : 'md';
    const gridClass = sizeClasses[gridSize] || sizeClasses.md;

    // Use the collection card renderer for consistent layout and behaviors
    const gridHtml = cards.map(c => renderCollectionCard(c)).join('');
    // Ensure reasonable minimum column width so cards aren't too skinny.
    const minMap = { sm: '110px', md: '150px', lg: '220px' };
    const minWidth = minMap[gridSize] || minMap.md;
    const gridStyle = `grid-template-columns: repeat(auto-fill, minmax(${minWidth}, 1fr));`;

    // Render a sticky back bar locked above the cards so it's always visible while scrolling
    const stickyBack = `
      <div id="sets-back-bar" class="sticky top-20 z-30 mb-4">
        <div class="bg-gray-900/80 backdrop-blur-sm p-3 rounded-lg flex items-center gap-4">
          <button id="sets-back-button" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">← Back to Sets</button>
          <div class="text-sm text-gray-400">${cards.length} cards</div>
        </div>
      </div>
    `;

  // Ensure the content container itself is used for our sticky bar + grid
  // Remove any preset grid classes on the container so our inner layout can span full width
  try { content.className = 'p-4'; } catch (e) {}
  // Use auto-fill with minmax to wrap into multiple rows and keep cards consistent
  content.innerHTML = stickyBack + `<div class="grid gap-4" style="${gridStyle}">${gridHtml}</div>`;

    // Wire back button
    const backBtn = document.getElementById('sets-back-button');
    if (backBtn) backBtn.addEventListener('click', () => {
      // restore page title
      if (pageTitle) pageTitle.textContent = 'Sets';
      // ensure the Sets view is shown and re-render the sets listing
      try { if (typeof window.showView === 'function') window.showView('sets'); } catch (e) {}
      if (typeof window.renderSets === 'function') window.renderSets();
      else import('./sets.js').then(mod => { if (typeof mod.renderSets === 'function') mod.renderSets(); }).catch(() => {});
    });

    // Wire card click to open details modal (reuse collection renderer if available)
    content.querySelectorAll('.set-card-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        const id = el.dataset.cardId;
        if (!id) return;
        const selected = cards.find(c => c.id === id);
        if (!selected) return;
        if (typeof window.renderCardDetailsModal === 'function') {
          window.renderCardDetailsModal(selected);
          if (typeof window.openModal === 'function') window.openModal('card-details-modal');
        } else {
          try {
            const col = await import('./collection.js');
            if (typeof col.renderCardDetailsModal === 'function') {
              col.renderCardDetailsModal(selected);
              if (typeof window.openModal === 'function') window.openModal('card-details-modal');
            }
          } catch (err) { console.debug('collection module not available for card details', err); }
        }
      });
    });

  } catch (err) {
    console.error('showSetView error', err);
    showToast('Failed to open set view.', 'error');
  }
}

// Expose on window for lazy callers
try { window.showSetView = showSetView; } catch (e) {}

export default { showSetView };
