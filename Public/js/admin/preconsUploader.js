import { db } from '../firebase/init.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { showToast } from '../lib/ui.js';

/**
 * Upload local precons JSON files to Firestore under collection `precons`.
 * Expects an index at /precons/index.generated.json or /precons/index.json
 * Each entry must have { name, file, cover }
 */
export async function uploadPreconsToFirestore(progressCb) {
  try {
    const idxPaths = ['/precons/index.generated.json', '/precons/index.json'];
    let idx = null;
    for (const p of idxPaths) {
      try {
        const r = await fetch(p);
        if (r && r.ok) { idx = await r.json(); break; }
      } catch (e) { /* ignore */ }
    }
    if (!Array.isArray(idx) || idx.length === 0) {
      showToast('No precons index found. Generate index.generated.json first.', 'error');
      return { success: false, reason: 'no-index' };
    }

    const results = [];
    for (let i = 0; i < idx.length; i++) {
      const item = idx[i];
      const filePath = item.file || item.path || '';
      const name = item.name || item.title || `precon-${i}`;
      try {
        if (!filePath) {
          results.push({ name, filePath, ok: false, err: 'no file path' });
          continue;
        }
        const r = await fetch(filePath);
        if (!r.ok) { results.push({ name, filePath, ok: false, err: `fetch failed ${r.status}` }); continue; }
        const content = await r.json();
        // Document id: use basename of filePath without extension, sanitize slashes
        const parts = filePath.split('/').filter(Boolean);
        const base = parts[parts.length - 1] || `precon_${i}`;
        const id = base.replace(/\.json$/i, '');
        const docRef = doc(db, 'precons', id);
        await setDoc(docRef, {
          name,
          file: filePath,
          cover: item.cover || item.coverImage || item.image || '',
          content,
          updatedAt: serverTimestamp(),
          uploader: (window.__firebase_auth && window.__firebase_auth.currentUser && window.__firebase_auth.currentUser.email) || null
        }, { merge: true });
        results.push({ name, filePath, ok: true, id });
        if (typeof progressCb === 'function') progressCb(i + 1, idx.length, name);
      } catch (err) {
        console.error('uploadPrecons: failed for', filePath, err);
        results.push({ name, filePath, ok: false, err: err && err.message || String(err) });
      }
    }
    showToast(`Uploaded ${results.filter(r => r.ok).length}/${results.length} precons.`, 'success');
    return { success: true, results };
  } catch (err) {
    console.error('uploadPreconsToFirestore failed', err);
    showToast('Precons upload failed.', 'error');
    return { success: false, reason: err && err.message };
  }
}
