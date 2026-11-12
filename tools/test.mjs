// Unit tests for game-independent modules (no @minecraft imports), e.g. the settlement rules.
// Transpiles them to .test-build/ and runs every tests/*.test.mjs.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, loadTypeScript } from "./lib.mjs";

const PURE = ["settlements/types", "settlements/buildings", "settlements/rules"];
const out = path.join(ROOT, ".test-build");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const ts = loadTypeScript();
for (const m of PURE) {
  const src = fs.readFileSync(path.join(ROOT, "src", "scripts", m + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
  fs.writeFileSync(path.join(out, path.basename(m) + ".mjs"), js.replace(/from "\.\/([a-z_]+)\.js"/g, 'from "./$1.mjs"'));
}
let failed = 0;
for (const f of fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.mjs"))) {
  try {
    await import(pathToFileURL(path.join(ROOT, "tests", f)).href);
    console.log(`pass  ${f}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${f}\n${e.stack ?? e}`);
  }
}
process.exit(failed ? 1 : 0);
