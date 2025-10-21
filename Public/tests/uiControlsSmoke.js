const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index-dev.html';
  const outDir = path.resolve(__dirname);
  const screenshotPath = path.join(outDir, 'ui-controls-screenshot.png');
  const resultsPath = path.join(outDir, 'ui-controls-results.json');

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

  try {
    await page.setViewport({width: 1280, height: 900});
    const response = await page.goto(url, {waitUntil: 'networkidle2', timeout: 30000});

    // Wait a bit for modules to attach
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    await delay(1500);

    // Ensure collection container exists
    const collectionExists = await page.$('#collection-content') !== null;

    // Helper to click and wait for a re-render
    async function clickAndWait(selector, waitMs = 800) {
      await page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.click(); }, selector);
      await delay(waitMs);
    }

    // 1) Toggle grid sizes: sm -> md -> lg and assert class changes on card elements
    const gridButtons = await page.$$('[data-grid-size]');
    const gridResults = [];
    if (gridButtons && gridButtons.length > 0) {
      for (const btn of gridButtons) {
        const data = await page.evaluate(b => ({text: b.innerText, size: b.getAttribute('data-grid-size')}), btn);
        await clickAndWait(`[data-grid-size="${data.size}"]`, 500);
        // check first card class
        const cardClass = await page.evaluate(() => {
          const c = document.querySelector('#collection-content .card') || document.querySelector('#collection-content .collection-card');
          return c ? c.className : null;
        });
        gridResults.push({size: data.size, cardClass});
      }
    }

    // 2) Toggle view mode: grid -> table
    const viewGridBtn = await page.$('#view-toggle-grid');
    const viewTableBtn = await page.$('#view-toggle-table');
    let viewMode = null;
    if (viewTableBtn) {
      await clickAndWait('#view-toggle-table', 800);
      viewMode = await page.evaluate(() => window.collectionViewMode || null);
    }

    // 3) Toggle hide-in-decks checkbox
    const hideBox = await page.$('#hide-in-deck-checkbox');
    let hidePref = null;
    if (hideBox) {
      await clickAndWait('#hide-in-deck-checkbox', 500);
      hidePref = await page.evaluate(() => (window.uiPreferences && window.uiPreferences.hideInDecks) === true);
    }

    // 4) Saved views: attempt to open saved views select and apply first option (if present)
    let savedViewApplied = false;
    const savedViewExists = await page.$('#saved-views-select');
    if (savedViewExists) {
      const optCount = await page.evaluate(() => {
        const s = document.getElementById('saved-views-select');
        return s ? s.options.length : 0;
      });
      if (optCount > 0) {
        // select the first non-empty option (skip placeholder)
        await page.evaluate(() => {
          const s = document.getElementById('saved-views-select');
          if (s && s.options && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }
        });
  await delay(800);
        savedViewApplied = await page.evaluate(() => !!window.__activeSavedViewId || !!(window.uiPreferences && (window.uiPreferences.gridSize || window.uiPreferences.viewMode || window.uiPreferences.groupBy)));
      }
    }

    // Snapshot
    await page.screenshot({path: screenshotPath, fullPage: true});

    const results = {
      url,
      status: response && response.status(),
      ok: response && response.ok(),
      collectionExists,
      gridResults,
      viewMode,
      hidePref,
      savedViewApplied,
      console: consoleMessages,
      pageErrors,
      requests,
      screenshot: path.relative(process.cwd(), screenshotPath),
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log('UI_CONTROLS_SMOKE_RESULTS=' + resultsPath);
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    const results = {url, error: err && err.message, stack: err && err.stack};
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.error('UI_CONTROLS_SMOKE_ERROR', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
