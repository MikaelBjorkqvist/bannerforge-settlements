// Turning block states with the plot (pure, unit-tested in tests/rotate.test.mjs).
// Blueprints are authored facing south; rot = quarter turns as in plots.ts (0 south, 1 west, 2 north, 3 east).

type States = Record<string, string | number | boolean>;

const CARDINAL = ["south", "west", "north", "east"]; // order of a quarter turn
const WEIRDO = ["east", "west", "south", "north"]; // stairs weirdo_direction 0..3, trapdoor direction 0..3
const BED = ["south", "west", "north", "east"]; // bed "direction" 0..3
const FACING6 = ["down", "up", "north", "south", "west", "east"]; // facing_direction 0..5

const turn = (dir: string, rot: number) => {
  const i = CARDINAL.indexOf(dir);
  return i < 0 ? dir : CARDINAL[(i + rot) % 4];
};

export function rotateStates(id: string, states: States | undefined, rot: number): States | undefined {
  if (!states || rot % 4 === 0) return states;
  const out: States = { ...states };
  for (const [key, value] of Object.entries(states)) {
    if (key === "minecraft:cardinal_direction" || key === "torch_facing_direction") {
      out[key] = turn(String(value), rot);
    } else if (key === "weirdo_direction" || (key === "direction" && /trapdoor/.test(id))) {
      out[key] = WEIRDO.indexOf(turn(WEIRDO[Number(value)], rot));
    } else if (key === "direction") {
      out[key] = BED.indexOf(turn(BED[Number(value)], rot));
    } else if (key === "facing_direction") {
      const f = FACING6[Number(value)];
      out[key] = f === "up" || f === "down" ? value : FACING6.indexOf(turn(f, rot));
    } else if (key === "pillar_axis" && rot % 2 === 1) {
      out[key] = value === "x" ? "z" : value === "z" ? "x" : value;
    } else if (key === "ground_sign_direction") {
      out[key] = (Number(value) + 4 * rot) % 16;
    }
  }
  return out;
}
