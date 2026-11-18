// Pure NPC helpers (no @minecraft imports, unit-tested).
// Owner rule (2026-11-15): every mod NPC is named "<Profession>, <Name>", e.g. "Steward, Edric".

/** One in-game day. A dead steward returns this long after dying. */
export const RESPAWN_TICKS = 24000;

/** Personal names (owner 2026-11-18: a bigger list, fewer repeats). Proper nouns are not translated, so they live here rather than in the lang file. */
export const NPC_NAMES = [
  "Edric", "Maren", "Oswin", "Hilde", "Bram", "Tamsin", "Alric", "Wenna", "Corwin", "Isolde",
  "Garrick", "Elowen", "Rowan", "Sabine", "Tobin", "Ysolde", "Halvard", "Mirela", "Dunstan", "Linnea",
  "Aldous", "Brienne", "Cedric", "Ottilie", "Fenwick", "Greta", "Leoric", "Nell", "Perrin", "Vesna",
  "Adela", "Agnes", "Alaric", "Alwin", "Amice", "Anselm", "Ansel", "Arn", "Astrid", "Aveline",
  "Baldric", "Barnaby", "Beatrix", "Benedict", "Berit", "Bertram", "Blythe", "Brand", "Brida", "Caspar",
  "Celia", "Clement", "Colwen", "Cora", "Cuthbert", "Dagny", "Daveth", "Delwyn", "Denholm", "Dorrit",
  "Eadric", "Ebba", "Edda", "Edmund", "Eira", "Elfric", "Elsbeth", "Emeric", "Erwin", "Esme",
  "Ewart", "Fenna", "Finnian", "Florin", "Freya", "Fulk", "Gareth", "Gerda", "Gilbert", "Godric",
  "Gunhild", "Gwyn", "Hadley", "Hal", "Hamond", "Hedda", "Helmer", "Herrick", "Hester", "Hugo",
  "Idony", "Ilse", "Ingram", "Ivo", "Jago", "Jessamy", "Jory", "Kenrick", "Kerra", "Lambert",
  "Lark", "Leofric", "Lettice", "Lowen", "Lucan", "Mabel", "Madoc", "Malin", "Mathilde", "Merrick",
  "Milo", "Morwen", "Neville", "Nesta", "Norbert", "Odo", "Olwen", "Orrin", "Osric", "Petra",
  "Piers", "Quenby", "Ragna", "Randal", "Reyna", "Ricard", "Roswitha", "Rufus", "Saxon", "Selby",
  "Sigrid", "Simeon", "Solveig", "Sten", "Swithin", "Talwyn", "Tancred", "Thora", "Tilda", "Torvin",
  "Ulric", "Una", "Ursel", "Valda", "Wace", "Walden", "Wilmot", "Wynn", "Yarrow", "Ynes",
  "Yorick", "Zelda", "Arden", "Bryn", "Cerys", "Dorian", "Elric", "Fern", "Gideon", "Hollis",
  "Imre", "Jasper", "Kestrel", "Lowell", "Mira", "Nils", "Oriel", "Pell", "Quill", "Riven",
  "Seren", "Tamsen", "Uther", "Vale", "Wren", "Alden", "Bree", "Cass", "Dain", "Elva",
  "Faye", "Gwen", "Hale", "Iona", "Joss", "Kit", "Linden", "Mabry", "Nyle", "Ondine",
  "Pim", "Reed", "Shay", "Teague", "Wyla",
];

/**
 * Workers' titles by building (owner 2026-11-18: a worker's name tag is "<Title>, <Name>"). Name tags are plain
 * strings and can't be translated: same documented exception as the steward's title.
 */
export const WORKER_TITLES: Record<string, string> = {
  market: "Merchant",
  tavern: "Innkeeper",
  stables: "Stablehand",
  warehouse: "Storekeeper",
  blacksmith: "Smith",
  fletcher: "Fletcher",
  alchemist: "Alchemist",
  stonemason: "Mason",
  woodcarver: "Woodcarver",
  farmstead: "Farmer",
  docks: "Fisher",
  shrine: "Priest",
};
/** A townsperson's name tag: with their title while they work at one of our buildings. */
export const townsTag = (name: string, building?: string) => (building && WORKER_TITLES[building] ? `${WORKER_TITLES[building]}, ${name}` : name);

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
  // Clamped: a clock change (e.g. /time set back) never makes the wait longer than one day.
  return Math.min(RESPAWN_TICKS, Math.max(0, diedAt + RESPAWN_TICKS - now));
}

/** Whole real-time minutes (20 ticks per second), rounded up, at least 1. */
export const ticksToMinutes = (ticks: number) => Math.max(1, Math.ceil(ticks / 1200));
