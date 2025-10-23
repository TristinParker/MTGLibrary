// Lightweight smoke tests for the deckSuggestions parser/validator
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'js', 'pages', 'deckSuggestions.js');
const content = fs.readFileSync(file, 'utf8');

// We will eval a tiny wrapper to access validateSuggestions from the file content
const vm = require('vm');
const sandbox = { console, module: {}, exports: {} };
vm.createContext(sandbox);
// Extract validateSuggestions function using regex
const match = content.match(/function validateSuggestions\([\s\S]*?\n\}/m);
if (!match) { console.error('Could not find validateSuggestions in file'); process.exit(2); }
const funcSrc = match[0] + '\nmodule.exports = validateSuggestions;';
vm.runInContext(funcSrc, sandbox);
const validate = sandbox.module.exports;

function test(description, fn) {
  try { fn(); console.log('[PASS] ' + description); } catch (e) { console.error('[FAIL] ' + description); console.error(e); process.exitCode = 1; }
}

// Test: valid fenced JSON
const fenced = '```json\n{ "suggestions": [ { "firestoreId":"id1", "name":"Card One", "rating":5, "reason":"Good" } ] }\n```';
const fencedMatch = fenced.match(/```json([\s\S]*?)```/i);
const parsed = JSON.parse(fencedMatch[1]);

test('valid suggestions object passes', () => {
  const res = validate(parsed);
  if (!res.ok) throw new Error('validator failed: ' + JSON.stringify(res));
});

// Test: missing firestoreId
const bad = { suggestions: [ { name: 'X' } ] };
test('missing firestoreId fails', () => {
  const res = validate(bad);
  if (res.ok) throw new Error('expected failure');
});

console.log('All parser/validator smoke tests complete.');
