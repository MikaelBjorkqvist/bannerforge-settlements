// tools/import_structures.mjs on the owner's first export (assets-src/structures/imported/plains_house_s1).
import assert from "node:assert/strict";
import fs from "node:fs";
import { openMcstructure, buildVariant, toBlueprint } from "../tools/import_structures.mjs";
import { readTyped, plain } from "../tools/structures/nbt_typed.mjs";

const src = openMcstructure(fs.readFileSync(new URL("../assets-src/structures/imported/plains_house_s1.mcstructure", import.meta.url)));
const v = buildVariant(src, "red");
assert.ok(v);

// re-open what was written: its own size (7 x 8 x 9, no padding), still the same file layout
const out = openMcstructure(v.bytes);
assert.deepEqual(out.file.root.v.size.v.v, [7, 8, 9]);
// padding still works when asked for (x by z), and refuses a plot that is too small
assert.deepEqual(openMcstructure(buildVariant(src, "red", 9, 11).bytes).file.root.v.size.v.v, [9, 8, 11]);
assert.equal(buildVariant(src, "red", 5, 9), undefined);
const s = out.inner.root.v;
const pal = plain(s.palette).default.block_palette;
const pos = plain(s.palette).default.block_position_data;

// faction colours: red bed (14), red cushions (legacy 1), faction banners instead of white wall banners
const beds = Object.values(pos).map((e) => e.block_entity_data).filter((b) => b?.id === "Bed");
assert.equal(beds.length, 4);
assert.ok(beds.every((b) => b.color === 14));
const cushions = plain(s.entities).filter((e) => e.identifier === "minecraft:cushion");
assert.ok(cushions.length > 0 && cushions.every((e) => e.Variant === 1));
assert.ok(!Object.values(pos).some((e) => e.block_entity_data?.id === "Banner"), "white banners replaced");
const used = new Set(s.block_indices.v.v[0].filter((i) => i >= 0).map((i) => pal[i].name));
assert.ok(used.has("bannerforge_settlements:banner_red"));
assert.ok(!used.has("minecraft:wall_banner"));

// blueprint: entrance turned to the south (path at the front edge), name sign marked
const bp = toBlueprint(v.view, 2, 0);
assert.deepEqual(bp.size, [7, 8, 9]);
assert.equal(bp.layers[0].length, 9, "9 rows deep");
assert.ok(bp.layers.every((layer) => layer.every((row) => row.length === 7)), "7 wide");
const front = bp.layers[0][8]; // the front edge row
assert.match(bp.layers[0].slice(6).join(""), /[^.]/, "path in front");
// a quarter turn swaps width and depth
const q = toBlueprint(v.view, 1, 0);
assert.deepEqual(q.size, [9, 8, 7]);
assert.ok(q.layers.every((layer) => layer.length === 7 && layer.every((row) => row.length === 9)));
assert.ok(bp.palette.some((p) => p.sign && /wall_sign/.test(p.id)));
assert.ok(bp.palette.some((p) => p.id === "bannerforge_settlements:banner_red" && p.states["minecraft:cardinal_direction"] === "south"));
void front;
void readTyped;
