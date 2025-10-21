const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index-dev.html';
  const outDir = path.resolve(__dirname);
  const screenshotPath = path.join(outDir, 'smoke-screenshot.png');
  const resultsPath = path.join(outDir, 'smoke-results.json');

  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();

  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];

  page.on('console', msg => {
    try {
      const args = msg.args().map(a => a._remoteObject && a._remoteObject.value !== undefined ? a._remoteObject.value : a.toString());
      consoleMessages.push({type: msg.type(), text: msg.text(), args});
    } catch (e) {
      consoleMessages.push({type: msg.type(), text: msg.text()});
    }
  });

  page.on('pageerror', err => {
    pageErrors.push({message: err.message, stack: err.stack});
  });

  page.on('requestfailed', req => {
    const failure = req.failure && req.failure();
    requests.push({url: req.url(), status: 'failed', errorText: failure && failure.errorText});
  });

  // Capture request bodies for Identity Toolkit calls as well (helps debug payloads)
  page.on('request', req => {
    try {
      const url = req.url();
      if (url.includes('identitytoolkit.googleapis.com')) {
        const postData = req.postData ? req.postData() : null;
        requests.push({ url, status: 'request', method: req.method(), postData });
      }
    } catch (e) {
      // ignore
    }
  });

  page.on('requestfinished', async req => {
    try {
      const res = req.response();
      if (res) {
        requests.push({url: req.url(), status: 'finished', statusCode: res.status(), statusText: res.statusText()});
      } else {
        requests.push({url: req.url(), status: 'finished'});
      }
    } catch (e) {
      requests.push({url: req.url(), status: 'finished', error: String(e)});
    }
  });

  // Capture response bodies for Identity Toolkit (Firebase) calls to see error details
  page.on('response', async res => {
    try {
      const url = res.url();
      if (url.includes('identitytoolkit.googleapis.com')) {
        let body = null;
        try {
          body = await res.text();
        } catch (e) {
          body = null;
        }
        // Append to requests as an entry with body for easier debugging
        requests.push({ url, status: 'response', statusCode: res.status(), statusText: res.statusText(), body });
      }
    } catch (e) {
      // ignore
    }
  });

  try {
    await page.setViewport({width: 1280, height: 800});
    const response = await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

  // Wait a short while for any late async logs (use a generic timeout for broader Puppeteer compatibility)
  await new Promise(resolve => setTimeout(resolve, 1500));

    // If a first-run setup modal exists, try to run it automatically for the smoke test.
    try {
      const hasSetupBtn = await page.$('#open-setup-btn');
      if (hasSetupBtn) {
        const uniq = Date.now();
        const testEmail = `smoke+${uniq}@example.com`;
        const testPass = `Sm0keTest!${uniq}`;
        // Open the setup modal in a robust way
        await page.evaluate(() => { const b = document.getElementById('open-setup-btn'); if (b) b.click(); });
        await page.waitForSelector('#first-run-setup', { timeout: 3000 }).catch(() => {});

        // Fill inputs via evaluate so it doesn't rely on element visibility/clickability
        await page.evaluate((email, pass) => {
          const e = document.getElementById('setup-email');
          const p = document.getElementById('setup-password');
          if (e) {
            e.focus(); e.value = email; e.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (p) {
            p.focus(); p.value = pass; p.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, testEmail, testPass);

        // Trigger the run button via evaluate to avoid not-clickable errors
        await page.evaluate(() => { const btn = document.getElementById('run-setup-btn'); if (btn) btn.click(); });

        // Also directly invoke an available handler to ensure signup + verification is exercised.
        try {
          const directResult = await page.evaluate(async () => {
            const eEl = document.getElementById('setup-email');
            const pEl = document.getElementById('setup-password');
            const email = eEl ? eEl.value : null;
            const pass = pEl ? pEl.value : null;
            // If the page uses the primary login inputs for signup handlers, copy values there so fallback handlers work
            try {
              const mainEmail = document.getElementById('email');
              const mainPass = document.getElementById('password');
              if (mainEmail && email) { mainEmail.value = email; mainEmail.dispatchEvent(new Event('input', { bubbles: true })); }
              if (mainPass && pass) { mainPass.value = pass; mainPass.dispatchEvent(new Event('input', { bubbles: true })); }
            } catch (copyErr) {
              // ignore
            }
            // Prefer the explicit first-run handler if present
            if (window && typeof window.handleFirstRunSetup === 'function') {
              try { return { handler: 'handleFirstRunSetup', result: await window.handleFirstRunSetup(email, pass) }; } catch (e) { return { handler: 'handleFirstRunSetup', error: e && e.message || String(e) }; }
            }
            // Fallback to the generic email signup handler
            if (window && typeof window.handleEmailSignup === 'function') {
              try { return { handler: 'handleEmailSignup', result: await window.handleEmailSignup() }; } catch (e) { return { handler: 'handleEmailSignup', error: e && e.message || String(e) }; }
            }
            return { handler: null, reason: 'no-handler' };
          });
          consoleMessages.push({ type: 'info', text: 'Direct setup invocation result: ' + JSON.stringify(directResult) });
        } catch (e) {
          consoleMessages.push({ type: 'info', text: 'Direct setup invocation failed: ' + String(e) });
        }
        // If UI path didn't surface results, call the handler directly to ensure server-side flow is exercised
        try {
          const handlerExists = await page.evaluate(() => !!(window && window.handleFirstRunSetup));
          if (handlerExists) {
            const directRes = await page.evaluate(async (email, pass) => {
              try {
                const r = await window.handleFirstRunSetup(email, pass);
                return { ok: true, result: r };
              } catch (e) {
                return { ok: false, error: (e && e.message) || String(e) };
              }
            }, testEmail, testPass);
            consoleMessages.push({ type: 'info', text: 'Direct setup handler result: ' + JSON.stringify(directRes) });
          }
        } catch (e) {
          consoleMessages.push({ type: 'info', text: 'Direct setup invocation failed: ' + String(e) });
        }
      }
    } catch (e) {
      consoleMessages.push({ type: 'info', text: 'Setup exercise failed: ' + String(e) });
    }

    // If Firestore snapshots contain no cards/decks, seed a small test card and deck so the UI can render them in headless tests.
    try {
      const seedResult = await page.evaluate(async () => {
        try {
          const debug = { ok: false, reason: null };
          // try to detect user/app context from multiple fallbacks
          const uid = (window.userId) || (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || null;
          const appId = (window.appId) || (window.APP_ID) || (window.__APP_ID) || (window.config && window.config.appId) || null;
          debug.detected = { uid, appId };
          if (!window.db || !uid || !appId) {
            debug.reason = 'missing-context';
            console.log('[SmokeTest] seeding skipped, missing context', debug);
            return debug;
          }
          const existing = Object.keys(window.localCollection || {}).length;
          const existingDecks = Object.keys(window.localDecks || {}).length;
          debug.existing = { cards: existing, decks: existingDecks };
          if (existing > 0 || existingDecks > 0) {
            debug.reason = 'already-has-data';
            console.log('[SmokeTest] seeding skipped, data present', debug);
            return debug;
          }
          const uniq = Date.now();
          const cardId = `smoke-test-card-${uniq}`;
          const deckId = `smoke-test-deck-${uniq}`;
          const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
          const cardRef = doc(window.db, `artifacts/${appId}/users/${uid}/collection`, cardId);
          const deckRef = doc(window.db, `artifacts/${appId}/users/${uid}/decks`, deckId);
          await setDoc(cardRef, {
            firestoreId: cardId,
            name: 'Smoke Test Card',
            count: 1,
            image_uris: { normal: 'https://via.placeholder.com/223x310.png?text=Card' },
            type_line: 'Artifact Creature',
            set_name: 'SMK'
          });
          await setDoc(deckRef, {
            firestoreId: deckId,
            name: 'Smoke Test Deck',
            createdAt: new Date().toISOString()
          });
          debug.ok = true;
          debug.reason = 'seeded';
          console.log('[SmokeTest] seeding completed', debug);
          return debug;
        } catch (e) {
          console.log('[SmokeTest] seeding error', e && e.message);
          return { ok: false, reason: 'exception', error: (e && e.message) || String(e) };
        }
      });
      if (seedResult && seedResult.ok) {
        // allow snapshots to propagate and UI to update
        await new Promise(r => setTimeout(r, 2500));
      }
    } catch (e) {
      // ignore seeding errors in harness
    }

    // Take screenshot
    await page.screenshot({path: screenshotPath, fullPage: true});

    // Force a direct invocation of the setup handler to ensure signup & verification are exercised
      try {
        // Poll inside the page for the handler to appear (some modules attach later). Wait up to 15s.
        try {
          // Prefer calling the canonical handler if present; fall back to the legacy test helper.
          const directInvoke = await page.evaluate(async () => {
            try {
              const uniq = Date.now();
              const email = `smoke+${uniq}@example.com`;
              const pass = `Sm0keTest!${uniq}`;
              if (window && typeof window.handleFirstRunSetup === 'function') {
                const r = await window.handleFirstRunSetup(email, pass);
                return { invoked: true, handler: 'handleFirstRunSetup', email, result: r || null };
              }
              if (window.__runFirstRunSetup) {
                const r2 = await window.__runFirstRunSetup(email, pass);
                return { invoked: true, handler: '__runFirstRunSetup', email, result: r2 || null };
              }
              return { invoked: false, reason: 'no-run-helper' };
            } catch (e) {
              return { invoked: true, error: (e && e.message) || String(e) };
            }
          });
          consoleMessages.push({ type: 'info', text: 'Direct invocation summary: ' + JSON.stringify(directInvoke) });
        } catch (e) {
          consoleMessages.push({ type: 'info', text: 'Direct invocation failed: ' + String(e) });
        }
      } catch (e) {
        consoleMessages.push({ type: 'info', text: 'Direct invocation failed: ' + String(e) });
      }

    // If the above didn't cause a verification send, try a stronger approach:
    // 1) Wait up to 10s for window.handleFirstRunSetup and call it directly.
    // 2) If not available and a user is signed in, import the auth module and call sendEmailVerification(user).
    try {
      const ensureVerification = await page.evaluate(async () => {
        const waitFor = (ms) => new Promise(r => setTimeout(r, ms));
        const start = Date.now();
        while (Date.now() - start < 10000) {
          if (window && typeof window.handleFirstRunSetup === 'function') break;
          await waitFor(250);
        }
        if (window && typeof window.handleFirstRunSetup === 'function') {
          try {
            const e = document.getElementById('setup-email')?.value || null;
            const p = document.getElementById('setup-password')?.value || null;
            const r = await window.handleFirstRunSetup(e, p);
            return { path: 'handleFirstRunSetup', ok: true, result: r || null };
          } catch (err) {
            return { path: 'handleFirstRunSetup', ok: false, error: (err && err.message) || String(err) };
          }
        }
        // If no handler, but there's a signed-in user, try to import the auth helper and call sendEmailVerification
        try {
          const authModule = await import('/js/firebase/auth.js');
          const current = (window && window.auth && window.auth.currentUser) ? window.auth.currentUser : null;
          if (current && typeof authModule.sendEmailVerification === 'function') {
            try {
              await authModule.sendEmailVerification(current);
              return { path: 'auth.sendEmailVerification', ok: true, email: current.email || null };
            } catch (err2) {
              return { path: 'auth.sendEmailVerification', ok: false, error: (err2 && err2.message) || String(err2) };
            }
          }
          return { path: 'auth.sendEmailVerification', ok: false, reason: 'no-current-user-or-fn' };
        } catch (imErr) {
          return { path: 'import', ok: false, error: (imErr && imErr.message) || String(imErr) };
        }
      });
      consoleMessages.push({ type: 'info', text: 'Ensure verification result: ' + JSON.stringify(ensureVerification) });
    } catch (e) {
      consoleMessages.push({ type: 'info', text: 'Ensure verification flow failed: ' + String(e) });
    }

    const results = {
      url,
      status: response && response.status(),
      ok: response && response.ok(),
      console: consoleMessages,
      pageErrors,
      requests,
        lastAuthError: null,
      screenshot: path.relative(process.cwd(), screenshotPath),
      timestamp: new Date().toISOString()
    };

    // Post-run assertions: ensure identitytoolkit signup, lookup, and sendOobCode occurred and returned HTTP 200.
    try {
      const ikRequests = requests.filter(r => r.url && r.url.includes('identitytoolkit.googleapis.com'));
      const signUp = ikRequests.find(r => r.url.includes(':signUp') && (r.status === 'response' || r.status === 'finished'));
      const lookup = ikRequests.find(r => r.url.includes(':lookup') && (r.status === 'response' || r.status === 'finished'));
      const sendOob = ikRequests.find(r => r.url.includes(':sendOobCode') && (r.status === 'response' || r.status === 'finished'));
      const assertions = [];
      if (!signUp) assertions.push('accounts:signUp request not observed');
      else if (signUp.statusCode && signUp.statusCode !== 200) assertions.push('accounts:signUp did not return 200');
      if (!lookup) assertions.push('accounts:lookup request not observed');
      else if (lookup.statusCode && lookup.statusCode !== 200) assertions.push('accounts:lookup did not return 200');
      else {
        // Try to parse lookup body to ensure emailVerified:false
        try {
          const body = lookup.body || lookup.postData || null;
          let parsed = null;
          if (body) parsed = typeof body === 'string' ? JSON.parse(body) : body;
          if (parsed && parsed.users && parsed.users[0] && parsed.users[0].emailVerified !== false) {
            assertions.push('accounts:lookup returned users[0].emailVerified !== false');
          }
        } catch (e) {
          // ignore parse errors
        }
      }
      if (!sendOob) assertions.push('accounts:sendOobCode request not observed');
      else if (sendOob.statusCode && sendOob.statusCode !== 200) assertions.push('accounts:sendOobCode did not return 200');

      results.identitytoolkitAssertions = { passed: assertions.length === 0, issues: assertions };
      if (assertions.length > 0) {
        // Mark the process as failing for CI visibility
        console.error('SMOKE_TEST_ASSERTIONS_FAILED', assertions);
        process.exitCode = 1;
      }
    } catch (assertErr) {
      results.identitytoolkitAssertions = { error: String(assertErr) };
    }

      try {
        const lastAuthError = await page.evaluate(() => {
          try { return window.__lastAuthError || null; } catch (e) { return null; }
        });
        results.lastAuthError = lastAuthError;
      } catch (e) {
        results.lastAuthError = { error: String(e) };
      }
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log('SMOKE_TEST_RESULTS_PATH=' + resultsPath);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    const results = {url, error: err && err.message, stack: err && err.stack};
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.error('SMOKE_TEST_ERROR', err);
  } finally {
    await browser.close();
  }
})();
