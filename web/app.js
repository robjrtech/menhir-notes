import { validateVault, MAX_BYTES } from "./model.js";
import { esc, markdown, renameLinks } from "./markdown.js";
import { BRAND } from "./brand.js";
import {
  createStore,
  ConflictError,
  StorageUnavailableError,
  CorruptVaultError,
  needsBackupReminder,
  storageFooter,
  fileUiAllowed,
} from "./store.js";
import {
  pendingDrafts,
  keepDraft,
  dropDraft,
  diffVaults,
  summarizeDiff,
} from "./drafts.js";
import {
  FileMirror,
  capabilities,
  pickSaveFile,
  pickOpenFile,
  browserLocks,
  idbHandleStore,
} from "./filesync.js";
import {
  ROVING_MIN,
  cardArt,
  cardLabel,
  gridTarget,
  homeModel,
  plural,
} from "./home.js";
const $ = (s, root = document) => root.querySelector(s);
const icons = {
  file: "M6 3h8l4 4v14H6z M14 3v5h4",
  folder: "M3 7V4h6l2 3h10v13H3z",
  search: "M21 21l-5-5 M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  graph:
    "M7 7l10 3M7 7l4 12M17 10l-6 9 M7 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M17 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M11 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  calendar: "M4 5h16v16H4z M4 10h16M8 3v4M16 3v4M8 14h2M14 14h2",
  canvas: "M3 3h7v7H3zM14 5h7v6h-7zM8 15h10v6H8zM6 10v7h2M18 11v4",
  settings:
    "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  x: "M6 6l12 12M18 6L6 18",
  panel: "M3 4h18v16H3zM8 4v16",
  rightPanel: "M3 4h18v16H3zM16 4v16",
  edit: "M4 16l12-12 4 4L8 20H4zM13 7l4 4",
  book: "M12 5v16M3 4c4 0 7 0 9 2 2-2 5-2 9-2v15c-4 0-7 0-9 2-2-2-5-2-9-2z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  link: "M10 14l4-4M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  star: "M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  cloud: "M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-12-1 4.5 4.5 0 0 0 1 9",
  check: "M5 12l4 4L19 6",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4M7 9l5-5 5 5M4 17v4h16v-4",
  bulb: "M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7M8 17h8M9 21h6",
  hash: "M9 3L7 21M17 3l-2 18M4 8h17M3 16h17",
  trash: "M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 18h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  home: "M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.file}"/></svg>`;
const ib = (i, label, action, extra = "", current = false) =>
  `<button type="button" class="icon-button ${extra}" title="${esc(label)}" aria-label="${esc(label)}" data-action="${action}"${current ? ' aria-current="page"' : ""}>${icon(i)}</button>`;
function seedVault() {
  const vault = {
  version: 1,
  folders: ["Getting started", "Daily notes", "Projects", "Ideas", "Library"],
  notes: [
    {
      id: "welcome",
      title: "A place for ideas",
      folder: "Getting started",
      tags: ["welcome", "personal"],
      body: "Your thoughts deserve a little room to grow. This is your space to capture what matters, make connections, and find your way back to a good idea.\n\n## A little less noise. A little more clarity.\nStart with a thought. It doesn’t need to be finished, organized, or particularly brilliant. Just give it a place to land.\n\n> [!tip] Everything starts with a note\n> Press **⌘ N** to make something new, or click **Edit note** to make this space your own.\n\n## A few things in motion\n- [x] Make a space for your thoughts\n- [ ] Write something in [[Today’s intentions]]\n- [ ] Collect a spark in [[Small observations]]\n- [ ] Connect two ideas with a link\n\n## Follow the connections\nThe best ideas rarely happen in isolation. Link a note with `[[double brackets]]` and let one thought lead to another.\n\nTry exploring [[The creative process]], or start building your own [[Reading list]].\n\nYour notes are saved in this browser. From Settings you can export a backup, and in Chrome or Edge you can also save them to a file on your computer.\n\n---\n*A notebook is a place where you get to think out loud.*",
      starred: true,
    },
    {
      id: "intentions",
      title: "Today’s intentions",
      folder: "Daily notes",
      tags: ["daily"],
      body: "## What matters today\n- [ ] Give one thing my full attention\n- [ ] Make time for a walk\n- [ ] Capture one unexpected idea\n\nA small reminder from [[A place for ideas]]: unfinished thoughts are welcome here.",
    },
    {
      id: "creative",
      title: "The creative process",
      folder: "Projects",
      tags: ["creativity", "work"],
      body: "## Collect, connect, create\nGood ideas are usually a conversation between things you already noticed.\n\n1. Collect details in [[Small observations]].\n2. Look for connections in your notes.\n3. Make a small version before a big plan.\n\n## Leave a little space\nA walk, a quiet morning, a page without an agenda. Start at [[A place for ideas]].",
      starred: true,
    },
    {
      id: "garden",
      title: "A digital garden",
      folder: "Projects",
      tags: ["knowledge"],
      body: "## Notes that keep growing\nThink of your notes as a garden. Some are seedlings; others need pruning.\n\n[[The creative process]] and [[Small observations]] are good starting points.\n\n## Next steps\n- [ ] Connect related thoughts\n- [ ] Revisit an old idea",
    },
    {
      id: "observations",
      title: "Small observations",
      folder: "Ideas",
      tags: ["ideas", "evergreen"],
      body: "## Pay attention\n- The best conversations have room for silence.\n- A familiar street looks different early in the morning.\n- A question can be more useful than an answer.\n\nThese little details feed [[The creative process]].",
    },
    {
      id: "slow",
      title: "The art of slowing down",
      folder: "Ideas",
      tags: ["personal"],
      body: "## Create a little margin\nLeave ten minutes between things. There is no need to fill every space.\n\nA useful companion to [[Today’s intentions]].",
    },
    {
      id: "reading",
      title: "Reading list",
      folder: "Library",
      tags: ["books"],
      body: "## On the nightstand\n- [ ] A book that challenges an assumption\n- [ ] A collection of essays\n- [x] A favorite worth reading twice\n\n## Notes to keep\nSave the ideas that stay with you in [[Small observations]].",
      starred: true,
    },
    {
      id: "markdown",
      title: "Markdown guide",
      folder: "Getting started",
      tags: ["reference"],
      body: "## The basics\nUse **bold** for emphasis, *italics* for a softer touch, and `code` for something literal.\n\n## Organize your thoughts\nStart a heading with `##`. Write a list with `-`. Add a task with `- [ ]`.\n\n## Connect your notes\nUse `[[A place for ideas]]` to link another note. Tags live beside the note title.\n\n> [!tip] Keep your words portable\n> Export any note as Markdown, or back up your whole vault from Settings.",
    },
  ],
  canvas: [
    { id: "creative", x: 60, y: 60 },
    { id: "observations", x: 400, y: 200 },
    { id: "reading", x: 80, y: 370 },
  ],
};
  const stamp = new Date().toISOString();
  vault.notes.forEach((n) => {
    n.starred = !!n.starred;
    n.updatedAt = stamp;
    n.createdAt = stamp;
  });
  return validateVault(vault);
}
const emptyVault = () => ({
  version: 1,
  folders: ["Notes"],
  notes: [],
  canvas: [],
});
// Nothing from the sample notes is shown until storage has been read.
let vault = emptyVault();
let active = null,
  tabs = [],
  mode = "read",
  view = "home",
  rightTab = "links",
  collapsed = new Set(),
  showFiles = false,
  showContext = false,
  hideFiles = false,
  hideContext = false,
  saveLabel = "Opening your notes…";
