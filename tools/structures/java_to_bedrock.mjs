// Java structure-template block states -> Bedrock block permutations.
//
// translateState({ Name, Properties }) returns a list of *candidates*: [{ name, states }, ...] in order of preference,
// or null when the block should be skipped (structure markers). The in-game script tries each candidate with
// BlockPermutation.resolve() and keeps the first one the running Minecraft version accepts. This keeps the table
// working across Bedrock renames (e.g. "direction" -> "minecraft:cardinal_direction") without pinning one version.
//
// Notes
// - Connections that Bedrock computes itself are dropped: stair shape, fence / pane / iron bar sides, snowy grass.
// - Block-entity data (bed and banner colour, chest loot, flower-pot plant, sign text) can't be set through a
//   permutation; those blocks come out with their default look. See TEMPLATE_WORLD.md.
// - Written for DataVersion 1935-era (Java 1.14) village templates; extend the tables when new inputs need it.

const WOOD = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak"];
const COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];

// Direction encodings used by Bedrock blocks.
const FACING_DIRECTION = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };
const WEIRDO_DIRECTION = { east: 0, west: 1, south: 2, north: 3 };
const LEGACY_DIRECTION = { south: 0, west: 1, north: 2, east: 3 }; // beds, gates, looms, bells, lecterns, …
const DOOR_DIRECTION = { east: 0, south: 1, west: 2, north: 3 };
const TRAPDOOR_DIRECTION = { east: 0, west: 1, south: 2, north: 3 };

const bool = (v) => v === "true";
const c = (name, states = {}) => ({ name, states });

/** Java id (no namespace) -> Bedrock id for blocks whose name changed but that carry no states. */
const RENAMES = {
  grass: ["short_grass", "tallgrass"],
  grass_path: ["grass_path", "dirt_path"],
  bricks: ["brick_block", "bricks"],
  terracotta: ["hardened_clay", "terracotta"],
  melon: ["melon_block"],
  snow_block: ["snow"],
  stonecutter: ["stonecutter_block"],
  dandelion: ["dandelion", "yellow_flower"],
  dirt_path: ["grass_path", "dirt_path"],
  cobweb: ["web"],
  dead_bush: ["deadbush", "dead_bush"],
  rooted_dirt: ["dirt_with_roots", "rooted_dirt"],
  note_block: ["noteblock"],
  nether_quartz_ore: ["quartz_ore"],
  poppy: ["poppy", "red_flower"],
};

/** Legacy (pre-flattening) fallbacks for simple blocks, used when the flat name isn't known to the game. */
const LEGACY_SIMPLE = {
  granite: c("stone", { stone_type: "granite" }),
  diorite: c("stone", { stone_type: "diorite" }),
  stone_bricks: c("stonebrick", { stone_brick_type: "default" }),
  cut_sandstone: c("sandstone", { sand_stone_type: "cut" }),
  chiseled_sandstone: c("sandstone", { sand_stone_type: "heiroglyphs" }),
  smooth_sandstone: c("sandstone", { sand_stone_type: "smooth" }),
  oxeye_daisy: c("red_flower", { flower_type: "oxeye" }),
  short_grass: c("tallgrass", { tall_grass_type: "tall" }),
  fern: c("tallgrass", { tall_grass_type: "fern" }),
};

function stairs(java, p) {
  const name = { cobblestone_stairs: "stone_stairs", stone_stairs: "normal_stone_stairs" }[java] ?? java;
  return [c(name, { weirdo_direction: WEIRDO_DIRECTION[p.facing] ?? 0, upside_down_bit: p.half === "top" })];
}

function slab(java, p) {
  const base = java === "stone_slab" ? "normal_stone" : java.replace(/_slab$/, "");
  java = `${base}_slab`;
  if (p.type === "double") return [c(`${base}_double_slab`), c(`${base}_slab`, { "minecraft:vertical_half": "bottom" })];
  return [c(java, { "minecraft:vertical_half": p.type === "top" ? "top" : "bottom" })];
}

