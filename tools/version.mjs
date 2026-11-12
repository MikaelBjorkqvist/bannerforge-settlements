// Bump the mod version in config/mod.json and open a CHANGELOG section.
// Usage: node tools/version.mjs patch|minor|major
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, writeJson, semverArray } from "./lib.mjs";

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) throw new Error("usage: version.mjs patch|minor|major");
const file = path.join(ROOT, "config", "mod.json");
const cfg = readJson(file);
let [a, b, c] = semverArray(cfg.version);
if (kind === "major") [a, b, c] = [a + 1, 0, 0];
if (kind === "minor") [b, c] = [b + 1, 0];
if (kind === "patch") c += 1;
cfg.version = `${a}.${b}.${c}`;
writeJson(file, cfg);

const log = path.join(ROOT, "CHANGELOG.md");
const text = fs.readFileSync(log, "utf8");
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(log, text.replace("## [Unreleased]", `## [Unreleased]\n\n## [${cfg.version}] - ${date}`));
console.log(`Version -> ${cfg.version}. Tag with: git tag v${cfg.version}`);
