import { validateVault } from "./model.js";
import { BRAND } from "./brand.js";

// Browser storage for the vault: one IndexedDB database with three object stores.
//   vault  - a single record "current" = { revision, vault, savedAt }
//   drafts - copies of unsaved or replaced work, keyed by an id
//   meta   - small values (backup times, file-sync state, the linked file handle)

export class ConflictError extends Error {
  constructor() {
    super(
      "This vault changed in another tab. Export your draft, then load the latest copy.",
    );
    this.name = "ConflictError";
  }
}
export class QuotaError extends Error {
  constructor() {
    super("Storage is full. Export a backup.");
    this.name = "QuotaError";
  }
}
export class StorageUnavailableError extends Error {
  constructor(detail) {
    super("Notes can't be saved in this browser." + (detail ? " " + detail : ""));
    this.name = "StorageUnavailableError";
  }
}
// The stored record exists but is not a valid vault. The app fails closed: it never
// overwrites the record and never seeds sample notes over it.
export class CorruptVaultError extends Error {
  constructor(raw, reason) {
    super("Your stored notes could not be read.");
    this.name = "CorruptVaultError";
    this.raw = raw;
    this.reason = reason;
  }
}

const classify = (e) => {
  if (e instanceof ConflictError) return e;
  if (e?.name === "QuotaExceededError") return new QuotaError();
  return new StorageUnavailableError();
};