function door(java, p) {
  const name = java === "oak_door" ? "wooden_door" : java;
  const common = { upper_block_bit: p.half === "upper", open_bit: bool(p.open), door_hinge_bit: p.hinge === "right" };
  return [
    c(name, { ...common, "minecraft:cardinal_direction": p.facing }),
    c(name, { ...common, direction: DOOR_DIRECTION[p.facing] ?? 0 }),
  ];
}

function trapdoor(java, p) {
  const name = java === "oak_trapdoor" ? "trapdoor" : java;
  return [c(name, { direction: TRAPDOOR_DIRECTION[p.facing] ?? 0, open_bit: bool(p.open), upside_down_bit: p.half === "top" })];
}

function fenceGate(java, p) {
  const name = java === "oak_fence_gate" ? "fence_gate" : java;
  const common = { open_bit: bool(p.open), in_wall_bit: bool(p.in_wall) };
  return [
    c(name, { ...common, "minecraft:cardinal_direction": p.facing }),
    c(name, { ...common, direction: LEGACY_DIRECTION[p.facing] ?? 0 }),
  ];
}

/** Blocks that face one of four horizontal directions, Java facing = Bedrock cardinal direction. */
function cardinal(name, p, extra = {}, legacy = "facing_direction") {
  const legacyValue = legacy === "facing_direction" ? FACING_DIRECTION[p.facing] : LEGACY_DIRECTION[p.facing];
  return [c(name, { ...extra, "minecraft:cardinal_direction": p.facing }), c(name, { ...extra, [legacy]: legacyValue ?? 0 })];
}

function wall(java, p) {
  const side = (v) => (bool(v) ? "short" : "none");
  const states = {
    wall_post_bit: p.up !== "false",
    wall_connection_type_north: side(p.north),
    wall_connection_type_south: side(p.south),
    wall_connection_type_east: side(p.east),
    wall_connection_type_west: side(p.west),
  };
  return [c(java, states), c("cobblestone_wall", { ...states, wall_block_type: java.replace(/_wall$/, "") })];
}

const BELL_ATTACHMENT = { floor: "standing", ceiling: "hanging", single_wall: "side", double_wall: "multiple" };
const GRINDSTONE_ATTACHMENT = { floor: "standing", ceiling: "hanging", wall: "side" };
const BUTTON_FACE = { floor: "up", ceiling: "down" };

/**
 * @param {{Name: string, Properties?: Record<string,string>}} java
 * @returns {{name: string, states: Record<string, string|number|boolean>}[] | null}
 */
