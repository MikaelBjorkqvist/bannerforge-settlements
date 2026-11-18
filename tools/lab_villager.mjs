// Citizen research lab (draft branch only, never merged as is): writes an exact copy of the vanilla villager_v2 under
// our identifier, so we can see in game which parts of the village routine (beds, job sites, gathering) a non-vanilla
// entity gets. Behaviour and client JSON come from Mojang's bedrock-samples (EULA); only names are changed, and the
// client entity points at the vanilla villager model, textures and animations by name (nothing copied or overridden).
//
//   node tools/lab_villager.mjs <path to a bedrock-samples checkout>
import fs from "node:fs";
import path from "node:path";

const SAMPLES = process.argv[2];
if (!SAMPLES) throw new Error("usage: node tools/lab_villager.mjs <bedrock-samples path>");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LAB_ID = "bannerforge_settlements:lab_villager";

/** Mojang's sample JSON has // comments; strip them outside strings. */
function readJsonc(file) {
  const src = fs.readFileSync(file, "utf8");
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += src[++i];
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }
  return JSON.parse(out);
}

const bp = readJsonc(path.join(SAMPLES, "behavior_pack/entities/villager_v2.json"));
const bpText = JSON.stringify(bp, null, 2).replaceAll('"minecraft:villager_v2"', JSON.stringify(LAB_ID));
const lab = JSON.parse(bpText);
lab["minecraft:entity"].description.is_summonable = true;
fs.writeFileSync(path.join(ROOT, "packs/BP/entities/lab_villager.json"), JSON.stringify(lab, null, 2) + "\n");

const rp = readJsonc(path.join(SAMPLES, "resource_pack/entity/villager_v2.entity.json"));
rp["minecraft:client_entity"].description.identifier = LAB_ID;
fs.writeFileSync(path.join(ROOT, "packs/RP/entity/lab_villager.entity.json"), JSON.stringify(rp, null, 2) + "\n");
console.log(`wrote ${LAB_ID} (BP format ${bp.format_version})`);
