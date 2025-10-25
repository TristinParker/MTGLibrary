/**
 * Lightweight module providing deck suggestion flows using Gemini.
 * Exposes `openDeckSuggestionsModal(deckId)` as default.
 *
 * This version uses a "Send all, then filter" pattern:
 * 1. For each card type (Creature, Instant, etc.), find ALL available cards
 * from the user's collection that match the deck's color identity
 * and are not already in this deck.
 * 2. Send this entire list of candidates (up to ~300) to Gemini in a
 * single API call for that type.
 * 3. Ask Gemini to return a list of the *best* cards from that list,
 * limited to the number needed for the deck (e.g., "up to 4").
 * 4. The model returns JSON with its selections, ratings, and reasons.
 * 5. We then strictly enforce the "up to 4" limit on our side before
 * adding them to the deck.
 *
 * This is more robust than the "Ask, then Filter" pattern as it gives
 * the AI full context of all available cards to make the best tradeoffs.
 * It relies on Gemini's native JSON mode for reliable responses.
 */

import { showToast, openModal, closeModal } from '../lib/ui.js';
import { localCollection, localDecks } from '../lib/data.js';

// --- JSON Schemas for Gemini ---

// This is the schema we *expect* Gemini to return.
// It's a list of suggestions.
const suggestionsResponseSchema = {
  type: "OBJECT",
  properties: {
    "suggestions": {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          "firestoreId": { "type": "STRING" },
          "rating": { "type": "NUMBER" },
          "reason": { "type": "STRING" }
        },
        required: ["firestoreId", "rating", "reason"]
      }
    }
  },
  required: ["suggestions"]
};

// --- End Schemas ---

// Local copy to avoid circular module imports. Validates that cardColors is a subset of commanderColors.
function isColorIdentityValid(cardColors, commanderColors) {
  if (!cardColors || cardColors.length === 0) return true; // Colorless cards are always valid
  if (!commanderColors || commanderColors.length === 0) return cardColors.length === 0; // Only colorless cards if commander is colorless

  const commanderSet = new Set(commanderColors);
  return (cardColors || []).every(c => commanderSet.has(c));
}

/**
 * Open a deck-scoped MTG chat helper that pre-populates the chat with
 * summary context about the deck and calls the existing MTG chat handler
 * or module if available.
 * @param {string} deckId
 */
function openDeckHelp(deckId) {
  try {
    const deck = (window.localDecks || localDecks)[deckId];
    if (!deck) { showToast('Deck not found for Deck Help.', 'error'); return; }

    // Build a short summary: name, format, commander, counts by type, and a sample of cards
    const commanderName = deck.commander?.name || 'Unknown';
    const cards = deck.cards || {};
    const localColl = window.localCollection || localCollection;
    const total = Object.values(cards).reduce((s,c) => s + (c.count||0), 0);
    const typeCounts = {};
    const sample = [];
    for (const fid of Object.keys(cards)) {
      const cdata = localColl[fid] || { name: cards[fid].name || fid, type_line: cards[fid].type_line || '' };
      const mainType = (cdata.type_line || '').split(' — ')[0] || 'Other';
      typeCounts[mainType] = (typeCounts[mainType] || 0) + (cards[fid].count || 0);
      if (sample.length < 20) sample.push(`${cdata.name} x${cards[fid].count || 1}`);
    }

    const countsText = Object.keys(typeCounts).map(k => `${k}: ${typeCounts[k]}`).join(', ');
    const msg = `Deck Help Request:\nDeck: ${deck.name} (${deck.format || 'commander'})\nCommander: ${commanderName}\nTotal cards (non-commander): ${total}\nCounts: ${countsText}\nSample cards: ${sample.join(', ')}\n\nPlease provide guidance, improvements, and suggestions for this deck.\n`;

    // Prefer module-level MTG chat handler if present
    if (typeof window.__module_handleMtgChat === 'function') {
      try { window.__module_handleMtgChat(deckId, msg); return; } catch (e) { console.debug('module mtg chat handler failed', e); }
    }

    // Fallback to delegator
    if (typeof window.handleMtgChat === 'function') {
      try { window.handleMtgChat(msg); return; } catch (e) { console.debug('delegated handleMtgChat failed', e); }
    }

    // Last-resort: open the AI suggestions modal with the message in the status area
    try {
      openDeckSuggestionsModal(deckId, { type: null });
      const status = document.getElementById('deck-suggestions-status');
      if (status) status.textContent = 'Deck Help context loaded. Paste the following into MTG Chat:';
      appendResultBlock('DeckHelp','',0,0,false,msg);
    } catch (e) {
      console.error('Could not open Deck Help UI', e);
      showToast('Deck Help is unavailable in this build.', 'error');
    }
  } catch (err) { console.error('openDeckHelp failed', err); showToast('Deck Help failed to start.', 'error'); }
}

// Expose helpers
try { window.openDeckSuggestionsModal = openDeckSuggestionsModal; window.openDeckHelp = openDeckHelp; } catch(e) {}

export { openDeckSuggestionsModal, openDeckHelp };

// --- Internal Module State ---
let allSuggestedMap = {}; // Map of firestoreId -> suggestion object
let previewSort = { field: 'rating', dir: -1 }; // Preview sorting state
let currentDeckId = null; // Store the deckId for the active modal
let currentTypeFilter = null; // If set, only process this type on Start

