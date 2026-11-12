// Shared helpers for BannerForge build tooling. Zero runtime dependencies besides TypeScript.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(ROOT, "dist");

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function loadConfig() {
  const cfg = readJson(path.join(ROOT, "config", "mod.json"));
  for (const [k, v] of Object.entries(cfg.uuids)) {
    if (!/^[0-9a-f-]{36}$/i.test(v)) {
      throw new Error(`config/mod.json uuids.${k} is not set. Run: npm run init`);
    }
  }
  return cfg;
}

/** "1.2.3" -> [1,2,3] */
export function semverArray(v) {
  const parts = v.split("-")[0].split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`Bad version: ${v}`);
  return parts;
}

/** Folder names used both in dist/ and in com.mojang development folders. */
export function packFolderNames(cfg) {
  const base = `${cfg.namespace}_${cfg.id}`;
  return { bp: `${base}_BP`, rp: `${base}_RP` };
}

export function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function copyDir(src, dest, filter = () => true) {
  for (const file of walk(src)) {
    const rel = path.relative(src, file);
    if (!filter(rel)) continue;
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
  }
}

/** Loads TypeScript from local node_modules, falling back to a global install. */
export function loadTypeScript() {
  const require = createRequire(import.meta.url);
  try {
    return require("typescript");
  } catch {
    const { execSync } = require("node:child_process");
    const globalRoot = execSync("npm root -g").toString().trim();
    return require(path.join(globalRoot, "typescript"));
  }
}
