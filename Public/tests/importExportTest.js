const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const url = process.argv[2] || 'http://localhost:8080/index-dev.html';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for handlers to be attached to window (timeout 5s)
  await page.waitForFunction(() => !!(window.exportAllData && window.processDataImport && window.handleImportAllData), { timeout: 5000 });

  // Check that exportAllData exists and is a function
  const hasExport = await page.evaluate(() => typeof window.exportAllData === 'function');
    if (!hasExport) throw new Error('exportAllData not exposed on window');

    // Check that centralized import functions exist
    const hasImportHandlers = await page.evaluate(() => {
      return {
        handleImportAllData: typeof window.handleImportAllData === 'function',
        processDataImport: typeof window.processDataImport === 'function',
        executeDataImportBatched: typeof window.executeDataImportBatched === 'function'
      };
    });

    if (!hasImportHandlers.handleImportAllData) throw new Error('handleImportAllData not found on window');
    if (!hasImportHandlers.processDataImport) throw new Error('processDataImport not found on window');
    if (!hasImportHandlers.executeDataImportBatched) throw new Error('executeDataImportBatched not found on window');

    console.log('IMPORT_EXPORT_HANDLERS_OK');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('IMPORT_EXPORT_TEST_FAILED', err && err.message);
    try { await browser.close(); } catch (e) {}
    process.exit(1);
  }
})();
