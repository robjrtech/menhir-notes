import { validateVault } from "./model.js";

// Drafts are copies of work that might otherwise be lost. A draft is written only when a save
// fails, or when a vault file replaces the browser copy. Shape:
//   { revision, vault, savedAt, reason }

// A canonical string for comparing vaults: validation rebuilds every object in a fixed key
// order, so two vaults with the same content compare equal whatever their key order was.
export function normalize(vault) {
  return JSON.stringify(validateVault(vault));
}

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// Sorts stored draft entries ([{id, draft}]) into what to do about each one.
//   prune   - ids of valid drafts that equal the current vault (nothing would be lost)
//   offer   - valid drafts that differ, newest first, each with a diff against the vault
//   invalid - drafts that fail validation or exceed the limits. They are offered for download
//             and never deleted automatically.
//   skipped - ids of entries that are not drafts at all (malformed), left alone
export function scanDrafts(entries, currentVault) {
  const current = normalize(currentVault);
  const result = { prune: [], offer: [], invalid: [], skipped: [] };
  for (const entry of entries ?? []) {
    const draft = entry?.draft;
    if (!entry || !isPlainObject(draft) || !isPlainObject(draft.vault)) {
      result.skipped.push(entry?.id ?? null);
      continue;
    }
    const meta = {
      id: entry.id,
      savedAt: typeof draft.savedAt === "string" ? draft.savedAt : "",
      reason: typeof draft.reason === "string" ? draft.reason : "",
      vault: draft.vault,
    };
    let clean;
    try {
      clean = validateVault(draft.vault);
    } catch (e) {
      result.invalid.push({ ...meta, invalidReason: e.message });
      continue;
    }
    if (JSON.stringify(clean) === current) result.prune.push(entry.id);
    else
      result.offer.push({
        ...meta,
        vault: clean,
        diff: diffVaults(currentVault, clean),
      });
  }
  const newest = (a, b) => b.savedAt.localeCompare(a.savedAt);
  result.offer.sort(newest);
  result.invalid.sort(newest);
  return result;
}

// What changes if you go from vault `a` to vault `b`. Notes are matched by id.
export function diffVaults(a, b) {
  const byId = (v) => new Map((v?.notes ?? []).map((n) => [n.id, n]));
  const from = byId(a),
    to = byId(b);
  const added = [],
    removed = [],
    changed = [];
  for (const [id, n] of to) {
    const old = from.get(id);
    if (!old) added.push(n.title);
    else if (JSON.stringify(canonicalNote(old)) !== JSON.stringify(canonicalNote(n)))
      changed.push(n.title);
  }
  for (const [id, n] of from) if (!to.has(id)) removed.push(n.title);
  const folders = (v) => new Set(v?.folders ?? []);
  const fa = folders(a),
    fb = folders(b);
  return {
    added,
    removed,
    changed,
    foldersAdded: [...fb].filter((f) => !fa.has(f)),
    foldersRemoved: [...fa].filter((f) => !fb.has(f)),
    canvasChanged: canvasKey(a) !== canvasKey(b),
    same:
      !added.length &&
      !removed.length &&
      !changed.length &&
      JSON.stringify(a?.folders ?? []) === JSON.stringify(b?.folders ?? []) &&
      canvasKey(a) === canvasKey(b),
  };
}
const canvasKey = (v) =>
  JSON.stringify((v?.canvas ?? []).map((c) => [c.id, c.x, c.y]));
const canonicalNote = (n) => [
  n.title,
  n.folder,
  n.body,
  [...(n.tags ?? [])].sort(),
  !!n.starred,
];

export function summarizeDiff(d) {
  const parts = [];
  if (d.added.length) parts.push(`${d.added.length} added`);
  if (d.removed.length) parts.push(`${d.removed.length} removed`);
  if (d.changed.length) parts.push(`${d.changed.length} changed`);
  if (d.foldersAdded.length || d.foldersRemoved.length) parts.push("folders differ");
  if (d.canvasChanged) parts.push("canvas differs");
  return parts.join(", ") || "no differences";
}

// -- storage helpers (take a store-like object) -----------------------------------------

export async function pendingDrafts(store, vault) {
  const scan = scanDrafts(await store.listDrafts(), vault);
  for (const id of scan.prune) await store.deleteDraft(id).catch(() => {});
  return scan;
}
export const keepDraft = (store, id, { revision, vault, reason }) =>
  store.putDraft(id, {
    revision,
    vault,
    reason,
    savedAt: new Date().toISOString(),
  });
// A draft made for a failed save is removed once a save has succeeded.
export const dropDraft = (store, id) => store.deleteDraft(id).catch(() => {});
