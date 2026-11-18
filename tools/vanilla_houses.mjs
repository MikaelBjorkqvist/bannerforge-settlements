// Fingerprints of the vanilla village houses that have beds (research spike 2026-11-18, docs/decisions draft).
// Reads Mojang's Java structure templates from the owner's Bedrock install (never committed) and writes a small
// table of facts per house: size, beds and a set of anchor blocks relative to the first bed head. The game uses
// the table to recognise vanilla houses in a converted village (adopt them as house sites).
//
//   node tools/vanilla_houses.mjs "<...>\behavior_packs\vanilla\structures\village" [--out file] [--selftest]
import fs from "node:fs";
import path from "node:path";
import { readNbt } from "./structures/nbt.mjs";
import { convertTemplate } from "./structures/java_to_bedrock.mjs";

const ANCHORS = 32;
/** Never anchors: randomised by village processors (mossy cobble), terrain, crops, plants, or the beds themselves. */
const SKIP = /^(air|cobblestone|mossy_cobblestone|dirt|grass_block|grass_path|dirt_path|farmland|wheat|carrots|potatoes|beetroot|.*_flower.*|poppy|dandelion|tallgrass|short_grass|tall_grass|fern|bed|torch|lantern|flower_pot|hay_block|water|sand|snow_layer)$/;

export function fingerprints(root) {
  const raw = [];
  for (const biome of fs.readdirSync(root).sort()) {
    const dir = path.join(root, biome, "houses");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const nbt = readNbt(fs.readFileSync(path.join(dir, f)));
      const r = cellsOf(path.basename(f, ".nbt"), convertTemplate(nbt));
      if (r) {
        r.entrance = entranceOf(nbt, r.heads[0]);
        raw.push(r);
      }
    }
  }
  return raw.map((r) => pick(r, raw));
}

const OUT = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

/**
 * The front door (lower half) relative to the first bed head, and the outward direction [x, z]: from the jigsaw
 * that joins the house to its street (it sits outside the entrance and faces away from the house).
 */
function entranceOf(nbt, head) {
  const pal = nbt.palette ?? nbt.palettes?.[0] ?? [];
  const facing = (b) => OUT[((pal[b.state].Properties ?? {}).orientation ?? (pal[b.state].Properties ?? {}).facing ?? "").split("_")[0]];
  // The entrance jigsaw faces the street (pool "streets" in plains, "empty" elsewhere); villager jigsaws face up.
  const jigs = nbt.blocks.filter((b) => pal[b.state]?.Name === "minecraft:jigsaw" && facing(b));
  const doors = nbt.blocks.filter((b) => /_door$/.test(pal[b.state]?.Name ?? "") && pal[b.state].Properties?.half === "lower");
  if (!jigs.length || !doors.length) return undefined;
  const dist = (a, b) => Math.abs(a.pos[0] - b.pos[0]) + Math.abs(a.pos[1] - b.pos[1]) + Math.abs(a.pos[2] - b.pos[2]);
  let best;
  for (const j of jigs) for (const d of doors) if (!best || dist(j, d) < dist(best.j, best.d)) best = { j, d };
  if (dist(best.j, best.d) > 4) return undefined; // no door at the street entrance
  const door = best.d;
  const out = facing(best.j);
  return { door: [door.pos[0] - head.x, door.pos[1] - head.y, door.pos[2] - head.z], out };
}

/** A house's blocks relative to its first bed head (lowest, then x, then z), or null without beds. */
function cellsOf(id, t) {
  const cells = [];
  for (let i = 0; i < t.blocks.length; i += 4) {
    const [x, y, z, p] = t.blocks.slice(i, i + 4);
    const c = t.palette[p][0];
    cells.push({ x, y, z, name: c.name, head: c.name === "bed" && c.states?.head_piece_bit === true, alt: [...new Set(t.palette[p].map((k) => k.name))].join("|"), ground: y + t.dy <= 0 });
  }
  const heads = cells.filter((c) => c.head).sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  if (!heads.length) return null;
  const a = heads[0];
  for (const c of cells) [c.dx, c.dy, c.dz] = [c.x - a.x, c.y - a.y, c.z - a.z];
  const at = new Map(cells.map((c) => [`${c.dx},${c.dy},${c.dz}`, c.name]));
  return { id, size: t.size, cells, heads, at };
}

/**
 * Anchors that tell this house apart: blocks that the other houses (aligned on their first bed head, any turn)
 * don't have at the same spot, spread out (no two closer than 2 blocks).
 */
function pick(r, all) {
  const others = all.filter((o) => o !== r);
  const shared = (c) => {
    let n = 0;
    for (const o of others) for (let rot = 0; rot < 4; rot++) {
      const [x, z] = turn(c.dx, c.dz, rot);
      if (o.at.get(`${x},${c.dy},${z}`) === c.name) n++;
    }
    return n;
  };
  const pool = r.cells.filter((c) => !SKIP.test(c.name)).map((c) => ({ c, n: shared(c) }));
  pool.sort((p, q) => p.n - q.n || p.c.dy - q.c.dy || p.c.dx - q.c.dx || p.c.dz - q.c.dz);
  const picked = [];
  for (const { c } of pool) {
    if (picked.length >= ANCHORS) break;
    if (picked.some((p) => Math.abs(p.dx - c.dx) + Math.abs(p.dy - c.dy) + Math.abs(p.dz - c.dz) < 2)) continue;
    picked.push(c);
  }
  return {
    id: r.id,
    size: r.size,
    beds: r.heads.length,
    heads: r.heads.map((c) => [c.dx, c.dy, c.dz]),
    anchors: picked.map((c) => [c.dx, c.dy, c.dz, c.alt]),
    entrance: r.entrance,
  };
}

