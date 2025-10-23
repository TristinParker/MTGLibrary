import { localDecks, localCollection, addCardToCollection, updateCardAssignments, deleteDeck as dataDeleteDeck } from '../lib/data.js';
import { showToast, openModal, closeModal } from '../lib/ui.js';
import { openDeckSuggestionsModal } from './deckSuggestions.js';
import { db, appId } from '../main/index.js';
import { writeBatch, doc, updateDoc, runTransaction, deleteField, collection, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Helper: add a single card to deck by splitting the collection stack (creates a new collection doc)
async function addSingleCardWithSplit(uid, deckId, fid) {
  if (!uid) throw new Error('no uid');
  const collectionCard = (window.localCollection || localCollection)[fid];
  if (!collectionCard) throw new Error('collection card not found');
  const origRef = doc(db, `artifacts/${appId}/users/${uid}/collection`, fid);
  const newRef = doc(collection(db, `artifacts/${appId}/users/${uid}/collection`));
  const batch = writeBatch(db);
  const newCard = Object.assign({}, collectionCard, { count: 1, addedAt: new Date().toISOString() });
  delete newCard.firestoreId;
  batch.set(newRef, newCard);
  if ((collectionCard.count || 0) > 1) batch.update(origRef, { count: (collectionCard.count || 0) - 1 }); else batch.delete(origRef);
  const deckRef = doc(db, `artifacts/${appId}/users/${uid}/decks`, deckId);
  batch.set(deckRef, { cards: { [newRef.id]: { count: 1, name: collectionCard.name, type_line: collectionCard.type_line } } }, { merge: true });
  await batch.commit();
  return { newId: newRef.id, name: collectionCard.name, type_line: collectionCard.type_line };
}

// Helper: fetch server docs for newly-created collection ids and reconcile local placeholders
async function fetchAndReplacePlaceholders(mappings, deckId, uid) {
  if (!Array.isArray(mappings) || mappings.length === 0) return;
  for (const m of mappings) {
    try {
      const snap = await getDoc(doc(db, `artifacts/${appId}/users/${uid}/collection`, m.newId));
      if (snap && snap.exists()) {
        const data = snap.data();
        data.firestoreId = m.newId;
        if (!window.localCollection) window.localCollection = window.localCollection || {};
        window.localCollection[m.newId] = data;
        if (window.localCollection[m.newId]) delete window.localCollection[m.newId].pending;
        // Ensure deck local entry matches server
        if (!window.localDecks) window.localDecks = localDecks;
        const localDeck = window.localDecks[deckId] || localDecks[deckId];
        if (localDeck) {
          localDeck.cards = localDeck.cards || {};
          localDeck.cards[m.newId] = localDeck.cards[m.newId] || { count: data.count || 1, name: data.name, type_line: data.type_line };
        }
      }
    } catch (e) {
      console.warn('[reconcile] failed to fetch new collection doc', m.newId, e);
    }
  }
  try { updateCardAssignments(); if (typeof window.renderSingleDeck === 'function') window.renderSingleDeck(deckId); } catch (e) {}
}

function getUserId() {
  return window.userId || (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
}

// Helper: validate color identity subset (migrated from inline index-dev.html)
export function isColorIdentityValid(cardColors, commanderColors) {
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
  window.attachSuggestionMetadataToDeck = attachSuggestionMetadataToDeck;
  window.renderDeckSuggestionSummary = renderDeckSuggestionSummary;
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
  // Ensure we have a userId early so we can attempt to prefetch missing collection docs
  const userId = getUserId(); if (!userId) { showToast('User not signed in.', 'error'); return; }

  // Validate selected ids. If a local collection entry is missing, try fetching it from Firestore
  for (const fid of firestoreIds) {
    let collectionCard = (window.localCollection || localCollection)[fid];
    if (!collectionCard) {
      try {
        const snap = await getDoc(doc(db, `artifacts/${appId}/users/${userId}/collection`, fid));
        if (snap && snap.exists()) {
          const data = snap.data(); data.firestoreId = fid;
          if (!window.localCollection) window.localCollection = window.localCollection || {};
          window.localCollection[fid] = data;
          collectionCard = data;
        }
      } catch (e) {
        console.warn('[handleAddSelectedCardsToDeck] prefetch failed for', fid, e);
      }
    }

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

  // userId already retrieved above
  const batch = writeBatch(db);
  // track mapping from original fid -> newly created collection doc id so we can update local state optimistically
  const createdMappings = [];
  const skippedIds = [];
  for (const fid of firestoreIds) {
    const collectionCard = (window.localCollection || localCollection)[fid];
    if (!collectionCard || collectionCard.count < 1) { console.warn(`Skipping ${fid}`); skippedIds.push(fid); continue; }

    // Create a dedicated collection document for the card that will be associated with the deck.
    // This splits a stack rather than reusing the same document id for both collection and deck.
    const origCollectionRef = doc(db, `artifacts/${appId}/users/${userId}/collection`, fid);
    const newCollectionRef = doc(collection(db, `artifacts/${appId}/users/${userId}/collection`));
    const newCardDoc = Object.assign({}, collectionCard, { count: 1, addedAt: new Date().toISOString() });
    delete newCardDoc.firestoreId; // avoid copying an existing id into the new doc
  batch.set(newCollectionRef, newCardDoc);
  createdMappings.push({ orig: fid, newId: newCollectionRef.id, name: collectionCard.name, type_line: collectionCard.type_line });

    // Decrement or remove the original stack
    if ((collectionCard.count || 0) > 1) {
      batch.update(origCollectionRef, { count: (collectionCard.count || 0) - 1 });
    } else {
      batch.delete(origCollectionRef);
    }

    // Add the new collection doc id into the deck's cards map
    const deckRef = doc(db, `artifacts/${appId}/users/${userId}/decks`, deckId);
    const cardInDeck = deck.cards?.[newCollectionRef.id];
    if (!cardInDeck) {
      batch.set(deckRef, { cards: { [newCollectionRef.id]: { count: 1, name: collectionCard.name, type_line: collectionCard.type_line } } }, { merge: true });
    } else {
      batch.update(deckRef, { [`cards.${newCollectionRef.id}.count`]: (cardInDeck.count || 0) + 1 });
    }
  }

  try {
    await batch.commit();
    const addedCount = createdMappings.length;
    if (skippedIds.length > 0) {
      showToast(`Added ${addedCount} card(s) to ${deck.name}. ${skippedIds.length} card(s) were skipped (not in collection).`, 'warning');
    } else {
      showToast(`Added ${addedCount} card(s) to ${deck.name}.`, 'success');
    }
    try {
      if (!window.localDecks) window.localDecks = localDecks;
      if (!window.localCollection) window.localCollection = localCollection;
      const localDeck = window.localDecks[deckId] || localDecks[deckId];
      localDeck.cards = localDeck.cards || {};
      // Apply optimistic local updates according to the created mappings
      createdMappings.forEach(({ orig, newId, name, type_line }) => {
        const collectionCard = (window.localCollection || localCollection)[orig];
        if (!collectionCard) return;
        if ((collectionCard.count || 0) > 1) {
          collectionCard.count = Math.max((collectionCard.count||0)-1,0);
          // create a local placeholder for the new collection doc
          window.localCollection[newId] = Object.assign({}, collectionCard, { count: 1, firestoreId: newId, pending: true, name, type_line });
          if (localDeck.cards[newId]) localDeck.cards[newId].count = (localDeck.cards[newId].count||0) + 1; else localDeck.cards[newId] = { count: 1, name, type_line };
        } else {
          // original had count 1: remove it and add deck entry referencing newId
          delete window.localCollection[orig];
          window.localCollection[newId] = Object.assign({}, collectionCard, { count: 1, firestoreId: newId, pending: true, name, type_line });
          if (localDeck.cards[newId]) localDeck.cards[newId].count = (localDeck.cards[newId].count||0) + 1; else localDeck.cards[newId] = { count: 1, name, type_line };
        }
      });
      updateCardAssignments();
      if (typeof window.renderSingleDeck === 'function') window.renderSingleDeck(deckId);
    } catch (e) { console.warn('Local optimistic update failed:', e); }
    // Reconcile placeholders with server data
    try { await fetchAndReplacePlaceholders(createdMappings, deckId, userId); } catch (e) { console.warn('Reconcile after add failed', e); }
    closeModal('add-cards-to-deck-modal');
  } catch (error) {
    console.error('Error adding cards to deck:', error); showToast('Failed to add cards to deck.', 'error');
  }
}

// Batch-add cards to deck with progress toasts. Uses the same logic as handleAddSelectedCardsToDeck
export async function batchAddCardsWithProgress(deckId, firestoreIds) {
  if (!deckId || !firestoreIds || firestoreIds.length === 0) return;
  const deck = window.localDecks?.[deckId] || localDecks[deckId];
  if (!deck) return;
  const uid = getUserId(); if (!uid) { showToast('User not signed in.', 'error'); return; }
  // We'll commit in small batches to show progress
  const batchSize = 50;
  let processed = 0;
  const failedIds = [];
  const toastId = showToastWithProgress('Adding cards to deck...', 0, firestoreIds.length);
  try {
    for (let i = 0; i < firestoreIds.length; i += batchSize) {
      const chunk = firestoreIds.slice(i, i + batchSize);
      // Prefetch any missing collection docs for this chunk to avoid skipping them
      for (const fid of chunk) {
        const existing = (window.localCollection || localCollection)[fid];
        if (!existing) {
          try {
            const snap = await getDoc(doc(db, `artifacts/${appId}/users/${uid}/collection`, fid));
            if (snap && snap.exists()) {
              const data = snap.data(); data.firestoreId = fid;
              if (!window.localCollection) window.localCollection = window.localCollection || {};
              window.localCollection[fid] = data;
            }
          } catch (e) {
            console.warn('[batchAdd] prefetch failed for', fid, e);
          }
        }
      }
      // Build batch and collect per-fid ops so we can retry the whole batch on failure
      // For this chunk we will collect the new collection doc ids we create so we can update local state
      const newIdsForChunk = [];
      const makeBatch = () => {
        const b = writeBatch(db);
        for (const fid of chunk) {
          const collectionCard = (window.localCollection || localCollection)[fid];
          if (!collectionCard) continue;
          const deckCardId = fid;
          const cardInDeck = deck.cards?.[deckCardId];
          const deckRef = doc(db, `artifacts/${appId}/users/${uid}/decks`, deckId);

          // Create a new collection doc to represent the unit moved into the deck
          const origCollectionRef = doc(db, `artifacts/${appId}/users/${uid}/collection`, fid);
          const newCollectionRef = doc(collection(db, `artifacts/${appId}/users/${uid}/collection`));
          const newCardDoc = Object.assign({}, collectionCard, { count: 1, addedAt: new Date().toISOString() });
          delete newCardDoc.firestoreId;
          b.set(newCollectionRef, newCardDoc);
          newIdsForChunk.push({ orig: fid, newId: newCollectionRef.id, name: collectionCard.name, type_line: collectionCard.type_line });

          // Decrement or delete the original stack
          if ((collectionCard.count || 0) > 1) {
            b.update(origCollectionRef, { count: collectionCard.count - 1 });
          } else {
            b.delete(origCollectionRef);
          }

          // Add deck entry referencing the new collection id (always create a dedicated deck entry for the new doc)
          b.set(deckRef, { cards: { [newCollectionRef.id]: { count: 1, name: (collectionCard && collectionCard.name) || '', type_line: (collectionCard && collectionCard.type_line) || '' } } }, { merge: true });
        }
        return b;
      };
      // commit with retries
      let attempts = 0;
      const maxAttempts = 3;
      let chunkCommitted = false;
      while (attempts < maxAttempts) {
        const batch = makeBatch();
        try {
          await batch.commit();
          processed += chunk.length;
          updateToastProgress(toastId, Math.min(processed, firestoreIds.length), firestoreIds.length);
          chunkCommitted = true;
          break; // success
        } catch (err) {
          attempts += 1;
          console.warn(`[batchAdd] commit attempt ${attempts} failed`, err);
          if (attempts >= maxAttempts) {
            // Log and continue with the next chunk rather than aborting the entire process so partial progress is preserved.
            console.error(`[batchAdd] chunk commit failed after ${attempts} attempts. Continuing with next chunk.`, chunk);
            break;
          }
          // wait with exponential backoff before retry
          await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempts)));
        }
      }
      // optimistic local update only for the successfully committed chunk
      if (!chunkCommitted) {
        // mark these ids as failed in console for troubleshooting and collect them
        console.warn('[batchAdd] skipping optimistic update for failed chunk', chunk);
        failedIds.push(...chunk);
        continue;
      }
      // optimistic local update
      try {
        const localDeck = window.localDecks[deckId] || localDecks[deckId];
        localDeck.cards = localDeck.cards || {};
        // Apply optimistic updates based on newIdsForChunk mapping
        (newIdsForChunk || []).forEach(mapping => {
          const { orig, newId, name, type_line } = mapping;
          const collectionCard = (window.localCollection || localCollection)[orig];
          if (collectionCard) {
            if ((collectionCard.count || 0) > 1) {
              collectionCard.count = Math.max((collectionCard.count||0)-1,0);
            } else {
              // removed original
              delete window.localCollection[orig];
            }
          }
          // create local placeholder for the new collection doc
          window.localCollection[newId] = Object.assign({}, collectionCard || {}, { count: 1, firestoreId: newId, pending: true, name, type_line });
          if (localDeck.cards[newId]) localDeck.cards[newId].count = (localDeck.cards[newId].count||0) + 1; else localDeck.cards[newId] = { count: 1, name, type_line };
        });
        updateCardAssignments();
        if (typeof window.renderSingleDeck === 'function') window.renderSingleDeck(deckId);
      } catch (e) { console.warn('Local optimistic update failed:', e); }
      // Reconcile server docs for this chunk's new ids
      try { await fetchAndReplacePlaceholders(newIdsForChunk, deckId, uid); } catch (e) { console.warn('[batchAdd] reconcile failed for chunk', e); }
    }
    // If some chunks failed, retry failed ids individually
    const finalFailed = [];
    if (failedIds.length > 0) {
      const retryMax = 3;
      for (const fid of failedIds) {
        let attempts = 0;
        let ok = false;
        while (attempts < retryMax && !ok) {
          attempts += 1;
          try {
            const res = await addSingleCardWithSplit(uid, deckId, fid);
            // reconcile this single created doc
            await fetchAndReplacePlaceholders([{ orig: fid, newId: res.newId, name: res.name, type_line: res.type_line }], deckId, uid);
            ok = true;
          } catch (err) {
            console.warn(`[batchAdd][retry] attempt ${attempts} for ${fid} failed`, err);
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempts)));
          }
        }
        if (!ok) finalFailed.push(fid);
      }
    }
    const allFailed = finalFailed.length > 0 ? finalFailed : [];
    if (failedIds.length === 0 && allFailed.length === 0) {
      showToast('All selected cards added to deck.', 'success');
    } else {
      const report = allFailed.length > 0 ? allFailed : failedIds;
      console.error('[batchAddCardsWithProgress] some cards failed to persist', report);
      window.__lastBatchAddFailedIds = report;
      showToast(`Added most cards to deck; ${report.length} card(s) failed to persist. See console.`, 'warning');
    }
  } catch (err) {
    console.error('[batchAddCardsWithProgress] failed', err);
    showToast('Failed to add some cards to deck. See console.', 'error');
  } finally {
    if (toastId) removeToastById(toastId);
  }
}