/**
 * Creates the modal element and appends it to the DOM if it doesn't exist.
 * This version uses the original two-column UI.
 */
function createModalIfNeeded() {
  if (document.getElementById('deck-suggestions-modal')) return;

  const modalHtml = `
  <div id="deck-suggestions-modal" class="modal hidden fixed inset-0 flex items-center justify-center z-50 modal-backdrop">
    <div class="deck-suggestions-modal-content">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 id="deck-suggestions-title" class="text-2xl font-semibold text-indigo-400 mb-1">AI Deck builder</h3>
          <p id="deck-suggestions-subtitle" class="text-sm text-gray-400">Use AI to build and suggest cards for this deck. Choose an action and start the pass.</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-300">Mode:</label>
          <select id="deck-suggestions-mode-select" class="bg-gray-800 text-gray-200 px-2 py-1 rounded">
            <option value="auto">Automatically apply</option>
            <option value="preview" selected>Preview & approve</option>
          </select>
          <button id="deck-suggestions-cancel-btn" class="ml-2 text-gray-300 hover:text-white">✕</button>
        </div>
      </div>

      <div class="mt-4" style="display:flex; flex:1; gap:1rem; min-height:0;">
        <div style="flex:2; display:flex; flex-direction:column; min-height:0;">
          <div id="deck-suggestions-status" class="text-sm text-gray-300 mb-2">Ready to start.</div>
          <div id="deck-suggestions-results" class="space-y-3 deck-suggestions-results">
            <!-- per-type results appended here (scrollable) -->
            <p class="text-sm text-gray-400">Press "Start" to begin the suggestion pass.</p>
          </div>
          <div style="margin-top:6px; color:#9CA3AF; font-size:12px;">Note: results area is scrollable; preview remains visible below.</div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
          <div class="bg-gray-900 p-3 rounded-lg border border-gray-700">
            <div class="mb-2 text-sm text-gray-300">Actions</div>
            <div class="flex flex-col gap-2">
              <button id="deck-suggestions-start-btn" class="bg-indigo-600 px-3 py-2 rounded">Start</button>
              <button id="deck-suggestions-apply-selected-btn" class="bg-green-600 px-3 py-2 rounded hidden">Add selected</button>
              <button id="deck-suggestions-rerun-btn" class="bg-yellow-600 px-3 py-2 rounded hidden">Find Replacements</button>
              <div id="deck-suggestions-preview-selected-count" class="text-xs text-gray-400 mt-2">0 selected</div>
              <div id="deck-suggestions-save-status" class="text-xs text-gray-400 mt-2">&nbsp;</div>
              <button id="deck-suggestions-save-retry-btn" class="text-xs text-indigo-300 underline hidden">Retry save</button>
            </div>
          </div>
          <div class="bg-gray-900 p-3 rounded-lg border border-gray-700" style="overflow:auto; max-height:40vh;">
            <div class="text-sm text-gray-300 mb-2">Preview Controls</div>
            <div class="flex items-center gap-2">
              <label class="text-xs text-gray-400">Sort:</label>
              <button id="deck-suggestions-sort-rating" class="text-xs text-gray-300 underline">Rating</button>
            </div>
            <!-- Parser mode removed as it's no longer needed -->
          </div>
        </div>
      </div>
      <div id="deck-suggestions-preview" class="mt-4 hidden deck-suggestions-preview-pane">
        <div class="bg-gray-900 rounded-lg p-2 border border-gray-700">
          <table class="w-full text-sm text-left text-gray-300" id="deck-suggestions-preview-table">
            <thead>
              <tr>
                <th class="p-2">Pick</th>
                <th class="p-2">Name</th>
                <th class="p-2">Type</th>
                <th class="p-2">CMC</th>
                <th class="p-2">Colors</th>
                <th class="p-2">Pow/Tou</th>
                <th class="p-2">Rating</th>
                <th class="p-2">Reason</th>
                <th class="p-2">Oracle (preview)</th>
              </tr>
            </thead>
            <tbody id="deck-suggestions-preview-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  `;
  const wrapper = document.createElement('div'); wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper);

  // Wire cancel
  document.getElementById('deck-suggestions-cancel-btn').addEventListener('click', () => closeModal('deck-suggestions-modal'));
}

/**
 * Main entry point. Opens the modal and prepares it for a deck.
 * @param {string} deckId - The Firestore ID of the deck.
 */
