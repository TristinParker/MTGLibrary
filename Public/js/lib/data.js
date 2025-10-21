import { db, appId } from '../main/index.js';
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, getDocs, runTransaction, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast } from '../lib/ui.js';

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

// Expose to window for legacy inline code
if (typeof window !== 'undefined') {
  window.localCollection = localCollection;
  window.localDecks = localDecks;
  window.cardDeckAssignments = cardDeckAssignments;
  window.updateCardAssignments = updateCardAssignments;
  window.addCardToCollection = addCardToCollection;
  window.deleteDeck = deleteDeck;
  window.exportAllData = exportAllData;
}
