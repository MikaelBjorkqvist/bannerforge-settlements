// Copy dist/ packs into Minecraft's development pack folders on this Windows PC (GDK build, 1.21.120+).
// Usage: npm run deploy            (Minecraft Bedrock)
//        npm run deploy -- preview (Minecraft Preview)
// Override with env COM_MOJANG=<path to com.mojang>.
import fs from "node:fs";
import path from "node:path";
import { DIST, loadConfig, packFolderNames, copyDir } from "./lib.mjs";

const preview = process.argv.includes("preview");
const appdata = process.env.APPDATA;
const comMojang =
  process.env.COM_MOJANG ??
  (appdata && path.join(appdata, preview ? "Minecraft Bedrock Preview" : "Minecraft Bedrock", "Users", "Shared", "games", "com.mojang"));

if (!comMojang || !fs.existsSync(comMojang)) {
  console.error(`com.mojang not found at ${comMojang}. Launch Minecraft once, or set COM_MOJANG.`);
  process.exit(1);
}

const cfg = loadConfig();
const names = packFolderNames(cfg);
for (const [kind, folder] of [["behavior", names.bp], ["resource", names.rp]]) {
  const target = path.join(comMojang, `development_${kind}_packs`, folder);
  fs.rmSync(target, { recursive: true, force: true }); // only ever removes our own pack folder
  copyDir(path.join(DIST, folder), target);
  console.log(`Deployed -> ${target}`);
}