function openDeckSuggestionsModal(deckId, opts = {}) {
  createModalIfNeeded();
  currentDeckId = deckId; // Store deckId
  currentTypeFilter = opts.type || null;

  const title = document.getElementById('deck-suggestions-title');
  const deck = (window.localDecks || localDecks)[deckId];
  if (!deck) { showToast('Deck not found for suggestions.', 'error'); return; }

  title.textContent = `AI Deck builder: ${deck.name}`;
  allSuggestedMap = {};

  // If deck has persisted aiSuggestions, seed them into the preview map
  if (deck.aiSuggestions && typeof deck.aiSuggestions === 'object' && !Array.isArray(deck.aiSuggestions)) {
    // Note: This assumes aiSuggestions is a Map/Object: { firestoreId: { ... } }
    Object.entries(deck.aiSuggestions).forEach(([id, s]) => {
      if (!s || !id) return;
      const card = (window.localCollection || localCollection)[id] || {};
      allSuggestedMap[id] = {
        ...card, // Base data from collection (name, type_line, cmc, etc.)
        firestoreId: id,
        rating: s.rating ?? null,
        reason: s.reason || s.note || '',
        slotType: s.slotType || card.type_line?.split(' — ')[0] || 'Unknown',
        sourceType: s.sourceType || card.type_line?.split(' — ')[0] || 'Unknown',
      };
    });
  }

  // --- Reset UI states ---
  document.getElementById('deck-suggestions-status').textContent = 'Ready to start.';
  document.getElementById('deck-suggestions-results').innerHTML = `<p class="text-sm text-gray-400">Press "Start" to begin the suggestion pass.</p>`;
  document.getElementById('deck-suggestions-preview-body').innerHTML = '';
  document.getElementById('deck-suggestions-preview').classList.add('hidden');

  // Reset buttons
  document.getElementById('deck-suggestions-apply-selected-btn').classList.add('hidden');
  document.getElementById('deck-suggestions-rerun-btn').classList.add('hidden');
  document.getElementById('deck-suggestions-start-btn').disabled = false;
  document.getElementById('deck-suggestions-start-btn').textContent = 'Start';

  // Wire Start button
  document.getElementById('deck-suggestions-start-btn').onclick = () => startSuggestionFlow(deckId);

  // Wire Sort control
  const sortBtn = document.getElementById('deck-suggestions-sort-rating');
  sortBtn.onclick = () => {
    previewSort.dir = (previewSort.dir === -1 ? 1 : -1);
    // Note: No text content change on this button in old UI
    reRenderPreviewTable();
  };


  // --- Event Listeners for checkboxes ---
  const updateCheckboxCount = () => {
    const cnt = document.querySelectorAll('.deck-suggestion-checkbox:checked').length;
    const el = document.getElementById('deck-suggestions-preview-selected-count');
    if (el) el.textContent = `${cnt} selected`;
  };
  
  // Need to use event delegation on the body since table rows are dynamic
  document.body.removeEventListener('change', handleModalChangeEvents); // Remove old listener
  document.body.addEventListener('change', handleModalChangeEvents); // Add new one

  openModal('deck-suggestions-modal');

  // If we seeded suggestions, render preview immediately
  if (Object.keys(allSuggestedMap).length > 0) {
    document.getElementById('deck-suggestions-preview').classList.remove('hidden');
    reRenderPreviewTable();
    // Show buttons
    document.getElementById('deck-suggestions-apply-selected-btn').classList.remove('hidden');
    document.getElementById('deck-suggestions-rerun-btn').classList.remove('hidden');
    updateCheckboxCount();
  }

  // Wire retry button (for metadata save)
  const retryBtn = document.getElementById('deck-suggestions-save-retry-btn');
  retryBtn.onclick = () => saveSuggestionMetadata(deckId);
}

/**
 * Handles all 'change' events within the modal for dynamic content.
 */
function handleModalChangeEvents(e) {
  const target = e.target;
  if (!target || !target.classList) return;

  // Update selected count when a checkbox changes
  if (target.classList.contains('deck-suggestion-checkbox')) {
    const cnt = document.querySelectorAll('.deck-suggestion-checkbox:checked').length;
    const el = document.getElementById('deck-suggestions-preview-selected-count');
    if (el) el.textContent = `${cnt} selected`;
  }

  // Update allSuggestedMap when a rating input changes
  if (target.classList.contains('deck-suggestion-rating')) {
    const id = target.dataset.firestoreId;
    const v = parseInt(target.value, 10);
    if (allSuggestedMap[id]) {
      allSuggestedMap[id].rating = Number.isFinite(v) ? v : null;
    }
  }
}

/**
 * Builds a Map of { firestoreId -> cardObject } for a given type.
 * This map excludes cards that are already in the tempDeckList.
 * @param {string} type - The card type (e.g., 'Creature')
 * @param {string[]} commanderColors - The deck's color identity
 * @param {Object} tempDeckList - The current list of cards in the deck
 * @returns {Map<string, Object>}
 */
function buildCandidateMapForType(type, commanderColors, tempDeckList) {
  const col = window.localCollection || localCollection;
  const candidateMap = new Map();

  // --- Land Logic ---
  if (type === 'Land') {
    for (const card of Object.values(col)) {
      // 1. Check color identity (Lands are tricky, but we still respect the rule)
      if (!isColorIdentityValid(card.color_identity, commanderColors)) continue;

      // 2. Check type
      const mainType = (card.type_line || '').split(' — ')[0];
      if (mainType !== 'Land') continue;

      // 3. Add to map. We DON'T check tempDeckList or assignments for lands.
      candidateMap.set(card.firestoreId, card);
    }
  } 
  // --- Non-Land Logic ---
  else {
    for (const card of Object.values(col)) {
      // 1. Check color identity
      if (!isColorIdentityValid(card.color_identity, commanderColors)) continue;

      // 2. Check type
      const mainType = (card.type_line || '').split(' — ')[0];
      if (type && mainType !== type) continue;

      // 3. Check if already in temp deck (from this session OR original)
      if (tempDeckList[card.firestoreId]) continue;

      // 4. Check if assigned to *any* other deck
      const assigns = (window.cardDeckAssignments || {})[card.firestoreId] || [];
      if (assigns.length > 0) continue;

      candidateMap.set(card.firestoreId, card);
    }
  }
  return candidateMap;
}

