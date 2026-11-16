// Build the owner-only BannerForge Dev Tools pack into dist-devtools/ (never part of a mod release).
//
//   node tools/build_devtools.mjs [path to vanilla structures/village] [--schem <folder> --set <name>]
//
// --schem adds a second set from Sponge schematics (.schem, e.g. purchased build packs): one row per biome, the
// biome taken from the file name ("Desert-Library.schem", "PlainsChurch.schem"). Rows are named "<set>_<biome>"
// (set "gs" -> gs_desert …) and laid out south of the vanilla rows. Third-party data stays in dist-devtools/ only.
//
// Reads the Java structure templates (.nbt) that ship inside the owner's own Bedrock install, translates them with
// tools/structures/java_to_bedrock.mjs and plans a grid: one row per biome (town centres, houses, then lamps and
// decorations), a sign in front of each building. The vanilla-derived data only ever exists in dist-devtools/.
// Deploy with: node tools/build_devtools.mjs && npm run deploy:devtools
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, writeJson, walk, semverArray, loadConfig, loadTypeScript } from "./lib.mjs";
import { readNbt } from "./structures/nbt.mjs";
import { convertTemplate } from "./structures/java_to_bedrock.mjs";
import { schemToTemplate } from "./structures/schem.mjs";

const DEFAULT_SRC = "C:\\XboxGames\\Minecraft for Windows\\Content\\data\\behavior_packs\\vanilla\\structures\\village";
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const schemDir = opt("--schem");
const schemSet = opt("--set") ?? "gs";
const src = args[0] ?? process.env.VANILLA_VILLAGE_DIR ?? DEFAULT_SRC;
if (!fs.existsSync(src)) {
  console.error(`Village templates not found at ${src}. Pass the path to vanilla structures/village.`);
  process.exit(1);
}

export const BIOMES = ["plains", "desert", "savanna", "snowy", "taiga"];
const GAP_X = 5; // blocks between buildings in a row
const GAP_Z = 10; // blocks between rows (signs stand 2 blocks in front)
const START_X = 4; // room for the row label sign

/** Which files go in the world: houses, town centres, and lamp / decoration pieces. Streets, villagers etc. don't. */
function groupOf(rel) {
  const parts = rel.split("/");
  if (parts.length === 3 && parts[1] === "town_centers") return 0;
  if (parts.length === 3 && parts[1] === "houses") return /lamp|decoration/.test(parts[2]) ? 2 : 1;
  if (parts.length === 2 && /lamp|decoration/.test(parts[1])) return 2;
  return -1;
}

/** Sign text: the name without biome prefix, wrapped to ~14 characters per line. */
export function signLabel(biome, file) {
  const words = file.replace(/\.nbt$/, "").replace(new RegExp(`^${biome}_`), "").split("_");
  const lines = [];
  for (const w of words) {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] + " " + w).length <= 14) lines[last] += " " + w;
    else lines.push(w);
  }
  return lines.slice(0, 4).join("\n");
}

const files = walk(src)
  .filter((f) => f.endsWith(".nbt"))
  .map((f) => path.relative(src, f).replaceAll("\\", "/"))
  .filter((rel) => BIOMES.includes(rel.split("/")[0]) && groupOf(rel) >= 0)
  .sort();

const candidates = [];
const candidateIndex = new Map();
const templates = [];
const rows = [];
let rowZ = 0;
let maxX = 0;
const seen = new Set();
for (const biome of BIOMES) {
  const inRow = files
    .filter((rel) => rel.startsWith(biome + "/"))
    .sort((a, b) => groupOf(a) - groupOf(b) || a.localeCompare(b));
  if (!inRow.length) continue;
  rows.push({ biome, ox: 0, oz: rowZ - 2 });
  let x = START_X;
  let depth = 0;
  for (const rel of inRow) {
    const name = path.basename(rel);
    if (seen.has(biome + "/" + name)) continue; // e.g. taiga lamp post exists in two folders
    seen.add(biome + "/" + name);
    const t = convertTemplate(readNbt(fs.readFileSync(path.join(src, rel))));
    const palette = t.palette.map((cands) => {
      const key = JSON.stringify(cands);
      if (!candidateIndex.has(key)) {
        candidateIndex.set(key, candidates.length);
        candidates.push(cands);
      }
      return candidateIndex.get(key);
    });
    templates.push({ key: rel.replace(/\.nbt$/, ""), label: signLabel(biome, name), biome, size: t.size, dy: t.dy, ox: x, oz: rowZ, palette, blocks: t.blocks });
    x += t.size[0] + GAP_X;
    depth = Math.max(depth, t.size[2]);
  }
  maxX = Math.max(maxX, x);
  rowZ += depth + GAP_Z;
}

