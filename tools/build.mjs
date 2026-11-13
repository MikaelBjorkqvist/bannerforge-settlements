// Build: packs/ + src/scripts/ + config/mod.json  ->  dist/<ns>_<id>_BP and dist/<ns>_<id>_RP
import fs from "node:fs";
import path from "node:path";
import { ROOT, DIST, loadConfig, semverArray, packFolderNames, walk, copyDir, writeJson, loadTypeScript } from "./lib.mjs";

const cfg = loadConfig();
const names = packFolderNames(cfg);
const bpOut = path.join(DIST, names.bp);
const rpOut = path.join(DIST, names.rp);

fs.rmSync(DIST, { recursive: true, force: true });

// 1. Copy pack sources (anything named *.md or starting with "_" is source-only and skipped)
const keep = (rel) => !rel.endsWith(".md") && !/^[_.]/.test(path.basename(rel));
copyDir(path.join(ROOT, "packs", "BP"), bpOut, keep);
copyDir(path.join(ROOT, "packs", "RP"), rpOut, keep);

// 2. Transpile scripts (TypeScript -> ES2020 modules, one .js per .ts; Minecraft resolves relative imports)
const ts = loadTypeScript();
const srcDir = path.join(ROOT, "src", "scripts");
const scriptFiles = walk(srcDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
for (const file of scriptFiles) {
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, sourceMap: false },
    fileName: file,
  });
  const target = path.join(bpOut, "scripts", path.relative(srcDir, file).replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Scripts can reference the resource pack (e.g. UI images) through this placeholder.
  fs.writeFileSync(target, out.outputText.replaceAll("__RP_PACK_ID__", cfg.uuids.rpHeader));
}
const hasScripts = scriptFiles.length > 0;

// 3. Generate manifests
const version = semverArray(cfg.version);
const minEngine = semverArray(cfg.minEngineVersion);
const metadata = { authors: cfg.authors, product_type: "addon" };

const bpManifest = {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: cfg.uuids.bpHeader, version, min_engine_version: minEngine },
  modules: [{ type: "data", uuid: cfg.uuids.bpData, version }],
  dependencies: [{ uuid: cfg.uuids.rpHeader, version }],
  metadata,
};
if (hasScripts) {
  bpManifest.modules.push({ type: "script", language: "javascript", uuid: cfg.uuids.bpScript, version, entry: "scripts/main.js" });
  for (const [module_name, v] of Object.entries(cfg.scriptModules)) {
    bpManifest.dependencies.push({ module_name, version: v });
  }
}
const rpManifest = {
  format_version: 2,
  header: { name: "pack.name", description: "pack.description", uuid: cfg.uuids.rpHeader, version, min_engine_version: minEngine, pack_scope: "world" },
  modules: [{ type: "resources", uuid: cfg.uuids.rpResources, version }],
  dependencies: [{ uuid: cfg.uuids.bpHeader, version }],
  metadata,
};
writeJson(path.join(bpOut, "manifest.json"), bpManifest);
writeJson(path.join(rpOut, "manifest.json"), rpManifest);

// 4. Pack name/description lang lines (prepended so packs/ lang files only hold content strings)
for (const [dir, suffix] of [[bpOut, ""], [rpOut, " (Resources)"]]) {
  const langFile = path.join(dir, "texts", "en_US.lang");
  const existing = fs.existsSync(langFile) ? fs.readFileSync(langFile, "utf8") : "";
  fs.mkdirSync(path.dirname(langFile), { recursive: true });
  fs.writeFileSync(langFile, `pack.name=${cfg.displayName}${suffix}\npack.description=${cfg.description} v${cfg.version}\n${existing}`);
  writeJson(path.join(dir, "texts", "languages.json"), ["en_US"]);
}

console.log(`Built ${cfg.displayName} v${cfg.version}`);
console.log(`  ${path.relative(ROOT, bpOut)}  (${hasScripts ? scriptFiles.length + " script file(s)" : "no scripts"})`);
console.log(`  ${path.relative(ROOT, rpOut)}`);