/**
 * Starts the sequential suggestion flow, one API call per card type.
 * @param {string} deckId
 */
async function startSuggestionFlow(deckId, opts = {}) {
  // Prevent duplicate/parallel runs
  if (window.__deckSuggestionsFlowInFlight) {
    console.warn('[deckSuggestions] suggestion flow already in progress, ignoring duplicate start.');
    showToast('Suggestion flow is already running. Please wait for it to finish.', 'warning');
    return;
  }
  window.__deckSuggestionsFlowInFlight = true;

  
  // --- UI State Update: Show Loading ---
  const statusEl = document.getElementById('deck-suggestions-status');
  statusEl.textContent = 'Starting suggestion flow...';
  document.getElementById('deck-suggestions-start-btn').disabled = true;
  document.getElementById('deck-suggestions-start-btn').textContent = 'Processing...';
  document.getElementById('deck-suggestions-results').innerHTML = ''; // Clear results log
  // ---

  const deck = (window.localDecks || localDecks)[deckId];
  if (!deck) { try { window.__deckSuggestionsFlowInFlight = false; } catch(e){}; showToast('Deck not found.', 'error'); return; }

  const blueprint = deck.aiBlueprint || {};
  const commanderColors = deck.commander?.color_identity || [];
  const targetTotal = (deck.format === 'commander' || !deck.format) ? 99 : 59; // 99 for commander, 59 for 60-card
  const deckFormat = deck.format || 'commander';

  // --- Get type counts from blueprint ---
  const typeCounts = blueprint.counts || {};
  
  // --- Better defaults for type counts ---
  const defaultTypeCounts = {
    'Creature': 25,
    'Planeswalker': 5,
    'Instant': 10,
    'Sorcery': 10,
    'Artifact': 10,
    'Enchantment': 10,
    'Land': 30 // This is for non-basic lands in the 99
  };
  // ---

  // Keep a temporary deck list (firestoreId -> cardObject)
  // This list includes the original deck AND cards added during this session
  const tempDeckList = { ...deck.cards }; // Seed with original deck

  // Helper to count *all* non-commander cards
  function countNonCommander() {
    // The commander is not in the .cards list, so this is fine.
    return Object.values(tempDeckList).reduce((s, c) => s + (c.count || 0), 0);
  }
  
  // --- Helper to count cards of a specific type SLOT in the tempDeckList ---
  const getTempDeckCountForType = (typeToCount) => { // typeToCount is the SLOT (e.g., 'Planeswalker')
    let count = 0;
    for (const card of Object.values(tempDeckList)) {
      // Check original deck cards (which have no slotType)
      if (!card.slotType) {
          const mainType = (card.type_line || '').split(' — ')[0];
          if (mainType === typeToCount) {
            count += (card.count || 0);
          }
      } 
      // Check suggested cards
      else if (card.slotType === typeToCount) {
        count += (card.count || 0);
      }
    }
    return count;
  };
  // ---


  // Types to fill: use a common order or blueprint.types
  let typesToFill = blueprint.types || ['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'];

  // If the modal was opened with a specific type filter, restrict to that
  if (currentTypeFilter) {
    typesToFill = [currentTypeFilter];
    console.debug(`[deckSuggestions] Running suggestion flow limited to type: ${currentTypeFilter}`);
  }

  // --- Main Loop: Process each type sequentially ---
  for (const type of typesToFill) {
    if (countNonCommander() >= targetTotal) break;
    
    // --- Calculate numToRequest based on blueprint ---
    // Use the *original* type from the loop (e.g., 'Planeswalker')
    const targetCount = typeCounts[type] || defaultTypeCounts[type] || 10; // Use blueprint, then default, then 10
    const currentCount = getTempDeckCountForType(type); // Get current count of 'Planeswalker'
    let numToRequest = Math.max(0, targetCount - currentCount);

    if (numToRequest === 0) {
      console.debug(`[deckSuggestions] Type ${type} is already full.`);
      continue;
    }
    // ---

    let effectiveType = type;
    let isFallback = false;
    let candidateMap = buildCandidateMapForType(effectiveType, commanderColors, tempDeckList);

    // --- FALLBACK LOGIC ---
    if (candidateMap.size === 0 && (type === 'Planeswalker' || type === 'Enchantment' || type === 'Artifact')) {
      const fallbackType = 'Creature';
      console.warn(`[deckSuggestions] No ${type} candidates found. Falling back to ${fallbackType}.`);
      effectiveType = fallbackType;
      isFallback = true;
      candidateMap = buildCandidateMapForType(effectiveType, commanderColors, tempDeckList);
    }
    // --- END FALLBACK LOGIC ---

    if (candidateMap.size === 0) {
      console.warn(`[deckSuggestions] No candidates found for ${effectiveType} (slot: ${type}).`);
      statusEl.textContent = `No candidates for ${effectiveType}.`;
      await new Promise(res => setTimeout(res, 500)); // Brief pause
      continue;
    }

    // --- This is the "Send all candidates" logic ---
    const fallbackMsg = isFallback ? `(for ${type} slot)` : '';
    const statusMsg = `Analyzing ${candidateMap.size} ${effectiveType}s ${fallbackMsg}...`;
    statusEl.textContent = statusMsg;
    console.log(`[deckSuggestions] ${statusMsg}`); // Console log now includes fallback info

    // 1. Build the full list of candidates to send
    const candidatesPreview = Array.from(candidateMap.values()).map(c => ({ 
      firestoreId: c.firestoreId, 
      name: c.name, 
      oracle_text: c.oracle_text || '', 
      type_line: c.type_line || '',
      cmc: c.cmc || 0,
      power: c.power || null,
      toughness: c.toughness || null,
      colors: c.colors || [],
      // Include how many copies the user currently owns in their collection
      // so the AI can decide whether duplicates are possible (important for lands).
      owned_count: (c.count || 0),
      // Tiny hint: mark basic lands so the model can prefer them as duplicates when allowed
      is_basic_land: /^(Plains|Island|Swamp|Mountain|Forest)$/i.test(c.name || '')
    }));
    
    // 2. Create the prompt
    let singleCallInstructions = `
      You are an expert Magic: The Gathering deck builder.
      From the "candidates" list, select up to ${numToRequest} of the best cards for this "${effectiveType}" slot.
      The deck is a ${deckFormat} deck.
      Provide a 1-10 rating and a brief "reason" for each card you select.
      Prioritize cards that fit the deck "blueprint" themes: ${blueprint.themes ? blueprint.themes.join(', ') : 'General Synergy'}.
      The commander is: ${deck.commander?.name || 'Unknown'}.
      Current deck size is ${countNonCommander()} / ${targetTotal}.
      IMPORTANT: Return the candidate's exact "firestoreId" string from the candidates list. Do NOT append suffixes like "_1", "_2" to indicate duplicates. If you want duplicates of a card, either return the same "firestoreId" multiple times or include a numeric "count" field on the suggestion object. Return ONLY a JSON object matching the provided schema.
    `;

    // --- Land-specific prompt modification ---
    if (effectiveType === 'Land') {
      singleCallInstructions = `
        You are an expert Magic: The Gathering deck builder.
        From the "candidates" list, select up to ${numToRequest} "Land" cards.
        The deck is a ${deckFormat} deck.
        DUPLICATES ARE ALLOWED for lands, especially Basic Lands.
        FIRST, prioritize non-basic lands that provide helpful bonuses, mana fixing, or utility and match the commander's colors.
        SECOND, after selecting useful non-basic lands, fill the remaining ${numToRequest} slots with Basic Lands (e.g., "Plains", "Island", "Forest") as needed to meet the count.
        Provide a 1-10 rating and a brief "reason" for each card you select.
        IMPORTANT: Return the candidate's exact "firestoreId" string from the candidates list. Do NOT invent or append suffixes like "_1". If you want duplicates, return the same "firestoreId" multiple times or include a numeric "count" field on the suggestion object.
        The commander is: ${deck.commander?.name || 'Unknown'}.
        Current deck size is ${countNonCommander()} / ${targetTotal}.
        Return ONLY a JSON object matching the provided schema.
      `;
    }
    // --- End modification ---

    const singleCallData = {
      blueprint,
      instructions: singleCallInstructions.trim(),
      candidates: candidatesPreview,
    };

    // 3. Call Gemini
    const payload = {
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(singleCallData) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: suggestionsResponseSchema,
      }
    };

    const result = await callGeminiWithRetries(payload, 3, 1000);
    if (!result || !result.suggestions) {
      statusEl.textContent = `AI failed to respond for ${effectiveType}.`;
      console.error(`[deckSuggestions] AI failed to produce valid suggestions for ${effectiveType}.`, result);
      appendResultBlock(effectiveType, type, 0, 0, true, 'AI failed to respond.');
      await new Promise(res => setTimeout(res, 500));
      continue;
    }

    // 4. Process results
    const suggestions = result.suggestions || [];
    const mapped = []; // This will hold the cards we ACTUALLY add
    
    for (const suggestion of suggestions) {
      let card = candidateMap.get(suggestion.firestoreId);
      // If AI returned an ID that doesn't match, attempt tolerant mapping.
      // Historically we've seen suffixes like `_1`, `-1`, ` (1)`, `-copy`, etc.
      if (!card && typeof suggestion.firestoreId === 'string') {
        const orig = suggestion.firestoreId;
        const candidatesToTry = [];

        // Common patterns to strip: _<num>, -<num>,  (<num>), -copy
        candidatesToTry.push(orig);
        candidatesToTry.push(orig.replace(/_\d+$/, ''));
        candidatesToTry.push(orig.replace(/-\d+$/, ''));
        candidatesToTry.push(orig.replace(/\s*\(\d+\)$/, ''));
        candidatesToTry.push(orig.replace(/-copy$/i, ''));
        // Also try trimming trailing dot-number (e.g., id.1)
        candidatesToTry.push(orig.replace(/\.\d+$/, ''));

        // Try each transformed key until we find a candidate in the map
        for (const tryKey of candidatesToTry) {
          if (!tryKey) continue;
          const found = candidateMap.get(tryKey);
          if (found) {
            card = found;
            if (tryKey !== orig) console.debug(`[deckSuggestions] Mapped AI-suggested id ${orig} -> ${tryKey}`);
            break;
          }
        }
      }
      if (!card) {
        console.warn(`[deckSuggestions] AI suggested card ID ${suggestion.firestoreId} not in candidate map.`);
        continue;
      }

      // --- !! CRITICAL FIX !! ---
      // Enforce the numToRequest limit.
      if (mapped.length >= numToRequest) {
        console.debug(`[deckSuggestions] Reached request limit of ${numToRequest} for ${type} slot, skipping remaining AI suggestions.`);
        break; // Stop processing suggestions for this type
      }
      mapped.push(card);
      // --- END FIX ---

      // Add to aggregate map for preview
      allSuggestedMap[card.firestoreId] = Object.assign({
        // Base data from local collection
        ...card, 
        // AI-provided data
        rating: suggestion.rating ?? null,
        reason: suggestion.reason ?? '',
        sourceType: effectiveType, // The type of card it IS (e.g., 'Creature')
        slotType: type, // The slot it FILLS (e.g., 'Planeswalker')
      }, allSuggestedMap[card.firestoreId] || {}); // Merge with any existing data

      // Add to temp deck list for next pass
      tempDeckList[card.firestoreId] = tempDeckList[card.firestoreId] || { count: 0, name: card.name, type_line: card.type_line };
      tempDeckList[card.firestoreId].count = (tempDeckList[card.firestoreId].count || 0) + 1;
      tempDeckList[card.firestoreId].slotType = type; // Mark which slot it fills
    }
    
    // Only proceed if we actually mapped cards to add
    if (mapped.length > 0) {
      // Append incremental per-type UI block
      appendResultBlock(effectiveType, type, mapped.length, numToRequest, false, '');

      // Live update the preview table as each type returns
      try {
        if (!document.getElementById('deck-suggestions-preview').classList.contains('hidden')) {
          reRenderPreviewTable();
        }
      } catch (e) { console.debug('preview re-render failed', e); }
    } else if (suggestions.length > 0) {
      appendResultBlock(effectiveType, type, 0, numToRequest, true, 'AI suggested cards we already have.');
    } else {
      appendResultBlock(effectiveType, type, 0, numToRequest, true, 'No suggestions from AI.');
    }

    statusEl.textContent = `Received ${mapped.length} suggestions for ${effectiveType}.`;
    console.log(`[deckSuggestions] Received ${mapped.length} suggestions for ${effectiveType}. (Slot: ${type}, Requested: ${numToRequest}, AI returned: ${suggestions.length})`);

    // Small delay to be polite
    await new Promise(res => setTimeout(res, 250));
  }
  // --- End Main Loop ---

  // --- Done gathering ---
  statusEl.textContent = `Suggestion pass complete. ${countNonCommander() - Object.keys(deck.cards).length} new cards suggested.`;
  document.getElementById('deck-suggestions-start-btn').disabled = false;
  document.getElementById('deck-suggestions-start-btn').textContent = 'Run Another Pass';


  const mode = document.getElementById('deck-suggestions-mode-select')?.value || 'preview';

  if (mode === 'auto') {
    // Auto-apply
    const idsToAdd = Object.keys(allSuggestedMap).filter(id => !(deck.cards || {})[id]);
  if (idsToAdd.length === 0) { try { window.__deckSuggestionsFlowInFlight = false; } catch(e){}; showToast('No new cards to add.', 'info'); return; }
    
    if (typeof window.handleAddSelectedCardsToDeck === 'function') {
      closeModal('deck-suggestions-modal');
      window.handleAddSelectedCardsToDeck(deckId, idsToAdd);
    } else {
      showToast('Auto-apply is unavailable (handler not found).', 'error');
    }
  } else {
    // Preview mode
    if (Object.keys(allSuggestedMap).length > 0) {
      document.getElementById('deck-suggestions-preview').classList.remove('hidden');
      reRenderPreviewTable(); // Final render

      // Show controls
      document.getElementById('deck-suggestions-apply-selected-btn').classList.remove('hidden');
      document.getElementById('deck-suggestions-rerun-btn').classList.remove('hidden');
      document.getElementById('deck-suggestions-preview-selected-count').textContent = `${Object.keys(allSuggestedMap).length} selected`;

      // Wire buttons
      document.getElementById('deck-suggestions-apply-selected-btn').onclick = () => {
        const ids = Array.from(document.querySelectorAll('.deck-suggestion-checkbox:checked')).map(cb => cb.dataset.firestoreId);
        
        // Save metadata first
        saveSuggestionMetadata(deckId);

        // Close modal and add cards
        closeModal('deck-suggestions-modal');
        if (typeof window.batchAddCardsWithProgress === 'function') {
          window.batchAddCardsWithProgress(deckId, ids);
        } else if (typeof window.handleAddSelectedCardsToDeck === 'function') {
          window.handleAddSelectedCardsToDeck(deckId, ids);
        } else {
          showToast('Card add handler not found on window.', 'error');
        }
      };

      document.getElementById('deck-suggestions-rerun-btn').onclick = () => {
        // User wants replacements.
        // 1. Get selected IDs
        const selectedIds = new Set(Array.from(document.querySelectorAll('.deck-suggestion-checkbox:checked')).map(cb => cb.dataset.firestoreId));
        
        // 2. Remove unselected cards from the aggregate map
        Object.keys(allSuggestedMap).forEach(id => {
          if (!selectedIds.has(id)) {
            delete allSuggestedMap[id];
          }
        });

        // 3. Clear results log and re-run
        document.getElementById('deck-suggestions-results').innerHTML = `<p class="text-sm text-gray-400">Finding replacements...</p>`;
        reRenderPreviewTable(); // Update preview to show only selected
        startSuggestionFlow(deckId);
      };

    } else {
      appendResultBlock('Complete', '', 0, 0, true, 'No new suggestions found for this deck.');
      document.getElementById('deck-suggestions-preview').classList.add('hidden');
    }
  // Clear the in-flight guard so the user can run another pass
  try { window.__deckSuggestionsFlowInFlight = false; } catch (e) {}
}
}