export function translateState(java) {
  const id = java.Name.replace(/^minecraft:/, "");
  const p = java.Properties ?? {};

  // Structure markers: never placed.
  if (id === "jigsaw" || id === "structure_block" || id === "structure_void") return null;
  if (id === "air" || id === "cave_air" || id === "void_air") return [c("air")];

  if (id.startsWith("potted_")) return [c("flower_pot")]; // plant lives in a block entity

  // --- families -------------------------------------------------------------------------------
  if (id.endsWith("_stairs")) return stairs(id, p);
  if (id.endsWith("_slab")) return slab(id, p);
  if (id.endsWith("_door")) return door(id, p);
  if (id.endsWith("_trapdoor")) return trapdoor(id, p);
  if (id.endsWith("_fence_gate")) return fenceGate(id, p);
  if (id.endsWith("_wall") && !id.endsWith("_sign") && !id.includes("banner")) return wall(id, p);

  if (id.endsWith("_bed")) {
    // Colour is block-entity data (defaults to red in Bedrock).
    const states = { head_piece_bit: p.part === "head", occupied_bit: false };
    return [c("bed", { ...states, "minecraft:cardinal_direction": p.facing }), c("bed", { ...states, direction: LEGACY_DIRECTION[p.facing] ?? 0 })];
  }

  const woodLog = id.match(/^(stripped_)?(\w+?)_(log|wood)$/);
  if (woodLog && WOOD.includes(woodLog[2])) return [c(id, { pillar_axis: p.axis ?? "y" })];
  if (id === "hay_block") return [c(id, { pillar_axis: p.axis ?? "y" })];

  const leaves = id.match(/^(\w+)_leaves$/);
  if (leaves) {
    const name = id === "flowering_azalea_leaves" ? "azalea_leaves_flowered" : id;
    return [c(name, { persistent_bit: p.persistent === "true", update_bit: false })];
  }

  if (id.endsWith("_sapling")) return [c(id, { age_bit: p.stage === "1" })];
  // Flattened families, with the pre-flattening form as a fallback.
  const legacyColor = (col) => (col === "light_gray" ? "silver" : col);
  if (id.endsWith("_fence")) return [c(id), c("fence", { wood_type: id.replace(/_fence$/, "") })];
  if (id.endsWith("_planks")) return [c(id), c("planks", { wood_type: id.replace(/_planks$/, "") })];
  if (id.endsWith("_wool")) return [c(id), c("wool", { color: legacyColor(id.replace(/_wool$/, "")) })];
  if (id.endsWith("_carpet")) return [c(id), c("carpet", { color: legacyColor(id.replace(/_carpet$/, "")) })];
  if (id.endsWith("_stained_glass_pane")) return [c(id), c("stained_glass_pane", { color: legacyColor(id.replace(/_stained_glass_pane$/, "")) })];

  if (id.endsWith("_terracotta") && !id.endsWith("_glazed_terracotta")) {
    const color = id.replace(/_terracotta$/, "");
    return [c(id), c("stained_hardened_clay", { color: color === "light_gray" ? "silver" : color })];
  }
  if (id.endsWith("_glazed_terracotta")) {
    const name = id === "light_gray_glazed_terracotta" ? "silver_glazed_terracotta" : id;
    return [c(name, { facing_direction: FACING_DIRECTION[p.facing] ?? 2 })];
  }

  if (id.endsWith("_pressure_plate")) {
    const name = id === "oak_pressure_plate" ? "wooden_pressure_plate" : id;
    return [c(name, { redstone_signal: 0 })];
  }

  if (id.endsWith("_button")) {
    const name = id === "oak_button" ? "wooden_button" : id;
    const dir = BUTTON_FACE[p.face] ?? p.facing;
    return [c(name, { facing_direction: FACING_DIRECTION[dir] ?? 2, button_pressed_bit: false })];
  }

  if (id.endsWith("_wall_banner")) return [c("wall_banner", { facing_direction: FACING_DIRECTION[p.facing] ?? 2 })];
  if (id.endsWith("_banner")) return [c("standing_banner", { ground_sign_direction: Number(p.rotation ?? 0) })];
  if (id.endsWith("_wall_sign")) {
    const name = id === "oak_wall_sign" ? "wall_sign" : id === "dark_oak_wall_sign" ? "darkoak_wall_sign" : id;
    return [c(name, { facing_direction: FACING_DIRECTION[p.facing] ?? 2 })];
  }

  // --- newer (1.17–1.21) blocks seen in third-party schematics -------------------------------
  if (id.endsWith("_wall_hanging_sign")) {
    const name = id.replace("_wall_hanging_sign", "_hanging_sign");
    return [c(name, { hanging: false, attached_bit: false, facing_direction: FACING_DIRECTION[p.facing] ?? 2, ground_sign_direction: 0 })];
  }
  if (id.endsWith("_hanging_sign")) {
    return [c(id, { hanging: true, attached_bit: p.attached === "true", ground_sign_direction: Number(p.rotation ?? 0), facing_direction: 2 })];
  }
  if (id.endsWith("_sign")) {
    // standing sign: oak is just "standing_sign"
    const name = id === "oak_sign" ? "standing_sign" : id === "dark_oak_sign" ? "darkoak_standing_sign" : id.replace(/_sign$/, "_standing_sign");
    return [c(name, { ground_sign_direction: Number(p.rotation ?? 0) })];
  }
  if (/(^|_)candle$/.test(id)) return [c(id, { candles: Math.max(0, Number(p.candles ?? 1) - 1), lit: bool(p.lit) })];
  if (id.endsWith("copper_bulb")) return [c(id, { lit: bool(p.lit), powered_bit: bool(p.powered) })];
  if (id.endsWith("_amethyst_bud") || id === "amethyst_cluster") return [c(id, { "minecraft:block_face": p.facing ?? "up" })];
  if (id.endsWith("_coral_fan")) return [c(id, { coral_fan_direction: 0 })];
  if (id.endsWith("mushroom_block") || id === "mushroom_stem") {
    const name = id === "mushroom_stem" ? "mushroom_stem" : id;
    return [c(name, { huge_mushroom_bits: id === "mushroom_stem" ? 15 : 14 })];
  }

  // Anything else with an axis (logs of any kind, deepslate, bone, chains, basalt…)
  if (p.axis && !["nether_portal"].includes(id)) {
    if (id === "chain") return [c("chain", { pillar_axis: p.axis }), c("iron_chain", { pillar_axis: p.axis })];
    return [c(id, { pillar_axis: p.axis })];
  }

  // --- single blocks --------------------------------------------------------------------------
  switch (id) {
    case "grass_block": return [c("grass_block"), c("grass")];
    case "tall_grass":
    case "large_fern": {
      const upper = p.half === "upper";
      return [c(id, { upper_block_bit: upper }), c("double_plant", { upper_block_bit: upper, double_plant_type: id === "tall_grass" ? "grass" : "fern" })];
    }
    case "torch": return [c("torch", { torch_facing_direction: "top" })];
    case "wall_torch": return [c("torch", { torch_facing_direction: p.facing })];
    case "lantern": return [c("lantern", { hanging: bool(p.hanging) })];
    case "ladder": return [c("ladder", { facing_direction: FACING_DIRECTION[p.facing] ?? 2 })];
    case "chest": return cardinal("chest", p);
    case "furnace":
    case "blast_furnace":
    case "smoker": return cardinal(id, p);
    case "barrel": return [c("barrel", { facing_direction: FACING_DIRECTION[p.facing] ?? 1, open_bit: bool(p.open) })];
    case "lectern": return cardinal("lectern", p, { powered_bit: false }, "direction");
    case "loom": return cardinal("loom", p, {}, "direction");
    case "bell": return cardinal("bell", p, { attachment: BELL_ATTACHMENT[p.attachment] ?? "standing", toggle_bit: false }, "direction");
    case "grindstone": return cardinal("grindstone", p, { attachment: GRINDSTONE_ATTACHMENT[p.face] ?? "standing" }, "direction");
    case "stonecutter": return cardinal("stonecutter_block", p);
    case "campfire": return cardinal("campfire", p, { extinguished: p.lit === "false" }, "direction");
    case "brewing_stand": return [c("brewing_stand")];
    case "cauldron":
    case "water_cauldron": return [c("cauldron", { fill_level: Math.min(6, Number(p.level ?? 0) * 2), cauldron_liquid: "water" })];
    case "composter": return [c("composter", { composter_fill_level: Number(p.level ?? 0) })];
    case "farmland": return [c("farmland", { moisturized_amount: Number(p.moisture ?? 0) })];
    case "wheat":
    case "carrots":
    case "potatoes":
    case "beetroots": return [c(id === "beetroots" ? "beetroot" : id, { growth: Number(p.age ?? 0) })];
    case "melon_stem":
    case "pumpkin_stem": return [c(id, { growth: Number(p.age ?? 0), facing_direction: 1 })];
    case "attached_melon_stem":
    case "attached_pumpkin_stem":
      return [c(id.replace("attached_", ""), { growth: 7, facing_direction: FACING_DIRECTION[p.facing] ?? 1 })];
    case "cactus": return [c("cactus", { age: Number(p.age ?? 0) })];
    case "pumpkin": return [c("pumpkin")];
    case "snow": return [c("snow_layer", { height: Math.max(0, Number(p.layers ?? 1) - 1), covered_bit: false })];
    case "water":
    case "lava": return [c(id, { liquid_depth: Number(p.level ?? 0) })];
    case "sea_pickle": return [c("sea_pickle", { cluster_count: Math.max(0, Number(p.pickles ?? 1) - 1), dead_bit: p.waterlogged !== "true" })];
    case "iron_bars":
    case "glass_pane": return [c(id)];
    case "fire":
    case "soul_fire":
    case "light":
      return null; // fire would spread through the template world; light blocks are invisible helpers
    case "soul_lantern": return [c("soul_lantern", { hanging: bool(p.hanging) })];
    case "trapped_chest":
    case "ender_chest": return cardinal(id, p);
    case "carved_pumpkin":
    case "jack_o_lantern": return [c(id === "jack_o_lantern" ? "lit_pumpkin" : id, { "minecraft:cardinal_direction": p.facing }), c(id, { "minecraft:cardinal_direction": p.facing })];
    case "anvil": return [c("anvil", { "minecraft:cardinal_direction": p.facing, damage: "undamaged" })];
    case "hopper": return [c("hopper", { facing_direction: FACING_DIRECTION[p.facing] ?? 0, toggle_bit: false })];
    case "lever": {
      const dir = p.face === "floor" ? (p.facing === "north" || p.facing === "south" ? "up_north_south" : "up_east_west") : p.face === "ceiling" ? (p.facing === "north" || p.facing === "south" ? "down_north_south" : "down_east_west") : p.facing;
      return [c("lever", { lever_direction: dir, open_bit: bool(p.powered) })];
    }
    case "rail":
    case "detector_rail": {
      const shapes = ["north_south", "east_west", "ascending_east", "ascending_west", "ascending_north", "ascending_south", "south_east", "south_west", "north_west", "north_east"];
      const states = { rail_direction: Math.max(0, shapes.indexOf(p.shape)) };
      if (id === "detector_rail") Object.assign(states, { rail_data_bit: false });
      return [c(id, states)];
    }
    case "tripwire": return [c("trip_wire", { attached_bit: bool(p.attached), disarmed_bit: bool(p.disarmed), powered_bit: false, suspended_bit: true })];
    case "tripwire_hook": return [c("tripwire_hook", { direction: LEGACY_DIRECTION[p.facing] ?? 0, attached_bit: bool(p.attached), powered_bit: false })];
    case "turtle_egg": return [c("turtle_egg", { turtle_egg_count: ["one_egg", "two_egg", "three_egg", "four_egg"][Number(p.eggs ?? 1) - 1] ?? "one_egg", cracked_state: "no_cracks" })];
    case "vine": {
      // bits: south 1, west 2, north 4, east 8
      const bits = (bool(p.south) ? 1 : 0) | (bool(p.west) ? 2 : 0) | (bool(p.north) ? 4 : 0) | (bool(p.east) ? 8 : 0);
      return [c("vine", { vine_direction_bits: bits })];
    }
    case "glow_lichen": {
      // bits: down 1, up 2, south 4, west 8, north 16, east 32
      const bits = (bool(p.down) ? 1 : 0) | (bool(p.up) ? 2 : 0) | (bool(p.south) ? 4 : 0) | (bool(p.west) ? 8 : 0) | (bool(p.north) ? 16 : 0) | (bool(p.east) ? 32 : 0);
      return [c("glow_lichen", { multi_face_direction_bits: bits })];
    }
    case "pointed_dripstone": return [c("pointed_dripstone", { dripstone_thickness: p.thickness ?? "tip", hanging: p.vertical_direction === "down" })];
    case "lightning_rod": return [c("lightning_rod", { facing_direction: FACING_DIRECTION[p.facing] ?? 1 })];
    case "beehive":
    case "bee_nest": return [c(id, { direction: LEGACY_DIRECTION[p.facing] ?? 0, honey_level: Number(p.honey_level ?? 0) })];
    case "decorated_pot": return [c("decorated_pot", { direction: LEGACY_DIRECTION[p.facing] ?? 0 })];
    case "chiseled_bookshelf": {
      let books = 0;
      for (let k = 0; k < 6; k++) if (p[`slot_${k}_occupied`] === "true") books |= 1 << k;
      return [c("chiseled_bookshelf", { direction: LEGACY_DIRECTION[p.facing] ?? 0, books_stored: books })];
    }
    case "cocoa": return [c("cocoa", { direction: LEGACY_DIRECTION[p.facing] ?? 0, age: Number(p.age ?? 0) })];
    case "sweet_berry_bush": return [c("sweet_berry_bush", { growth: Number(p.age ?? 0) })];
    case "nether_wart": return [c("nether_wart", { age: Number(p.age ?? 0) })];
    case "scaffolding": return [c("scaffolding", { stability: Number(p.distance ?? 0), stability_check: false })];
    case "target": return [c("target")];
    case "lilac":
    case "rose_bush":
    case "peony":
    case "sunflower": {
      const upper = p.half === "upper";
      const legacy = { lilac: "syringa", rose_bush: "rose", peony: "paeonia", sunflower: "sunflower" }[id];
      return [c(id, { upper_block_bit: upper }), c("double_plant", { upper_block_bit: upper, double_plant_type: legacy })];
    }
  }

  const renamed = RENAMES[id];
  if (renamed) return renamed.map((n) => c(n));

  const out = [c(id)];
  if (LEGACY_SIMPLE[id]) out.push(LEGACY_SIMPLE[id]);
  return out;
}

