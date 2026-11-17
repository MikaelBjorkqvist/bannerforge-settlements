// Imports owner-built structures (structure block exports, .mcstructure) into the mod.
//
//   node tools/import_structures.mjs        (npm run structures:import)
//
// Input:  assets-src/structures/imported/imports.json + the .mcstructure files next to it.
// Output: packs/BP/structures/bannerforge_settlements/<design>_<faction>.mcstructure
//         src/scripts/settlements/generated/imported.ts (blueprints for the construction phases + structure ids)
//
// For each design and faction:
// - the plot is exactly as big as the structure (owner, 2026-11-16: lot sizes dropped);
// - faction colours (owner, 2026-11-16): white wall banners become the faction banner block (top + bottom part),
//   white beds, wool and carpet take the faction colour, white cushions too;
// - a sign whose text contains "[HOUSE NAME]" gets the building's name in game;
// - the blueprint (used while it is being built) is turned so the entrance faces south, like every blueprint.
// The finished building is placed from the .mcstructure, which keeps what scripts can't set: bed colours,
// cushions, chest and bookshelf contents, flower pot plants.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "./lib.mjs";
import { readTyped, writeTyped, plain, T } from "./structures/nbt_typed.mjs";
import { rotateBedrockStates, rotatePos } from "./structures/bedrock_rotate.mjs";

const SRC = path.join(ROOT, "assets-src", "structures", "imported");
const OUT_DIR = path.join(ROOT, "packs", "BP", "structures", "bannerforge_settlements");
const OUT_TS = path.join(ROOT, "src", "scripts", "settlements", "generated", "imported.ts");
const NS = "bannerforge_settlements";
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+-/:;<=>?@[]^_{|}~";

/** Clockwise quarter turns that bring an entrance on this side to the south. */
export const FRONT_TURNS = { south: 0, east: 1, north: 2, west: 3 };

/** Faction colours. bed: block entity "color" (white 0); legacy: "Variant"/banner "Base" order (white 15). */
export const FACTIONS = {
  blue: { name: "blue", bed: 11, legacy: 4 },
  green: { name: "green", bed: 13, legacy: 2 },
  red: { name: "red", bed: 14, legacy: 1 },
};
const WALL_BANNER_FACING = { 2: "north", 3: "south", 4: "west", 5: "east" };
const NAME_MARK = /\[(HOUSE )?NAME\]/i;

// ---------- reading ----------

/** Opens an .mcstructure: { file (typed root), inner (typed structure compound), compressed }. */
export function openMcstructure(buf) {
  const file = readTyped(buf, true);
  const r = file.root.v;
  let inner;
  let compressed = false;
  if (r.structure.t === T.BYTES) {
    if (r.compression?.v !== 1) throw new Error(`unknown compression ${r.compression?.v}`);
    inner = readTyped(zlib.inflateSync(Buffer.from(r.structure.v.map((b) => b & 0xff))), true);
    compressed = true;
  } else {
    inner = { name: "", root: r.structure };
  }
  return { file, inner, compressed };
}

function saveMcstructure({ file, inner, compressed }) {
  const r = file.root.v;
  if (compressed) {
    const bytes = zlib.deflateSync(writeTyped(inner, true));
    r.structure = { t: T.BYTES, v: Array.from(bytes, (b) => (b << 24) >> 24) };
  } else {
    r.structure = inner.root;
  }
  return writeTyped(file, true);
}

const clone = (o) => structuredClone(o);

/** Blanks the author's Xbox user id that signs store (TextOwner): the repo and the add-on are public. */
export function stripOwnerIds(node) {
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  if (node.t === 10) {
    for (const [k, child] of Object.entries(node.v)) {
      if (k === "TextOwner" && child.t === T.STRING && child.v) {
        child.v = "";
        n++;
      } else n += stripOwnerIds(child);
    }
  } else if (node.t === 9) {
    for (const e of node.v.v) n += stripOwnerIds({ t: node.v.et, v: e });
  }
  return n;
}

// ---------- transforming ----------

/**
 * Applies faction colours and returns the new .mcstructure bytes plus a plain view used for the blueprint.
 * `W` x `L` (x by z) pads the structure, centred, with structure void; by default it keeps its own size.
 */