// Save suggestion metadata onto the deck object (in-memory). This can be expanded to persist to Firestore.
export function attachSuggestionMetadataToDeck(deckId, suggestions) {
  if (!deckId || !suggestions) return;
  const deck = window.localDecks?.[deckId] || localDecks[deckId];
  if (!deck) return;
  // Optimistically update local state
  deck.aiSuggestions = deck.aiSuggestions || [];
  suggestions.forEach(s => {
    const existing = deck.aiSuggestions.find(x => x.firestoreId === s.firestoreId);
    if (existing) Object.assign(existing, s); else deck.aiSuggestions.push(Object.assign({}, s));
  });
  try { renderDeckSuggestionSummary(deckId); } catch (e) {}

  // Persist to Firestore under the deck document for the current user
  return (async () => {
    try {
      const uid = getUserId();
      if (!uid) { console.debug('[attachSuggestionMetadataToDeck] no user signed in, skipping persistence'); return; }
      // Show saving status in modal if present
      try { const statusEl = document.getElementById('deck-suggestions-save-status'); if (statusEl) statusEl.innerHTML = '<span class="tiny-spinner"></span>Saving...'; } catch (e) {}
      const deckRef = doc(db, `artifacts/${appId}/users/${uid}/decks`, deckId);
      // Write only the aiSuggestions field to avoid clobbering other data
      await updateDoc(deckRef, { aiSuggestions: deck.aiSuggestions });
      try { const statusEl = document.getElementById('deck-suggestions-save-status'); if (statusEl) statusEl.textContent = 'Saved'; const retry = document.getElementById('deck-suggestions-save-retry-btn'); if (retry) retry.classList.add('hidden'); } catch (e) {}
      // Optionally refresh localDecks from server copy for consistency
      try {
        const snap = await getDoc(deckRef);
        if (snap && snap.exists()) {
          const serverDeck = snap.data();
          // merge server aiSuggestions back into local optimistic copy
          deck.aiSuggestions = serverDeck.aiSuggestions || deck.aiSuggestions;
          try { renderDeckSuggestionSummary(deckId); } catch (e) {}
        }
      } catch (e) { /* non-fatal */ }
    } catch (err) {
      console.error('[attachSuggestionMetadataToDeck] failed to persist', err);
      showToast('Failed to save AI suggestion metadata. It will remain local until you refresh.', 'warning');
      try { const statusEl = document.getElementById('deck-suggestions-save-status'); if (statusEl) statusEl.textContent = 'Save failed'; const retry = document.getElementById('deck-suggestions-save-retry-btn'); if (retry) retry.classList.remove('hidden'); } catch (e) {}
      // Re-throw so callers (who expect a Promise) can handle errors
      throw err;
    }
  })();
}

export function renderDeckSuggestionSummary(deckId) {
  const container = document.getElementById('deck-suggestion-summary');
  if (!container) return;
  const deck = window.localDecks?.[deckId] || localDecks[deckId];
  if (!deck || !deck.aiSuggestions || deck.aiSuggestions.length === 0) {
    container.innerHTML = '<div class="text-sm text-gray-400">No AI suggestions</div>';
    return;
  }
  const lines = deck.aiSuggestions.slice(0,5).map(s => `<div class="text-sm text-gray-200">${s.rating ? `<strong>${s.rating}/10</strong> ` : ''}${s.name || (window.localCollection||localCollection)[s.firestoreId]?.name || 'Card'} - ${escapeHtml((s.reason||s.note||'').slice(0,120))}</div>`);
  container.innerHTML = `<div class="space-y-1">${lines.join('')}</div>`;
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
  document.getElementById('ai-suggestions-btn')?.addEventListener('click', () => openDeckSuggestionsModal(deckId));
  // Render suggestion summary if present
  try { renderDeckSuggestionSummary(deckId); } catch (e) {}
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
