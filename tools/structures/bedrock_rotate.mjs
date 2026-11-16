// Quarter turns of Bedrock block states, as src/scripts/settlements/rotate.ts, plus the connection states that
// newer exports carry (glass panes, fences, walls). rot = clockwise quarter turns seen from above
// (south -> west -> north -> east), the same as plots.ts. Pure.
const CARDINAL = ["south", "west", "north", "east"];
const WEIRDO = ["east", "west", "south", "north"];
const LEGACY = ["south", "west", "north", "east"]; // bed / bookshelf "direction" 0..3
const FACING6 = ["down", "up", "north", "south", "west", "east"];
const turn = (dir, rot) => { const i = CARDINAL.indexOf(dir); return i < 0 ? dir : CARDINAL[(i + rot) % 4]; };

export function rotateBedrockStates(id, states, rot) {
  rot = ((rot % 4) + 4) % 4;
  if (!states || rot === 0) return states;
  const out = { ...states };
  for (const [key, value] of Object.entries(states)) {
    if (key === "minecraft:cardinal_direction" || key === "torch_facing_direction") out[key] = turn(String(value), rot);
    else if (key === "weirdo_direction" || (key === "direction" && /trapdoor/.test(id))) out[key] = WEIRDO.indexOf(turn(WEIRDO[Number(value)], rot));
    else if (key === "direction") out[key] = LEGACY.indexOf(turn(LEGACY[Number(value)], rot));
    else if (key === "facing_direction") {
      const f = FACING6[Number(value)];
      out[key] = f === "up" || f === "down" ? value : FACING6.indexOf(turn(f, rot));
    } else if (key === "pillar_axis" && rot % 2 === 1) out[key] = value === "x" ? "z" : value === "z" ? "x" : value;
    else if (key === "ground_sign_direction") out[key] = (Number(value) + 4 * rot) % 16;
  }
  // connection_<dir> / wall_connection_type_<dir>: move each value to the turned side
  for (const prefix of ["minecraft:connection_", "wall_connection_type_"]) {
    const sides = CARDINAL.filter((d) => `${prefix}${d}` in states);
    for (const d of sides) out[`${prefix}${turn(d, rot)}`] = states[`${prefix}${d}`];
  }
  return out;
}

/** Local position after turning a w x l footprint by rot (same mapping as plots.ts toWorld, for square or not). */
export function rotatePos(x, z, w, l, rot) {
  switch (((rot % 4) + 4) % 4) {
    case 0: return [x, z];
    case 1: return [l - 1 - z, x];
    case 2: return [w - 1 - x, l - 1 - z];
    default: return [z, w - 1 - x];
  }
}