export function createStore({
  indexedDB = globalThis.indexedDB,
  BroadcastChannel: BC = globalThis.BroadcastChannel,
  dbName = BRAND.dbName,
  channelName = BRAND.channel,
  now = () => new Date().toISOString(),
} = {}) {
  let dbPromise = null;
  let channel = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new StorageUnavailableError());
      let request;
      try {
        request = indexedDB.open(dbName, 1);
      } catch {
        return reject(new StorageUnavailableError());
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["vault", "drafts", "meta"])
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(new StorageUnavailableError());
      request.onblocked = () => reject(new StorageUnavailableError());
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
    return dbPromise;
  }

  const wrap = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(classify(request.error));
    });

  // Runs a simple single-store operation to completion of its transaction.
  async function run(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(storeName, mode);
      } catch (e) {
        return reject(classify(e));
      }
      let result;
      Promise.resolve(fn(tx.objectStore(storeName))).then(
        (r) => {
          result = r;
        },
        () => {},
      );
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(classify(tx.error));
    });
  }

  const post = (message) => {
    try {
      if (!BC) return;
      channel ??= new BC(channelName);
      channel.postMessage(message);
    } catch {
      /* other tabs will catch up when they next look */
    }
  };

  return {
    // -- vault -----------------------------------------------------------------------
    async load() {
      const record = await run("vault", "readonly", (os) =>
        wrap(os.get("current")),
      );
      if (record === undefined) return { status: "empty" };
      try {
        if (
          !record ||
          typeof record !== "object" ||
          !Number.isSafeInteger(record.revision) ||
          record.revision < 1
        )
          throw new Error("The stored record has no valid revision.");
        const vault = validateVault(record.vault);
        return {
          status: "ok",
          vault,
          revision: record.revision,
          savedAt: record.savedAt,
        };
      } catch (e) {
        throw new CorruptVaultError(record, e.message);
      }
    },

    async readRevision() {
      const record = await run("vault", "readonly", (os) =>
        wrap(os.get("current")),
      );
      return Number.isSafeInteger(record?.revision) ? record.revision : 0;
    },

    // Compare-and-set save. Resolves with the new revision only after the transaction has
    // committed. A stale `expected` revision aborts the transaction and rejects with
    // ConflictError, leaving the stored record untouched.
    async save(vault, expected) {
      const clean = validateVault(vault);
      if (!Number.isSafeInteger(expected) || expected < 0)
        throw new TypeError("expected revision must be a non-negative integer");
      const db = await open();
      const revision = await new Promise((resolve, reject) => {
        // BEGIN-CAS: everything between these markers runs inside one IndexedDB
        // transaction. A transaction auto-commits as soon as control returns to the event
        // loop with no request pending, so nothing here may wait on anything that is not
        // an IndexedDB request. Keep this region free of promise waiting.
        let tx;
        try {
          tx = db.transaction("vault", "readwrite", { durability: "strict" });
        } catch (e) {
          reject(classify(e));
          return;
        }
        const os = tx.objectStore("vault");
        let next = 0;
        let conflicted = false;
        const get = os.get("current");
        get.onsuccess = () => {
          const have = get.result ? get.result.revision : 0;
          if (have !== expected) {
            conflicted = true;
            tx.abort();
            return;
          }
          next = have + 1;
          os.put({ revision: next, vault: clean, savedAt: now() }, "current");
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = () => reject(conflicted ? new ConflictError() : classify(tx.error));
        // END-CAS
      });
      post({ type: "saved", revision });
      try {
        await run("meta", "readwrite", (os) => {
          os.put(now(), "lastChangeAt");
        });
      } catch {
        /* the reminder timestamp is advisory */
      }
      return revision;
    },

    onSaved(callback) {
      try {
        if (!BC) return () => {};
        channel ??= new BC(channelName);
        const handler = (e) => {
          if (e.data?.type === "saved") callback(e.data.revision);
        };
        channel.addEventListener("message", handler);
        return () => channel?.removeEventListener("message", handler);
      } catch {
        return () => {};
      }
    },

    // -- meta ------------------------------------------------------------------------
    getMeta: (key) => run("meta", "readonly", (os) => wrap(os.get(key))),
    setMeta: (key, value) =>
      run("meta", "readwrite", (os) => {
        os.put(value, key);
      }),
    deleteMeta: (key) =>
      run("meta", "readwrite", (os) => {
        os.delete(key);
      }),

    // -- drafts ----------------------------------------------------------------------
    putDraft: (id, draft) =>
      run("drafts", "readwrite", (os) => {
        os.put(draft, id);
      }),
    async listDrafts() {
      return run("drafts", "readonly", async (os) => {
        const [keys, values] = await Promise.all([
          wrap(os.getAllKeys()),
          wrap(os.getAll()),
        ]);
        return keys.map((id, i) => ({ id, draft: values[i] }));
      });
    },
    deleteDraft: (id) =>
      run("drafts", "readwrite", (os) => {
        os.delete(id);
      }),
    clearDrafts: () =>
      run("drafts", "readwrite", (os) => {
        os.clear();
      }),

    close() {
      channel?.close();
      channel = null;
      dbPromise?.then((db) => db.close()).catch(() => {});
      dbPromise = null;
    },
  };
}

const DAY = 86400000;
// Show the backup reminder when the vault changed since the last backup and the last
// backup (or the first save) is more than seven days old. A healthy linked file counts.
export function needsBackupReminder({
  now,
  lastBackupAt,
  createdAt,
  lastChangeAt,
  fileHealthy,
}) {
  if (fileHealthy) return false;
  const changed = Date.parse(lastChangeAt);
  if (!Number.isFinite(changed)) return false;
  const backup = Date.parse(lastBackupAt);
  if (Number.isFinite(backup) && changed <= backup) return false;
  const base = Number.isFinite(backup) ? backup : Date.parse(createdAt);
  if (!Number.isFinite(base)) return false;
  return now - base > 7 * DAY;
}

// -- what the interface may claim, as pure functions so they can be tested -------------------

// The label in the files footer.
export function storageFooter({ loading, loaded, storageDown }) {
  if (storageDown) return "Not saved";
  if (loading) return "Opening your notes…";
  if (!loaded) return "Notes unavailable";
  return "Stored on this device";
}

// Saving to a file, and any sync with it, only make sense once notes were read from, and can
// be written to, browser storage.
export const fileUiAllowed = ({ loaded, storageDown }) =>
  !!loaded && !storageDown;
