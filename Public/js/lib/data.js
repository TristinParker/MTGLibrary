import { db, appId } from '../main/index.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, getDocs, runTransaction, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast, showToastWithProgress, updateToastProgress, removeToastById } from '../lib/ui.js';

// Shared in-memory state
export let localCollection = {};
export let localDecks = {};
export let cardDeckAssignments = {};

export function setLocalCollection(obj) {
  localCollection = obj || {};
  if (typeof window !== 'undefined') window.localCollection = localCollection;
  // keep assignments up to date
  updateCardAssignments();
}

export function setLocalDecks(obj) {
  localDecks = obj || {};
  if (typeof window !== 'undefined') window.localDecks = localDecks;
  // keep assignments up to date
  updateCardAssignments();
}

export function updateCardAssignments() {
  cardDeckAssignments = {};
  Object.values(localDecks).forEach((deck) => {
    const allDeckCardsFirestoreIds = Object.keys(deck.cards || {});
    if (deck.commander && deck.commander.firestoreId) {
      allDeckCardsFirestoreIds.push(deck.commander.firestoreId);
    }
    allDeckCardsFirestoreIds.forEach(firestoreId => {
      if (!cardDeckAssignments[firestoreId]) cardDeckAssignments[firestoreId] = [];
      const existing = cardDeckAssignments[firestoreId].find(a => a.deckId === deck.id);
      if (!existing) cardDeckAssignments[firestoreId].push({ deckId: deck.id, deckName: deck.name });
    });
  });
}

