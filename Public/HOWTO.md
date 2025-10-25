## Quick Start (recommended order)

1. Playstyle (first)
	 - Open the Playstyle panel (header). Set your preferred format (Commander/Standard/etc.), deck sizing and budget. This personalizes AI blueprints and suggestions.
2. Add cards to your collection (next)
	 - Go to *My Collection* → use the Add Card search (Scryfall). Pick exact print/version, set quantity and finish, then add.
	 - Or import a backup (Settings → Data Management → Import All Data) to bulk-populate your collection and decks.
3. Create decks (after collection)
	 - Open *Decks* → Create New Deck. Choose format (Commander, Modern, etc.).
	 - For Commander: select a commander from your collection; optionally request an AI blueprint to build a 99-card suggestion.
	 - Important: AI features require a per-user Gemini API key. Open Settings → "AI / Gemini API Key" and paste your Gemini API key before using any AI tools. The app encrypts the key in your account settings (client-side) and uses it to call Gemini on your behalf.
	 - AI-assisted deck suggestions: From the Single Deck view you can run the "Deck Suggestions" AI pass. The app gathers the current decklist and a candidate pool from your collection (respecting commander color identity and ownership), then calls Gemini to rate and recommend cards to add or remove. Suggestions are shown as a preview where you can accept individual recommendations or apply the selected changes in bulk.
4. Add cards to decks
	 - In Single Deck view click *Add Cards* to open the modal, select cards from your collection and confirm. The collection counts will update.

After those core steps explore Filters, Saved Views, AI tools and Data Management.

How to Start — MTG Library

Quick Start (recommended order of actions)
Follow these steps to get the best experience from MTG Forge:

Playstyle (set up first)

Open the Playstyle panel from the header (Playstyle button). The app uses your playstyle to tailor AI suggestions and some prompt contexts.
In Settings you can also manage a more detailed playstyle profile (if available). The app will attach playstyle context to AI deck blueprints, rule lookups, and MTG chat responses for personalized suggestions.
Add Cards to Your Collection

Go to My Collection.
Use the "Add Card to Collection" search input to find cards via Scryfall (enter at least ~3 characters). Click Search.
When search results appear, choose the exact version/print you want (Card Versions modal), set quantity and finish, and confirm to add it to your collection.
You can also import full backups (Settings → Data Management → Import All Data) to populate collection and decks from a JSON file.
Create Decks (after you have relevant cards)

Open Decks and click "Create New Deck".
Choose a format (Commander, Standard, Modern).
For Commander:
Select a commander from your collection or search Scryfall.
If you already selected a playstyle, you can request an AI blueprint ("Get AI Blueprint") to produce a 99-card suggestion tailored to the commander and your playstyle. The blueprint is returned as a JSON-based deck plan and can be used to create the deck automatically.
For non-commander formats: create an empty deck and then add cards from your collection using the "Add Cards" flow.
Add Cards to Decks

View a Deck (Single Deck view).
Click "Add Cards" to open the Add Cards to Deck modal.
Filter/select cards from your collection. The UI checks commander color identity (for Commander decks) and prevents illegal additions.
Select multiple cards, confirm, and the app will decrement card counts in your collection and add them to the deck.
After completing these three core steps, continue with the rest of the features below.