const current = () => vault.notes.find((n) => n.id === active);
function render() {
  let n = current();
  const ui = saveHomeUi();
  $("#app").className = view === "home" ? "is-home" : "";
  $("#app").innerHTML =
    `<div class="workspace ${showFiles ? "show-files" : ""} ${showContext ? "show-context" : ""} ${hideFiles ? "no-files" : ""} ${hideContext || view === "home" ? "no-context" : ""} ${view === "home" ? "home-view" : ""}"><nav class="rail" aria-label="Workspace tools"><div class="brand" title="${esc(BRAND.name)}">${BRAND.glyph}</div>${ib("home", "Home", "home", view === "home" ? "active" : "", view === "home")}${ib("file", "Notes", "notes", view === "note" ? "active" : "", view === "note")}${ib("search", "Search notes (⌘ K)", "search")}${ib("graph", "Graph view", "graph", view === "graph" ? "active" : "", view === "graph")}${ib("canvas", "Canvas", "canvas", view === "canvas" ? "active" : "", view === "canvas")}${ib("calendar", "Open daily note", "daily")}<div class="rail-bottom">${ib("help", "Keyboard shortcuts", "help")}${ib("settings", "Settings", "settings")}</div></nav><aside class="files" aria-label="Notes and folders"><div class="vault-name">${icon("book")} Personal space <small>⌄</small>${ib("x", "Close files", "files", "mobile-close")}</div><button class="search-trigger" data-action="search">${icon("search")}<span>Quick switcher</span><kbd>⌘ K</kbd></button><div class="section-title">FILES <span class="tools">${ib("plus", "New note (⌘ N)", "new")}${ib("folder", "New folder", "folder")}${ib("down", "Collapse or expand folders", "collapse")}</span></div><div class="file-tree">${tree()}</div><div class="mobile-tools">${ib("home", "Home", "home", view === "home" ? "active" : "", view === "home")}${ib("search", "Search notes", "search")}${ib("graph", "Graph view", "graph")}${ib("canvas", "Canvas", "canvas")}${ib("calendar", "Open daily note", "daily")}${ib("settings", "Settings", "settings")}</div><div class="vault-footer">${icon("cloud")} ${storageFooter({ loading, loaded, storageDown })}</div></aside><main class="main"><div class="tabs"><div class="tabs-scroll" role="group" aria-label="Open notes">${tabs
      .map((id) => {
        let t = vault.notes.find((x) => x.id === id);
        return t
          ? `<div class="tab ${active === id && view === "note" ? "active" : ""}">${icon("file")}<button aria-pressed="${active === id && view === "note"}" data-note="${id}" class="label">${esc(t.title)}</button><button class="icon-button" data-close="${id}" title="Close ${esc(t.title)}" aria-label="Close ${esc(t.title)}">${icon("x")}</button></div>`
          : "";
      })
      .join(
        "",
      )}</div>${ib("plus", "New note", "new")}${ib("rightPanel", "Toggle context sidebar", "context", "right")}</div><div class="document-toolbar">${ib("panel", "Toggle files", "files")}${ib("left", "Previous note", "back", "history")}${ib("right", "Next note", "forward", "history")}<div class="breadcrumb"><span>${esc(view === "note" ? n?.folder || "Notes" : "Personal space")}</span>${icon("chevron")}<span>${esc(view === "home" ? "Home" : view === "note" ? n?.title || "No open note" : view === "graph" ? "Graph view" : "Canvas")}</span></div>${view === "note" && n ? `<button class="mode-button" data-action="mode" title="Toggle edit and read (⌘ E)">${icon(mode === "read" ? "edit" : "book")}${mode === "read" ? "Edit note" : "Reading view"}</button>${ib("more", "Note actions", "more")}` : ""}</div><div id="save-alert" class="hidden"></div><div id="file-alert" class="hidden" role="status"></div>${view === "home" ? homeHTML() : view === "note" ? `<div class="document-scroll"><article class="document">${n ? noteHTML(n) : '<div class="empty"><h1>A little room to think.</h1><p>Create a note to get started.</p><button class="primary-button" data-action="new">Create a note</button></div>'}</article></div>` : specialView()}</main><aside class="context" aria-label="Note context"><div class="context-tabs">${ib("link", "Backlinks", "right-links", rightTab === "links" ? "active" : "")}${ib("list", "Outline", "right-outline", rightTab === "outline" ? "active" : "")}${ib("hash", "Tags", "right-tags", rightTab === "tags" ? "active" : "")}<span style="flex:1"></span>${ib("rightPanel", "Close context", "context")}</div>${contextHTML(n)}</aside></div><footer class="statusbar"><span class="save-status">${icon("cloud")}<span id="save-status" class="${isErrorState() ? "is-error" : ""}">${esc(saveLabel)}</span></span><button id="backup-reminder" data-action="backup" class="${backupDue() ? "" : "hidden"}" title="It has been over a week since your last backup">Back up now</button><span class="spacer"></span><button data-action="context">${n ? backlinks(n).length : 0} backlinks</button><span class="optional">${vault.notes.length} notes</span><span id="word-count">${n ? words(n.body) : 0} words</span><span class="optional" id="char-count">${n ? n.body.length : 0} characters</span>${ib("settings", "Settings", "settings")}</footer>${view === "home" ? bottomBar() : ""}`;
  renderAlerts();
  restoreHomeUi(ui);
  if (restoreFocus && !focusShown(restoreFocus.sel, restoreFocus.region)) focusShown(LANDING);
  restoreFocus = null;
}
// The same control can appear in several regions, some hidden at this width: prefer the
// given region, else the first one with a layout.
function focusShown(sel, region) {
  const shown = [...$("#app").querySelectorAll(sel)].filter((el) => el.getClientRects().length);
  const el = shown.find((el) => region && el.closest(region)) || shown[0];
  el?.focus();
  return !!el;
}
// Where focus goes when the control it should return to is gone.
const LANDING = '.tab.active .label, .empty button, [data-action="home"].active';
function tree() {
  return (
    vault.folders
      .map(
        (f) =>
          `<button class="tree-item folder" data-folder="${esc(f)}" aria-expanded="${!collapsed.has(f)}">${icon(collapsed.has(f) ? "chevron" : "down")}${icon("folder")}<span>${esc(f)}</span><span class="count">${vault.notes.filter((n) => n.folder === f).length}</span></button>${
            collapsed.has(f)
              ? ""
              : vault.notes
                  .filter((n) => n.folder === f)
                  .map(
                    (n) =>
                      `<button class="tree-item note ${n.id === active && view === "note" ? "selected" : ""}" data-note="${n.id}">${icon("file")}<span>${esc(n.title)}</span></button>`,
                  )
                  .join("")
          }`,
      )
      .join("") +
    `<div class="star-label">BOOKMARKS</div>` +
    vault.notes
      .filter((n) => n.starred)
      .map(
        (n) =>
          `<button class="tree-item" data-note="${n.id}">${icon("star")}<span>${esc(n.title)}</span></button>`,
      )
      .join("")
  );
}
function words(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
function backlinks(n) {
  return vault.notes.filter(
    (t) =>
      t.id !== n.id &&
      t.body.toLowerCase().includes("[[" + n.title.toLowerCase() + "]]"),
  );
}
function noteHTML(n) {
  return `<div class="note-eyebrow">${icon("file")} ${esc(n.folder)} <span> / </span> ${esc(new Date(n.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</div>${mode === "read" ? `<h1 class="note-title" tabindex="-1">${esc(n.title)}</h1>` : `<input aria-label="Note title" class="note-title-input" id="note-title" value="${esc(n.title)}" maxlength="120">`}<div class="tags">${n.tags.map((t) => `<button class="tag" data-tag="${esc(t)}"># ${esc(t)}</button>`).join("")}${mode === "edit" ? '<button class="tag" data-action="tags">+ tags</button>' : ""}</div>${mode === "read" ? `<div class="prose">${markdown(n.body)}</div>` : `<textarea class="editor" id="editor" aria-label="Markdown note content" spellcheck="true">${esc(n.body)}</textarea><p class="editor-help">Markdown supported · [[link a note]] · ⌘ E to preview</p>`}<div class="note-tail"><span>${icon("link")} ${backlinks(n).length} linked mentions</span><span>Personal space</span></div>`;
}
function contextHTML(n) {
  if (!n) return '<p class="empty">Open a note to see its connections.</p>';
  return `<section class="context-section"><h2 class="context-heading">${icon("graph")} LOCAL GRAPH ${ib("expand", "Open graph view", "graph")}</h2>${graphHTML(true)}<p class="context-subtitle">Ideas are better connected.</p></section>${
    rightTab === "tags"
      ? `<section class="context-section"><h2 class="context-heading">TAGS</h2>${[...new Set(vault.notes.flatMap((x) => x.tags))].map((t) => `<button class="tag" data-tag="${esc(t)}"># ${esc(t)}</button>`).join(" ")}</section>`
      : rightTab === "outline"
        ? outlineHTML(n)
        : `<section class="context-section"><h2 class="context-heading">BACKLINKS <span class="badge">${backlinks(n).length}</span></h2>${
            backlinks(n)
              .map(
                (t) =>
                  `<button class="backlink" data-note="${t.id}"><strong>${icon("file")}${esc(t.title)}</strong><p>${esc(t.body.replace(/[#*\[\]]/g, "").slice(-110))}</p></button>`,
              )
              .join("") ||
            '<p class="context-subtitle">Notes that link here will appear here.</p>'
          }</section>${outlineHTML(n)}`
  }`;
}
function outlineHTML(n) {
  return `<section class="context-section"><h2 class="context-heading">OUTLINE</h2>${
    n.body
      .split("\n")
      .map((s, i) =>
        s.match(/^#{1,3} /)
          ? `<button class="outline-link" data-heading="${i}">${esc(s.replace(/^#+ /, ""))}</button>`
          : "",
      )
      .join("") ||
    '<p class="context-subtitle">Add headings with ## to organize this note.</p>'
  }</section>`;
}
function graphHTML(mini = false) {
  const nodes = mini
    ? vault.notes
        .filter(
          (n) =>
            n.id === active ||
            current()?.body.includes("[[" + n.title + "]]") ||
            n.body.includes("[[" + (current()?.title || "") + "]]"),
        )
        .slice(0, 8)
    : vault.notes;
  nodes.sort((a, b) => (b.id === active) - (a.id === active));
  const w = mini ? 230 : 800,
    h = mini ? 180 : 550;
  const coords = nodes.map((n, i) => ({
    n,
    x: i === 0 ? w / 2 : w / 2 + Math.cos((i - 1) * 2.4) * w * 0.34,
    y: i === 0 ? h / 2 : h / 2 + Math.sin((i - 1) * 2.4) * h * 0.32,
  }));
  return `<svg class="${mini ? "graph-mini" : "full-graph"}" viewBox="0 0 ${w} ${h}" role="group" aria-label="${mini ? "Local" : "Vault"} note connections">${coords.flatMap((a) => coords.filter((b) => a.n.body.includes("[[" + b.n.title + "]]")).map((b) => `<line class="graph-lines" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`)).join("")}${coords.map((a) => `<g class="graph-node ${a.n.id === active ? "active" : ""}" data-note="${a.n.id}" tabindex="0" role="button" aria-label="Open ${esc(a.n.title)}" transform="translate(${a.x},${a.y})"><circle r="${mini ? (a.n.id === active ? 6 : 4) : a.n.id === active ? 10 : 7}"/><text text-anchor="middle" y="${mini ? 18 : 26}">${esc(mini ? a.n.title.split(" ").slice(0, 2).join(" ") : a.n.title)}</text></g>`).join("")}</svg>`;
}
// -- Home view ----------------------------------------------------------------------------
// Everything here lives in JS state, because render() rebuilds the whole page: the Show all
// toggle, the card that holds the Tab stop, and (via saveHomeUi/restoreHomeUi) focus and scroll.
let homeShowAll = false,
  homeRoving = null,
  homeCollapse = false,
  homeObserver = null,
  homeFrame = 0;
const shortDate = (s) => {
  const t = Date.parse(s);
  return Number.isNaN(t)
    ? ""
    : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
function cardHTML(f, tabStop) {
  const a = cardArt(f.name);
  const empty = !f.newest || !f.count;
  const target = empty
    ? `data-new-in="${esc(f.name)}"`
    : `data-note="${esc(f.newest.id)}"`;
  return `<li><button type="button" class="folder-card" ${target} data-home-key="card:${esc(f.name)}" aria-label="${esc(cardLabel(f))}"${tabStop ? "" : ' tabindex="-1"'}><span class="art" style="${a.style}" aria-hidden="true"><span class="art-sun"></span><svg viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true" focusable="false">${a.ridges.map((r) => `<path d="${r.d}" fill="${r.fill}"/>`).join("")}</svg></span><span class="card-text">${f.tag ? `<span class="card-tag">${esc(f.tag)}</span>` : ""}<span class="card-title">${esc(f.name)}</span><span class="card-count">${plural(f.count, "note")}</span></span></button></li>`;
}
function homeHTML() {
  const m = homeModel(vault);
  const hero = `<div class="home-hero"><h1>Home</h1><p>${esc(m.summary)}</p></div>`;
  if (!vault.notes.length)
    return `<div class="home-scroll"><div class="home">${hero}<div class="home-empty"><h2>No notes yet</h2><p>Make a note, or start with a folder to keep things together.</p><div class="home-actions"><button class="primary-button" data-action="folder">New folder</button><button class="secondary-button" data-action="new">New note</button></div></div></div></div>`;
  const rovingOn = m.folders.length >= ROVING_MIN;
  const rov = m.folders.some((f) => f.name === homeRoving)
    ? homeRoving
    : m.folders[0]?.name;
  const ctl = (kind, label, i, extra = "") =>
    `<button type="button" class="icon-button home-ctl ${extra}" data-home="${kind}" data-home-key="ctl:${kind}" aria-label="${label}" aria-disabled="${kind === "prev"}">${icon(i)}</button>`;
  return `<div class="home-scroll ${homeShowAll ? "show-all" : ""}"><div class="home">${hero}<section class="home-folders" aria-labelledby="folders-h"><div class="home-head"><h2 id="folders-h">Folders</h2><div class="home-controls"><button type="button" class="secondary-button" data-home="toggle" data-home-key="ctl:showall">${homeShowAll ? "Show fewer" : "Show all"}</button>${homeShowAll ? "" : ctl("prev", "Previous folders", "left") + ctl("next", "Next folders", "right")}</div></div><ul class="${homeShowAll ? "folder-grid" : "folder-row"}" role="list">${m.folders.map((f) => cardHTML(f, !rovingOn || f.name === rov)).join("")}</ul></section><section class="home-recent" aria-labelledby="recent-h"><h2 id="recent-h">Recent notes</h2><ul role="list">${m.recent.map((r) => `<li><button type="button" class="recent-row" data-note="${esc(r.id)}" data-home-key="recent:${esc(r.id)}">${icon("file")}<span class="recent-title">${esc(r.title)}</span><span class="recent-meta recent-folder">${esc(r.folder)}</span><span class="recent-meta">${esc(shortDate(r.updatedAt))}</span>${icon("chevron")}</button></li>`).join("")}</ul></section><div class="home-actions"><button class="secondary-button new-folder" data-action="folder">${icon("plus")} New folder</button></div></div></div>`;
}
const bottomBar = () =>
  `<nav class="bottom-bar" aria-label="Home navigation">${ib("home", "Home", "home", "active", true)}${ib("search", "Search notes", "search")}${ib("graph", "Graph view", "graph")}${ib("canvas", "Canvas", "canvas")}${ib("calendar", "Open daily note", "daily")}${ib("settings", "Settings", "settings")}</nav>`;
// Stable key for the focused control, so focus survives the full re-render.
function homeKeyOf(el) {
  if (!el?.closest) return null;
  const k = el.closest("[data-home-key]");
  if (k) return k.dataset.homeKey;
  const box = el.closest(".rail") ? "rail" : el.closest(".bottom-bar") ? "bar" : null;
  const act = el.closest("[data-action]")?.dataset.action;
  return box && act ? box + ":" + act : null;
}
function findHomeKey(key) {
  const m = /^(rail|bar):(.+)$/.exec(key);
  if (m)
    return $(`${m[1] === "rail" ? ".rail" : ".bottom-bar"} [data-action="${m[2]}"]`);
  return [...document.querySelectorAll("[data-home-key]")].find(
    (el) => el.dataset.homeKey === key,
  );
}
function saveHomeUi() {
  return {
    key: homeKeyOf(document.activeElement),
    top: $(".home-scroll")?.scrollTop ?? null,
    left: $(".folder-row")?.scrollLeft ?? null,
  };
}
function restoreHomeUi(ui) {
  const sc = $(".home-scroll"),
    row = $(".folder-row");
  homeObserver?.disconnect();
  if (sc) {
    homeObserver ||= new ResizeObserver(() => homeUpdate());
    for (const el of [sc, row, $(".home-head")]) if (el) homeObserver.observe(el);
    row?.addEventListener("scroll", homeSchedule, { passive: true });
    if (ui.top != null) sc.scrollTo({ top: ui.top, behavior: "instant" });
    if (row && ui.left != null) row.scrollTo({ left: ui.left, behavior: "instant" });
  }
  if (ui.key) {
    const el = findHomeKey(ui.key);
    if (el && el !== document.activeElement) el.focus({ preventScroll: true });
  }
  if (homeCollapse) {
    homeCollapse = false;
    // Instant, not smooth: a second smooth scroll on the same scroller starts from the
    // position the first has not reached yet, and replaces it.
    const jump = { block: "nearest", inline: "nearest", behavior: "instant" };
    $(".home-folders")?.scrollIntoView(jump);
    const card = homeRoving && findHomeKey("card:" + homeRoving);
    (card || $(".folder-card"))?.scrollIntoView(jump);
  }
  homeUpdate();
}
function homeSchedule() {
  if (!homeFrame)
    homeFrame = requestAnimationFrame(() => {
      homeFrame = 0;
      homeUpdate();
    });
}
// Sticky head height, and the Prev / Next / Show all state.
function homeUpdate() {
  const sc = $(".home-scroll");
  if (!sc) return;
  const head = $(".home-head");
  if (head) sc.style.setProperty("--home-sticky-h", head.offsetHeight + "px");
  const toggle = $('[data-home="toggle"]'),
    prev = $('[data-home="prev"]'),
    next = $('[data-home="next"]'),
    row = $(".folder-row");
  if (!toggle) return;
  if (!row) {
    toggle.classList.remove("hidden");
    return;
  }
  const overflow = row.scrollWidth > row.clientWidth + 1;
  for (const b of [toggle, prev, next]) b?.classList.toggle("hidden", !overflow);
  prev?.setAttribute("aria-disabled", String(row.scrollLeft <= 1));
  next?.setAttribute(
    "aria-disabled",
    String(row.scrollLeft + row.clientWidth >= row.scrollWidth - 1),
  );
}
function homeControl(kind) {
  if (kind === "toggle") {
    homeCollapse = homeShowAll;
    homeShowAll = !homeShowAll;
    render();
    return;
  }
  const row = $(".folder-row"),
    btn = $(`[data-home="${kind}"]`);
  if (!row || btn?.getAttribute("aria-disabled") === "true") return;
  const w = row.querySelector(".folder-card")?.offsetWidth ?? 0;
  const step = Math.max(row.clientWidth - w, w);
  row.scrollBy({ left: kind === "next" ? step : -step }); // smoothness comes from CSS only
}
function homeKey(e) {
  const cards = [...document.querySelectorAll(".folder-card")],
    i = cards.indexOf(e.target);
  if (i < 0) return;
  let cols = cards.length;
  if (homeShowAll) {
    const top = cards[0].getBoundingClientRect().top;
    cols = cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length;
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
  const t = gridTarget(i, e.key, cols, cards.length);
  if (t < 0) return;
  e.preventDefault();
  cards[t].focus({ preventScroll: true });
  cards[t].scrollIntoView({ block: "nearest", inline: "nearest" });
}
document.addEventListener("focusin", (e) => {
  const card = e.target instanceof Element && e.target.closest(".folder-card");
  if (!card) return;
  homeRoving = card.dataset.homeKey.slice(5);
  const all = document.querySelectorAll(".folder-card");
  if (all.length >= ROVING_MIN) for (const c of all) c.tabIndex = c === card ? 0 : -1;
  // 2.4.11: Chrome doesn't apply scroll-padding to this focus scroll, and the page scrolls
  // smoothly, so measure after the browser's own scroll has settled and correct by hand.
  const head = $(".home-head"),
    sc = $(".home-scroll");
  if (homeShowAll && head && sc && card.closest(".folder-grid")) {
    const fix = () => {
      if (!card.isConnected || !head.isConnected) return;
      const gap = card.getBoundingClientRect().top - (head.getBoundingClientRect().bottom + 6);
      if (gap < 0) sc.scrollBy({ top: gap, behavior: "instant" });
    };
    requestAnimationFrame(fix);
    sc.addEventListener("scrollend", fix, { once: true });
    setTimeout(fix, 500);
  }
});
function specialView() {
  return `<section class="graph-page"><div class="view-heading"><div><h1>${view === "graph" ? "A web of ideas" : "Your thinking canvas"}</h1><p>${view === "graph" ? `${vault.notes.length} notes. A growing constellation of connections.` : "Arrange your notes. Make room for a new perspective."}</p></div><div class="view-actions">${view === "canvas" ? '<button class="secondary-button" data-action="canvas-add">+ Add a note</button>' : ""}</div></div>${
    view === "graph"
      ? graphHTML() +
        `<div class="graph-list">${vault.notes.map((n) => `<button data-note="${n.id}">${esc(n.title)}</button>`).join("")}</div>`
      : `<div class="canvas-surface"><div class="canvas-world">${vault.canvas
          .map((c) => {
            const n = vault.notes.find((n) => n.id === c.id);
            return n
              ? `<div class="canvas-card" style="left:${c.x}px;top:${c.y}px" data-card="${c.id}"><header data-drag="${c.id}"><button data-note="${n.id}">${esc(n.title)}</button><button class="icon-button" data-move-card="${c.id}" aria-label="Move ${esc(n.title)}" title="Move card">${icon("canvas")}</button><button class="icon-button" data-remove-card="${c.id}" aria-label="Remove from canvas">${icon("x")}</button></header><p>${esc(n.body.replace(/[#*\[\]]/g, "").slice(0, 240))}</p></div>`
              : "";
          })
          .join("")}</div></div>`
  }</section>`;
}
function openNote(id, record = true) {
  if (!vault.notes.some((n) => n.id === id)) return;
  if (record && id !== active) {
    history = history.slice(0, historyIndex + 1);
    history.push(id);
    historyIndex = history.length - 1;
  }
  active = id;
  if (!tabs.includes(id)) tabs.push(id);
  view = "note";
  showFiles = false;
  render();
}
const draftSession = crypto.randomUUID();
let revision = 0,
  loaded = false,
  dirty = false,
  saving = false,
  saveError = "",
  conflict = false,
  saveTimer = null,
  editGeneration = 0,
  pendingDraft = null,
  recoverId = null,
  history = [],
  historyIndex = 0,
  toastTimer = null,
  lastFocus = null,
  restoreFocus = null,
  loading = true;
const modal = $("#modal");
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
const store = createStore();
const caps = capabilities();
let mirror = null; // set when the browser supports saving to a file
let fileState = { kind: "unlinked" };
let storageDown = false,
  corrupt = null,
  persisted = null,
  fileOfferDismissed = false,
  lastAnnounced = "",
  backupInfo = {},
  draftsWritten = false;

const isErrorState = () => !!saveError || storageDown;
function statusText() {
  if (loading) return "Opening your notes…";
  if (!loaded) return "Notes unavailable";
  if (storageDown) return "Not saved · storage unavailable";
  if (conflict) return "Save conflict";
  if (saveError) return "Changes not saved";
  if (saving) return "Saving…";
  if (dirty) return "Unsaved changes";
  if (fileState.kind === "synced") return "Saved · file up to date";
  if (fileState.kind === "pending") return "Saved · updating file…";
  if (fileState.kind !== "unlinked")
    return "Saved in this browser · file not updated";
  return "Saved";
}
function updateStatus() {
  saveLabel = statusText();
  const el = $("#save-status");
  if (el) {
    el.textContent = saveLabel;
    el.classList.toggle("is-error", isErrorState());
  }
}
function saveAlertHTML() {
  if (saveError)
    return `${esc(saveError)} <button data-action="backup">Export draft</button>${
      storageDown
        ? ""
        : ` <button data-action="${conflict ? "reload-latest" : "retry"}">${conflict ? "Load latest copy" : "Retry"}</button>`
    }`;
  if (pendingDraft)
    return `An unsaved draft was found on this device. <button data-action="recover">Review recovery</button>`;
  return "";
}
function fileAlertHTML() {
  if (!fileUiAllowed({ loaded, storageDown }) || !mirror) return "";
  const name = fileState.name ? `“${esc(fileState.name)}”` : "your vault file";
  const behind = fileState.behind
    ? ` The file is ${fileState.behind} save${fileState.behind === 1 ? "" : "s"} behind.`
    : "";
  const b = (action, label) =>
    `<button data-action="${action}">${label}</button>`;
  switch (fileState.kind) {
    case "unlinked":
      if (fileOfferDismissed) break;
      return `Your notes are stored in this browser. Save a copy to a file on this computer so they survive if browser data is cleared. If that file is in a cloud-synced folder, your notes leave this device through that service. ${b("file-save", "Save vault to this computer")} ${b("file-open", "Open vault file")} ${b("file-dismiss", "Not now")}`;
    case "needs-permission":
      return `Saving to ${name} is paused until you reconnect.${behind} Your notes are still saved in this browser. ${b("file-reconnect", "Reconnect vault file")} ${b("file-open", "Choose another file")} ${b("file-unlink", "Stop saving to file")}`;
    case "missing":
      return `Your vault file was moved or deleted, so nothing was written to it. Your notes are still saved in this browser. ${b("file-save", "Save to a new location")} ${b("file-open", "Open the moved file")} ${b("file-unlink", "Stop saving to file")}`;
    case "conflict":
      return `The vault file and this browser both have changes. Nothing was overwritten. ${b("file-conflict", "Review the differences")} ${b("file-unlink", "Stop saving to file")}`;
    case "invalid":
      return `Your vault file was changed and can’t be read${fileState.detail ? " (" + esc(fileState.detail) + ")" : ""}. It has not been touched. ${b("file-download", "Download file contents")} ${b("file-overwrite", "Overwrite with this browser’s notes")} ${b("file-unlink", "Stop saving to file")}`;
    case "too-large":
      return `Your vault file is larger than the 1 MB limit and was not read. It has not been touched. ${b("file-download", "Download file contents")} ${b("file-overwrite", "Overwrite with this browser’s notes")} ${b("file-unlink", "Stop saving to file")}`;
    case "error":
      return `Could not update ${name}${fileState.detail ? " (" + esc(fileState.detail) + ")" : ""}. Your notes are still saved in this browser.${behind} ${b("file-retry", "Try again")} ${b("file-open", "Choose another file")} ${b("file-unlink", "Stop saving to file")}`;
  }
  return "";
}
// Shown in the status bar: the vault changed and the last backup is over a week old. A linked
// file that is being kept up to date counts as a backup.
const backupDue = () =>
  loaded &&
  needsBackupReminder({
    now: Date.now(),
    fileHealthy: fileState.kind === "synced" || fileState.kind === "pending",
    ...backupInfo,
  });
function setAlertBox(box, html, announce) {
  box.className = html ? "save-alert" : "hidden";
  if (announce && html) box.setAttribute("role", "alert");
  else box.removeAttribute("role");
  box.innerHTML = html;
}
function renderAlerts() {
  const box = $("#save-alert");
  if (!box) return;
  const html = saveAlertHTML();
  // Announce a message once, not on every re-render.
  setAlertBox(box, html, html !== lastAnnounced);
  lastAnnounced = html;
  $("#backup-reminder")?.classList.toggle("hidden", !backupDue());
  const fileBox = $("#file-alert");
  if (fileBox) {
    const fileHtml = fileAlertHTML();
    fileBox.className = fileHtml ? "save-alert file-alert" : "hidden";
    fileBox.innerHTML = fileHtml;
  }
  $(".main")
    ?.querySelectorAll(".loading-overlay")
    .forEach((o) => o.remove());
  if (loading) {
    let overlay = document.createElement("div");
    overlay.className = "loading-overlay";
    overlay.textContent = "Opening your notes…";
    $(".main").append(overlay);
  } else if (!loaded) {
    let overlay = document.createElement("div");
    overlay.className = "loading-overlay";
    overlay.setAttribute("role", "alert");
    overlay.innerHTML = corrupt
      ? '<p>Your stored notes could not be read.</p><p>They have not been changed. Download the raw data to keep a copy before doing anything else.</p><div class="dialog-actions"><button class="secondary-button" data-action="download-raw">Download raw data</button><button class="primary-button" data-action="retry-load">Try again</button></div>'
      : '<p>Your notes could not be opened.</p><button class="primary-button" data-action="retry-load">Try again</button>';
    $(".main").append(overlay);
  }
}
const exists = (id) => vault.notes.some((n) => n.id === id);
function fixNavigation() {
  tabs = tabs.filter(exists);
  if (!tabs.length)
    tabs = ["welcome", "creative"].filter(exists);
  if (!exists(active))
    active =
      vault.notes.find((n) => n.id === "welcome")?.id ??
      tabs.at(-1) ??
      vault.notes[0]?.id ??
      null;
  if (active && !tabs.includes(active)) tabs.push(active);
  if (!history.length || !exists(history[historyIndex])) {
    history = active ? [active] : [];
    historyIndex = 0;
  }
}
async function refreshInfo() {
  try {
    backupInfo = {
      lastBackupAt: await store.getMeta("lastBackupAt"),
      createdAt: await store.getMeta("createdAt"),
      lastChangeAt: await store.getMeta("lastChangeAt"),
    };
    fileOfferDismissed = !!(await store.getMeta("fileOfferDismissed"));
  } catch {
    /* advisory only */
  }
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    persisted = null;
  }
}
async function afterLoad() {
  loaded = true;
  loading = false;
  dirty = false;
  conflict = false;
  saveError = "";
  recoverId = null;
  draftsWritten = false;
  fixNavigation();
  try {
    const scan = await pendingDrafts(store, vault);
    pendingDraft = scan.offer[0] ?? scan.invalid[0] ?? null;
  } catch {
    pendingDraft = null;
  }
  await refreshInfo();
  updateStatus();
  render();
  mirror?.init().catch(() => {});
}
async function loadVault() {
  loading = true;
  loaded = false;
  saveError = "";
  corrupt = null;
  storageDown = false;
  conflict = false;
  render();
  try {
    let result = await store.load();
    if (result.status === "empty") {
      // Sample notes are written only when no record exists at all.
      const seed = seedVault();
      try {
        const rev = await store.save(seed, 0);
        await store.setMeta("seedRevision", rev);
        await store.setMeta("createdAt", new Date().toISOString());
        result = { status: "ok", vault: seed, revision: rev };
      } catch (e) {
        if (e instanceof ConflictError) return loadVault(); // another tab seeded first
        throw e;
      }
    }
    vault = result.vault;
    revision = result.revision;
    await afterLoad();
  } catch (e) {
    loading = false;
    if (e instanceof CorruptVaultError) {
      // Fail closed: never overwrite the record and never show sample notes over it.
      loaded = false;
      corrupt = e;
      vault = emptyVault();
      saveError = "";
    } else if (e instanceof StorageUnavailableError || e?.name === "QuotaError") {
      storageDown = true;
      loaded = true;
      // No sample notes here: nothing can be saved, so start empty and say so.
      vault = emptyVault();
      revision = 0;
      saveError = e.message + " Export a backup to keep your notes.";
      fixNavigation();
    } else {
      loaded = false;
      saveError = e?.message || "Your notes could not be opened.";
    }
    updateStatus();
    render();
  }
}
// Quietly adopts a newer saved copy, keeping the open note, when this tab has no unsaved edits.
async function reloadQuiet() {
  if (!loaded || dirty || saving || storageDown) return;
  try {
    const r = await store.load();
    if (r.status !== "ok" || r.revision === revision) return;
    vault = r.vault;
    revision = r.revision;
    fixNavigation();
    updateStatus();
    render();
  } catch {
    /* the next save will report a real problem */
  }
}
function changed() {
  dirty = true;
  editGeneration++;
  updateStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveVault, 550);
}
async function flushSave() {
  clearTimeout(saveTimer);
  await saveVault();
}
async function saveVault() {
  if (!loaded || !dirty || saving || conflict || storageDown) return;
  saving = true;
  const generation = editGeneration;
  let snapshot;
  try {
    snapshot = validateVault(vault);
    updateStatus();
    // Resolves only after the browser has committed the write.
    revision = await store.save(snapshot, revision);
    saveError = "";
    if (draftsWritten) {
      await dropDraft(store, draftSession);
      draftsWritten = false;
    }
    if (recoverId) {
      await dropDraft(store, recoverId);
      recoverId = null;
    }
    backupInfo.lastChangeAt = new Date().toISOString();
    mirror?.notifySaved();
    if (generation === editGeneration) dirty = false;
  } catch (e) {
    if (e instanceof ConflictError) conflict = true;
    saveError = e.message || "Could not save. Your changes are still in this tab.";
    try {
      await keepDraft(store, draftSession, {
        revision,
        vault: snapshot ?? structuredClone(vault),
        reason: conflict ? "conflict" : "save failed",
      });
      draftsWritten = true;
    } catch {
      toast("A device draft could not be saved. Keep this tab open and export a backup.");
    }
  } finally {
    saving = false;
    updateStatus();
    renderAlerts();
    if (dirty && !saveError && !conflict) saveTimer = setTimeout(saveVault, 100);
  }
}
function dialog(title, body, onSubmit) {
  // Auto-repeated Enter from a held key on the opener must not submit the new dialog.
  modal.onkeydown = (e) => {
    if (e.key === "Enter" && e.repeat) e.preventDefault();
  };
  const replacing = modal.open;
  // A dialog opened from inside another keeps the original opener as the return target.
  if (!replacing) lastFocus = document.activeElement;
  modal.innerHTML = `<form id="dialog-form"><div class="dialog-head"><h2>${esc(title)}</h2>${ib("x", "Close dialog", "close-modal")}</div><div class="dialog-body">${body}<p id="dialog-error" class="error-text" role="alert"></p></div></form>`;
  if (replacing) modal.querySelector("button")?.focus();
  else modal.showModal();
  $("#dialog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await onSubmit?.(new FormData(e.target));
    } catch (err) {
      $("#dialog-error").textContent = err.message;
    }
  });
  requestAnimationFrame(() =>
    modal.querySelector("input,select,textarea")?.focus(),
  );
}
// render() rebuilds the page, so the opener that closeDialog() just refocused is gone. The
// next render looks the same control up again in the new page by its data-action.
const REGIONS = [".rail", ".files", ".bottom-bar", ".statusbar", ".home-scroll", ".document-toolbar", ".tabs", ".context", ".document"];
function closeDialog() {
  modal.close();
  if (lastFocus?.isConnected) lastFocus.focus();
  const attr = ["data-action", "data-move-card"].find((a) => lastFocus?.getAttribute?.(a));
  const value = attr && lastFocus.getAttribute(attr);
  restoreFocus =
    value && /^[\w-]+$/.test(value)
      ? { sel: `[${attr}="${value}"]`, region: REGIONS.find((r) => lastFocus.closest(r)) }
      : { sel: LANDING };
  queueMicrotask(() => (restoreFocus = null));
}
const focusNote = () => ($("#editor") || $(".note-title"))?.focus();
// Enter clicks a button on keydown and Space on keyup, so only Enter is still down at the click.
let enterDown = false;
document.addEventListener("keydown", (e) => e.key === "Enter" && (enterDown = true), true);
document.addEventListener("keyup", (e) => e.key === "Enter" && (enterDown = false), true);
// The keyup is missed if the window loses focus mid-press, e.g. to the file picker.
window.addEventListener("blur", () => (enterDown = false));
// Enter picked a result, so a key still held would repeat into the editor it now has.
function holdEnter() {
  const stop = (e) => e.key === "Enter" && e.repeat && e.preventDefault();
  const release = (e) => {
    if (e.key !== "Enter") return;
    document.removeEventListener("keydown", stop, true);
    document.removeEventListener("keyup", release);
  };
  document.addEventListener("keydown", stop, true);
  document.addEventListener("keyup", release);
}
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeDialog();
});
modal.addEventListener("cancel", () =>
  requestAnimationFrame(() => lastFocus?.isConnected && lastFocus.focus()),
);
const actions = (label = "Create") =>
  `<div class="dialog-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${label}</button></div>`;