/** Parses "minecraft:oak_stairs[facing=east,half=bottom]" (jigsaw final_state) into a Java state. */
export function parseStateString(s) {
  const m = s.match(/^([^[]+)(?:\[(.*)\])?$/);
  if (!m) return { Name: s };
  const Properties = {};
  for (const kv of (m[2] ?? "").split(",").filter(Boolean)) {
    const [k, v] = kv.split("=");
    Properties[k] = v;
  }
  return { Name: m[1].includes(":") ? m[1] : `minecraft:${m[1]}`, Properties };
}

/**
 * Converts a parsed Java structure template into a placement-ready Bedrock description.
 * - Jigsaw blocks become their `final_state`.
 * - `dy` is the vertical offset that puts the template's street connection on the surface (see TEMPLATE_WORLD.md):
 *   a street jigsaw at height j means template y = 0 sits at surface + 1 - j.
 * - Air is kept only below the surface (so sunken floors get carved out of the ground); above it, air is skipped.
 *
 * @returns {{ size: number[], dy: number, palette: object[][], blocks: number[] }} blocks = flat [x,y,z,paletteIndex,…]
 */
export function convertTemplate(nbt, { carveBelowSurface = true } = {}) {
  const javaPalette = nbt.palette ?? nbt.palettes?.[0] ?? [];
  const palette = [];
  const index = new Map();
  const add = (javaState) => {
    const candidates = translateState(javaState);
    if (!candidates) return -1;
    const key = JSON.stringify(candidates);
    if (!index.has(key)) {
      index.set(key, palette.length);
      palette.push(candidates);
    }
    return index.get(key);
  };

  let streetJigsawY = null;
  for (const b of nbt.blocks) {
    const s = javaPalette[b.state];
    if (s?.Name !== "minecraft:jigsaw" || !b.nbt) continue;
    const pool = String(b.nbt.target_pool ?? "");
    const type = String(b.nbt.attachement_type ?? b.nbt.name ?? "");
    const horizontal = !["up", "down"].includes(s.Properties?.facing);
    if (horizontal && (pool.includes("/streets") || type.endsWith("building_entrance") || type.endsWith("street"))) {
      streetJigsawY = streetJigsawY === null ? b.pos[1] : Math.min(streetJigsawY, b.pos[1]);
    }
  }
  const dy = streetJigsawY === null ? 0 : 1 - streetJigsawY;

  const blocks = [];
  for (const b of nbt.blocks) {
    let s = javaPalette[b.state];
    if (!s) continue;
    if (s.Name === "minecraft:jigsaw") {
      const fs = b.nbt?.final_state;
      if (!fs) continue;
      s = parseStateString(String(fs));
    }
    const idx = add(s);
    if (idx < 0) continue;
    const isAir = palette[idx][0].name === "air";
    if (isAir && (!carveBelowSurface || b.pos[1] + dy > 0)) continue;
    blocks.push(b.pos[0], b.pos[1], b.pos[2], idx);
  }
  return { size: [...nbt.size], dy, palette, blocks };
}

export const _internal = { COLORS, FACING_DIRECTION, WEIRDO_DIRECTION, LEGACY_DIRECTION };