Collection Features & Workflow
Views:
Grid or Table display for collection.
Grid size: S / M / L controls visual density.
Pagination exists for large collections.
Filters & Grouping:
Quick Filter (text box), Group By and Then By (Type, Rarity, Color, Mana Value, Set, Deck).
"Hide Cards in Decks" toggles exclusion of decked cards.
KPIs:
Live metrics: Total Cards (copies), Unique Cards, Total Price (USD), Filtered/Total summary.
Card interactions:
Click a card to view details (modal): edit count, finish, condition, purchase price, notes.
Delete a card in Edit Mode (activate via header).
Add cards to deck from the card details or search flows.
Deck Management
Deck list (Decks view) shows deck cards, commander art, and quick actions.
Single deck view shows decklist grouped by card type, mana curve chart, export button, and AI suggestions.
You can export a deck as JSON. Deck import is available (Settings → Import Deck).
AI Tools
Gemini-powered features (requires API key):
AI Blueprint (Commander): Generates a JSON blueprint containing name, summary, strategy, and suggested counts (99).
AI Deck Suggestions: Gives analysis and specific add/remove suggestions in a chat modal, built from the decklist and playstyle context.
Rule Lookup: Ask rules questions; the AI replies with rule explanations and (when possible) rule citations.
MTG Chat: A general MTG assistant for strategy and lore.
Safety: AI-provided HTML is sanitized (DOMPurify) before being displayed.
Note: You must provide your own Gemini API key for these features to function properly.
Saved Views & Settings
Saved Views (Settings) let you store filter/sort/group configurations. You can set a default view to auto-apply on collection render.
View Builder includes:
Filter rules, Sort rules, Group By settings, View Mode (grid/table), Grid Size, "Hide in Decks" option, and an option to set a view as default.
Settings also include:
Account: view user email and logout.
Deck management: list decks for deletion.
Data Management: Export All Data, Import All Data, Import Decks, and Danger Zone for clearing all data.
Modal visibility settings per-user are persisted to Firestore (which controls which fields appear in card edit modals).
# How to Start — MTG Library

Welcome! This quick-start guide shows the recommended order of actions and covers main features. It also includes tips and developer notes to help extend or troubleshoot the app.

## Table of contents

