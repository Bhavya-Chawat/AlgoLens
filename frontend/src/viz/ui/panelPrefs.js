// How the person arranged the panels of a program: which are open, which are folded, how big each one is.
// Pure functions over a plain object, so the rules are testable; usePanelPrefs.js wires them to React and storage.
//
// Choices belong to the code being looked at (a closed "graph" panel in one problem must not hide the graph in
// the next), so they are stored per program, newest first, and only the last few programs are kept.

const STORAGE_KEY = 'algolens-panels';
const MAX_PROGRAMS = 30;

/** Panels open by default, best first (the recogniser orders them by how likely they are what you came for). */
export const DEFAULT_OPEN = 3;
export const EMPTY = Object.freeze({});

/** A short, stable key for a program's source. */
export function codeKey(code) {
  const s = String(code || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function readAll(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeAll(all, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* private mode or a full disk: the arrangement just will not outlive this tab */
  }
}

/** A panel is open when the person said so, otherwise when it is among the first few. */
export const isOpen = (prefs, id, rank) => (typeof prefs[id]?.open === 'boolean' ? prefs[id].open : rank < DEFAULT_OPEN);
export const isFolded = (prefs, id) => prefs[id]?.folded === true;
export const sizeOf = (prefs, id) => (prefs[id]?.w || prefs[id]?.h ? { w: prefs[id].w ?? null, h: prefs[id].h ?? null } : null);

/**
 * `change` merged into one panel's entry. null / undefined values are removed, and so is `folded: false` (the
 * default). `open` is kept whichever way it is: a closed panel (`open: false`) must stay closed.
 */
export function patch(prefs, id, change) {
  const next = { ...prefs[id], ...change };
  for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
  if (next.folded === false) delete next.folded;
  return { ...prefs, [id]: next };
}

export const withSize = (prefs, id, size) => patch(prefs, id, { w: size?.w ?? null, h: size?.h ?? null });

/** All programs' prefs with `key` replaced and moved to the end (newest), the oldest dropped past the limit. */
export function store(all, key, prefs) {
  const rest = Object.entries(all).filter(([k]) => k !== key);
  const kept = rest.slice(Math.max(0, rest.length - (MAX_PROGRAMS - 1)));
  return Object.fromEntries([...kept, [key, prefs]]);
}
