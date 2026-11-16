// BannerForge Dev Tools: lays out every vanilla village building as an editable template in a superflat world.
//
//   /scriptevent bannerforge:vt_check            resolve every block against this Minecraft version, report failures
//   /scriptevent bannerforge:vt_layout [biome]   lay the grid out (all biomes, or one). The first run starts where you
//                                                stand and remembers that spot; later runs reuse it (re-running fills gaps).
//   /scriptevent bannerforge:vt_layout here [biome]   forget the saved spot and start from where you stand
//   /scriptevent bannerforge:vt_stop             stop a running layout
//
// Owner-only tool, never shipped: chat text is plain English on purpose (no resource pack, no lang files).
import { BlockPermutation, Dimension, Player, system, Vector3, world } from "@minecraft/server";
import { CANDIDATES, ROWS, TEMPLATES, Template } from "./village_templates.js";
import type { RowLabel } from "./village_templates.js";

const TAG = "[BannerForge Dev Tools]";
const AREA = "bf_templates";
const ORIGIN_KEY = "bannerforge:vt_origin";
/** Chunks are loaded one stretch of a row at a time: 9 chunks wide (the ticking-area limit is 100 chunks). */
const AREA_WIDTH = 144;
const LOAD_TIMEOUT_TICKS = 600;

// ---------- block resolution ----------

type Resolved = { perm: BlockPermutation; used: number } | undefined;
const resolved: Resolved[] = [];

/** Tries each candidate in order; falls back to the first candidate's default state. */
function resolveCandidates(i: number): Resolved {
  if (i in resolved) return resolved[i];
  const list = CANDIDATES[i];
  let out: Resolved;
  for (let k = 0; k < list.length && !out; k++) {
    try {
      out = { perm: BlockPermutation.resolve(list[k].name, list[k].states), used: k };
    } catch {
      // try the next alternative
    }
  }
  if (!out) {
    for (let k = 0; k < list.length && !out; k++) {
      try {
        out = { perm: BlockPermutation.resolve(list[k].name), used: -1 - k };
      } catch {
        // unknown block name
      }
    }
  }
  resolved[i] = out;
  return out;
}

function describe(i: number): string {
  return CANDIDATES[i].map((c) => `${c.name}${JSON.stringify(c.states)}`).join(" | ");
}

function check(player?: Player): void {
  let failed = 0;
  let defaulted = 0;
  let fallback = 0;
  for (let i = 0; i < CANDIDATES.length; i++) {
    const r = resolveCandidates(i);
    if (!r) {
      failed++;
      console.warn(`${TAG} UNKNOWN block: ${describe(i)}`);
    } else if (r.used < 0) {
      defaulted++;
      console.warn(`${TAG} states refused, default used: ${describe(i)}`);
    } else if (r.used > 0) {
      fallback++;
      console.warn(`${TAG} alternative #${r.used} used: ${describe(i)}`);
    }
  }
  const msg = `${TAG} ${CANDIDATES.length} block states: ${failed} unknown, ${defaulted} defaulted, ${fallback} via alternative (details in content log).`;
  console.warn(msg);
  player?.sendMessage(msg);
}

// ---------- layout ----------

let running = false;
let stopRequested = false;

function tryGet(dim: Dimension, at: Vector3) {
  try {
    return dim.getBlock(at);
  } catch {
    return undefined;
  }
}

type Box = { x0: number; z0: number; x1: number; z1: number };
let area: Box | undefined;

const inside = (b: Box, a: Box) => b.x0 >= a.x0 && b.x1 <= a.x1 && b.z0 >= a.z0 && b.z1 <= a.z1;

/**
 * Makes sure the chunks under `box` are loaded, moving the ticking area forward along the row when needed.
 * Waits in real ticks: a runJob `yield` can resume within the same tick, so counting yields is not waiting.
 */
function* ensureLoaded(dim: Dimension, box: Box, rowDepth: number, y: number): Generator<void, boolean> {
  if (!area || !inside(box, area)) {
    area = { x0: box.x0 - 6, z0: box.z0 - 4, x1: box.x0 - 6 + AREA_WIDTH, z1: Math.max(box.z1, box.z0 + rowDepth) + 1 };
    try {
      dim.runCommand(`tickingarea remove ${AREA}`);
    } catch {
      // no area yet
    }
    try {
      dim.runCommand(`tickingarea add ${area.x0} ${y} ${area.z0} ${area.x1} ${y} ${area.z1} ${AREA}`);
    } catch (e) {
      console.warn(`${TAG} tickingarea add failed: ${String(e)}`);
    }
  }
  const corners = [
    { x: box.x0, y, z: box.z0 },
    { x: box.x1, y, z: box.z0 },
    { x: box.x0, y, z: box.z1 },
    { x: box.x1, y, z: box.z1 },
  ];
  const start = system.currentTick;
  while (system.currentTick - start < LOAD_TIMEOUT_TICKS) {
    if (corners.every((c) => tryGet(dim, c))) return true;
    yield;
  }
  return false;
}

let sign: BlockPermutation | undefined;
function signPermutation(): BlockPermutation {
  if (!sign) {
    for (const id of ["standing_sign", "oak_standing_sign"]) {
      try {
        sign = BlockPermutation.resolve(id, { ground_sign_direction: 8 });
        break;
      } catch {
        // try the next name
      }
    }
  }
  if (!sign) throw new Error("no standing sign block");
  return sign;
}

