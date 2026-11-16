// tools/import_structures.mjs on the owner's first export (assets-src/structures/imported/plains_house_s1).
import assert from "node:assert/strict";
import fs from "node:fs";
import { openMcstructure, buildVariant, toBlueprint } from "../tools/import_structures.mjs";
import { readTyped, plain } from "../tools/structures/nbt_typed.mjs";

const src = openMcstructure(fs.readFileSync(new URL("../assets-src/structures/imported/plains_house_s1.mcstructure", import.meta.url)));
const v = buildVariant(src, 13, "red");
assert.ok(v, "fits an M plot");

// re-open what was written: padded to 13 x 8 x 13, still the same file layout
const out = openMcstructure(v.bytes);
assert.deepEqual(out.file.root.v.size.v.v, [13, 8, 13]);
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
assert.deepEqual(bp.size, [13, 8, 13]);
const front = bp.layers[0][10]; // a row near the front (z = 12 is the edge)
assert.match(bp.layers[0].slice(9).join(""), /[^.]/, "path in front");
assert.ok(bp.palette.some((p) => p.sign && /wall_sign/.test(p.id)));
assert.ok(bp.palette.some((p) => p.id === "bannerforge_settlements:banner_red" && p.states["minecraft:cardinal_direction"] === "south"));
void front;
void readTyped;
