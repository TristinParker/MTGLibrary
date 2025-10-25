import { app, db, auth, appId } from '../firebase/init.js';
import { getGeminiUrlForCurrentUser } from '../firebase/gemini.js';
import * as Auth from '../firebase/auth.js';
import * as Settings from '../settings/settings.js';

// Re-export for legacy code expecting globals
window.db = db;
window.auth = auth;
window.appId = appId;
// Expose runtime getter for per-user Gemini URL (may return null if no key saved)
window.getGeminiUrl = getGeminiUrlForCurrentUser;

console.log('[Main] Entry module loaded. Firebase/auth/settings available.');

// TODO: Move remaining app logic into page-specific modules under js/pages/
// Also export these values for other modules to import
export { app, db, auth, appId, getGeminiUrlForCurrentUser };
