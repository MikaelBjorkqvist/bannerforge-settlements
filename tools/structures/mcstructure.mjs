// Bedrock .mcstructure reader (little-endian NBT). Handles both layouts:
// - classic: { format_version, size, structure: { block_indices, entities, palette }, structure_world_origin }
// - compressed (seen in 26.x exports): { compression: 1, structure: <byte array: zlib-compressed NBT compound> }
import zlib from "node:zlib";
import { readNbt } from "./nbt.mjs";

export function readMcstructure(buf) {
  const root = readNbt(buf, { littleEndian: true });
  let structure = root.structure;
  if (Array.isArray(structure)) {
    if (root.compression !== 1) throw new Error(`Unknown .mcstructure compression ${root.compression}`);
    structure = readNbt(zlib.inflateSync(Buffer.from(structure.map((b) => b & 0xff))), { littleEndian: true });
  }
  return { size: root.size, origin: root.structure_world_origin, formatVersion: root.format_version, structure };
}
