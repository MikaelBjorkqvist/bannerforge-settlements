// Validator: catches the mistakes that most often break add-ons or fail Marketplace review.
// Runs offline with plain Node. Exit code 1 on any error.
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, walk, loadConfig } from "./lib.mjs";

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

const cfg = loadConfig();
const ns = cfg.namespace + ":";
const BP = path.join(ROOT, "packs", "BP");
const RP = path.join(ROOT, "packs", "RP");

// 1. Config sanity
const repo = process.env.GITHUB_REPOSITORY ?? "";
if (cfg.id === "template" && repo && !repo.endsWith("/bannerforge-template"))
  err("config: this repo was created from the template but `npm run init -- <id> ...` was never run (UUIDs would clash)");
for (const [mod, v] of Object.entries(cfg.scriptModules)) {
  if (v.includes("beta")) err(`config: ${mod}@${v} is a beta API. Stable APIs only (see docs/decisions/0002).`);
}

// 2. All JSON parses + naming rules
const jsonFiles = [...walk(BP), ...walk(RP)].filter((f) => f.endsWith(".json"));
const parsed = new Map();
for (const f of jsonFiles) {
  try {
    parsed.set(f, readJson(f));
  } catch (e) {
    err(`${rel(f)}: invalid JSON (${e.message})`);
  }
}
for (const f of [...walk(BP), ...walk(RP)]) {
  const r = path.relative(ROOT, f).replaceAll("\\", "/");
  const inPack = path.relative(f.startsWith(BP) ? BP : RP, f).replaceAll("\\", "/");
  const checked = inPack.replace(/^texts\/[a-z]{2}_[A-Z]{2}\.lang$/, "");
  if (!path.basename(f).startsWith(".") && /[A-Z\s-]/.test(checked)) warn(`${r}: use lowercase_snake_case file names`);
  if (path.basename(f) === "manifest.json") err(`${r}: manifests are generated from config/mod.json — delete this file`);
}

// 3. Lang file (RP holds display names)
const langFile = path.join(RP, "texts", "en_US.lang");
const lang = new Set(
  fs.existsSync(langFile)
    ? fs.readFileSync(langFile, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("##")).map((l) => l.split("=")[0].trim())
    : []
);

// 4. Content definitions: namespace, lang, icons
const itemTextures = parsed.get(path.join(RP, "textures", "item_texture.json"))?.texture_data ?? {};
const terrainTextures = parsed.get(path.join(RP, "textures", "terrain_texture.json"))?.texture_data ?? {};
const textureExists = (p) => [".png", ".tga"].some((ext) => fs.existsSync(path.join(RP, p + ext)));

for (const [f, data] of parsed) {
  if (!f.startsWith(BP)) continue;
  const kind = ["minecraft:item", "minecraft:block", "minecraft:entity"].find((k) => data[k]);
  if (!kind) continue;
  const def = data[kind];
  const id = def.description?.identifier;
  if (!data.format_version) err(`${rel(f)}: missing format_version`);
  if (!id) { err(`${rel(f)}: missing description.identifier`); continue; }
  if (id.startsWith("minecraft:")) err(`${rel(f)}: overrides vanilla ${id}. Add-ons must be additive only (docs/decisions/0003).`);
  else if (!id.startsWith(ns)) err(`${rel(f)}: identifier ${id} must use namespace ${ns}`);

  if (kind === "minecraft:item") {
    if (!lang.has(`item.${id}`)) err(`${rel(f)}: missing lang key item.${id} in RP/texts/en_US.lang`);
    const icon = def.components?.["minecraft:icon"];
    const key = typeof icon === "string" ? icon : icon?.textures?.default;
    if (!key) err(`${rel(f)}: item has no minecraft:icon`);
    else if (!itemTextures[key]) err(`${rel(f)}: icon "${key}" not in RP/textures/item_texture.json`);
    else if (!textureExists(itemTextures[key].textures)) err(`${rel(f)}: texture file ${itemTextures[key].textures}.png not found`);
  }
  if (kind === "minecraft:block") {
    if (!lang.has(`tile.${id}.name`)) err(`${rel(f)}: missing lang key tile.${id}.name`);
    const mats = def.components?.["minecraft:material_instances"] ?? {};
    for (const m of Object.values(mats)) {
      if (m.texture && !terrainTextures[m.texture]) err(`${rel(f)}: texture "${m.texture}" not in RP/textures/terrain_texture.json`);
    }
  }
  if (kind === "minecraft:entity") {
    if (!lang.has(`entity.${id}.name`)) err(`${rel(f)}: missing lang key entity.${id}.name`);
  }
}

// 5. Every texture referenced by atlases exists
for (const [atlasName, atlas] of [["item_texture.json", itemTextures], ["terrain_texture.json", terrainTextures]]) {
  for (const [key, v] of Object.entries(atlas)) {
    const tex = typeof v.textures === "string" ? v.textures : null;
    if (tex && !textureExists(tex)) err(`RP/textures/${atlasName}: "${key}" points to missing ${tex}.png`);
  }
}

// 6. Scripts must not import beta-only modules
const betaOnly = ["@minecraft/server-net", "@minecraft/server-admin", "@minecraft/server-gametest", "@minecraft/debug-utilities"];
for (const f of walk(path.join(ROOT, "src", "scripts")).filter((x) => x.endsWith(".ts"))) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of betaOnly) if (src.includes(`"${m}"`)) err(`${rel(f)}: imports beta-only module ${m}`);
  for (const m of src.matchAll(/from\s+"(@minecraft\/[^"]+)"/g)) {
    if (!(m[1] in cfg.scriptModules) && m[1] !== "@minecraft/math" && m[1] !== "@minecraft/vanilla-data")
      err(`${rel(f)}: imports ${m[1]} but config/mod.json scriptModules does not declare it`);
  }
}

// 7. Pack icon
for (const [name, dir] of [["BP", BP], ["RP", RP]]) {
  if (!fs.existsSync(path.join(dir, "pack_icon.png"))) warn(`${name}: no pack_icon.png`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\ncheck: ${errors.length} error(s), ${warnings.length} warning(s), ${jsonFiles.length} JSON file(s) scanned`);
process.exit(errors.length ? 1 : 0);
