import { BRAND } from "./brand.js";

// The list of vaults, as pure functions so it can be tested with node --test.
// Each vault is its own IndexedDB database. The list itself lives in a separate registry
// database as one meta value: [{ id, name }].

// The first vault keeps the original storage names, so notes saved before vaults existed open
// unchanged as this vault.
export const DEFAULT_VAULT = Object.freeze({ id: "personal", name: "Personal space" });
export const MAX_VAULTS = 20;
export const VAULT_NAME_MAX = 60;
const ID = /^[a-z0-9-]{1,40}$/;

export function vaultStorage(id) {
  if (id === DEFAULT_VAULT.id)
    return { dbName: BRAND.dbName, channel: BRAND.channel, lockName: BRAND.lockName };
  return {
    dbName: BRAND.dbName + "-vault-" + id,
    channel: BRAND.channel + "-vault-" + id,
    lockName: BRAND.lockName + "-" + id,
  };
}

// A clean list from whatever was stored: the default vault first, then valid entries in order,
// duplicates and malformed entries dropped. A stored entry for the default vault only renames it.
export function readVaults(raw) {
  const list = [{ ...DEFAULT_VAULT }];
  if (!Array.isArray(raw)) return list;
  for (const v of raw) {
    if (
      !v ||
      typeof v.id !== "string" ||
      !ID.test(v.id) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > VAULT_NAME_MAX
    )
      continue;
    const seen = list.find((x) => x.id === v.id);
    if (seen) {
      if (v.id === DEFAULT_VAULT.id) seen.name = v.name;
      continue;
    }
    if (list.length < MAX_VAULTS) list.push({ id: v.id, name: v.name });
  }
  return list;
}

export function checkVaultName(name, list, except = null) {
  const clean = String(name ?? "").trim();
  if (!clean || clean.length > VAULT_NAME_MAX || /[\r\n]/.test(clean))
    throw new Error(`Use a vault name of 1–${VAULT_NAME_MAX} characters.`);
  if (list.some((v) => v.id !== except && v.name.toLowerCase() === clean.toLowerCase()))
    throw new Error("Another vault already has that name.");
  return clean;
}

// These two run inside the registry's read-modify-write transaction, so they never throw: a
// change that no longer fits leaves the list as it is, and the caller checks the result.
export function withVault(raw, vault) {
  const list = readVaults(raw);
  return list.some((v) => v.id === vault.id) || list.length >= MAX_VAULTS ? list : [...list, vault];
}
export const withName = (raw, id, name) =>
  readVaults(raw).map((v) => (v.id === id ? { ...v, name } : v));

export const pickVault = (list, wanted) =>
  list.some((v) => v.id === wanted) ? wanted : DEFAULT_VAULT.id;

export const newVaultId = (uuid = crypto.randomUUID()) => uuid.toLowerCase();
