// Sponge schematic (.schem, WorldEdit) v2 / v3 -> the same shape as a Java structure template:
// { size: [w, h, l], palette: [{ Name, Properties }], blocks: [{ pos: [x, y, z], state }], dataVersion }
// so java_to_bedrock.convertTemplate() can translate it. Air is kept (convertTemplate decides what to place).
import { parseStateString } from "./java_to_bedrock.mjs";

export function schemToTemplate(nbt) {
  const root = nbt.Schematic ?? nbt; // v3 wraps everything in "Schematic"
  const w = root.Width, h = root.Height, l = root.Length;
  const blocks3 = root.Blocks; // v3
  const paletteMap = blocks3 ? blocks3.Palette : root.Palette;
  const data = blocks3 ? blocks3.Data : root.BlockData;
  if (!paletteMap || !data) throw new Error("Not a Sponge schematic (no palette / block data)");

  const palette = [];
  for (const [state, idx] of Object.entries(paletteMap)) palette[idx] = parseStateString(state);

  const blocks = [];
  let i = 0;
  let index = 0;
  while (i < data.length) {
    // varint (bytes are signed in NBT byte arrays)
    let value = 0, shift = 0, b;
    do {
      b = data[i++] & 0xff;
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    const y = Math.floor(index / (w * l));
    const rem = index % (w * l);
    const z = Math.floor(rem / w);
    const x = rem % w;
    blocks.push({ pos: [x, y, z], state: value });
    index++;
  }
  if (index !== w * h * l) throw new Error(`Block count ${index} != ${w}x${h}x${l}`);
  return { size: [w, h, l], palette, blocks, dataVersion: root.DataVersion };
}
