#!/usr/bin/env node
/**
 * Generate an index.generated.json file for the UI by scanning Public/precons
 * - Writes Public/precons/index.generated.json (does not overwrite user's index.json)
 * - Each entry: { name, file, cover }
 *
 * Run from repo root:
 *   node scripts\generate-precons-index.js
 */
const fs = require('fs');
const path = require('path');

const preconsDir = path.join(__dirname, '..', 'Public', 'precons');
const outFile = path.join(preconsDir, 'index.generated.json');

function safeReadJson(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function deriveName(obj, filename) {
  if (!obj) return filename;
  return obj.name || obj.title || (obj.data && (obj.data.name || obj.data.title)) || (obj.data && Array.isArray(obj.data.commander) && obj.data.commander[0] && obj.data.commander[0].name) || filename;
}

function deriveCover(obj) {
  if (!obj) return '';
  if (obj.cover) return obj.cover;
  if (obj.coverImage) return obj.coverImage;
  // try commander image
  const commander = obj.commander || (obj.data && obj.data.commander);
  if (Array.isArray(commander) && commander[0] && commander[0].image_uris) {
    return commander[0].image_uris.normal || commander[0].image_uris.small || '';
  }
  // try first mainBoard card image
  const main = obj.mainBoard || (obj.data && obj.data.mainBoard);
  if (Array.isArray(main) && main[0] && main[0].image_uris) {
    return main[0].image_uris.normal || main[0].image_uris.small || '';
  }
  return '';
}

function makeWebPath(filePath) {
  // Convert absolute path under Public into a web path starting with /
  const parts = filePath.split(path.sep);
  const publicIndex = parts.findIndex(p => p.toLowerCase() === 'public');
  if (publicIndex >= 0) {
    return '/' + parts.slice(publicIndex + 1).join('/').replace(/\\/g, '/');
  }
  return '/' + path.basename(filePath);
}

function run() {
  if (!fs.existsSync(preconsDir)) {
    console.error('Precons directory not found:', preconsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(preconsDir).filter(f => f.toLowerCase().endsWith('.json'));
  const entries = [];
  files.forEach(f => {
    const full = path.join(preconsDir, f);
    // skip generated index file and user index.json (don't overwrite user's index.json)
    if (f === 'index.generated.json') return;
    if (f === 'index.json') return;
    const obj = safeReadJson(full);
    const name = deriveName(obj, path.basename(f, '.json'));
    const cover = deriveCover(obj) || '';
    entries.push({ name, file: makeWebPath(full), cover });
  });

  // sort alphabetically by name
  entries.sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  fs.writeFileSync(outFile, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`Wrote ${outFile} with ${entries.length} entries.`);
}

run();