/** Offset (dx, dz) turned by rot quarter turns (same convention at build time and in game). */
export const turn = (dx, dz, rot) => [[dx, dz], [-dz, dx], [-dx, -dz], [dz, -dx]][rot];

/** Share of anchors that match, for a house with its first bed head at `at`, turned by rot. */
export function score(fp, at, rot, typeAt) {
  for (const [dx, dy, dz] of fp.heads) {
    const [rx, rz] = turn(dx, dz, rot);
    if (typeAt(at[0] + rx, at[1] + dy, at[2] + rz) !== "bed") return 0; // every bed of the design must be there
  }
  let ok = 0;
  for (const [dx, dy, dz, names] of fp.anchors) {
    const [rx, rz] = turn(dx, dz, rot);
    const got = typeAt(at[0] + rx, at[1] + dy, at[2] + rz);
    if (got && names.split("|").includes(got)) ok++;
  }
  return ok / fp.anchors.length;
}

// ---- self-test: place every house in a fake world, turned and with damage; it must be recognised as itself ----
function selftest(fps, root) {
  let fail = 0;
  let worst = 1;
  const tmpl = new Map();
  for (const biome of fs.readdirSync(root)) {
    const dir = path.join(root, biome, "houses");
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) tmpl.set(path.basename(f, ".nbt"), convertTemplate(readNbt(fs.readFileSync(path.join(dir, f)))));
  }
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const fp of fps) {
    for (let rot = 0; rot < 4; rot++) {
      const t = tmpl.get(fp.id);
      const world = new Map();
      let head;
      for (let i = 0; i < t.blocks.length; i += 4) {
        const [x, y, z, p] = t.blocks.slice(i, i + 4);
        const c = t.palette[p][0];
        const [wx, wz] = turn(x, z, rot);
        if (c.name !== "bed" && rnd() < 0.15) continue; // 15% damage
        world.set(`${wx},${y},${wz}`, c.name);
      }
      const hd = fp.heads[0];
      // first head in template coordinates: find it again
      const cells = [];
      for (let i = 0; i < t.blocks.length; i += 4) cells.push(t.blocks.slice(i, i + 4));
      const heads = cells.filter(([, , , p]) => t.palette[p][0].name === "bed" && t.palette[p][0].states?.head_piece_bit === true).sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
      const [hx, hy, hz] = heads[0];
      const [ax, az] = turn(hx, hz, rot);
      head = [ax, hy, az];
      const typeAt = (x, y, z) => world.get(`${x},${y},${z}`);
      let best = { s: 0 };
      const ranked = [];
      for (const g of fps) for (let r = 0; r < 4; r++) {
        const s = score(g, head, r, typeAt);
        ranked.push({ id: g.id, r, s });
        if (s > best.s) best = { id: g.id, r, s };
      }
      const other = ranked.filter((x) => x.id !== fp.id).sort((a, b) => b.s - a.s)[0];
      const okId = best.id === fp.id && best.r === rot;
      const margin = best.s - other.s;
      worst = Math.min(worst, okId ? margin : -1);
      if (!okId || margin < 0.05) {
        fail++;
        console.log(`  ${fp.id} rot ${rot}: best ${best.id} r${best.r} ${best.s.toFixed(2)}; runner-up ${other.id} ${other.s.toFixed(2)}`);
      }
      void hd;
    }
  }
  console.log(`self-test: ${fps.length} houses x 4 turns, ${fail} problem(s), smallest margin ${worst.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const root = process.argv[2];
  const fps = fingerprints(root);
  console.log(`${fps.length} houses with beds:`, fps.map((f) => `${f.id}(${f.beds})`).join(" "));
  if (process.argv.includes("--selftest")) selftest(fps, root);
  const o = process.argv.indexOf("--out");
  if (o > 0) fs.writeFileSync(process.argv[o + 1], JSON.stringify(fps));
  if (process.argv.includes("--ts")) {
    const file = "src/scripts/settlements/generated/vanilla_houses.ts";
    const body = fps.map((f) => "  " + JSON.stringify({ id: f.id, beds: f.beds, heads: f.heads, anchors: f.anchors, entrance: f.entrance })).join(",\n");
    fs.writeFileSync(
      file,
      `// GENERATED by tools/vanilla_houses.mjs from the game's village templates. Do not edit.
// Facts for recognising vanilla houses (beds, sample blocks relative to the first bed head); no structure data.
export interface VanillaHouse {
  id: string;
  beds: number;
  /** Bed heads relative to the first one: [dx, dy, dz]. */
  heads: number[][];
  /** [dx, dy, dz, "type|alternative"] relative to the first bed head, before turning. */
  anchors: (number | string)[][];
  /** Front door (lower half) relative to the first bed head, and the way out of it [x, z], before turning. */
  entrance?: { door: number[]; out: number[] };
}

export const VANILLA_HOUSES: VanillaHouse[] = [
${body},
];
`,
    );
    console.log("wrote", file);
  }
}
