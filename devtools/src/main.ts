// BannerForge Dev Tools: lays out every vanilla village building as an editable template in a superflat world.
//
//   /scriptevent bannerforge:vt_check            resolve every block against this Minecraft version, report failures
//   /scriptevent bannerforge:vt_layout [biome]   lay the grid out from where you stand (all biomes, or one)
//   /scriptevent bannerforge:vt_stop             stop a running layout
//
// Owner-only tool, never shipped: chat text is plain English on purpose (no resource pack, no lang files).
import { BlockPermutation, Dimension, Player, system, Vector3 } from "@minecraft/server";
import { CANDIDATES, ROWS, TEMPLATES, Template } from "./village_templates.js";

const TAG = "[BannerForge Dev Tools]";
const AREA = "bf_templates";

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

/** Keeps the chunks under one template loaded while it is placed. */
function* loadArea(dim: Dimension, x0: number, z0: number, x1: number, z1: number, y: number): Generator<void, boolean> {
  try {
    dim.runCommand(`tickingarea remove ${AREA}`);
  } catch {
    // no area yet
  }
  try {
    dim.runCommand(`tickingarea add ${x0} ${y} ${z0} ${x1} ${y} ${z1} ${AREA}`);
  } catch (e) {
    console.warn(`${TAG} tickingarea add failed: ${String(e)}`);
  }
  const corners = [
    { x: x0, y, z: z0 },
    { x: x1, y, z: z0 },
    { x: x0, y, z: z1 },
    { x: x1, y, z: z1 },
  ];
  for (let wait = 0; wait < 400; wait++) {
    if (corners.every((c) => tryGet(dim, c))) return true;
    yield;
  }
  return false;
}

function placeSign(dim: Dimension, at: Vector3, text: string): void {
  const block = tryGet(dim, at);
  if (!block) return;
  try {
    block.setPermutation(BlockPermutation.resolve("oak_standing_sign", { ground_sign_direction: 8 })); // text faces north
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

function* placeTemplate(dim: Dimension, t: Template, ox: number, sy: number, oz: number): Generator<void, number> {
  const x0 = ox + t.ox;
  const z0 = oz + t.oz;
  const ok = yield* loadArea(dim, x0, z0 - 2, x0 + t.size[0] - 1, z0 + t.size[2] - 1, sy);
  if (!ok) {
    console.warn(`${TAG} chunks did not load for ${t.key}, skipped`);
    return 0;
  }
  let placed = 0;
  const b = t.blocks;
  for (let i = 0; i < b.length; i += 4) {
    const r = resolveCandidates(t.palette[b[i + 3]]);
    if (!r) continue;
    const block = tryGet(dim, { x: x0 + b[i], y: sy + t.dy + b[i + 1], z: z0 + b[i + 2] });
    if (!block) continue;
    try {
      block.setPermutation(r.perm);
      placed++;
    } catch {
      // keep going; check() reports bad states
    }
    if (i % 64 === 0) yield;
  }
  placeSign(dim, { x: x0 + Math.floor(t.size[0] / 2), y: sy + 1, z: z0 - 2 }, t.label);
  return placed;
}

function* layout(player: Player, biome: string | undefined): Generator<void, void> {
  const dim = player.dimension;
  const ox = Math.floor(player.location.x) + 4;
  const oz = Math.floor(player.location.z) + 4;
  const sy = Math.floor(player.location.y) - 1; // surface = the block under your feet
  const list = TEMPLATES.filter((t) => !biome || t.biome === biome);
  player.sendMessage(`${TAG} placing ${list.length} templates from x=${ox} z=${oz}, surface y=${sy}. Stay in this world; /scriptevent bannerforge:vt_stop to stop.`);

  for (const row of ROWS.filter((r) => !biome || r.biome === biome)) {
    placeSign(dim, { x: ox + row.ox, y: sy + 1, z: oz + row.oz }, `${row.biome.toUpperCase()}\nvillage`);
  }

  let done = 0;
  let blocks = 0;
  let lastBiome = "";
  for (const t of list) {
    if (stopRequested) break;
    if (t.biome !== lastBiome) {
      lastBiome = t.biome;
      player.sendMessage(`${TAG} row: ${t.biome}`);
    }
    blocks += yield* placeTemplate(dim, t, ox, sy, oz);
    done++;
    if (done % 20 === 0) player.sendMessage(`${TAG} ${done}/${list.length} placed`);
  }
  try {
    dim.runCommand(`tickingarea remove ${AREA}`);
  } catch {
    // already gone
  }
  const msg = `${TAG} ${stopRequested ? "stopped" : "done"}: ${done} templates, ${blocks} blocks.`;
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
      const biome = e.message.trim() || undefined;
      if (biome && !ROWS.some((r) => r.biome === biome)) {
        player.sendMessage(`${TAG} unknown biome "${biome}". Use one of: ${ROWS.map((r) => r.biome).join(", ")}`);
        return;
      }
      running = true;
      check(player);
      system.runJob(layout(player, biome));
      break;
    }
    case "bannerforge:vt_stop":
      if (running) stopRequested = true;
      break;
  }
});
