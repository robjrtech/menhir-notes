# Menhir Notes

A quiet, local-only Markdown notes app. It runs in your browser, keeps your notes on your own computer, and has no accounts, no cloud and no tracking.

Menhir Notes is an independent project inspired by Obsidian. It is not affiliated with Obsidian.

## What it does

- Markdown editing and reading, checklists, headings, callouts and safe external links
- Folders, tabs, bookmarks, full-text and tag search, keyboard shortcuts
- Wiki links (`[[note title]]`) with backlinks, rename-aware link updates and a heading outline
- Daily notes, a note graph and a canvas of note cards
- Dark and light themes, responsive layout down to phone width
- Import Markdown or text files and a whole-vault JSON backup; export a vault or a single note
- Automatic saving, multi-tab safety and recovery drafts
- Optional saving to a file on your computer (desktop Chrome, Edge and Opera)

## Run it

You need Node.js 24 or newer. The app has no runtime dependencies.

```sh
node scripts/serve.mjs
```

Then open <http://127.0.0.1:4419/>. The server listens on `127.0.0.1` only and hands out the app's own files; it never receives your notes.

To use another port, set `PORT` (for example `PORT=5000 node scripts/serve.mjs`). Your notes belong to the address you open: a different port, or `localhost` instead of `127.0.0.1`, is a different, empty notes space. Requests to `localhost` on the right port are redirected to `127.0.0.1` for you.

## Where your notes live

Your notes are stored in your browser (IndexedDB) for the address above. That means:

- **Clearing the site's data deletes them.** Browsers can also remove stored data when disk space is very low. Settings shows whether your browser has agreed to keep them, and has a button to ask it to.
- **They are plain text, not encrypted.** Anyone who can use your operating-system account or your browser profile can read them.
- A different browser, or a different browser profile, has its own separate notes.

### Back them up

- **Export** (Settings) downloads the whole vault as one JSON file that **Import** can read. The app reminds you when you have changed notes and not backed up for a week.
- **Save to a file** (desktop Chrome, Edge and Opera only): Settings can link one JSON file on your computer. After every save the app also writes the vault to that file, so your notes survive if the browser's data is cleared. After clearing the data, choose **Open vault file** to get them back.
  - Firefox, Safari and phone and tablet browsers do not offer the file pickers this needs. There, use Export.
  - Chrome may ask you to reconnect to the file each time you start a new browser session. Choose "Allow on every visit" in its prompt to stop that.
  - If the file is changed by another program, the app compares the contents (not the dates). If only the file changed, it loads the file and keeps your previous browser copy as a draft. If both changed, it asks you which to keep and keeps the other as a draft. If the file cannot be read, it leaves the file alone and tells you.
  - If you put the file in a folder that a sync service uploads, your notes leave your computer through that service.

## Limits

A vault holds up to 500 notes, 100 folders and 100 canvas cards. Each note can have 200,000 characters and the whole vault must stay under 1 MB. Imports and the linked file are read only up to that size.

## Security model in brief

- The server answers `GET` and `HEAD` only for ten fixed paths, refuses every other method without reading the body, and accepts only the exact `127.0.0.1:<port>` host (and redirects `localhost`).
- Every response carries a strict Content-Security-Policy (no inline scripts, no network connections from the page, no framing) and the usual hardening headers.
- Notes are rendered by escaping all text; links are limited to `http`, `https` and `mailto`.
- Storage and file permissions belong to the browser's origin, so another web page cannot read your notes even if it tricks the browser into talking to the local server.

## Tests

```sh
npm ci
npm test
```

The only dependency is `fake-indexeddb`, used by the tests alone (it stands in for the browser database). Nothing is installed or bundled for the app itself.

## License

MIT. See [LICENSE](LICENSE).
