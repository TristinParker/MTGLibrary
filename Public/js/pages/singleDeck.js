import { localDecks, localCollection, addCardToCollection, updateCardAssignments, deleteDeck as dataDeleteDeck } from '../lib/data.js';
import { showToast, openModal, closeModal } from '../lib/ui.js';
import { db, appId } from '../main/index.js';
import { writeBatch, doc, updateDoc, runTransaction, deleteField, collection } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

function getUserId() {
  return window.userId || (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
}

// Helper: validate color identity subset (migrated from inline index-dev.html)
function isColorIdentityValid(cardColors, commanderColors) {
  if (!cardColors || cardColors.length === 0) return true;
  const commanderSet = new Set(commanderColors || []);
  return (cardColors || []).every(c => commanderSet.has(c));
}

const deckChartInstances = {};

export function renderDecklist(deckId) {
  const container = document.getElementById('decklist-container');
  if (!container) return;
  const deck = localDecks[deckId];
  if (!deck) return;
  const allCards = Object.keys(deck.cards || {}).map(firestoreId => {
    const cardData = localCollection[firestoreId];
    if (!cardData) return null;
    return { ...cardData, countInDeck: deck.cards[firestoreId].count };
  }).filter(Boolean);

  const grouped = allCards.reduce((acc, card) => {
    const mainType = (card.type_line || '').split(' — ')[0];
    (acc[mainType] = acc[mainType] || []).push(card);
    return acc;
  }, {});

  const typeOrder = ['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'];
  let html = '';
  typeOrder.forEach(type => {
    if (grouped[type]) {
      const cardsOfType = grouped[type].sort((a,b) => a.name.localeCompare(b.name));
      const count = cardsOfType.reduce((s,c) => s + c.countInDeck, 0);
      html += `<div><h4 class="text-lg font-semibold text-indigo-400 mb-2">${type} (${count})</h4>${cardsOfType.map(card => `
        <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50">
          <span>${card.countInDeck} ${card.name}</span>
          <div class="flex items-center gap-2">
            <button class="view-card-details-btn p-1 text-gray-400 hover:text-white" data-firestore-id="${card.firestoreId}"></button>
            <button class="remove-card-from-deck-btn p-1 text-red-400 hover:text-red-300" data-firestore-id="${card.firestoreId}" data-deck-id="${deckId}"></button>
          </div>
        </div>`).join('')}</div>`;
    }
  });

  container.innerHTML = html || '<p class="text-gray-500">This deck is empty. Click "Add Cards" to get started.</p>';
}

export function renderManaCurveChart(manaCurveData) {
  const ctx = document.getElementById('mana-curve-chart')?.getContext('2d');
  if (!ctx) return;
  const chartId = 'mana-curve-chart';
  if (deckChartInstances[chartId]) deckChartInstances[chartId].destroy();
  const labels = ['0','1','2','3','4','5','6','7+'];
  const data = labels.map((label, index) => {
    const cmc = parseInt(label);
    if (index < 7) return manaCurveData[cmc] || 0;
    let sum = 0; for (let k in manaCurveData) if (parseInt(k) >= 7) sum += manaCurveData[k]; return sum;
  });
  deckChartInstances[chartId] = new Chart(ctx, {
    type: 'bar', data: { labels, datasets: [{ label: 'Card Count', data, backgroundColor: 'rgba(79, 70, 229, 0.6)', borderColor: 'rgba(129, 140, 248, 1)', borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
  });
}

export function initSingleDeckModule() {
  window.renderDecklist = renderDecklist;
  window.renderManaCurveChart = renderManaCurveChart;
  console.log('[SingleDeck] Module initialized.');
}

// --- Single-deck UI flows migrated from inline HTML ---
export function openAddCardsToDeckModal(deckId) {
  const deck = window.localDecks?.[deckId] || localDecks[deckId];
  if (!deck) { showToast('Could not find the specified deck.', 'error'); return; }
  document.getElementById('add-cards-modal-title').textContent = `Add Cards to "${deck.name}"`;
  const commanderColors = deck.commander?.color_identity || ['W','U','B','R','G'];
  const tableBody = document.getElementById('add-cards-modal-table-body');
  const filterInput = document.getElementById('add-card-modal-filter');
  if (filterInput) filterInput.value = '';

  const renderTable = () => {
    const filterText = (filterInput?.value || '').toLowerCase();
    const col = window.localCollection || localCollection;
    const eligibleCards = Object.values(col)
      .filter(card => (card.count || 0) > 0 && isColorIdentityValid(card.color_identity, commanderColors))
      .filter(card => card.name.toLowerCase().includes(filterText))
      .sort((a,b) => a.name.localeCompare(b.name));

    if (eligibleCards.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">No eligible cards in your collection.</td></tr>`;
    } else {
      tableBody.innerHTML = eligibleCards.map(card => `
        <tr class="border-b border-gray-700 hover:bg-gray-700/50">
          <td class="p-4">
            <div class="flex items-center">
              <input id="checkbox-${card.firestoreId}" type="checkbox" data-firestore-id="${card.firestoreId}" class="add-card-checkbox w-4 h-4">
            </div>
          </td>
          <td class="px-6 py-4 font-medium whitespace-nowrap">${card.name}</td>
          <td class="px-6 py-4">${(card.type_line||'').split(' — ')[0]}</td>
          <td class="px-6 py-4 text-center">${card.count}</td>
        </tr>
      `).join('');
    }
    updateSelectedCount();
  };

  const updateSelectedCount = () => {
    const selectedCount = document.querySelectorAll('.add-card-checkbox:checked').length;
    const counter = document.getElementById('add-cards-selected-count'); if (counter) counter.textContent = `${selectedCount} card(s) selected`;
  };

  renderTable();
  filterInput && filterInput.addEventListener('input', renderTable);
  tableBody && tableBody.addEventListener('change', updateSelectedCount);
  const selectAll = document.getElementById('add-cards-select-all'); if (selectAll) selectAll.addEventListener('change', (e) => { document.querySelectorAll('.add-card-checkbox').forEach(cb => cb.checked = e.target.checked); updateSelectedCount(); });
  document.getElementById('confirm-add-cards-to-deck-btn').onclick = () => {
    const selectedIds = Array.from(document.querySelectorAll('.add-card-checkbox:checked')).map(cb => cb.dataset.firestoreId);
    handleAddSelectedCardsToDeck(deckId, selectedIds);
  };
  openModal('add-cards-to-deck-modal');
}

export async function handleAddSelectedCardsToDeck(deckId, firestoreIds) {
  if (!deckId || !firestoreIds || firestoreIds.length === 0) { showToast('No cards selected to add.', 'warning'); return; }
  const deck = window.localDecks?.[deckId] || localDecks[deckId];
  if (!deck) { showToast('Deck not found.', 'error'); return; }
  const commanderColors = deck.commander?.color_identity || [];
  for (const fid of firestoreIds) {
    const collectionCard = (window.localCollection || localCollection)[fid];
    if (!collectionCard) { showToast(`Card not found in collection: ${fid}`, 'error'); return; }
    if (!isColorIdentityValid(collectionCard.color_identity, commanderColors)) { showToast(`Card "${collectionCard.name}" is not legal with this commander (color identity mismatch).`, 'error'); return; }
  }
  // Check assignments
  for (const fid of firestoreIds) {
    const assigns = window.cardDeckAssignments?.[fid] || [];
    if (assigns.length > 0) {
      const assignment = assigns[0]; if (assignment.deckId !== deckId) { showToast(`Card "${(window.localCollection||localCollection)[fid].name}" is already in another deck.`, 'error'); return; }
    }
  }

  const userId = getUserId(); if (!userId) { showToast('User not signed in.', 'error'); return; }
  const batch = writeBatch(db);
  for (const fid of firestoreIds) {
    const collectionCard = (window.localCollection || localCollection)[fid];
    if (!collectionCard || collectionCard.count < 1) { console.warn(`Skipping ${fid}`); continue; }
    const deckCardId = fid;
    const cardInDeck = deck.cards?.[deckCardId];
    if (!cardInDeck) {
      const collectionCardRef = doc(db, `artifacts/${appId}/users/${userId}/collection`, fid);
      batch.update(collectionCardRef, { count: collectionCard.count - 1 });
      const deckRef = doc(db, `artifacts/${appId}/users/${userId}/decks`, deckId);
      batch.update(deckRef, { [`cards.${deckCardId}`]: { count: 1, name: collectionCard.name, type_line: collectionCard.type_line } });
    } else {
      const collectionCardRef = doc(db, `artifacts/${appId}/users/${userId}/collection`, fid);
      batch.update(collectionCardRef, { count: collectionCard.count - 1 });
      const deckRef = doc(db, `artifacts/${appId}/users/${userId}/decks`, deckId);
      batch.update(deckRef, { [`cards.${deckCardId}.count`]: (cardInDeck.count || 0) + 1 });
    }
  }

  try {
    await batch.commit();
    showToast(`Added ${firestoreIds.length} card(s) to ${deck.name}.`, 'success');
    try {
      if (!window.localDecks) window.localDecks = localDecks;
      if (!window.localCollection) window.localCollection = localCollection;
      const localDeck = window.localDecks[deckId] || localDecks[deckId];
      localDeck.cards = localDeck.cards || {};
      firestoreIds.forEach(fid => {
        const collectionCard = (window.localCollection || localCollection)[fid]; if (!collectionCard) return; collectionCard.count = Math.max((collectionCard.count||0)-1,0);
        if (localDeck.cards[fid]) localDeck.cards[fid].count = (localDeck.cards[fid].count||0) + 1; else localDeck.cards[fid] = { count: 1, name: collectionCard.name, type_line: collectionCard.type_line };
      });
      updateCardAssignments();
      if (typeof window.renderSingleDeck === 'function') window.renderSingleDeck(deckId);
    } catch (e) { console.warn('Local optimistic update failed:', e); }
    closeModal('add-cards-to-deck-modal');
  } catch (error) {
    console.error('Error adding cards to deck:', error); showToast('Failed to add cards to deck.', 'error');
  }
}

export async function deleteDeck(deckId, alsoDeleteCards) {
  const userId = getUserId();
  if (!deckId) {
    const modal = document.getElementById('deck-delete-options-modal');
    if (modal) {
      const btn = modal.querySelector('#delete-deck-only-btn') || modal.querySelector('#delete-deck-and-cards-btn');
      deckId = btn && (btn.dataset.deckId || btn.dataset.id) ? (btn.dataset.deckId || btn.dataset.id) : deckId;
    }
    if (!deckId && window.views && window.views.singleDeck) deckId = window.views.singleDeck.dataset.deckId;
  }
  if (!deckId) { showToast('Deck not found.', 'error'); return; }
  try {
    await dataDeleteDeck(deckId, !!alsoDeleteCards, getUserId());
    showToast('Deck deleted successfully.', 'success');
    if (window.views && window.views.singleDeck && window.views.singleDeck.dataset.deckId === deckId) { if (typeof window.showView === 'function') window.showView('decks'); }
    closeModal('deck-delete-options-modal');
  } catch (error) {
    console.error('Error deleting deck:', error); showToast('Failed to delete deck.', 'error');
  }
}

export function addSingleDeckListeners(deckId) {
  const addBtn = document.getElementById('add-cards-to-deck-btn'); if (addBtn) addBtn.addEventListener('click', () => openAddCardsToDeckModal(deckId));
  document.querySelector('#single-deck-view .view-card-details-btn')?.addEventListener('click', (e) => { const fid = e.currentTarget.dataset.firestoreId; const card = (window.localCollection||localCollection)[fid]; if (card) { if (typeof window.renderCardDetailsModal === 'function') window.renderCardDetailsModal(card); if (typeof window.openModal === 'function') window.openModal('card-details-modal'); } });
  document.getElementById('deck-delete-btn')?.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId; if (typeof window.openDeckDeleteOptions === 'function') window.openDeckDeleteOptions(id); });
  document.getElementById('ai-suggestions-btn')?.addEventListener('click', () => showToast('AI suggestions are coming soon!', 'info'));
  document.getElementById('export-deck-btn')?.addEventListener('click', (e) => { const id = e.currentTarget.dataset.deckId; if (typeof window.exportDeck === 'function') window.exportDeck(id); });
  document.getElementById('view-strategy-btn')?.addEventListener('click', () => { const deck = (window.localDecks||localDecks)[deckId]; if (deck && deck.aiBlueprint && typeof window.renderAiBlueprintModal === 'function') { window.renderAiBlueprintModal(deck.aiBlueprint, deck.name, true); window.openModal('ai-blueprint-modal'); } });
}

// Expose compatibility shims
if (typeof window !== 'undefined') {
  window.openAddCardsToDeckModal = openAddCardsToDeckModal;
  window.handleAddSelectedCardsToDeck = handleAddSelectedCardsToDeck;
  window.deleteDeck = deleteDeck; // override earlier shim with wrapper
  window.addSingleDeckListeners = addSingleDeckListeners;
}
