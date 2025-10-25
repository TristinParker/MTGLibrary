// transform-backup.js
// Usage: node transform-backup.js path/to/old-backup.json path/to/new-backup.json

const fs = require('fs');
const path = require('path');

if (process.argv.length < 4) {
  console.error('Usage: node transform-backup.js <old.json> <new.json>');
  process.exit(2);
}

const oldPath = process.argv[2];
const newPath = process.argv[3];

function loadJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('Failed to read or parse', p, err.message);
    process.exit(1);
  }
}

const oldData = loadJSON(oldPath);
const out = {};

// 1) Convert collection
if (Array.isArray(oldData.collection)) {
  out.collection = {};
  for (const card of oldData.collection) {
    const key = card.firestoreId || card.fireStoreId || card.id;
    if (!key) {
      // fallback: try to derive a unique key
      console.warn('Card without firestoreId found, skipping or assigning temporary key:', card.name || card.id);
      continue;
    }
    // copy card as-is (you may want to normalize fields here)
    out.collection[key] = { ...card, firestoreId: key };
  }
} else if (oldData.collection && typeof oldData.collection === 'object') {
  // already an object — shallow copy
  out.collection = { ...oldData.collection };
} else {
  out.collection = {};
}

// 2) Convert decks
if (Array.isArray(oldData.decks)) {
  out.decks = {};
  for (const d of oldData.decks) {
    // prefer explicit id field
    const id = d.id || d.firestoreId || d.deckId || d.name && d.name.replace(/\s+/g,'_').toLowerCase();
    if (!id) {
      console.warn('Deck without id found, skipping or generating temp id:', d);
      continue;
    }
    out.decks[id] = { ...d, id };
  }
} else if (oldData.decks && typeof oldData.decks === 'object') {
  out.decks = { ...oldData.decks };
} else {
  out.decks = {};
}

// 3) Preserve settings (if present)
if (oldData.settings) out.settings = oldData.settings;

// 4) Preserve other root keys if needed (optionally)
if (oldData.exportedAt) out.exportedAt = oldData.exportedAt;
else out.exportedAt = new Date().toISOString();

// 5) Additional normalization: add addedAt for items that don't have it (optional)
for (const [k, card] of Object.entries(out.collection)) {
  if (!card.addedAt) {
    // if old records had no addedAt and you want to keep original unknown time, skip or set to exportedAt
    out.collection[k].addedAt = out.exportedAt;
  }
}

fs.writeFileSync(newPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote transformed file to', newPath);