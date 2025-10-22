import { db, appId, GEMINI_API_URL } from '../main/index.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast, openModal, closeModal } from '../lib/ui.js';

// Lightweight playstyle questionnaire module
export let playstyleState = {
  summary: null,
  answers: []
};

// The questionnaire will be driven by Gemini: we ask Gemini what the next best question is
// given prior answers. At the end Gemini will produce a structured Playstyle JSON with
// fields: summary, tags[], scores{aggression, consistency, interaction, variance}, archetypes[]


function renderPlaystyleWidget(containerId = 'settings-playstyle') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'bg-gray-800 p-6 rounded-lg shadow-lg';
  box.innerHTML = `
    <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Playstyle & Preferences</h2>
    <div id="playstyle-summary" class="text-gray-300 mb-4">${playstyleState.summary ? escapeHtml(playstyleState.summary) : '<em>No playstyle saved yet.</em>'}</div>
    <div class="flex gap-2">
      <button id="start-playstyle-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">Start Questionnaire</button>
      <button id="edit-playstyle-btn" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg">Edit</button>
      <button id="clear-playstyle-btn" class="bg-red-800 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Clear</button>
    </div>
    <div id="playstyle-question-area" class="mt-4"></div>
  `;
  container.appendChild(box);

  document.getElementById('start-playstyle-btn').addEventListener('click', () => startQuestionnaire());
  document.getElementById('edit-playstyle-btn').addEventListener('click', () => startQuestionnaire(playstyleState.answers || []));
  document.getElementById('clear-playstyle-btn').addEventListener('click', async () => {
    const uid = window.userId || null;
    if (!uid) { showToast('Sign in to clear your saved playstyle.', 'warning'); return; }
    await clearPlaystyleForUser(uid);
    playstyleState = { summary: null, answers: [] };
    window.playstyleSummary = null;
    renderPlaystyleWidget(containerId);
    showToast('Playstyle cleared.', 'success');
  });
}

