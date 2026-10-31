// Pure logic for the Home view. No DOM access, so it can be tested with node --test.

export const ROVING_MIN = 9; // more than 8 folders: the cards share one Tab stop

export function hash(s) {
  let h = 2166136261 >>> 0;
  for (const c of s) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

// Artwork parameters for a folder name. Deterministic: the same name always gives the same art.
export function art(name) {
  const r = rng(hash(name.normalize("NFC").toLowerCase()));
  const h1 = Math.floor(r() * 360),
    h2 = (h1 + 30 + Math.floor(r() * 50)) % 360,
    s = 38 + Math.floor(r() * 20);
  const skyTop = hsl(h1, s, 34 + Math.floor(r() * 8)),
    skyBot = hsl(h2, s, 26 + Math.floor(r() * 6));
  const sunX = 15 + r() * 70,
    sunY = 14 + r() * 22,
    sunR = 7 + r() * 7,
    sun = hsl(h1, s + 10, 56 + Math.floor(r() * 6));
  const ridges = [0, 1, 2].map((i) => {
    const base = 46 + i * 17 + r() * 6,
      amp = 6 + r() * 9,
      ph = r() * 6.28,
      f = 1 + r() * 1.6;
    const pts = [];
    for (let x = 0; x <= 100; x += 10)
      pts.push([
        x,
        +(base + amp * Math.sin(ph + (x / 100) * f * 6.28)).toFixed(1),
      ]);
    return { pts, col: hsl((h1 + i * 14) % 360, s - 6, 22 - i * 5) };
  });
  return { skyTop, skyBot, sun, sunX, sunY, sunR, ridges };
}

const artCache = new Map();
// Card art as numbers and hex colours only (never the folder name): a style string for the art
// layer, and the ridge paths for a 100x130 viewBox that is stretched to the card.
export function cardArt(name) {
  let v = artCache.get(name);
  if (v) return v;
  const a = art(name);
  v = {
    style:
      `--sky-top:${hex(a.skyTop)};--sky-bot:${hex(a.skyBot)};--sun:${hex(a.sun)};` +
      `--sun-x:${a.sunX.toFixed(2)}%;--sun-y:${((a.sunY / 130) * 100).toFixed(2)}%;` +
      `--sun-d:${(a.sunR * 2).toFixed(2)}%`,
    ridges: a.ridges.map((rg) => ({
      d: `M0 130 L${rg.pts.map((p) => `${p[0]} ${p[1]}`).join(" L")} L100 130 Z`,
      fill: hex(rg.col),
    })),
  };
  artCache.set(name, v);
  return v;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const time = (s) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? -Infinity : t;
};
const cmpTime = (x, y) => (x === y ? 0 : x > y ? 1 : -1);
// Order newest first. Times are parsed once per note, never compared as strings.
function newerSafe(a, b) {
  const u = cmpTime(b.u, a.u);
  if (u) return u;
  const c = cmpTime(b.c, a.c);
  if (c) return c;
  return a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0;
}
const collator = new Intl.Collator("en", { sensitivity: "base" });
const byName = (a, b) => collator.compare(a, b);
// Best entry of a Map by a "better first" comparator, in one pass.
const best = (m, cmp) => {
  let top = null;
  for (const e of m) if (!top || cmp(e, top) < 0) top = e;
  return top;
};

export function homeModel(vault) {
  const info = new Map(
    vault.folders.map((f) => [f, { count: 0, tags: new Map(), newest: null }]),
  );
  const stamped = [];
  for (const n of vault.notes) {
    const w = { n, u: time(n.updatedAt), c: time(n.createdAt) };
    stamped.push(w);
    const f = info.get(n.folder);
    if (!f) continue;
    f.count++;
    if (!f.newest || newerSafe(w, f.newest) < 0) f.newest = w;
    const seen = new Set();
    for (const t of n.tags || []) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      let e = f.tags.get(k);
      if (!e) f.tags.set(k, (e = { count: 0, spell: new Map() }));
      e.count++;
      e.spell.set(t, (e.spell.get(t) || 0) + 1);
    }
  }
  const folders = vault.folders.map((name) => {
    const f = info.get(name);
    let tag = null;
    if (f.tags.size) {
      const [, top] = best(f.tags, (a, b) => b[1].count - a[1].count || byName(a[0], b[0]));
      tag = best(top.spell, (a, b) => b[1] - a[1] || byName(a[0], b[0]))[0];
    }
    return {
      name,
      count: f.count,
      tag,
      newest: f.newest ? { id: f.newest.n.id, title: f.newest.n.title } : null,
    };
  });
  const recent = stamped
    .sort(newerSafe)
    .slice(0, 5)
    .map(({ n }) => ({
      id: n.id,
      title: n.title,
      folder: n.folder,
      updatedAt: n.updatedAt,
    }));
  return {
    folders,
    recent,
    summary: `${plural(vault.folders.length, "folder")} · ${plural(vault.notes.length, "note")}`,
  };
}

// Accessible name (raw text: escape it before putting it in HTML).
export function cardLabel({ name, tag, count, newest }) {
  if (!newest || !count) return `${name}, 0 notes. Creates a new note`;
  return `${name}, ${tag ? tag + ", " : ""}${plural(count, "note")}. Opens newest note: ${newest.title}`;
}

// Arrow-key target inside the cards. Returns the new index, or -1 when the key does not move focus.
export function gridTarget(index, key, cols, len) {
  if (!len) return -1;
  let t = index;
  switch (key) {
    case "ArrowLeft":
      t = index - 1;
      break;
    case "ArrowRight":
      t = index + 1;
      break;
    case "ArrowUp":
      t = index - cols;
      break;
    case "ArrowDown":
      if (index + cols < len) t = index + cols;
      else if (Math.floor(index / cols) < Math.floor((len - 1) / cols))
        t = len - 1;
      break;
    case "Home":
      t = 0;
      break;
    case "End":
      t = len - 1;
      break;
    default:
      return -1;
  }
  return t < 0 || t >= len || t === index ? -1 : t;
}
