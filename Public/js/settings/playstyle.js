import { db, appId } from '../main/index.js';
// Use runtime getter for per-user Gemini URL (returns null if no key saved)
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast, openModal, closeModal } from '../lib/ui.js';

// Lightweight playstyle questionnaire module
export let playstyleState = {
  summary: null,
  answers: []
};

// --- Core Gemini API Call Helper ---
/**
 * A robust wrapper for calling the Gemini API with exponential backoff.
 * @param {object} payload - The full payload to send to the Gemini API.
 * @param {number} retries - The number of retries for the request.
 * @param {number} delay - The initial delay in ms for retries.
 * @returns {Promise<object|null>} - The parsed JSON from the Gemini response or null on failure.
 */
async function callGeminiWithRetry(payload, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const url = (typeof window.getGeminiUrl === 'function') ? await window.getGeminiUrl() : null;
      if (!url) {
        console.error('[playstyle] Gemini API Key is not defined (per-user key missing).');
        try { if (typeof window.renderGeminiSettings === 'function') window.renderGeminiSettings(); } catch (e) {}
        try { if (typeof window.showView === 'function') window.showView('settings'); } catch (e) {}
        return null;
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        throw new Error(`Gemini API error: ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Invalid or empty response from Gemini.");
      }
      return JSON.parse(text);
    } catch (err) {
      console.error(`Gemini call attempt ${i + 1} failed:`, err);
      if (i === retries - 1) {
        // Last retry failed
        return null;
      }
      // Wait for the delay and then double it for the next potential retry
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  return null;
}


// --- Rewritten Gemini Functions ---

/**
 * Asks Gemini for the next best question based on prior answers.
 * @param {Array<object>} priorAnswers - An array of previous answers.
 * @returns {Promise<object>} - A promise that resolves to { question, choices }.
 */
async function askNextQuestion(priorAnswers) {
  const systemInstruction = `You are an expert survey designer for Magic: The Gathering (MTG) players. Your goal is to create the most informative question to understand a user's playstyle based on their previous answers. Questions should be clear and concise, with 3-5 distinct multiple-choice answers. Avoid repeating questions. Focus on different aspects of MTG playstyles, such as deck preferences, game strategies, social interaction styles, and risk tolerance.`;

  let userPrompt;
  if (priorAnswers.length === 0) {
    userPrompt = "Generate the very first question for an MTG playstyle questionnaire. This question should gauge the player's overall experience with the game, as this will help tailor subsequent questions.";
  } 
  else if (priorAnswers.length === 1) {
    userPrompt = "Generate the second question for an MTG playstyle questionnaire. This question should build on the player's overall experience and delve into their specific preferences.";
  }
  else if (priorAnswers.length === 2) {
    userPrompt = "Generate the third question for an MTG playstyle questionnaire. This question should explore the player's fantasy or thematic preferences in deck building.";
  } else {
    const previousAnswersText = priorAnswers.map(a => `- ${a.question}: ${a.answer}`).join('\n');
    userPrompt = `Based on the user's previous answers, generate the next single best question to further refine their playstyle profile. Do not repeat questions.\n\nPrevious Answers:\n${previousAnswersText}`;
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING", description: "The next question to ask the user." },
          choices: {
            type: "ARRAY",
            description: "An array of 3-5 concise answer choices.",
            items: { type: "STRING" }
          }
        },
        required: ["question", "choices"]
      }
    }
  };

  const result = await callGeminiWithRetry(payload);

  if (result) {
    return result;
  } else {
    console.warn('askNextQuestion failed, falling back to static question');
    // Fallback static question
    return { question: 'Which of these classic archetypes appeals to you most?', choices: ['Aggro (fast creatures)', 'Control (spells and answers)', 'Combo (synergistic engine)', 'Midrange (value and efficiency)'] };
  }
}

/**
 * Synthesizes a structured JSON playstyle profile from a list of answers.
 * @param {Array<object>} answers - The complete list of Q/A pairs.
 * @returns {Promise<object|null>} - The structured playstyle profile or null on failure.
 */