export async function addCardToCollection(cardData, userId) {
  try {
    const existingCard = Object.values(localCollection).find(c => c.id === cardData.id && c.finish === cardData.finish);
    if (existingCard) {
      const newCount = (existingCard.count || 0) + (cardData.count || 1);
      const cardRef = doc(db, `artifacts/${appId}/users/${userId}/collection`, existingCard.firestoreId);
      await updateDoc(cardRef, { count: newCount });
      showToast(`Updated ${cardData.name} to ${newCount} in collection.`, 'success');
      return existingCard.firestoreId;
    } else {
      const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/collection`), cardData);
      showToast(`Added ${cardData.count || 1}x ${cardData.name} to collection.`, 'success');
      return docRef.id;
    }
  } catch (error) {
    console.error('Error adding card to collection:', error);
    showToast('Failed to add card to collection.', 'error');
    return null;
  }
}

export async function deleteDeck(deckId, alsoDeleteCards, userId) {
  if (!deckId) return;
  try {
    const batch = writeBatch(db);
    const deckRef = doc(db, `artifacts/${appId}/users/${userId}/decks`, deckId);
    batch.delete(deckRef);
    if (alsoDeleteCards) {
      const deck = localDecks[deckId];
      const cardIds = new Set(Object.keys(deck.cards || {}));
      if (deck.commander && deck.commander.firestoreId) cardIds.add(deck.commander.firestoreId);
      cardIds.forEach(fid => batch.delete(doc(db, `artifacts/${appId}/users/${userId}/collection`, fid)));
    }
    await batch.commit();
    showToast('Deck deleted.', 'success');
  } catch (error) {
    console.error('Error deleting deck:', error);
    showToast('Failed to delete deck.', 'error');
  }
}

export async function clearAllUserData(userId) {
  if (!userId) return;

  try {
    const confirmation = confirm("Are you sure you want to delete all your data? This action is irreversible.");
    if (!confirmation) {
      showToast('Data deletion cancelled.', 'info');
      return;
    }

    // Collect all document refs to delete and commit them in chunks to avoid
    // exceeding Firestore transaction / batch limits.
    const batchSize = 400; // keep safely under Firestore 500 limit

    // Fetch collection docs
    const collectionRef = collection(db, `artifacts/${appId}/users/${userId}/collection`);
    const collectionSnapshot = await getDocs(collectionRef);
    const collectionRefs = collectionSnapshot.docs.map(d => d.ref);

    // Fetch deck docs
    const decksRef = collection(db, `artifacts/${appId}/users/${userId}/decks`);
    const decksSnapshot = await getDocs(decksRef);
    const deckRefs = decksSnapshot.docs.map(d => d.ref);

    // User doc
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);

    const allRefs = [...collectionRefs, ...deckRefs, userDocRef];

    for (let i = 0; i < allRefs.length; i += batchSize) {
      const batch = writeBatch(db);
      allRefs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    // Clear local state after successful deletes
    setLocalCollection({});
    setLocalDecks({});

    showToast('All your data has been successfully deleted.', 'success');
    // Optional: refresh or redirect the user
    window.location.reload();

  } catch (error) {
    console.error('Error clearing all user data:', error);
    showToast('Failed to clear all data. Please try again.', 'error');
  }
}

export function exportAllData() {
  try {
    const dataToExport = { collection: localCollection, decks: localDecks, exportedAt: new Date().toISOString() };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mtg_forge_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Full data exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Failed to export data.', 'error');
  }
}

// --- Centralized Import Handlers ---
// These mirror the previous inline handlers but live here so all data operations
// are available from a single module. They are intentionally defensive and
// will use window.userId / window.tempImportedData when available to maintain
// compatibility with the legacy inline state.

let _tempImportedData = null;

export function handleImportAllData(event) {
  try {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.collection || !data.decks) throw new Error('Invalid backup file structure.');
        _tempImportedData = data;
        try { window.tempImportedData = data; } catch (e) {}
        // Open the import options modal (UI helper exposed on window)
        try { if (typeof window.openModal === 'function') window.openModal('data-import-options-modal'); }
        catch (err) { /* non-fatal */ }
      } catch (error) {
        console.error('Error parsing backup file:', error);
        showToast('Could not parse file. It may be corrupted or not a valid backup.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset input if possible
    try { if (event && event.target) event.target.value = ''; } catch (e) {}
  } catch (err) {
    console.error('[handleImportAllData] error', err);
    showToast('Failed to read import file.', 'error');
  }
}

export async function processDataImport(replace) {
  try {
    // Close the modal that asked merge/replace (if present)
    try { if (typeof window.closeModal === 'function') window.closeModal('data-import-options-modal'); } catch (e) {}

    const data = _tempImportedData || (typeof window !== 'undefined' && window.tempImportedData) || null;
    if (!data) {
      showToast('Import data not found.', 'error');
      return;
    }

    if (replace) {
      // Use the generic confirmation modal if available
      if (typeof window.openModal === 'function' && document && document.getElementById && document.getElementById('confirmation-modal')) {
        document.getElementById('confirmation-title').textContent = 'Replace All Data?';
        document.getElementById('confirmation-message').textContent = 'This will permanently delete all your current decks and collection. This action cannot be undone.';
        if (document.getElementById('confirm-action-btn')) {
          document.getElementById('confirm-action-btn').onclick = async () => {
            try { if (typeof window.closeModal === 'function') window.closeModal('confirmation-modal'); } catch (e) {}
            await executeDataImportBatched(true);
            document.getElementById('confirm-action-btn').onclick = null;
          };
        }
        try { window.openModal('confirmation-modal'); } catch (e) {}
      } else {
        // Fallback to direct execution
        await executeDataImportBatched(true);
      }
    } else {
      await executeDataImportBatched(false);
    }
  } catch (err) {
    console.error('[processDataImport] error', err);
    showToast('Failed to start import process.', 'error');
  }
}

export async function executeDataImportBatched(replace) {
  const data = _tempImportedData || (typeof window !== 'undefined' && window.tempImportedData) || null;
  if (!data) {
    showToast('No import data available.', 'error');
    return;
  }

  const collectionEntries = Object.entries(data.collection || {});
  const deckEntries = Object.entries(data.decks || {});
  const total = collectionEntries.length + deckEntries.length;
  let current = 0;
  const batchSize = 400; // safety below Firestore limit

  let toastId = null;
  try {
    if (typeof showToastWithProgress === 'function') toastId = showToastWithProgress('Importing data...', current, total);
  } catch (e) {}

  try {
    const uid = (typeof window !== 'undefined' && window.userId) || null;
    if (!uid) {
      showToast('User not signed in. Please sign in before importing data.', 'error');
      return;
    }

    // If replacing, delete existing items first in batched chunks
    if (replace) {
      const deleteIds = [
        ...Object.keys(localCollection).map(id => ({ type: 'collection', id })),
        ...Object.keys(localDecks).map(id => ({ type: 'deck', id }))
      ];
      for (let i = 0; i < deleteIds.length; i += batchSize) {
        const batch = writeBatch(db);
        deleteIds.slice(i, i + batchSize).forEach(({ type, id }) => {
          const ref = doc(db, `artifacts/${appId}/users/${uid}/${type === 'collection' ? 'collection' : 'decks'}`, id);
          batch.delete(ref);
        });
        await batch.commit();
      }
    }

    async function batchWrite(entries, type) {
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = writeBatch(db);
        entries.slice(i, i + batchSize).forEach(([id, d]) => {
          const ref = doc(db, `artifacts/${appId}/users/${uid}/${type}`, id);
          batch.set(ref, d, { merge: !replace });
        });
        await batch.commit();
        current += Math.min(batchSize, entries.length - i);
        try { if (typeof updateToastProgress === 'function' && toastId) updateToastProgress(toastId, current, total); } catch (e) {}
      }
    }

    await batchWrite(collectionEntries, 'collection');
    await batchWrite(deckEntries, 'decks');
    try { if (typeof updateToastProgress === 'function' && toastId) updateToastProgress(toastId, total, total); } catch (e) {}
    setTimeout(() => { try { if (typeof removeToastById === 'function' && toastId) removeToastById(toastId); } catch (e) {} }, 1500);
    showToast(`Data successfully imported (${replace ? 'Replaced' : 'Merged'}).`, 'success');
  } catch (err) {
    console.error('Error executing data import:', err);
    showToast('A problem occurred during the import.', 'error');
  } finally {
    _tempImportedData = null;
    try { if (typeof window !== 'undefined') window.tempImportedData = null; } catch (e) {}
  }
}

// Expose to window for legacy inline code
if (typeof window !== 'undefined') {
  window.localCollection = localCollection;
  window.localDecks = localDecks;
  window.cardDeckAssignments = cardDeckAssignments;
  window.updateCardAssignments = updateCardAssignments;
  window.addCardToCollection = addCardToCollection;
  window.deleteDeck = deleteDeck;
  window.exportAllData = exportAllData;
  window.clearAllUserData = clearAllUserData;
  // Import/export handlers
  window.handleImportAllData = handleImportAllData;
  window.processDataImport = processDataImport;
  window.executeDataImportBatched = executeDataImportBatched;
}
