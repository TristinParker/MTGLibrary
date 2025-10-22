Run the playstyle smoke test locally

This repository includes a small Puppeteer smoke test that checks the playstyle module is exposed on window and that the helper `attachPlaystyleToPrompt` appends the playstyle summary into prompts.

Steps (PowerShell):

1) Start a static server serving `Public` on port 8080 (run in one terminal):

   npx http-server .. -p 8080 -a 127.0.0.1

2) In another terminal, run the smoke test:

   npm run playstyle-smoke

Or use the convenience script (may require backgrounding support in your shell):

   npm run serve-and-test

Test output is written to `Public/tests/playstyle-smoke-results.json` and the script prints `PLAYSTYLE_SMOKE_OK true` on success.