function uniqueTitle(base) {
  let title = base,
    i = 2;
  while (vault.notes.some((n) => n.title.toLowerCase() === title.toLowerCase()))
    title = base + " " + i++;
  return title;
}
function checkTitle(title, except) {
  if (!title || title.length > 120 || /[\[\]\r\n]/.test(title))
    throw new Error(
      "Use a title of 1–120 characters without brackets or line breaks.",
    );
  if (
    vault.notes.some(
      (n) => n.id !== except && n.title.toLowerCase() === title.toLowerCase(),
    )
  )
    throw new Error("A note already has that title. Please choose another.");
}
function createNote(title, folder, body = "") {
  checkTitle(title);
  if (vault.notes.length >= 500)
    throw new Error(
      "The vault supports up to 500 notes. Export a backup before making room.",
    );
  const date = new Date().toISOString();
  const n = {
    id: crypto.randomUUID(),
    title,
    folder: folder || vault.folders[0],
    body,
    tags: [],
    starred: false,
    createdAt: date,
    updatedAt: date,
  };
  vault.notes.push(n);
  changed();
  return n;
}
function newNoteDialog(prefill = "", folder = current()?.folder) {
  if (!loaded) return;
  dialog(
    "A new thought",
    `<label class="field-label" for="new-title">Note title</label><input class="field" id="new-title" name="title" placeholder="Untitled" value="${esc(prefill)}" maxlength="120" required><label class="field-label" for="new-folder">Folder</label><select class="field" id="new-folder" name="folder">${vault.folders.map((f) => `<option ${f === folder ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>${actions("Create note")}`,
    (form) => {
      const n = createNote(form.get("title").trim(), form.get("folder"));
      closeDialog();
      mode = "edit";
      openNote(n.id);
      $("#editor")?.focus();
    },
  );
}
function newFolder() {
  if (!loaded) return;
  dialog(
    "New folder",
    `<label class="field-label" for="folder-name">Folder name</label><input class="field" id="folder-name" name="name" maxlength="80" required placeholder="A home for your notes">${actions("Create folder")}`,
    (form) => {
      const name = form.get("name").trim();
      if (!name || vault.folders.includes(name))
        throw new Error("Choose a unique folder name.");
      if (vault.folders.length >= 100) throw new Error("Folder limit reached.");
      vault.folders.push(name);
      changed();
      closeDialog();
      render();
    },
  );
}
// -- saving to a file on this computer (only where the browser supports it) -------------
function fileStateChanged(next) {
  const same = JSON.stringify(next) === JSON.stringify(fileState);
  fileState = next;
  if (same) return;
  updateStatus();
  renderAlerts();
  if (modal.open && $("#settings-file")) fillSettings();
}
// The file replaced the saved notes. If this tab has unsaved edits they are kept as a draft
// and the usual conflict banner is shown instead of discarding them.
function vaultReplaced(newVault, newRevision) {
  if (dirty) {
    keepDraft(store, draftSession, {
      revision,
      vault: structuredClone(vault),
      reason: "replaced by file",
    })
      .then(() => (draftsWritten = true))
      .catch(() => {});
    conflict = true;
    saveError =
      "The vault file replaced the saved notes while this tab had unsaved changes. Export your draft, then load the latest copy.";
    updateStatus();
    renderAlerts();
    return;
  }
  vault = newVault;
  revision = newRevision;
  fixNavigation();
  updateStatus();
  render();
  toast("Loaded newer notes from your vault file.");
}
async function fileSave() {
  if (!fileUiAllowed({ loaded, storageDown })) return;
  // The picker must be the first thing a click does: it needs user activation.
  const handle = await pickSaveFile();
  if (!handle) return;
  await flushSave();
  if (dirty || conflict || saveError) {
    toast("Resolve the save problem first, then save to a file.");
    return;
  }
  await mirror.link(handle, "save");
  if (mirror.state.kind === "synced") toast("Saving to “" + handle.name + "”.");
}
async function fileOpen() {
  if (!fileUiAllowed({ loaded, storageDown })) return;
  const handle = await pickOpenFile();
  if (!handle) return;
  await flushSave();
  if (dirty || conflict || saveError) {
    toast("Resolve the save problem first, then open a file.");
    return;
  }
  await mirror.link(handle, "open");
  if (mirror.state.kind === "conflict") conflictDialog();
  else if (mirror.state.kind === "synced") toast("Linked to “" + handle.name + "”.");
}
function diffLines(d) {
  const list = (label, titles) =>
    titles.length
      ? `<li>${label}: ${titles
          .slice(0, 6)
          .map((t) => esc(t))
          .join(", ")}${titles.length > 6 ? ", …" : ""}</li>`
      : "";
  return `<ul>${list("Added", d.added)}${list("Removed", d.removed)}${list("Changed", d.changed)}${d.canvasChanged ? "<li>Canvas differs</li>" : ""}${d.foldersAdded.length || d.foldersRemoved.length ? "<li>Folders differ</li>" : ""}</ul>`;
}
function conflictDialog() {
  const info = mirror?.conflict;
  if (!info) return;
  const toFile = diffVaults(info.browserVault, info.fileVault);
  const toBrowser = diffVaults(info.fileVault, info.browserVault);
  dialog(
    "Your notes and the vault file differ",
    `<p>Both this browser and the vault file have changes that the other doesn’t. Nothing has been overwritten. Whichever copy you don’t keep is saved as a draft first.</p><p><strong>Using the file’s copy</strong> would change this browser’s notes (${esc(summarizeDiff(toFile))}):</p>${diffLines(toFile)}<p><strong>Keeping this browser’s copy</strong> would change the file (${esc(summarizeDiff(toBrowser))}):</p>${diffLines(toBrowser)}<div class="dialog-actions"><button type="button" class="secondary-button" data-action="conflict-download">Download both</button><button type="button" class="secondary-button" data-action="conflict-use-file">Use the file’s copy</button><button type="button" class="primary-button" data-action="conflict-keep-browser">Keep this browser’s copy</button></div>`,
  );
}
async function resolveConflict(choice) {
  try {
    const r = await mirror.resolveConflict(choice);
    closeDialog();
    if (r.stale) {
      toast("The file changed again. Please review the new differences.");
      if (mirror.state.kind === "conflict") conflictDialog();
      return;
    }
    toast(choice === "keep-browser" ? "Vault file updated." : "Loaded the file’s notes.");
  } catch (e) {
    toast(e?.message || "Could not finish. Nothing was changed.");
  }
}
async function allDrafts() {
  try {
    return await store.listDrafts();
  } catch {
    return [];
  }
}
async function clearDraftsDialog() {
  const list = await allDrafts();
  if (!list.length) {
    toast("There are no saved drafts.");
    return;
  }
  dialog(
    "Clear saved drafts?",
    `<p>${list.length} draft${list.length === 1 ? " is" : "s are"} saved on this device. Drafts hold copies of work from failed saves or from notes replaced by a vault file. Clearing them cannot be undone.</p><button type="button" class="secondary-button" data-action="download-drafts">Download drafts first</button>${actions("Clear drafts")}`,
    async () => {
      await store.clearDrafts();
      pendingDraft = null;
      draftsWritten = false;
      closeDialog();
      renderAlerts();
      toast("Drafts cleared.");
    },
  );
}
function fileRow() {
  if (storageDown)
    return `<div class="row-setting"><div>Save to a file<p>Not available while this browser is not keeping your notes. Use Export to keep a copy.</p></div></div>`;
  if (!caps.supported)
    return `<div class="row-setting"><div>Save to a file<p>Not available in this browser. Use Export for backups; browsers with this feature include Chrome, Edge and Opera on a computer.</p></div></div>`;
  const k = fileState.kind;
  const name = fileState.name ? "“" + esc(fileState.name) + "”" : "a file";
  const text =
    k === "unlinked"
      ? "Keep a copy of your notes in a file on this computer. Every save is also written to it. Notes in the file are plain text; if the file is in a cloud-synced folder, your notes leave this device through that service."
      : k === "synced" || k === "pending"
        ? `Saving to ${name}.`
        : `Linked to ${name}, but it is not being updated right now. See the notice at the top of the page.`;
  const buttons =
    k === "unlinked"
      ? '<button type="button" class="secondary-button" data-action="file-save">Save vault to this computer</button><button type="button" class="secondary-button" data-action="file-open">Open vault file</button>'
      : '<button type="button" class="secondary-button" data-action="file-unlink">Stop saving to file</button>';
  return `<div class="row-setting"><div>Save to a file<p>${text}</p></div><div class="row-buttons">${buttons}</div></div>`;
}
async function fillSettings() {
  const box = $("#settings-file");
  if (box) box.innerHTML = fileRow();
  const storageBox = $("#settings-storage");
  if (!storageBox) return;
  await refreshInfo();
  const drafts = await allDrafts();
  if (!$("#settings-storage")) return;
  const canPersist = typeof navigator.storage?.persist === "function";
  const last = backupInfo.lastBackupAt
    ? new Date(backupInfo.lastBackupAt).toLocaleDateString()
    : "never";
  $("#settings-storage").innerHTML = `<div class="row-setting"><div>Browser storage<p>${
    persisted === true
      ? "Your browser has agreed to keep these notes unless you clear site data."
      : "The browser may clear these notes if disk space runs low, and clearing site data deletes them."
  }</p></div>${persisted !== true && canPersist ? '<button type="button" class="secondary-button" data-action="persist">Keep my notes on this device</button>' : ""}</div><div class="row-setting"><div>Saved drafts<p>${drafts.length ? drafts.length + " saved on this device." : "None."} Last backup: ${last}.</p></div>${drafts.length ? '<button type="button" class="secondary-button" data-action="clear-drafts">Clear drafts</button>' : ""}</div>`;
}
function settings() {
  const kb = (new TextEncoder().encode(JSON.stringify(vault)).length / 1000).toFixed(1);
  dialog(
    "Your workspace",
    `<div class="row-setting"><div>Appearance<p>Make yourself comfortable.</p></div><select aria-label="Appearance" id="theme"><option value="dark">Dark</option><option value="light">Light</option></select></div><div id="settings-storage"></div><div id="settings-file">${fileRow()}</div><div class="row-setting"><div>Export vault<p>Download every note and your canvas.</p></div><button type="button" class="secondary-button" data-action="backup">Export</button></div><div class="row-setting"><div>Import notes<p>Markdown files or a ${esc(BRAND.name)} vault backup.</p></div><button type="button" class="secondary-button" data-action="import">Import</button></div><div class="row-setting"><div>Keyboard shortcuts<p>Keep your hands on the keys.</p></div><button type="button" class="secondary-button" data-action="help">View</button></div><p class="storage-note">Your notes are saved automatically in this browser on this computer. This vault contains ${vault.notes.length} notes and uses ${kb} KB of 1,000 KB. Notes are stored as plain text and are not encrypted. Export a backup now and then.</p><p class="storage-note">${esc(BRAND.name)} is an independent notes app inspired by Obsidian and not affiliated with it. Imports support text notes, not attachments or Obsidian plugins.</p>`,
  );
  $("#theme").value = document.body.classList.contains("theme-light")
    ? "light"
    : "dark";
  $("#theme").addEventListener("change", (e) => {
    document.body.classList.toggle("theme-light", e.target.value === "light");
    try {
      localStorage.setItem(BRAND.themeKey, e.target.value);
    } catch {}
  });
  fillSettings();
}
function commandPalette(query = "", canvas = false) {
  // Over an open dialog the focused element belongs to the content this replaces.
  if (!modal.open) lastFocus = document.activeElement;
  modal.innerHTML = `<input class="command-search" aria-label="${canvas ? "Find a note for your canvas" : "Search your notes"}" placeholder="${canvas ? "Add a note to your canvas…" : "Search notes, ideas, anything…"}" id="command-query" value="${esc(query)}"><div class="command-results" id="command-results"></div><div class="command-footer">↑ ↓ to navigate &nbsp; ↵ to open &nbsp; esc to close</div>`;
  if (!modal.open) modal.showModal();
  const input = $("#command-query");
  let focusIndex = -1;
  const update = () => {
    focusIndex = -1;
    const q = input.value.toLowerCase().trim();
    const list = vault.notes.filter(
      (n) =>
        (!canvas || !vault.canvas.some((c) => c.id === n.id)) &&
        (n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => ("#" + t).toLowerCase().includes(q))),
    );
    $("#command-results").innerHTML =
      list
        .map(
          (n) =>
            `<button class="command-result" ${canvas ? "data-add-card" : "data-note"}="${n.id}">${icon("file")}<span>${esc(n.title)}</span><small>${esc(n.folder)}</small></button>`,
        )
        .join("") ||
      '<p class="empty">No notes found. Try a different search.</p>';
  };
  input.addEventListener("input", update);
  modal.onkeydown = (e) => {
    const buttons = [...modal.querySelectorAll(".command-result")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusIndex =
        (focusIndex + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length;
      buttons[focusIndex]?.focus();
    }
    if (e.key === "Enter" && document.activeElement === input) {
      e.preventDefault();
      buttons[0]?.click();
    }
  };
  update();
  input.focus();
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function backup() {
  download(
    BRAND.exportPrefix + "-" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(vault, null, 2),
    "application/json",
  );
  const stamp = new Date().toISOString();
  backupInfo.lastBackupAt = stamp;
  store.setMeta("lastBackupAt", stamp).catch(() => {});
  renderAlerts();
  toast("Vault backup downloaded");
}
function exportNote() {
  const n = current();
  if (n)
    download(
      n.title.replace(/[<>:"/\\|?*]/g, "_") + ".md",
      "# " +
        n.title +
        "\n\n" +
        n.tags.map((t) => "#" + t).join(" ") +
        "\n\n" +
        n.body,
    );
}
function renameNote(n, title) {
  checkTitle(title, n.id);
  const old = n.title;
  if (title === old) return;
  vault.notes.forEach((t) => {
    t.body = renameLinks(t.body, old, title);
  });
  n.title = title;
  n.updatedAt = new Date().toISOString();
  changed();
}
function noteMenu() {
  const n = current();
  if (!n) return;
  dialog(
    "Note options",
    `<button type="button" class="command-result" data-action="bookmark">${icon("star")}${n.starred ? "Remove bookmark" : "Bookmark note"}</button><button type="button" class="command-result" data-action="move">${icon("folder")}Move to folder</button><button type="button" class="command-result" data-action="tags">${icon("hash")}Edit tags</button><button type="button" class="command-result" data-action="export-note">${icon("download")}Export Markdown</button><button type="button" class="command-result" data-action="delete">${icon("trash")}Delete note</button>`,
  );
}
function dailyNote() {
  const date = new Date(),
    title =
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0");
  let n = vault.notes.find((n) => n.title === title);
  if (!n) {
    if (!vault.folders.includes("Daily notes"))
      vault.folders.push("Daily notes");
    n = createNote(
      title,
      "Daily notes",
      "## Today’s focus\n\n- [ ] One thing that matters\n\n## Notes & observations\n\n\n## A moment of gratitude\n\n",
    );
    n.tags = ["daily"];
  }
  mode = "edit";
  openNote(n.id);
}
async function handleAction(action) {
  switch (action) {
    case "close-modal":
      closeDialog();
      break;
    case "mode":
      mode = mode === "read" ? "edit" : "read";
      render();
      break;
    case "files":
      if (window.innerWidth <= 800) showFiles = !showFiles;
      else hideFiles = !hideFiles;
      render();
      break;
    case "context":
      if (window.innerWidth <= 1150) showContext = !showContext;
      else hideContext = !hideContext;
      render();
      break;
    case "new":
      newNoteDialog();
      break;
    case "folder":
      newFolder();
      break;
    case "collapse":
      collapsed =
        collapsed.size === vault.folders.length
          ? new Set()
          : new Set(vault.folders);
      render();
      break;
    case "search":
      commandPalette();
      break;
    case "graph":
    case "canvas":
      view = action;
      showFiles = false;
      render();
      break;
    case "home":
      view = "home";
      showFiles = false;
      render();
      break;
    case "notes":
      view = "note";
      render();
      break;
    case "daily":
      dailyNote();
      break;
    case "settings":
      settings();
      break;
    case "right-links":
    case "right-outline":
    case "right-tags":
      rightTab = action.slice(6);
      render();
      break;
    case "more":
      noteMenu();
      break;
    case "back":
      if (historyIndex > 0) openNote(history[--historyIndex], false);
      break;
    case "forward":
      if (historyIndex < history.length - 1)
        openNote(history[++historyIndex], false);
      break;
    case "bookmark":
      current().starred = !current().starred;
      changed();
      closeDialog();
      render();
      break;
    case "backup":
      backup();
      break;
    case "export-note":
      exportNote();
      closeDialog();
      break;
    case "import":
      $("#import-file").click();
      break;
    case "canvas-add":
      commandPalette("", true);
      break;
    case "retry":
      saveError = "";
      updateStatus();
      await saveVault();
      break;
    case "retry-load":
      loadVault();
      break;
    case "reload-latest":
      dialog(
        "Load the latest copy?",
        `<p>This replaces what is in this tab with the latest saved copy. Your unsaved changes are kept as a draft on this device, and you can export them first.</p><button type="button" class="secondary-button" data-action="backup">Export draft</button>${actions("Load latest copy")}`,
        async () => {
          pendingDraft = null;
          closeDialog();
          // The banner that opened this is gone once the copy loads.
          await loadVault();
          focusShown(LANDING);
        },
      );
      break;
    case "recover": {
      const d = pendingDraft;
      dialog(
        "Recover your unsaved draft",
        `<p>A draft from ${esc(new Date(d.savedAt).toLocaleString())}${d.reason ? " (" + esc(d.reason) + ")" : ""} was found${d.diff ? ": " + esc(summarizeDiff(d.diff)) + " compared with the notes loaded now" : ""}. You can download it, discard it, or replace the notes loaded now with it.</p><button type="button" class="secondary-button" id="export-recovery">Download recovered draft</button> <button type="button" class="secondary-button" data-action="discard-draft">Discard draft</button>${d.invalidReason ? `<p class="error-text">${esc(d.invalidReason)} Download this draft to keep all its text. It cannot be restored until it is within the vault limits.</p><div class="dialog-actions"><button type="button" class="primary-button" data-action="close-modal">Keep draft for later</button></div>` : actions("Use recovered draft")}`,
        () => {
          vault = validateVault(d.vault);
          recoverId = d.id;
          pendingDraft = null;
          closeDialog();
          active = vault.notes[0]?.id;
          tabs = active ? [active] : [];
          changed();
          render();
        },
      );
      $("#export-recovery").onclick = () =>
        download(
          BRAND.recoveredDraftFile,
          JSON.stringify(d.vault, null, 2),
          "application/json",
        );
      break;
    }
    case "discard-draft": {
      if (pendingDraft) await dropDraft(store, pendingDraft.id);
      closeDialog();
      const scan = await pendingDrafts(store, vault);
      pendingDraft = scan.offer[0] ?? scan.invalid[0] ?? null;
      renderAlerts();
      // The banner was redrawn: focus its next Review button, or leave it for the note.
      focusShown('[data-action="recover"]') || focusShown(LANDING);
      toast("Draft discarded");
      break;
    }
    case "download-raw":
      try {
        download(
          BRAND.exportPrefix + "-raw-data.json",
          JSON.stringify(corrupt?.raw ?? null, null, 2),
          "application/json",
        );
      } catch {
        toast("The raw data could not be turned into a file.");
      }
      break;
    case "download-drafts": {
      const list = await allDrafts();
      download(
        BRAND.exportPrefix + "-drafts.json",
        JSON.stringify(
          list.map((x) => ({ id: x.id, ...x.draft })),
          null,
          2,
        ),
        "application/json",
      );
      break;
    }
    case "clear-drafts":
      await clearDraftsDialog();
      break;
    case "persist":
      try {
        persisted = await navigator.storage.persist();
        toast(persisted ? "Your browser will keep your notes." : "Your browser declined. Export backups regularly.");
      } catch {
        toast("This browser could not change storage settings.");
      }
      fillSettings();
      break;
    case "file-save":
      await fileSave();
      break;
    case "file-open":
      await fileOpen();
      break;
    case "file-dismiss":
      fileOfferDismissed = true;
      store.setMeta("fileOfferDismissed", true).catch(() => {});
      renderAlerts();
      break;
    case "file-reconnect":
      await mirror.reconnect();
      if (mirror.state.kind === "conflict") conflictDialog();
      break;
    case "file-retry":
      await mirror.sync();
      break;
    case "file-unlink":
      await mirror.unlink();
      toast("Stopped saving to a file. The file was left as it is.");
      break;
    case "file-conflict":
      conflictDialog();
      break;
    case "conflict-keep-browser":
      await resolveConflict("keep-browser");
      break;
    case "conflict-use-file":
      await resolveConflict("use-file");
      break;
    case "conflict-download":
      try {
        const info = mirror.conflict;
        download(BRAND.exportPrefix + "-file-copy.json", JSON.stringify(info.fileVault, null, 2), "application/json");
        download(BRAND.exportPrefix + "-browser-copy.json", JSON.stringify(info.browserVault, null, 2), "application/json");
      } catch {
        toast("Could not prepare the downloads.");
      }
      break;
    case "file-download":
      try {
        download(BRAND.exportPrefix + "-file-contents.txt", await mirror.fileText());
      } catch (e) {
        toast(e?.message || "Could not read the file.");
      }
      break;
    case "file-overwrite":
      dialog(
        "Overwrite the vault file?",
        `<p>The file’s current contents will be replaced with this browser’s notes. They cannot be recovered afterwards, so download them first if you want them.</p><button type="button" class="secondary-button" data-action="file-download">Download file contents</button>${actions("Overwrite file")}`,
        async () => {
          const r = await mirror.overwriteFile();
          closeDialog();
          toast(
            r.stale
              ? "The file changed again, so nothing was overwritten. Please review the notice."
              : "Vault file updated.",
          );
          if (mirror.state.kind === "conflict") conflictDialog();
        },
      );
      break;
    case "move":
      dialog(
        "Move note",
        `<label class="field-label" for="move-folder">Destination folder</label><select class="field" name="folder" id="move-folder">${vault.folders.map((f) => `<option ${f === current().folder ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>${actions("Move note")}`,
        (form) => {
          current().folder = form.get("folder");
          current().updatedAt = new Date().toISOString();
          changed();
          closeDialog();
          render();
        },
      );
      break;
    case "tags":
      dialog(
        "Edit tags",
        `<label class="field-label" for="tag-input">Tags, separated by commas</label><input class="field" id="tag-input" name="tags" value="${esc(current().tags.join(", "))}" placeholder="ideas, personal">${actions("Save tags")}`,
        (form) => {
          const tags = form
            .get("tags")
            .split(",")
            .map((t) => t.trim().replace(/^#/, ""))
            .filter(Boolean);
          if (tags.length > 20 || tags.some((t) => t.length > 40))
            throw new Error("Use up to 20 tags, each 40 characters or fewer.");
          current().tags = [...new Set(tags)];
          changed();
          closeDialog();
          render();
        },
      );
      break;
    case "delete":
      dialog(
        "Delete this note?",
        `<p>“${esc(current().title)}” will be removed from your vault and canvas. Links to it will remain in other notes.</p><button type="button" class="secondary-button" data-action="export-note">Export Markdown first</button>${actions("Delete note")}`,
        () => {
          const id = active;
          vault.notes = vault.notes.filter((n) => n.id !== id);
          vault.canvas = vault.canvas.filter((c) => c.id !== id);
          tabs = tabs.filter((t) => t !== id);
          active = tabs.at(-1) || vault.notes[0]?.id;
          if (active && !tabs.includes(active)) tabs.push(active);
          changed();
          closeDialog();
          // The note and its opener are gone, so focus the tab of the note now shown.
          restoreFocus = { sel: ".tab.active .label, .empty button" };
          render();
          toast("Note deleted");
        },
      );
      break;
    case "help":
      dialog(
        "A few useful shortcuts",
        `<div class="row-setting"><span>Find a note</span><kbd>⌘ / Ctrl K</kbd></div><div class="row-setting"><span>New note</span><kbd>⌘ / Ctrl N</kbd></div><div class="row-setting"><span>Edit / read</span><kbd>⌘ / Ctrl E</kbd></div><div class="row-setting"><span>Save now</span><kbd>⌘ / Ctrl S</kbd></div><div class="row-setting"><span>Close a dialog</span><kbd>Esc</kbd></div><p>Use <code>[[note title]]</code> to connect ideas. Use <code>## Heading</code> for an outline and <code>- [ ]</code> for a task.</p>`,
      );
      break;
  }
}
document.addEventListener("click", async (e) => {
  try {
    const hc = e.target.closest("[data-home]");
    if (hc) {
      homeControl(hc.dataset.home);
      return;
    }
    const nf = e.target.closest("[data-new-in]");
    if (nf) {
      newNoteDialog("", nf.dataset.newIn);
      return;
    }
    const node = e.target.closest("[data-note]");
    if (node) {
      const picked = modal.open;
      if (picked) closeDialog();
      openNote(node.dataset.note);
      if (picked) {
        focusNote();
        if (enterDown) holdEnter();
      }
      return;
    }
    const wiki = e.target.closest("[data-wiki]");
    if (wiki) {
      const n = vault.notes.find(
        (n) => n.title.toLowerCase() === wiki.dataset.wiki.toLowerCase(),
      );
      n ? openNote(n.id) : newNoteDialog(wiki.dataset.wiki);
      return;
    }
    const folder = e.target.closest("[data-folder]");
    if (folder) {
      collapsed.has(folder.dataset.folder)
        ? collapsed.delete(folder.dataset.folder)
        : collapsed.add(folder.dataset.folder);
      render();
      return;
    }
    const close = e.target.closest("[data-close]");
    if (close) {
      tabs = tabs.filter((x) => x !== close.dataset.close);
      if (active === close.dataset.close) {
        active = tabs.at(-1);
        if (view !== "home") view = "note";
      }
      render();
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      commandPalette("#" + tag.dataset.tag);
      return;
    }
    const heading = e.target.closest("[data-heading]");
    if (heading) {
      if (mode === "edit") {
        mode = "read";
        render();
      }
      $("#heading-" + heading.dataset.heading)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    const add = e.target.closest("[data-add-card]");
    if (add) {
      if (vault.canvas.length >= 100) throw new Error("Canvas limit reached.");
      vault.canvas.push({
        id: add.dataset.addCard,
        x: 60 + (vault.canvas.length % 3) * 280,
        y: 60 + ((Math.floor(vault.canvas.length / 3) * 230) % 800),
      });
      changed();
      closeDialog();
      render();
      return;
    }
    const remove = e.target.closest("[data-remove-card]");
    if (remove) {
      vault.canvas = vault.canvas.filter(
        (c) => c.id !== remove.dataset.removeCard,
      );
      changed();
      render();
      return;
    }
    const move = e.target.closest("[data-move-card]");
    if (move) {
      const card = vault.canvas.find((c) => c.id === move.dataset.moveCard);
      dialog(
        "Move canvas card",
        `<label class="field-label" for="card-x">Horizontal position (0–1150)</label><input type="number" class="field" name="x" id="card-x" min="0" max="1150" value="${card.x}" required><label class="field-label" for="card-y">Vertical position (0–850)</label><input type="number" class="field" name="y" id="card-y" min="0" max="850" value="${card.y}" required>${actions("Move card")}`,
        (f) => {
          card.x = Math.min(1150, Math.max(0, Number(f.get("x"))));
          card.y = Math.min(850, Math.max(0, Number(f.get("y"))));
          changed();
          closeDialog();
          render();
        },
      );
      return;
    }
    const a = e.target.closest("[data-action]")?.dataset.action;
    if (a) {
      e.preventDefault();
      if (!loaded && !["retry-load", "close-modal", "backup", "download-raw"].includes(a))
        return;
      await handleAction(a);
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "editor") {
    const n = current();
    n.body = e.target.value;
    n.updatedAt = new Date().toISOString();
    changed();
    $("#word-count").textContent = words(n.body) + " words";
    $("#char-count").textContent = n.body.length + " characters";
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "note-title") {
    try {
      renameNote(current(), e.target.value.trim());
      render();
    } catch (err) {
      e.target.value = current().title;
      toast(err.message);
    }
  }
  if (e.target.dataset.task !== undefined) {
    const n = current(),
      lines = n.body.split("\n"),
      i = Number(e.target.dataset.task);
    lines[i] = lines[i].replace(/\[[ x]\]/, e.target.checked ? "[x]" : "[ ]");
    n.body = lines.join("\n");
    n.updatedAt = new Date().toISOString();
    changed();
    render();
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches?.(".folder-card") &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey
  )
    homeKey(e);
  if (
    (e.metaKey || e.ctrlKey) &&
    ["k", "n", "e", "s"].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    if (!loaded) return;
    const key = e.key.toLowerCase();
    if (key === "k") commandPalette();
    if (key === "n") newNoteDialog();
    if (key === "e" && !modal.open) handleAction("mode");
    if (key === "s") saveVault();
  }
  if (e.key === "Escape") {
    const drawerOpen = showFiles || showContext;
    showFiles = false;
    showContext = false;
    if (drawerOpen && !modal.open) render();
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".graph-node")) {
    e.preventDefault();
    openNote(e.target.dataset.note);
  }
});
let drag = null;
document.addEventListener("pointerdown", (e) => {
  const head = e.target.closest("[data-drag]");
  if (!head || e.target.closest("button")) return;
  const card = vault.canvas.find((c) => c.id === head.dataset.drag);
  drag = {
    card,
    startX: e.clientX,
    startY: e.clientY,
    x: card.x,
    y: card.y,
    el: head.closest(".canvas-card"),
  };
  head.setPointerCapture(e.pointerId);
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.card.x = Math.round(
    Math.min(1150, Math.max(0, drag.x + e.clientX - drag.startX)),
  );
  drag.card.y = Math.round(
    Math.min(850, Math.max(0, drag.y + e.clientY - drag.startY)),
  );
  drag.el.style.left = drag.card.x + "px";
  drag.el.style.top = drag.card.y + "px";
});
document.addEventListener("pointerup", () => {
  if (drag) {
    drag = null;
    changed();
  }
});
document.addEventListener("pointercancel", () => {
  if (drag) {
    drag = null;
    changed();
  }
});
$("#import-file").addEventListener("change", async (e) => {
  try {
    const files = [...e.target.files];
    if (!files.length) return;
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES)
      throw new Error("Select files totaling less than 1 MB.");
    if (files.some((f) => f.name.endsWith(".json"))) {
      if (files.length !== 1)
        throw new Error("Import one vault backup at a time.");
      const imported = validateVault(JSON.parse(await files[0].text()));
      dialog(
        "Import vault backup?",
        `<p>This backup contains ${imported.notes.length} notes. It will replace your current vault. Export your current vault first if you want to keep it.</p><button type="button" class="secondary-button" data-action="backup">Export current vault</button>${actions("Replace vault")}`,
        () => {
          vault = imported;
          active = vault.notes[0]?.id;
          tabs = active ? [active] : [];
          changed();
          closeDialog();
          render();
          toast("Vault imported");
        },
      );
    } else {
      const candidate = structuredClone(vault);
      for (const f of files) {
        if (!/\.(md|markdown|txt)$/i.test(f.name))
          throw new Error("Choose Markdown, text, or a " + BRAND.name + " JSON backup.");
        let body = await f.text(),
          title =
            f.name
              .replace(/\.(md|markdown|txt)$/i, "")
              .replace(/[\[\]\r\n]/g, "")
              .slice(0, 115) || "Imported note";
        if (/^# .+\n/.test(body)) {
          title =
            body
              .split("\n")[0]
              .slice(2)
              .trim()
              .replace(/[\[\]\r\n]/g, "")
              .slice(0, 115) || title;
          body = body.slice(body.indexOf("\n") + 1).trimStart();
        }
        let base = title,
          i = 2;
        while (
          candidate.notes.some(
            (n) => n.title.toLowerCase() === title.toLowerCase(),
          )
        )
          title = base + " " + i++;
        const now = new Date().toISOString();
        candidate.notes.push({
          id: crypto.randomUUID(),
          title,
          folder: candidate.folders[0],
          body,
          tags: [],
          starred: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      vault = validateVault(candidate);
      changed();
      if (modal.open) closeDialog();
      openNote(vault.notes.at(-1).id);
      focusNote();
      toast(
        files.length + " note" + (files.length === 1 ? "" : "s") + " imported",
      );
    }
  } catch (err) {
    toast(err.message);
  } finally {
    e.target.value = "";
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Other tabs and the vault file.
store.onSaved((rev) => {
  if (loaded && rev !== revision) reloadQuiet();
});
if (caps.supported) {
  mirror = new FileMirror({
    store,
    handleStore: idbHandleStore(store),
    locks: browserLocks(),
    onState: fileStateChanged,
    onVaultReplaced: vaultReplaced,
    id: draftSession,
  });
}
document.addEventListener("visibilitychange", () => {
  if (!fileUiAllowed({ loaded, storageDown })) return;
  if (document.visibilityState === "hidden") {
    mirror?.flush().catch(() => {});
    return;
  }
  store
    .readRevision()
    .then((r) => {
      if (r !== revision) reloadQuiet();
    })
    .catch(() => {});
  mirror?.sync().catch(() => {});
});
window.addEventListener("focus", () => {
  if (fileUiAllowed({ loaded, storageDown })) mirror?.sync().catch(() => {});
});
try {
  document.body.classList.toggle(
    "theme-light",
    localStorage.getItem(BRAND.themeKey) === "light",
  );
} catch {}
function registerTools() {
  const ctx = document.modelContext;
  if (!ctx?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: "search_notes",
      title: "Search notes",
      description:
        "Search titles and content in the currently loaded notes vault.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 200 } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!loaded) throw new Error("Vault is not loaded");
        if (
          !input ||
          typeof input.query !== "string" ||
          input.query.length > 200
        )
          throw new Error("Provide a query under 200 characters");
        const q = input.query.toLowerCase();
        return vault.notes
          .filter((n) => (n.title + " " + n.body).toLowerCase().includes(q))
          .map((n) => ({ id: n.id, title: n.title, folder: n.folder }));
      },
    },
    {
      name: "open_note",
      title: "Open a note",
      description:
        "Navigate to an existing note by its exact ID without editing it.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", maxLength: 80 } },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (
          !loaded ||
          !input ||
          typeof input.id !== "string" ||
          !vault.notes.some((n) => n.id === input.id)
        )
          throw new Error("Note not found");
        openNote(input.id);
        return { id: active, title: current().title };
      },
    },
  ])
    try {
      Promise.resolve(
        ctx.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
}
render();
loadVault();
registerTools();
