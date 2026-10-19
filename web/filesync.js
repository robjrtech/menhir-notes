import { validateVault, MAX_BYTES } from "./model.js";
import { BRAND } from "./brand.js";
import { keepDraft } from "./drafts.js";

// Optional local-file mirror. IndexedDB stays the working copy; where the browser supports the
// File System Access pickers, every committed save is also written to one file the user chose.
// The file is untrusted input: it is size-checked, parsed and validated before it is used.

// A vault file larger than the import limit plus a small margin is never read.
export const FILE_LIMIT = MAX_BYTES + 1024;
const WRITE_DELAY_MS = 1500;

export const serializeVault = (vault) => JSON.stringify(vault);

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -- feature detection --------------------------------------------------------------------

export function capabilities(g = globalThis) {
  const save = typeof g?.showSaveFilePicker === "function";
  const open = typeof g?.showOpenFilePicker === "function";
  return { save, open, supported: save && open };
}

const pickerTypes = [
  {
    description: BRAND.name + " vault",
    accept: { "application/json": [".json"] },
  },
];
async function pick(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.name === "AbortError") return null;
    throw e;
  }
}
// Both must be called straight from a click handler (they need user activation).
export const pickSaveFile = (g = globalThis) =>
  pick(() =>
    g.showSaveFilePicker({
      suggestedName: BRAND.vaultFile,
      types: pickerTypes,
      excludeAcceptAllOption: true,
    }),
  );
export const pickOpenFile = async (g = globalThis) => {
  const handles = await pick(() =>
    g.showOpenFilePicker({
      multiple: false,
      types: pickerTypes,
      excludeAcceptAllOption: true,
    }),
  );
  return handles?.[0] ?? null;
};

// -- reconcile: which copy wins -----------------------------------------------------------

// Pure decision function. It compares content hashes and revisions, never timestamps alone,
// because sync tools and clocks change modification times.
//   first   : null, "save" (just linked via Save) or "open" (just linked via Open)
//   file    : { tooLarge, valid, hash, canonicalHash }
//   browser : { revision, hash, pristine }   hash = hash of the serialized browser vault
//   sync    : { hash, revision } from the last successful sync, or null
// Returns one of: noop, adopt, write, load-file, conflict, invalid, too-large.
export function reconcile({ first = null, file, browser, sync }) {
  if (first === "save") return "write"; // the picker already warned about replacing a file
  if (file.tooLarge) return "too-large";
  if (!file.valid) return "invalid";
  if (file.canonicalHash === browser.hash) {
    return sync && sync.hash === file.hash && sync.revision === browser.revision
      ? "noop"
      : "adopt";
  }
  if (first === "open") return browser.pristine ? "load-file" : "conflict";
  if (!sync) return browser.pristine ? "load-file" : "conflict";
  if (file.hash === sync.hash)
    return browser.revision > sync.revision ? "write" : "noop";
  return browser.revision === sync.revision ? "load-file" : "conflict";
}

// -- locks --------------------------------------------------------------------------------

// In-process fallback with the same shape as navigator.locks.
export function createMutex() {
  let tail = Promise.resolve();
  return {
    request(_name, fn) {
      const run = tail.then(() => fn());
      tail = run.then(
        () => {},
        () => {},
      );
      return run;
    },
  };
}
export const browserLocks = (g = globalThis) =>
  g?.navigator?.locks?.request ? g.navigator.locks : createMutex();

// -- the mirror ---------------------------------------------------------------------------

const META_KEY = "fileSync";

const errorKind = (e) =>
  e?.name === "NotFoundError"
    ? "missing"
    : e?.name === "NotAllowedError" || e?.name === "SecurityError"
      ? "needs-permission"
      : "error";

export class FileMirror {
  constructor({
    store,
    handleStore,
    locks = createMutex(),
    hash = sha256Hex,
    serialize = serializeVault,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (t) => clearTimeout(t),
    onState = () => {},
    onVaultReplaced = () => {},
    id = "tab",
  }) {
    Object.assign(this, {
      store,
      handleStore,
      locks,
      hash,
      serialize,
      setTimer,
      clearTimer,
      onState,
      onVaultReplaced,
      id,
    });
    this.state = { kind: "unlinked" };
    this.timer = null;
    this.conflict = null;
    this.queue = Promise.resolve();
  }

  setState(kind, extra = {}) {
    this.state = { kind, ...extra };
    try {
      this.onState(this.state);
    } catch {
      /* UI errors must not break syncing */
    }
  }

  async init() {
    const handle = await this.handleStore.get();
    if (!handle) return this.setState("unlinked");
    let permission = "prompt";
    try {
      permission = await handle.queryPermission({ mode: "readwrite" });
    } catch {
      /* treated as prompt */
    }
    if (permission !== "granted")
      return this.setState("needs-permission", { name: handle.name });
    await this.sync();
  }