// ---- optional second set from Sponge schematics ----
function addTemplate(t, key, label, biome, x, z) {
  const palette = t.palette.map((cands) => {
    const k = JSON.stringify(cands);
    if (!candidateIndex.has(k)) {
      candidateIndex.set(k, candidates.length);
      candidates.push(cands);
    }
    return candidateIndex.get(k);
  });
  templates.push({ key, label, biome, size: t.size, dy: t.dy, ox: x, oz: z, palette, blocks: t.blocks });
}

if (schemDir) {
  rowZ += GAP_Z * 2;
  const schems = walk(schemDir).filter((f) => f.endsWith(".schem")).sort();
  const byBiome = new Map();
  for (const f of schems) {
    const base = path.basename(f, ".schem");
    const m = base.match(/^([A-Za-z]+?)(?:-|(?=[A-Z]))(.*)$/);
    const biome = (m ? m[1] : "misc").toLowerCase();
    const name = (m ? m[2] : base).replace(/^-/, "");
    if (!byBiome.has(biome)) byBiome.set(biome, []);
    byBiome.get(biome).push({ f, name });
  }
  for (const [biome, list] of [...byBiome].sort()) {
    const row = `${schemSet}_${biome}`;
    rows.push({ biome: row, ox: 0, oz: rowZ - 2 });
    let x = START_X;
    let depth = 0;
    for (const { f, name } of list) {
      // Schematic y = 0 is the bottom layer of the build and sits on top of the surface (owner play-test 2026-11-16:
      // GraySun builds were one block too low with y = 0 in the surface layer). Air is never placed (keeps the grass).
      const t = convertTemplate(schemToTemplate(readNbt(fs.readFileSync(f))), { carveBelowSurface: false });
      t.dy = 1;
      const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
      addTemplate(t, `${row}/${name}`, `${schemSet.toUpperCase()} ${biome}\n${words.join(" ")}`, row, x, rowZ);
      x += t.size[0] + GAP_X;
      depth = Math.max(depth, t.size[2]);
    }
    maxX = Math.max(maxX, x);
    rowZ += depth + GAP_Z;
  }
}

// ---- write the pack ----
const dcfg = readJson(path.join(ROOT, "devtools", "config.json"));
const modCfg = loadConfig();
const OUT = path.join(ROOT, "dist-devtools", dcfg.folder);
fs.rmSync(path.join(ROOT, "dist-devtools"), { recursive: true, force: true });

const version = semverArray(dcfg.version);
writeJson(path.join(OUT, "manifest.json"), {
  format_version: 2,
  header: { name: dcfg.displayName, description: dcfg.description, uuid: dcfg.uuids.header, version, min_engine_version: semverArray(modCfg.minEngineVersion) },
  modules: [
    { type: "data", uuid: dcfg.uuids.data, version },
    { type: "script", language: "javascript", uuid: dcfg.uuids.script, version, entry: "scripts/main.js" },
  ],
  dependencies: [{ module_name: "@minecraft/server", version: modCfg.scriptModules["@minecraft/server"] }],
  metadata: { authors: modCfg.authors, product_type: "addon" },
});

const ts = loadTypeScript();
const mainSrc = fs.readFileSync(path.join(ROOT, "devtools", "src", "main.ts"), "utf8");
const mainJs = ts.transpileModule(mainSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
fs.mkdirSync(path.join(OUT, "scripts"), { recursive: true });
fs.writeFileSync(path.join(OUT, "scripts", "main.js"), mainJs);
fs.writeFileSync(
  path.join(OUT, "scripts", "village_templates.js"),
  "// Generated by tools/build_devtools.mjs from the local vanilla install. Do not commit.\n" +
    `export const CANDIDATES = ${JSON.stringify(candidates)};\n` +
    `export const ROWS = ${JSON.stringify(rows)};\n` +
    `export const EXTENT = ${JSON.stringify([maxX, rowZ])};\n` +
    `export const TEMPLATES = [\n${templates.map((t) => JSON.stringify(t)).join(",\n")}\n];\n`,
);

const blockCount = templates.reduce((n, t) => n + t.blocks.length / 4, 0);
console.log(`Built ${dcfg.displayName} v${dcfg.version} -> ${path.relative(ROOT, OUT)}`);
console.log(`  ${templates.length} templates in ${rows.length} rows, ${blockCount} blocks, ${candidates.length} distinct block states`);
console.log(`  layout ${maxX} x ${rowZ} blocks`);
for (const r of rows) console.log(`  ${r.biome}: ${templates.filter((t) => t.biome === r.biome).length}`);
