// Package dist/ packs into a single .mcaddon (a zip with the BP and RP folders at its root).
// Dependency-free zip writer (deflate) so it runs the same on Windows, Linux and CI.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT, DIST, loadConfig, packFolderNames, walk } from "./lib.mjs";

const cfg = loadConfig();
const names = packFolderNames(cfg);
for (const n of Object.values(names)) {
  if (!fs.existsSync(path.join(DIST, n))) throw new Error(`dist/${n} missing — run npm run build first`);
}

const entries = [];
for (const n of Object.values(names)) {
  for (const file of walk(path.join(DIST, n)).sort()) {
    entries.push({ name: path.relative(DIST, file).replaceAll("\\", "/"), data: fs.readFileSync(file) });
  }
}

const chunks = [];
const central = [];
let offset = 0;
const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1; // fixed 1980-01-01 => reproducible archives
for (const { name, data } of entries) {
  const nameBuf = Buffer.from(name, "utf8");
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, deflated);

  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(8, 10); c.writeUInt16LE(DOS_TIME, 12); c.writeUInt16LE(DOS_DATE, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(deflated.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += 30 + nameBuf.length + deflated.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);

const outFile = path.join(DIST, `${cfg.namespace}_${cfg.id}-${cfg.version}.mcaddon`);
fs.writeFileSync(outFile, Buffer.concat([...chunks, centralBuf, end]));
console.log(`Packaged ${path.relative(ROOT, outFile)} (${entries.length} files)`);