async function synthesizeStructuredPlaystyle(answers) {
    const uid = window.userId || null;
    const systemInstruction = `You are an expert MTG coach and psychographic analyst. Your task is to analyze a player's answers and synthesize a detailed playstyle profile. The summary should be a concise paragraph that can inform other AI agents about the user's preferences. Scores must be between 0 and 100.`;

    const userPrompt = `Analyze the following questionnaire answers and generate a detailed playstyle profile in the specified JSON format.\n\n${answers.map(a => `- ${a.question} -> ${a.answer}`).join('\n')}`;

    const payload = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    summary: {
                        type: "STRING",
                        description: "A plain-text summary of the user's playstyle for other AI agents."
                    },
                    tags: {
                        type: "ARRAY",
                        description: "Short tags (e.g., 'Ramp', 'Political', 'Combo', 'Stax').",
                        items: { type: "STRING" }
                    },
                    scores: {
                        type: "OBJECT",
                        description: "Numeric 0-100 scores for different playstyle axes.",
                        properties: {
                            aggression: { type: "NUMBER" },
                            consistency: { type: "NUMBER" },
                            interaction: { type: "NUMBER" },
                            variance: { type: "NUMBER" },
                            comboAffinity: { type: "NUMBER" }
                        },
                        required: ["aggression", "consistency", "interaction", "variance", "comboAffinity"]
                    },
                    archetypes: {
                        type: "ARRAY",
                        description: "Suggested MTG archetype labels (e.g., 'Izzet Spellslinger', 'Golgari Midrange').",
                        items: { type: "STRING" }
                    }
                },
                required: ["summary", "tags", "scores", "archetypes"]
            }
        }
    };
    
    showToast('Generating playstyle profile...', 'info');
    const parsed = await callGeminiWithRetry(payload);

    if (parsed) {
        // Add the raw answers back in on the client-side
        parsed.rawAnswers = answers;
        playstyleState = parsed;
        window.playstyleSummary = parsed.summary || null;
        if (uid) await savePlaystyleForUser(uid, playstyleState);
        showToast('Playstyle profile saved.', 'success');
        renderPlaystyleWidget();
        return parsed;
    } else {
        console.error('Error synthesizing structured playstyle');
        showToast('Failed to synthesize playstyle profile.', 'error');
        return null;
    }
}


// --- UI and Data Logic ---

