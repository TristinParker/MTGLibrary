UI delegation and test guide

This folder contains the public-facing HTML and the modular JS assets.

Delegation pattern

- Centralized UI helpers live in `js/lib/ui.js` and export functions such as:
  - `showToast`, `showToastWithProgress`, `updateToastProgress`, `updateToast`, `removeToastById`
  - `openModal`, `closeModal`
  - `computeTableHeaderTop`

- These helpers are attached to `window` by `js/lib/ui.js` (for backwards compatibility). HTML and older inline scripts should call the shims on `window` (for example `window.showToast(...)`) rather than defining their own delegator functions.

Canonical handlers

- First-run admin/signup flow: `window.handleFirstRunSetup(email, password)` — this is the canonical entry point for automated tests to create an admin user, send verification, and force sign-out until verification completes.
- Secondary/test helpers that were previously used (now deprecated): `window.__runFirstRunSetup` (removed from `index-dev.html`). Tests should not rely on this legacy proxy.

Testing guidance (smoke harness)

- The smoke harness is `Public/tests/smokeTest.js`.
- It now prefers `window.handleFirstRunSetup(email, password)` for direct invocation. If you need a shim in your local tests, create it in your test harness rather than in HTML.
- The harness captures console logs, page errors, and network traces; it records identitytoolkit calls (accounts:signUp, accounts:lookup, accounts:sendOobCode) and asserts they returned status 200 and that `accounts:lookup` shows `emailVerified: false` for the newly created user.

Maintenance notes

- If you add a new UI helper, export it from `js/lib/ui.js` and (optionally) attach it to `window` there. This keeps HTML files small and avoids duplication.
- If a test requires a short-lived shim, add it in the test harness (not in the HTML files) and remove it once tests are updated to use canonical handlers.

Contact

- For questions about the migration or to propose further changes to the delegation pattern, see the main README or open an issue in the repository.