function escapeHtml(s) { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function startQuestionnaire(existingAnswers = []) {
  const answers = existingAnswers.length ? existingAnswers.slice() : [];
  const area = document.getElementById('playstyle-question-area');
  if (!area) return;
  area.innerHTML = '';

  // Ask Gemini for the next question given prior answers
  async function askNextQuestion(priorAnswers) {
    // Build a short prompt: provide prior Q/A and request next best question and optional choices
    const prompt = `You are a survey designer for Magic: The Gathering players. Given the following prior answers (question id and answer) from a user:\n\n${priorAnswers.map(a => `Q${a.questionId}: ${a.answer}`).join('\n')}\n\nProvide the next most informative multiple-choice question (brief), and a small list of 3-5 concise answer choices. Respond with a single JSON object exactly like: { "question": "...", "choices": ["a","b","c"] }. Do not include any explanatory text.`;

    try {
      const resp = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      if (!resp.ok) throw new Error('Gemini error: ' + resp.status);
      const data = await resp.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      text = text.replace(/```/g, '\n').trim();
      // Robust JSON extraction: find first '{' and last '}' and parse that
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first >= 0 && last > first) {
        const jsonStr = text.substring(first, last + 1);
        try { return JSON.parse(jsonStr); } catch (e) { throw e; }
      }
      // If it wasn't JSON, attempt to parse as a simple line format
      // e.g. "question: ...\nchoices:\n- a\n- b"
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const qLine = lines.find(l => /question[:]/i.test(l)) || lines[0] || 'Which play pattern do you prefer?';
      const question = qLine.replace(/^(question[:]\s*)/i, '');
      const choices = lines.filter(l => /^[-\d\.]/.test(l) || l.includes(','));
      if (choices.length) {
        const parsedChoices = choices.map(c => c.replace(/^[-\d\.\)\s]*/, '').split(',').map(s => s.trim()).filter(Boolean)).flat();
        return { question, choices: parsedChoices.slice(0,5) };
      }
      return { question, choices: ['Aggro','Control','Combo','Midrange'] };
    } catch (err) {
      console.warn('askNextQuestion failed, falling back to static question', err);
      // Fallback static question
      return { question: 'Which play pattern do you prefer?', choices: ['Aggro', 'Control', 'Combo', 'Midrange'] };
    }
  }

  // Render a single step: get next question from Gemini and render choices
  async function step() {
    area.innerHTML = '';
    // If we've collected 10 answers, finish and synthesize structured playstyle
    if (answers.length >= 10) {
      const finishDiv = document.createElement('div');
      finishDiv.className = 'space-y-3';
      finishDiv.innerHTML = `\n        <div class="text-gray-300">You're done. Generate detailed playstyle profile?</div>\n        <div class="flex gap-2">\n          <button id="generate-playstyle-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Generate Profile</button>\n          <button id="restart-playstyle-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Restart</button>\n        </div>\n      `;
      area.appendChild(finishDiv);
      document.getElementById('generate-playstyle-btn').addEventListener('click', async () => {
        await synthesizeStructuredPlaystyle(answers);
        area.innerHTML = '';
        renderPlaystyleWidget();
      });
      document.getElementById('restart-playstyle-btn').addEventListener('click', () => { answers.length = 0; step(); });
      return;
    }

    const next = await askNextQuestion(answers);
    const qCard = document.createElement('div'); qCard.className = 'space-y-3';
    qCard.innerHTML = `<div class="font-semibold text-gray-200">${escapeHtml(next.question)}</div>`;
    const choicesDiv = document.createElement('div'); choicesDiv.className = 'flex flex-wrap gap-2';
    (next.choices || []).forEach((choice, idxChoice) => {
      const btn = document.createElement('button'); btn.className = 'bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded'; btn.textContent = choice;
      btn.addEventListener('click', () => {
        answers.push({ questionId: answers.length + 1, question: next.question, answer: choice });
        step();
      });
      choicesDiv.appendChild(btn);
    });
    // allow a free-text choice if Gemini didn't provide choices
    if (!next.choices || !next.choices.length) {
      const input = document.createElement('input'); input.className = 'bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm'; input.placeholder = 'Your answer';
      const submit = document.createElement('button'); submit.className = 'bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-3 rounded ml-2'; submit.textContent = 'Submit';
      submit.addEventListener('click', () => { if (input.value.trim()) { answers.push({ questionId: answers.length + 1, question: next.question, answer: input.value.trim() }); step(); } });
      choicesDiv.appendChild(input); choicesDiv.appendChild(submit);
    }
    qCard.appendChild(choicesDiv);
    const nav = document.createElement('div'); nav.className = 'flex gap-2 mt-2';
    if (answers.length > 0) {
      const prev = document.createElement('button'); prev.className = 'bg-gray-600 hover:bg-gray-700 text-white py-1 px-3 rounded'; prev.textContent = 'Previous'; prev.addEventListener('click', () => { answers.pop(); step(); }); nav.appendChild(prev);
    }
    qCard.appendChild(nav);
    area.appendChild(qCard);
  }

  // Start
  step();
}

async function generatePlaystyleSummary(answers) {
  try {
    const uid = window.userId || null;
    // Compose prompt for Gemini
    // Deprecated single-line generator kept for compatibility; prefer structured synthesis
    return synthesizeStructuredPlaystyle(answers);
  } catch (err) {
    console.error('Error generating playstyle summary', err);
    showToast('Failed to generate playstyle summary.', 'error');
  }
}

async function synthesizeStructuredPlaystyle(answers) {
  try {
    const uid = window.userId || null;
    const prompt = `You are an expert MTG coach and psychographic analyst. Given the following Q/A pairs from a player:\n\n${answers.map(a => `- Q${a.questionId}: ${a.question} -> ${a.answer}`).join('\n')}\n\nProduce a single JSON object only with the exact keys: \n- summary: a 1-2 sentence plain-text summary,\n- tags: array of short tag strings (e.g., "ramp","political","combo"),\n- scores: object with numeric 0-100 keys: aggression, consistency, interaction, variance, comboAffinity,\n- archetypes: array of suggested archetype labels (strings),\n- rawAnswers: the original Q/A array as provided.\nReturn valid JSON only.`;

    // Show a progress toast while synthesizing
    const toastId = showToastWithProgress ? showToastWithProgress('Generating playstyle profile...', 0, 1) : null;
    const resp = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    let jsonText = '';
    if (resp.ok) {
      const data = await resp.json();
      jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      jsonText = jsonText.replace(/```/g, '').trim();
      if (toastId) updateToastProgress && updateToastProgress(toastId, 1, 1);
    } else {
      console.warn('synthesizeStructuredPlaystyle Gemini failed', resp.status);
      // fallback minimal structure
      const fallback = { summary: 'Fallback: could not synthesize structured playstyle.', tags: [], scores: { aggression: 50, consistency: 50, interaction: 50, variance: 50, comboAffinity: 50 }, archetypes: [], rawAnswers: answers };
      playstyleState = fallback; window.playstyleSummary = fallback.summary; if (uid) await savePlaystyleForUser(uid, playstyleState);
      if (toastId) { updateToastProgress && updateToastProgress(toastId, 1, 1); setTimeout(() => removeToastById && removeToastById(toastId), 600); }
      showToast('Playstyle saved (fallback).', 'success'); renderPlaystyleWidget(); return fallback;
    }

    // Ensure we parse the JSON safely (strip any leading text)
    // Robust JSON extraction
    const first = jsonText.indexOf('{');
    const last = jsonText.lastIndexOf('}');
    let parsed = null;
    if (first >= 0 && last > first) {
      const jsonStr = jsonText.substring(first, last + 1);
      parsed = JSON.parse(jsonStr);
    } else {
      parsed = JSON.parse(jsonText);
    }
    // Validate/normalize
    parsed.tags = parsed.tags || [];
    parsed.scores = parsed.scores || { aggression: 50, consistency: 50, interaction: 50, variance: 50, comboAffinity: 50 };
    parsed.archetypes = parsed.archetypes || [];
    parsed.rawAnswers = answers;
    playstyleState = parsed;
    window.playstyleSummary = parsed.summary || null;
    if (uid) await savePlaystyleForUser(uid, playstyleState);
    if (toastId) { updateToastProgress && updateToastProgress(toastId, 1, 1); setTimeout(() => removeToastById && removeToastById(toastId), 600); }
    showToast('Playstyle profile saved.', 'success');
    try { renderPlaystyleWidget(); } catch (e) {}
    return parsed;
  } catch (err) {
    console.error('Error synthesizing structured playstyle', err);
    showToast('Failed to synthesize playstyle.', 'error');
    return null;
  }
}

export async function loadPlaystyleForUser(userId) {
  if (!userId) return null;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const snap = await getDoc(userDocRef);
    const settings = snap.exists() ? (snap.data().settings || {}) : {};
    const ps = settings.playstyle || null;
    playstyleState = ps || { summary: null, answers: [] };
    window.playstyleSummary = playstyleState.summary || null;
    // If the settings UI is mounted, render
    try { renderPlaystyleWidget(); } catch (e) {}
    return playstyleState;
  } catch (err) {
    console.error('Error loading playstyle for user', err);
    return null;
  }
}

export async function savePlaystyleForUser(userId, playstyleObj) {
  if (!userId) return false;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const current = (await getDoc(userDocRef)).data()?.settings || {};
    await setDoc(userDocRef, { settings: Object.assign({}, current, { playstyle: playstyleObj }) }, { merge: true });
    playstyleState = playstyleObj;
    window.playstyleSummary = playstyleState.summary || null;
    try { renderPlaystyleWidget(); } catch (e) {}
    return true;
  } catch (err) {
    console.error('Error saving playstyle for user', err);
    return false;
  }
}

export async function clearPlaystyleForUser(userId) {
  if (!userId) return false;
  try {
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}`);
    const current = (await getDoc(userDocRef)).data()?.settings || {};
    current.playstyle = null;
    await setDoc(userDocRef, { settings: current }, { merge: true });
    playstyleState = { summary: null, answers: [] };
    window.playstyleSummary = null;
    try { renderPlaystyleWidget(); } catch (e) {}
    return true;
  } catch (err) {
    console.error('Error clearing playstyle for user', err);
    return false;
  }
}

export function attachPlaystyleToPrompt(prompt) {
  // Returns prompt with appended playstyle summary (if present)
  const summary = playstyleState.summary || window.playstyleSummary || null;
  if (!summary) return prompt;
  return `${prompt}\n\nUser Playstyle Summary:\n${summary}\n`;
}

export function initPlaystyleModule() {
  if (typeof window !== 'undefined') {
    window.playstyle = {
      loadPlaystyleForUser,
      savePlaystyleForUser,
      clearPlaystyleForUser,
      attachPlaystyleToPrompt
    };
    window.playstyleState = playstyleState;
    window.playstyleSummary = playstyleState.summary || null;
  }
  // attempt to render if settings view is present
  try { renderPlaystyleWidget(); } catch (e) {}
  console.log('[Playstyle] Module initialized.');
}

// auto-init if imported
initPlaystyleModule();