export function renderPlaystyleWidget(containerId = 'settings-playstyle') {
  // Prefer the floating panel if it's present
  let container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if ((!container || container === null) && typeof document !== 'undefined') {
    const panel = document.getElementById('playstyle-panel-content');
    if (panel) container = panel;
  }
  if (!container) return;
  container.innerHTML = '';
  const box = document.createElement('div');
  // Make the box a flex column so we can have a scrollable content area and a stable footer
  box.className = 'bg-gradient-to-br from-gray-800/80 to-gray-800 p-4 rounded-xl shadow-lg border border-gray-700 flex flex-col gap-3';
  const summaryHtml = playstyleState.summary ? escapeHtml(playstyleState.summary) : '<em>No playstyle saved yet.</em>';
  box.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-100">Playstyle & Preferences</h3>
    </div>

    <div id="playstyle-scroll-container" class="overflow-auto max-h-[55vh] pr-2">
      <div id="playstyle-summary" class="text-gray-300 leading-relaxed">${summaryHtml}</div>
      <div id="playstyle-meta" class="mt-3 flex flex-wrap gap-2"></div>
      <div id="playstyle-question-area" class="mt-4"></div>
    </div>

    <div class="pt-3 border-t border-gray-700 flex items-center justify-end gap-2">
      <button id="start-playstyle-btn" class="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-3 rounded-md">Start</button>
      <button id="edit-playstyle-btn" class="inline-flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold py-2 px-3 rounded-md">Edit</button>
      <button id="clear-playstyle-btn" class="inline-flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold py-2 px-3 rounded-md">Clear</button>
    </div>
  `;
  container.appendChild(box);

  // Scope button lookups to the container to avoid selecting wrong elements when multiple instances exist
  const startBtn = container.querySelector('#start-playstyle-btn');
  const editBtn = container.querySelector('#edit-playstyle-btn');
  const clearBtn = container.querySelector('#clear-playstyle-btn');

  if (startBtn) startBtn.addEventListener('click', () => startQuestionnaire());
  if (editBtn) editBtn.addEventListener('click', () => startQuestionnaire(playstyleState.answers || []));
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    const uid = window.userId || null;
    if (!uid) { showToast('Sign in to clear your saved playstyle.', 'warning'); return; }
    await clearPlaystyleForUser(uid);
    playstyleState = { summary: null, answers: [] };
    window.playstyleSummary = null;
    // Re-render the widget in the same container
    renderPlaystyleWidget(container.id || containerId);
    showToast('Playstyle cleared.', 'success');
  });
}

function escapeHtml(s) { return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function startQuestionnaire(existingAnswers = []) {
  const answers = existingAnswers.length ? existingAnswers.slice() : [];
  const area = document.getElementById('playstyle-question-area');
  if (!area) return;
  area.innerHTML = '<div class="text-gray-400">Loading next question...</div>';

  async function step() {
    area.innerHTML = '<div class="text-gray-400">Loading next question...</div>';
    
    if (answers.length >= 10) {
      area.innerHTML = `
        <div class="space-y-3">
          <div class="text-gray-300">You've answered 10 questions. Ready to generate your detailed playstyle profile?</div>
          <div class="flex gap-2">
            <button id="generate-playstyle-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Generate Profile</button>
            <button id="restart-playstyle-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Restart</button>
          </div>
        </div>`;
      document.getElementById('generate-playstyle-btn').addEventListener('click', async () => {
        await synthesizeStructuredPlaystyle(answers);
        area.innerHTML = '';
        renderPlaystyleWidget();
      });
      document.getElementById('restart-playstyle-btn').addEventListener('click', () => { answers.length = 0; step(); });
      return;
    }

    const next = await askNextQuestion(answers);
    area.innerHTML = ''; 
    const qCard = document.createElement('div');
    qCard.className = 'space-y-3';
    qCard.innerHTML = `<div class="font-semibold text-gray-200">Q${answers.length + 1}: ${escapeHtml(next.question)}</div>`;
    
    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'flex flex-wrap gap-2';
    
    (next.choices || []).forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded';
      btn.textContent = choice;
      btn.addEventListener('click', () => {
        answers.push({ questionId: answers.length + 1, question: next.question, answer: choice });
        step();
      });
      choicesDiv.appendChild(btn);
    });

    qCard.appendChild(choicesDiv);
    const nav = document.createElement('div');
    nav.className = 'flex gap-2 mt-2';
    if (answers.length > 0) {
      const prev = document.createElement('button');
      prev.className = 'bg-gray-600 hover:bg-gray-700 text-white py-1 px-3 rounded';
      prev.textContent = 'Back';
      prev.addEventListener('click', () => { answers.pop(); step(); });
      nav.appendChild(prev);
    }
    qCard.appendChild(nav);
    area.appendChild(qCard);
  }

  step();
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
    renderPlaystyleWidget();
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
    const snap = await getDoc(userDocRef);
    const currentSettings = snap.exists() ? snap.data().settings || {} : {};
    const newSettings = { ...currentSettings, playstyle: playstyleObj };
    await setDoc(userDocRef, { settings: newSettings }, { merge: true });
    
    playstyleState = playstyleObj;
    window.playstyleSummary = playstyleState.summary || null;
    renderPlaystyleWidget();
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
    const snap = await getDoc(userDocRef);
    const currentSettings = snap.exists() ? snap.data().settings || {} : {};
    currentSettings.playstyle = null; // or delete currentSettings.playstyle;
    await setDoc(userDocRef, { settings: currentSettings }, { merge: true });

    playstyleState = { summary: null, answers: [] };
    window.playstyleSummary = null;
    renderPlaystyleWidget();
    return true;
  } catch (err) {
    console.error('Error clearing playstyle for user', err);
    return false;
  }
}

export function attachPlaystyleToPrompt(prompt) {
  const summary = playstyleState.summary || window.playstyleSummary || null;
  if (!summary) return prompt;
  return `${prompt}\n\nFor context, here is the user's MTG Playstyle Summary:\n${summary}\n`;
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
  // do not auto-render on import; Settings view will call renderPlaystyleWidget when visible
  console.log('[Playstyle] Module initialized.');
}

// auto-init if imported
initPlaystyleModule();