  // Called with a handle straight from a picker.
  async link(handle, mode) {
    await this.handleStore.set(handle);
    await this.store.deleteMeta(META_KEY);
    this.conflict = null;
    try {
      if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
        if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted")
          return this.setState("needs-permission", { name: handle.name });
      }
    } catch {
      return this.setState("needs-permission", { name: handle.name });
    }
    await this.sync({ first: mode });
  }

  async unlink() {
    this.clearTimer(this.timer);
    this.conflict = null;
    await this.handleStore.clear();
    await this.store.deleteMeta(META_KEY);
    this.setState("unlinked");
  }

  // Needs a click: this is where the browser offers "Allow on every visit".
  async reconnect() {
    const handle = await this.handleStore.get();
    if (!handle) return this.setState("unlinked");
    let permission = "denied";
    try {
      permission = await handle.requestPermission({ mode: "readwrite" });
    } catch {
      /* stays denied */
    }
    if (permission !== "granted")
      return this.setState("needs-permission", { name: handle.name });
    await this.sync({ reason: "reconnect" });
  }

  // Called after every committed browser save.
  notifySaved() {
    if (this.state.kind === "unlinked") return;
    this.clearTimer(this.timer);
    if (this.state.kind === "synced")
      this.setState("pending", { name: this.state.name });
    this.timer = this.setTimer(() => {
      this.sync().catch(() => {});
    }, WRITE_DELAY_MS);
  }

  flush() {
    if (this.state.kind === "unlinked") return Promise.resolve();
    this.clearTimer(this.timer);
    return this.sync();
  }

  sync(options = {}) {
    const run = this.queue.then(() =>
      this.locks.request(BRAND.lockName, () => this.#syncLocked(options)),
    );
    this.queue = run.then(
      () => {},
      () => {},
    );
    return run.catch((e) => this.setState("error", { detail: e?.name ?? "Error" }));
  }

  async #behind(sync) {
    try {
      const rev = await this.store.readRevision();
      return Math.max(0, rev - (sync?.revision ?? 0));
    } catch {
      return 0;
    }
  }

  async #record(handle, revision, fileHash, modified) {
    await this.store.setMeta(META_KEY, {
      name: handle.name,
      revision,
      hash: fileHash,
      modified,
    });
  }

  async #writeFile(handle, json) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      let writable;
      try {
        writable = await handle.createWritable();
        await writable.write(json);
        await writable.close(); // the file changes only here
        return;
      } catch (e) {
        lastError = e;
        try {
          await writable?.abort?.();
        } catch {
          /* already closed or never opened */
        }
        if (errorKind(e) !== "error") break; // permission or missing: retrying cannot help
      }
    }
    throw lastError;
  }

  async #syncLocked({ first = null } = {}) {
    const handle = await this.handleStore.get();
    if (!handle) return this.setState("unlinked");
    const name = handle.name;
    let permission = "denied";
    try {
      permission = await handle.queryPermission({ mode: "readwrite" });
    } catch {
      /* denied */
    }
    const sync = (await this.store.getMeta(META_KEY)) ?? null;
    if (permission !== "granted")
      return this.setState("needs-permission", {
        name,
        behind: await this.#behind(sync),
      });

    for (let attempt = 0; attempt < 3; attempt++) {
      // Browser side, read fresh on every attempt.
      let loaded;
      try {
        loaded = await this.store.load();
      } catch (e) {
        // Stored notes unreadable: never write a possibly-bad copy over the file.
        return this.setState("error", { name, detail: e?.name ?? "Error" });
      }
      const browserVault = loaded.status === "ok" ? loaded.vault : null;
      const browserRevision = loaded.status === "ok" ? loaded.revision : 0;
      const seedRevision = await this.store.getMeta("seedRevision");
      const browser = {
        revision: browserRevision,
        vault: browserVault,
        pristine: !browserVault || browserRevision === seedRevision,
        hash: browserVault ? await this.hash(this.serialize(browserVault)) : null,
      };

      // File side. A first Save replaces the file without reading it.
      let file = null,
        text = null,
        handleFile = null;
      if (first !== "save") {
        try {
          handleFile = await handle.getFile();
        } catch (e) {
          const kind = errorKind(e);
          return this.setState(kind, { name, behind: await this.#behind(sync) });
        }
        file = { tooLarge: handleFile.size > FILE_LIMIT, valid: false, hash: null };
        if (!file.tooLarge) {
          text = await handleFile.text();
          file.hash = await this.hash(text);
          try {
            file.vault = validateVault(JSON.parse(text));
            file.valid = true;
            file.canonicalHash = await this.hash(this.serialize(file.vault));
          } catch (e) {
            file.invalidReason = e?.message;
          }
        }
      }

      const action = reconcile({ first, file, browser, sync });
      const modified = handleFile?.lastModified ?? null;

      if (action === "noop")
        return this.setState("synced", { name });
      if (action === "too-large")
        return this.setState("too-large", { name, size: handleFile.size });
      if (action === "invalid")
        return this.setState("invalid", { name, detail: file.invalidReason });
      if (action === "conflict") {
        this.conflict = {
          fileVault: file.vault,
          fileHash: file.hash,
          browserVault,
          browserRevision,
        };
        return this.setState("conflict", { name });
      }
      if (action === "adopt") {
        await this.#record(handle, browserRevision, file.hash, modified);
        return this.setState("synced", { name });
      }

      if (action === "load-file") {
        // Keep the browser copy as a draft before it is replaced.
        if (browserVault)
          await keepDraft(this.store, `replaced-${new Date().toISOString()}-${this.id}`, {
            revision: browserRevision,
            vault: browserVault,
            reason: "replaced by file",
          });
        let revision;
        try {
          revision = await this.store.save(file.vault, browserRevision);
        } catch (e) {
          if (e?.name === "ConflictError") continue; // another tab saved first; look again
          throw e;
        }
        await this.#record(handle, revision, file.hash, modified);
        this.setState("synced", { name });
        try {
          this.onVaultReplaced(file.vault, revision);
        } catch {
          /* UI errors must not break syncing */
        }
        return;
      }

      // action === "write"
      if (!browserVault) return this.setState("synced", { name });
      if (handleFile) {
        // The file must still be exactly what was just checked.
        let again;
        try {
          again = await handle.getFile();
        } catch (e) {
          return this.setState(errorKind(e), { name });
        }
        if (again.size !== handleFile.size || again.lastModified !== handleFile.lastModified)
          continue;
      }
      const json = this.serialize(browserVault);
      try {
        await this.#writeFile(handle, json);
      } catch (e) {
        return this.setState(errorKind(e), {
          name,
          detail: e?.name,
          behind: await this.#behind(sync),
        });
      }
      let after = null;
      try {
        after = (await handle.getFile()).lastModified;
      } catch {
        /* the hash is what matters */
      }
      await this.#record(handle, browserRevision, await this.hash(json), after);
      return this.setState("synced", { name });
    }
    this.setState("error", { name, detail: "The file kept changing." });
  }

  // -- conflict and invalid-file resolution (each is a user choice) -----------------------

  // choice: "keep-browser" or "use-file". Returns { stale: true } if the file changed again.
  resolveConflict(choice) {
    return this.locks.request(BRAND.lockName, async () => {
      const info = this.conflict;
      if (!info) return { stale: true };
      const handle = await this.handleStore.get();
      const file = await handle.getFile();
      if (file.size > FILE_LIMIT || (await this.hash(await file.text())) !== info.fileHash) {
        await this.#syncLocked();
        return { stale: true };
      }
      const loaded = await this.store.load();
      const browserVault = loaded.status === "ok" ? loaded.vault : info.browserVault;
      const browserRevision = loaded.status === "ok" ? loaded.revision : 0;
      if (choice === "keep-browser") {
        await keepDraft(this.store, `file-copy-${new Date().toISOString()}-${this.id}`, {
          revision: browserRevision,
          vault: info.fileVault,
          reason: "file copy replaced",
        });
        const json = this.serialize(browserVault);
        await this.#writeFile(handle, json);
        const after = (await handle.getFile()).lastModified;
        await this.#record(handle, browserRevision, await this.hash(json), after);
        this.conflict = null;
        this.setState("synced", { name: handle.name });
        return { stale: false };
      }
      if (choice === "use-file") {
        await keepDraft(this.store, `replaced-${new Date().toISOString()}-${this.id}`, {
          revision: browserRevision,
          vault: browserVault,
          reason: "replaced by file",
        });
        const revision = await this.store.save(info.fileVault, browserRevision);
        await this.#record(handle, revision, info.fileHash, file.lastModified);
        this.conflict = null;
        this.setState("synced", { name: handle.name });
        this.onVaultReplaced(info.fileVault, revision);
        return { stale: false };
      }
      throw new TypeError("unknown choice");
    });
  }

  // The user chose to replace an unreadable file with the browser's notes.
  overwriteFile() {
    return this.locks.request(BRAND.lockName, async () => {
      const handle = await this.handleStore.get();
      const loaded = await this.store.load();
      if (loaded.status !== "ok") throw new Error("There are no notes to write.");
      const json = this.serialize(loaded.vault);
      await this.#writeFile(handle, json);
      const after = (await handle.getFile()).lastModified;
      await this.#record(handle, loaded.revision, await this.hash(json), after);
      this.setState("synced", { name: handle.name });
    });
  }

  // Both copies as text, for the "Download both" option and for unreadable files.
  async fileText(limit = 20 * 1024 * 1024) {
    const handle = await this.handleStore.get();
    const file = await handle.getFile();
    if (file.size > limit) throw new Error("The file is too large to download here.");
    return file.text();
  }
}

// IndexedDB-backed handle storage for the browser (structured-clones the handle).
export function idbHandleStore(store) {
  return {
    get: () => store.getMeta("fileHandle").then((h) => h ?? null),
    set: (h) => store.setMeta("fileHandle", h),
    clear: () => store.deleteMeta("fileHandle"),
  };
}
