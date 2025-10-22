const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index-dev.html';
  const outDir = path.resolve(__dirname);
  const resultsPath = path.join(outDir, 'playstyle-smoke-results.json');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const results = { url, ok: false, logs: [] };

  page.on('console', msg => {
    try { results.logs.push({ type: msg.type(), text: msg.text() }); } catch (e) { results.logs.push({ type: 'console', text: String(msg) }); }
  });

  try {
  await page.setViewport({ width: 1200, height: 800 });
  // puppeteer file:// support can be flaky with networkidle; use a simple goto and short wait
  await page.goto(url, { timeout: 30000 }).catch(() => {});

  // Wait briefly for modules to attach (portable sleep)
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1200)));

    // Check that the playstyle module initialized on window
    const hasModule = await page.evaluate(() => {
      return !!(window.playstyle && typeof window.playstyle.attachPlaystyleToPrompt === 'function' && window.playstyleState !== undefined);
    });

    results.hasModule = hasModule;

    if (!hasModule) {
      results.error = 'playstyle module not found on window';
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      console.log('PLAYSTYLE_SMOKE_FAILED');
      await browser.close();
      process.exit(1);
      return;
    }

    // Inject a mock playstyle state and test attachPlaystyleToPrompt
    const sample = { summary: 'I like to play aggressively and pursue combos.', tags: ['aggro','combo'], scores: { aggression: 85, consistency: 40, interaction: 60, variance: 70, comboAffinity: 90 }, archetypes: ['Gruul Combo'], rawAnswers: [] };
    const appended = await page.evaluate((s) => {
      try {
        window.playstyleState = s;
        window.playstyleSummary = s.summary;
        return window.playstyle.attachPlaystyleToPrompt('Make me a deck:');
      } catch (e) { return { error: String(e) }; }
    }, sample);

    results.appended = appended;
    results.ok = typeof appended === 'string' && appended.includes(sample.summary);

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log('PLAYSTYLE_SMOKE_OK', results.ok);
  } catch (err) {
    results.error = (err && err.message) || String(err);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.error('PLAYSTYLE_SMOKE_ERROR', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