export function buildVariant(src, faction, W, L) {
  const m = clone(src);
  const r = m.file.root.v;
  const s = m.inner.root.v;
  const [w, h, l] = r.size.v.v;
  W ??= w;
  L ??= l;
  if (w > W || l > L) return undefined;
  const ox = Math.floor((W - w) / 2);
  const oz = Math.floor((L - l) / 2);
  const idx = (x, y, z, L) => (x * h + y) * L + z;

  const palNode = s.palette.v.default.v;
  const palette = palNode.block_palette.v.v; // array of typed compounds
  const posData = palNode.block_position_data?.v ?? {};
  // Layers are int arrays (tag 11) in newer exports, lists of ints (tag 9) in older ones.
  const layerType = s.block_indices.v.et;
  const layers = s.block_indices.v.v.map((layer) => (layerType === T.INTS ? layer : layer.v));

  // 1. Pad: new layers full of void (-1), copy the old blocks in at the offset; move block entity data.
  const newLayers = layers.map((old) => {
    const out = new Array(W * h * L).fill(-1);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < l; z++) out[idx(x + ox, y, z + oz, L)] = old[idx(x, y, z, l)];
    return out;
  });
  const newPos = {};
  for (const [k, v] of Object.entries(posData)) {
    const i = Number(k);
    const x = Math.floor(i / (h * l)), y = Math.floor(i / l) % h, z = i % l;
    newPos[String(idx(x + ox, y, z + oz, L))] = v;
  }
  r.size.v.v = [W, h, L];
  // Entity and block entity positions are stored in world coordinates relative to this origin.
  if (r.structure_world_origin) r.structure_world_origin.v.v = [r.structure_world_origin.v.v[0] - ox, r.structure_world_origin.v.v[1], r.structure_world_origin.v.v[2] - oz];

  // 2. Faction colours.
  const f = FACTIONS[faction];
  const addEntry = (name, states) => {
    const version = palette.find((p) => p.version)?.version ?? { t: T.INT, v: 18168865 };
    const st = {};
    for (const [k, v] of Object.entries(states)) st[k] = { t: T.STRING, v };
    palette.push({ name: { t: T.STRING, v: name }, states: { t: T.COMPOUND, v: st }, version: clone(version) });
    return palette.length - 1;
  };
  const nameOf = (i) => (i < 0 ? "void" : palette[i].name.v);
  // white wool / carpet -> faction colour (new palette entries, so other colours stay)
  palette.forEach((p) => {
    const mm = p.name.v.match(/^minecraft:white_(wool|carpet)$/);
    if (mm) p.name.v = `minecraft:${f.name}_${mm[1]}`;
  });
  const notes = [];
  const layer0 = newLayers[0];
  for (const [k, entry] of Object.entries(newPos)) {
    const be = entry.v.block_entity_data?.v;
    if (!be) continue;
    const i = Number(k);
    const id = be.id?.v;
    if (id === "Bed" && be.color?.v === 0) be.color.v = f.bed;
    if (id === "Banner" && be.Base?.v === 15) {
      const block = nameOf(layer0[i]);
      if (block !== "minecraft:wall_banner") {
        notes.push(`white standing banner at index ${i} left as it is (faction banners hang on walls)`);
        continue;
      }
      const facing = WALL_BANNER_FACING[palette[layer0[i]].states.v.facing_direction?.v] ?? "south";
      layer0[i] = addEntry(`${NS}:banner_${f.name}`, { [`${NS}:part`]: "top", "minecraft:cardinal_direction": facing });
      delete newPos[k];
      const below = i - L; // y - 1 (index = (x*h + y)*L + z)
      const y = Math.floor(i / L) % h;
      if (y > 0 && ["minecraft:air", "void"].includes(nameOf(layer0[below]))) {
        layer0[below] = addEntry(`${NS}:banner_${f.name}`, { [`${NS}:part`]: "bottom", "minecraft:cardinal_direction": facing });
      } else notes.push(`banner at index ${i}: no room below for the bottom part`);
    }
  }
  for (const e of s.entities.v.v) {
    if (e.identifier?.v === "minecraft:cushion" && e.Variant?.v === 15) e.Variant.v = f.legacy;
  }

  s.block_indices.v.v = newLayers.map((v) => (layerType === T.INTS ? v : { et: T.INT, v }));
  palNode.block_position_data = { t: T.COMPOUND, v: newPos };

  return { bytes: saveMcstructure(m), view: { size: [W, h, L], layer0, palette: palette.map((p) => ({ name: p.name.v, states: p.states.v })), posData: newPos }, notes };
}

/** States for BlockPermutation.resolve: bytes (bit states) become booleans. */
function plainStates(states) {
  const out = {};
  for (const [k, n] of Object.entries(states)) out[k] = n.t === T.BYTE ? n.v !== 0 : plain(n);
  return Object.keys(out).length ? out : undefined;
}

