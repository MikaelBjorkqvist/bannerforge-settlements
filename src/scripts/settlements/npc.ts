// Pure NPC helpers (no @minecraft imports, unit-tested).
// Owner rule (2026-11-15): every mod NPC is named "<Profession>, <Name>", e.g. "Steward, Edric".

/** One in-game day. A dead steward returns this long after dying. */
export const RESPAWN_TICKS = 24000;

/** Personal names. Proper nouns are not translated, so they live here rather than in the lang file. */
export const NPC_NAMES = [
  "Edric", "Maren", "Oswin", "Hilde", "Bram", "Tamsin", "Alric", "Wenna", "Corwin", "Isolde",
  "Garrick", "Elowen", "Rowan", "Sabine", "Tobin", "Ysolde", "Halvard", "Mirela", "Dunstan", "Linnea",
  "Aldous", "Brienne", "Cedric", "Ottilie", "Fenwick", "Greta", "Leoric", "Nell", "Perrin", "Vesna",
];

/** Stable pick from a seed string (so a migrated settlement gets the same name every load). */
export function pickIndex(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) % count;
}

export const pickName = (seed: string) => NPC_NAMES[pickIndex(seed, NPC_NAMES.length)];

/** Ticks until a steward who died at `diedAt` may return (0 = may return now). */
export function respawnTicksLeft(diedAt: number | undefined, now: number): number {
  if (diedAt === undefined) return 0;
  return Math.max(0, diedAt + RESPAWN_TICKS - now);
}

/** Whole real-time minutes (20 ticks per second), rounded up, at least 1. */
export const ticksToMinutes = (ticks: number) => Math.max(1, Math.ceil(ticks / 1200));