- [Quick Start (recommended order)](#quick-start-recommended-order)
- [Collection: Add cards & workflow](#collection-add-cards--workflow)
- [Decks: create and manage decks](#decks-create-and-manage-decks)
- [Collection features & UI notes](#collection-features--ui-notes)
- [AI tools (Gemini)](#ai-tools-gemini)
- [Saved views & settings](#saved-views--settings)
- [Import / Export & data management](#import--export--data-management)
- [First-run setup & test hooks](#first-run-setup--test-hooks)
- [Troubleshooting & tips](#troubleshooting--tips)
- [Developer notes](#developer-notes)

---

## Quick Start (recommended order)

1. Playstyle (first)
	 - Open the Playstyle panel (header). Set your preferred format (Commander/Standard/etc.), deck sizing and budget. This personalizes AI blueprints and suggestions.
2. Add cards to your collection (next)
	 - Go to *My Collection* → use the Add Card search (Scryfall). Pick exact print/version, set quantity and finish, then add.
	 - Or import a backup (Settings → Data Management → Import All Data) to bulk-populate your collection and decks.
3. Create decks (after collection)
	 - Open *Decks* → Create New Deck. Choose format (Commander, Modern, etc.).
	 - For Commander: select a commander from your collection; optionally request an AI blueprint to build a 99-card suggestion.
4. Add cards to decks
	 - In Single Deck view click *Add Cards* to open the modal, select cards from your collection and confirm. The collection counts will update.

After those core steps explore Filters, Saved Views, AI tools and Data Management.

---

## Collection: Add cards & workflow

- Use Grid or Table view. Change grid size with the density controls.
- Search: enter card name (3+ chars) and press Search to query Scryfall.
- Card Versions: select the exact printing (image, set) in the versions modal before adding.
- Bulk import: Settings → Import All Data (choose Merge or Replace).
- Card details: click any card to edit count, finish, condition, price and notes.

### Common flows

- Add a single card: Search → select version → set quantity → Add.
- Add multiple copies: set quantity in the Card Versions modal.
- Remove a card: enable Edit Mode (header) then delete from the card details modal.

---

## Decks: create and manage decks

- Create Deck: Decks → Create New Deck → pick format.
- Commander specifics:
	- Select commander from your collection (or search Scryfall).
	- Select commander from your collection (or search Scryfall).
	- Use **Get AI Blueprint** (requires playstyle & Gemini key) to generate a suggested 99-card plan.
	- AI Deck Suggestions and how they work:
	  - From the Single Deck view run the **Deck Suggestions** AI pass to get add/remove recommendations tailored to your deck, collection, and playstyle.
	  - Preview mode: suggestions are displayed with reasons/ratings. You can accept individual recommendations or uncheck ones you don't want.
	  - Apply selected: click "Add selected" to apply the chosen suggestions to your deck; collection counts will be updated accordingly.
	  - Auto mode: optionally run auto-apply to have the app take the top suggestions automatically (it still respects commander color identity and ownership constraints).
	  - Metadata: when you save AI suggestions the app stores lightweight metadata (reason, rating) with the deck so you can review why a card was recommended.
- Add cards to a deck: in Single Deck view click *Add Cards* and pick from your collection.
- Export a deck as JSON or TXT (Export Deck buttons). Import decks from Settings → Import Deck.

---

## Collection features & UI notes

- Filters & Grouping: Quick Filter, Group By / Then By (Type, Rarity, Color, Mana Value, Set, Deck).
- Hide cards already in decks with the *Hide in Decks* toggle.
- Pagination/Performance: collection pages are used for very large collections; adjust the page size in settings if needed.
- KPIs show live totals (card count, unique cards, estimated USD value).

---

## AI tools (Gemini)

- Features: AI Blueprint (Commander), Deck Suggestions (chat-based analysis), Rule Lookup, MTG Chat assistant.
- Requirement: you must provide your own Gemini API key in Settings for AI features to work.
- Safety: AI-provided HTML is sanitized with DOMPurify before rendering.

Additional details and tips:

- Where to put your key: open Settings → "AI / Gemini API Key" and paste your per-user key. A left-nav banner will appear in the app when an AI key is missing to help you find Settings quickly.
- Deck Suggestions workflow (quick recap): gather deck + candidate pool → AI rates cards and returns suggested adds/removals → preview and accept or auto-apply → app updates deck and collection; you may save the AI metadata with the deck.
- Permissions & constraints: AI suggestions respect commander color identity, card legality for the chosen format, and ownership (the app will not add cards you don't own unless you choose to ignore ownership warnings).
- CORS & proxies: if direct client calls to Gemini are blocked by CORS in your environment, run the API calls through a server-side proxy that injects your key (recommended for production for better key control).

---

## Saved views & settings

- Saved Views: store filter/sort/group configurations and optionally set a default view.
- View builder: configure filter rules, sort rules, groups, view mode (grid/table), grid size and hide-in-decks option.
- Settings include account (email/logout), deck management, data management and modal visibility settings (persisted to Firestore).

---

## Import / Export & data management

- Export All Data: downloads collection + decks as JSON with timestamp.
- Import All Data: upload JSON and choose Merge or Replace (Replace overwrites — confirmation required).
- Import Deck: import single deck JSON and resolve missing cards via Scryfall.
- Clear All Account Data: permanently deletes user Firestore data (batched deletes). Use the Danger Zone with caution.

---

## First-run setup & test hooks

- For local development, use the app's first-run setup to create an initial account. The test hook is `window.handleFirstRunSetup(email, password)`.

---

## Troubleshooting & tips

- Authentication
	- Ensure Firebase Auth (Email/Password and Google) is enabled in your Firebase project.
	- The app supports signInWithCustomToken flows for CI/emulated scenarios.
- AI issues
	- Check your GEMINI_API_KEY and GEMINI_API_URL. If CORS prevents direct client calls, use a server-side proxy.
- Large imports
	- Imports are batched (≈400 docs per commit). For very large files split them to avoid timeouts.
- Multiple Firebase instances
	- Avoid loading multiple Firebase SDK instances; the client warns if multiple apps/auth instances are detected.

---

## Developer notes

- Views & navigation
	- The app uses a show/hide view pattern. The canonical navigation helper is `showView(viewName)` in `Public/index.html`.
	- A custom event `mtg:viewchange` is dispatched on view changes; listen for it to update UI without polling.

- Where code lives
	- Page-specific implementations: `Public/js/pages/*` (collection, decks, singleDeck, settings).
	- Shared helpers: `Public/js/lib/*` (ui.js, data.js).
	- Boot and initialization: `Public/app.js`, `Public/js/main/*`.

- How to render the HOWTO in-app
	- The floating panel uses client-side rendering and the modal fetches `HOWTO.md` relative to `Public/`.

- Suggestions for improvements
	- Replace the inline minimal markdown renderer with a lightweight library (e.g. `marked`) + `DOMPurify` for full Markdown support.
	- Add unit tests for import/export flows and saved views rendering.

---
