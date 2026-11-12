// One-time setup for a new mod repo created from the template.
// Usage: node tools/init.mjs <id> "<Display Name>" "<description>"
// Generates fresh UUIDs (each mod MUST have its own) and sets the mod id.
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, readJson, writeJson } from "./lib.mjs";

const file = path.join(ROOT, "config", "mod.json");
const cfg = readJson(file);
const [id, displayName, description] = process.argv.slice(2);

if (id) {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error("id must be lowercase_snake_case");
  cfg.id = id;
}
if (displayName) cfg.displayName = displayName;
if (description) cfg.description = description;

// Always fresh: two packs sharing a UUID silently replace each other in Minecraft.
for (const k of Object.keys(cfg.uuids)) cfg.uuids[k] = crypto.randomUUID();
writeJson(file, cfg);
console.log(`config/mod.json ready: ${cfg.namespace}:${cfg.id} — ${cfg.displayName}`);