/**
 * Appends a result block to the "Suggestion Log" (left column).
 * @param {string} effectiveType - The type of card found (e.g., 'Creature')
 * @param {string} slotType - The slot it was for (e.g., 'Planeswalker')
 * @param {number} count - Number of cards found
 * @param {number} requested - Number of cards requested
 * @param {boolean} isError - If true, styles as an error/warning
 * @param {string} message - An optional message
 */
function appendResultBlock(effectiveType, slotType, count, requested, isError, message) {
  try {
    const resultsDiv = document.getElementById('deck-suggestions-results');
    // Clear initial message
    if (resultsDiv.querySelector('p')) {
      resultsDiv.innerHTML = '';
    }

    const block = document.createElement('div');
    block.className = `p-3 rounded-lg border ${isError ? 'bg-red-900/20 border-red-700/50' : 'bg-gray-800/60 border-gray-700/50'}`;
    
    let title = '';
    if (slotType && effectiveType !== slotType) {
      title = `${effectiveType} (for ${slotType} slot)`;
    } else {
      title = effectiveType;
    }

    const countColor = count === 0 ? 'text-gray-400' : 'text-green-400';
    const countText = message ? `<span class="text-yellow-400">${message}</span>` : `Found ${count} / ${requested}`;

    block.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-200 font-medium">${title}</div>
        <div class="text-xs ${isError ? 'text-red-300' : countColor}">${countText}</div>
      </div>
    `;
    resultsDiv.appendChild(block);
    resultsDiv.scrollTop = resultsDiv.scrollHeight; // Auto-scroll
  } catch (e) { console.debug('UI append failed', e); }
}

/**
 * Saves the current `allSuggestedMap` metadata to the deck object.
 * This is called when "Add Selected" is clicked.
 * @param {string} deckId
 */
function saveSuggestionMetadata(deckId) {
  if (typeof window.attachSuggestionMetadataToDeck !== 'function') {
    console.warn('[deckSuggestions] attachSuggestionMetadataToDeck function not found.');
    return;
  }

  // Get *only* the selected cards
  const selectedIds = new Set(Array.from(document.querySelectorAll('.deck-suggestion-checkbox:checked')).map(cb => cb.dataset.firestoreId));
  
  const metadataToSave = []; // FIX: Initialize as an array
  for (const id of selectedIds) {
    if (allSuggestedMap[id]) {
      const s = allSuggestedMap[id];
      metadataToSave.push({ // FIX: Push objects into the array
        firestoreId: id, // FIX: Include the ID in the object
        // Only save the AI-generated data, not the full card object
        rating: s.rating ?? null,
        reason: s.reason ?? '',
        sourceType: s.sourceType,
        slotType: s.slotType,
      });
    }
  }
  
  const statusEl = document.getElementById('deck-suggestions-save-status');
  const retryBtn = document.getElementById('deck-suggestions-save-retry-btn');
  statusEl.textContent = 'Saving AI metadata...';
  retryBtn.classList.add('hidden');

  try {
    // This function is expected to be on the window and return a Promise
    window.attachSuggestionMetadataToDeck(deckId, metadataToSave) // FIX: Pass the array
      .then(() => {
        statusEl.textContent = 'AI metadata saved.';
      })
      .catch(err => {
        console.error('Failed to save suggestion metadata', err);
        statusEl.textContent = 'Metadata save failed.';
        retryBtn.classList.remove('hidden');
      });
  } catch (e) {
    console.error('Error calling attachSuggestionMetadataToDeck', e);
    statusEl.textContent = 'Metadata save failed.';
    retryBtn.classList.remove('hidden');
  }
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&"'<>]/g, (s) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[s]));
}

/**
 * Re-renders the entire preview table from the aggregated `allSuggestedMap`.
 */
function reRenderPreviewTable() {
  const previewBody = document.getElementById('deck-suggestions-preview-body');
  if (!previewBody) return;
  
  previewBody.innerHTML = '';
  const arr = Object.values(allSuggestedMap);

  // Sort
  arr.sort((a, b) => {
    const af = (a.rating === null || a.rating === undefined) ? -Infinity : a.rating;
    const bf = (b.rating === null || b.rating === undefined) ? -Infinity : b.rating;
    return (previewSort.dir || -1) * (af - bf);
  });

  const selectedIds = new Set(Array.from(document.querySelectorAll('.deck-suggestion-checkbox:checked')).map(cb => cb.dataset.firestoreId));

  arr.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-700/50 hover:bg-gray-800/60 transition-colors';
    
    // Get checkbox state. If table is re-rendering, maintain checked state.
    // Default to checked if it's a new card.
    const isChecked = selectedIds.has(s.firestoreId) || !selectedIds.size; // Default to checked
    
    const oracle = s.oracle_text || '';
    const cmc = s.cmc ?? '';
    const colors = (s.colors || []).join(', ');
    const pt = (s.power || s.toughness) ? `${s.power || '?'}/${s.toughness || '?'}` : '';
    const rating = s.rating !== undefined && s.rating !== null ? s.rating : '';
    const reason = s.reason || '';

    tr.innerHTML = `
      <td class="p-3"><input type="checkbox" class="deck-suggestion-checkbox" data-firestore-id="${s.firestoreId}" ${isChecked ? 'checked' : ''}></td>
      <td class="p-3 font-medium whitespace-nowrap text-gray-100">${escapeHtml(s.name)}</td>
      <td class="p-3 text-sm text-gray-400">${escapeHtml(s.sourceType)}</td>
      <td class="p-3 text-sm text-gray-400">${cmc}</td>
      <td class="p-3 text-sm text-gray-400">${colors}</td>
      <td class="p-3 text-sm text-gray-400">${pt}</td>
      <td class="p-3 text-sm"><input type="number" min="1" max="10" class="deck-suggestion-rating bg-gray-800 rounded p-1 border border-gray-600 w-16 text-center" data-firestore-id="${s.firestoreId}" value="${rating}"></td>
      <td class="p-3 text-sm text-gray-400 max-w-xs truncate" title="${escapeHtml(reason)}">${escapeHtml(reason)}</td>
      <td class="p-3 text-sm text-gray-500 max-w-xs truncate" title="${escapeHtml(oracle)}">${escapeHtml(oracle)}</td>
    `;
    previewBody.appendChild(tr);
  });
}

/**
 * Robust caller with retries/exponential backoff.
 * Returns the parsed JSON response from Gemini or null.
 * @param {object} payload - The full request payload for Gemini.
 * @param {number} retries - Number of retries.
 * @param {number} initialDelay - Starting delay in ms.
 * @returns {Promise<object|null>} Parsed JSON object or null.
 */
async function callGeminiWithRetries(payload, retries = 3, initialDelay = 1000) {
  let delay = initialDelay;
  // Deduplicate identical in-flight requests to avoid accidental duplicate model calls
  try {
    if (!window.__geminiInFlightMap) window.__geminiInFlightMap = {};
  } catch (e) { window.__geminiInFlightMap = {}; }
  const key = JSON.stringify(payload || {});
  if (window.__geminiInFlightMap[key]) {
    // Return the existing promise so callers share the same result
    return await window.__geminiInFlightMap[key];
  }

  // Store the promise while the request resolves (including retries)
  window.__geminiInFlightMap[key] = (async () => {
  
  // Resolve per-user Gemini URL at runtime (require per-user key; do not rely on hard-coded global)
  const url = (typeof window.getGeminiUrl === 'function') ? await window.getGeminiUrl() : null;
  if (!url) {
    console.error('[deckSuggestions] Gemini API Key is not configured.');
    try { if (typeof window.renderGeminiSettings === 'function') window.renderGeminiSettings(); } catch (e) {}
    try { if (typeof window.showView === 'function') window.showView('settings'); } catch (e) {}
    if (typeof showToast === 'function') showToast('No Gemini API key configured. Add it in Settings to enable AI features.', 'error');
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(`[deckSuggestions] Gemini API error (Attempt ${attempt}):`, resp.status, body);
        throw new Error(`APIError: ${resp.status}`);
      }

      const data = await resp.json();
      
      // Check for blocked content
      if (!data.candidates || data.candidates.length === 0) {
        const blockReason = data.promptFeedback?.blockReason;
        if (blockReason) {
          console.error(`[deckSuggestions] Gemini request blocked: ${blockReason}`, data.promptFeedback);
          showToast(`Request blocked by AI: ${blockReason}`, 'error');
          return null; // Don't retry on content block
        }
        throw new Error('Empty response from Gemini');
      }

      const part = data.candidates?.[0]?.content?.parts?.[0];
      if (!part || !part.text) {
        console.warn(`[deckSuggestions] Malformed response part (Attempt ${attempt}):`, data);
        throw new Error('Malformed response part');
      }

      // With native JSON mode, part.text is a string *containing* JSON.
      const parsedJson = JSON.parse(part.text);
      return parsedJson; // Success!

    } catch (err) {
      console.warn(`[deckSuggestions] Gemini attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        showToast('AI suggestions failed after multiple retries.', 'error');
        return null;
      }
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 10000); // Exponential backoff, max 10s
    }
  }
  return null;
  })();

  try {
    return await window.__geminiInFlightMap[key];
  } finally {
    // Clean up entry for this payload so future requests can run
    try { delete window.__geminiInFlightMap[key]; } catch (e) {}
  }
}

// Note: exports are declared earlier (openDeckSuggestionsModal, openDeckHelp)
// No additional export here to avoid duplicate export errors.