/** Blueprint (south-facing, '.' = leave as is) from a view. Odd turns swap width and depth. */
export function toBlueprint(view, turns, yOffset) {
  const [W, h, L] = view.size;
  const odd = turns % 2 === 1;
  const BW = odd ? L : W; // blueprint width (x) and depth (z) after turning
  const BD = odd ? W : L;
  const signAt = new Set(
    Object.entries(view.posData)
      .filter(([, e]) => {
        const be = e.v.block_entity_data?.v;
        return be?.id?.v === "Sign" && NAME_MARK.test(String(be.FrontText?.v?.Text?.v ?? be.Text?.v ?? ""));
      })
      .map(([k]) => Number(k)),
  );
  const entries = [];
  const keyIndex = new Map();
  const charFor = (paletteIndex, sign) => {
    const p = view.palette[paletteIndex];
    if (p.name === "minecraft:air" || p.name === "minecraft:structure_void") return ".";
    const states = rotateBedrockStates(p.name, plainStates(p.states), turns);
    const entry = { id: p.name, ...(states ? { states } : {}), ...(sign ? { sign: true } : {}) };
    const key = JSON.stringify(entry);
    if (!keyIndex.has(key)) {
      if (entries.length >= ALPHABET.length) throw new Error("palette too big for the blueprint alphabet");
      keyIndex.set(key, entries.length);
      entries.push(entry);
    }
    return ALPHABET[keyIndex.get(key)];
  };
  const layers = [];
  for (let k = 0; k < yOffset; k++) layers.push(Array.from({ length: BD }, () => ".".repeat(BW)));
  for (let y = 0; y < h; y++) {
    const rows = Array.from({ length: BD }, () => new Array(BW).fill("."));
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < L; z++) {
        const i = (x * h + y) * L + z;
        const pi = view.layer0[i];
        if (pi < 0) continue;
        const [tx, tz] = rotatePos(x, z, W, L, turns);
        rows[tz][tx] = charFor(pi, signAt.has(i));
      }
    }
    layers.push(rows.map((r) => r.join("")));
  }
  return { size: [BW, h + yOffset, BD], palette: entries, layers };
}

// ---------- main ----------

function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(SRC, "imports.json"), "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Remove our old outputs (only files this tool writes), so renamed designs don't linger.
  for (const f of fs.readdirSync(OUT_DIR)) if (/_(blue|green|red)(_(9|13|17))?\.mcstructure$/.test(f)) fs.rmSync(path.join(OUT_DIR, f));

  const imported = {};
  let placeholder;
  for (const [design, d] of Object.entries(cfg.designs)) {
    const srcPath = path.join(SRC, d.file);
    const src = openMcstructure(fs.readFileSync(srcPath));
    // Keep the committed source free of the author's Xbox id too.
    if (stripOwnerIds(src.inner.root) + stripOwnerIds(src.file.root)) fs.writeFileSync(srcPath, saveMcstructure(clone(src)));
    const turns = FRONT_TURNS[d.front];
    if (turns === undefined) throw new Error(`${design}: front must be south, east, north or west`);
    const groundLayers = d.groundLayers ?? 1;
    if (groundLayers > 1) throw new Error(`${design}: only 0 or 1 ground layers are supported (blueprint y 0 is the ground)`);
    const yOffset = 1 - groundLayers;
    const [w, h, l] = src.file.root.v.size.v.v;
    console.log(`${design}: ${w}x${h}x${l}, front ${d.front}, ${groundLayers} ground layer(s)`);
    for (const faction of Object.keys(FACTIONS)) {
      const v = buildVariant(src, faction);
      const file = `${design}_${faction}`;
      fs.writeFileSync(path.join(OUT_DIR, `${file}.mcstructure`), v.bytes);
      const data = toBlueprint(v.view, turns, yOffset);
      imported[`${design}/${faction}`] = { data, structure: `${NS}:${file}`, turns, yOffset };
      if (faction === "blue") {
        console.log(`  plot ${data.size[0]} wide x ${data.size[2]} deep (entrance south): ${NS}:${design}_<faction>`);
        for (const n of v.notes) console.log(`    note: ${n}`);
      }
    }
    if (d.placeholderFor === "all") placeholder = design;
  }

  const ts =
    "// GENERATED by tools/import_structures.mjs from assets-src/structures/imported. Do not edit.\n" +
    'import type { BlueprintData } from "../blueprint_data.js";\n\n' +
    "export interface ImportedDesign {\n" +
    "  /** Blueprint for the construction phases, entrance facing south like every blueprint. */\n" +
    "  data: BlueprintData;\n" +
    "  /** Structure placed when the building is finished (keeps bed colours, cushions, container contents). */\n" +
    "  structure: string;\n" +
    "  /** Clockwise quarter turns from the structure as exported to entrance-south. */\n" +
    "  turns: number;\n" +
    "  /** Layers between the plot's ground (ly 0) and the structure's bottom. */\n" +
    "  yOffset: number;\n" +
    "}\n\n" +
    "/** Key: <design>/<faction>. The plot is as big as the structure (data.size: width, height, depth). */\n" +
    `export const IMPORTED: Record<string, ImportedDesign> = ${JSON.stringify(imported)};\n\n` +
    "/** Design that stands in for every plot building without a design of its own (Defence section excluded). */\n" +
    `export const PLACEHOLDER_DESIGN: string | undefined = ${JSON.stringify(placeholder)};\n`;
  fs.writeFileSync(OUT_TS, ts);
  console.log(`Wrote ${Object.keys(imported).length} variants -> ${path.relative(ROOT, OUT_TS)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