function placeSign(dim: Dimension, at: Vector3, text: string): void {
  const block = tryGet(dim, at);
  if (!block) return;
  try {
    block.setPermutation(signPermutation()); // text faces north
  } catch (e) {
    console.warn(`${TAG} sign failed: ${String(e)}`);
    return;
  }
  system.runTimeout(() => {
    try {
      tryGet(dim, at)?.getComponent("minecraft:sign")?.setText(text);
    } catch {
      // a sign without text is fine
    }
  }, 2);
}

function* placeTemplate(dim: Dimension, t: Template, rowDepth: number, ox: number, sy: number, oz: number, row?: RowLabel): Generator<void, number> {
  const x0 = ox + t.ox;
  const z0 = oz + t.oz;
  const box = { x0: Math.min(x0, row ? ox + row.ox : x0), z0: z0 - 2, x1: x0 + t.size[0] - 1, z1: z0 + t.size[2] - 1 };
  if (!(yield* ensureLoaded(dim, box, rowDepth, sy))) {
    console.warn(`${TAG} chunks did not load for ${t.key}, skipped`);
    return -1;
  }
  if (row) placeSign(dim, { x: ox + row.ox, y: sy + 1, z: oz + row.oz }, `${row.biome.toUpperCase()}\nvillage`);
  let placed = 0;
  let missed = 0;
  const b = t.blocks;
  for (let i = 0; i < b.length; i += 4) {
    const r = resolveCandidates(t.palette[b[i + 3]]);
    if (!r) continue;
    const block = tryGet(dim, { x: x0 + b[i], y: sy + t.dy + b[i + 1], z: z0 + b[i + 2] });
    if (!block) {
      missed++;
      continue;
    }
    try {
      block.setPermutation(r.perm);
      placed++;
    } catch {
      // keep going; check() reports bad states
    }
    if (i % 64 === 0) yield;
  }
  if (missed) console.warn(`${TAG} ${t.key}: ${missed} blocks in unloaded chunks`);
  placeSign(dim, { x: x0 + Math.floor(t.size[0] / 2), y: sy + 1, z: z0 - 2 }, t.label);
  return placed;
}

type Origin = { x: number; y: number; z: number; dim: string };

function savedOrigin(): Origin | undefined {
  try {
    const raw = world.getDynamicProperty(ORIGIN_KEY);
    return typeof raw === "string" ? (JSON.parse(raw) as Origin) : undefined;
  } catch {
    return undefined;
  }
}

function* layout(player: Player, biome: string | undefined, here: boolean): Generator<void, void> {
  const dim = player.dimension;
  let o = here ? undefined : savedOrigin();
  if (!o || o.dim !== dim.id) {
    o = { x: Math.floor(player.location.x) + 4, y: Math.floor(player.location.y) - 1, z: Math.floor(player.location.z) + 4, dim: dim.id };
    world.setDynamicProperty(ORIGIN_KEY, JSON.stringify({ schema: 1, ...o }));
  }
  const { x: ox, y: sy, z: oz } = o; // sy = surface: the block under your feet on the first run
  const list = TEMPLATES.filter((t) => !biome || t.biome === biome);
  player.sendMessage(`${TAG} placing ${list.length} templates from x=${ox} z=${oz}, surface y=${sy}. /scriptevent bannerforge:vt_stop to stop.`);

  const depth: Record<string, number> = {};
  for (const t of TEMPLATES) depth[t.biome] = Math.max(depth[t.biome] ?? 0, t.size[2]);

  area = undefined;
  let done = 0;
  let skipped = 0;
  let blocks = 0;
  let lastBiome = "";
  for (const t of list) {
    if (stopRequested) break;
    let row: RowLabel | undefined;
    if (t.biome !== lastBiome) {
      lastBiome = t.biome;
      row = ROWS.find((r) => r.biome === t.biome);
      player.sendMessage(`${TAG} row: ${t.biome}`);
    }
    const n = yield* placeTemplate(dim, t, depth[t.biome], ox, sy, oz, row);
    if (n < 0) skipped++;
    else {
      done++;
      blocks += n;
    }
    if ((done + skipped) % 20 === 0) player.sendMessage(`${TAG} ${done + skipped}/${list.length}`);
  }
  try {
    dim.runCommand(`tickingarea remove ${AREA}`);
  } catch {
    // already gone
  }
  area = undefined;
  const msg = `${TAG} ${stopRequested ? "stopped" : "done"}: ${done} placed, ${skipped} skipped (chunks didn't load), ${blocks} blocks.`;
  console.warn(msg);
  player.sendMessage(msg);
  running = false;
  stopRequested = false;
}

system.afterEvents.scriptEventReceive.subscribe((e) => {
  const player = e.sourceEntity instanceof Player ? e.sourceEntity : undefined;
  switch (e.id) {
    case "bannerforge:vt_check":
      check(player);
      break;
    case "bannerforge:vt_layout": {
      if (!player) {
        console.warn(`${TAG} run vt_layout as a player`);
        return;
      }
      if (running) {
        player.sendMessage(`${TAG} a layout is already running`);
        return;
      }
      const args = e.message.trim().split(/\s+/).filter(Boolean);
      const here = args[0] === "here";
      if (here) args.shift();
      const biome = args[0];
      if (biome && !ROWS.some((r) => r.biome === biome)) {
        player.sendMessage(`${TAG} unknown biome "${biome}". Use one of: ${ROWS.map((r) => r.biome).join(", ")}`);
        return;
      }
      running = true;
      check(player);
      system.runJob(layout(player, biome, here));
      break;
    }
    case "bannerforge:vt_stop":
      if (running) stopRequested = true;
      break;
  }
});
