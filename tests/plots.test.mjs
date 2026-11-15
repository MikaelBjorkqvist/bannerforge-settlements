// Plot geometry and construction timing. Run with: npm test
import assert from "node:assert/strict";
import * as P from "../.test-build/plots.mjs";

// Entrance side (lz = w-1) ends up on the side the rotation names.
const f = (rot) => ({ x: 100, z: 200, w: 9, rot });
assert.deepEqual(P.toWorld(f(0), 0, 8), { x: 100, z: 208 }, "rot 0: front is south (max z)");
assert.deepEqual(P.toWorld(f(1), 0, 8), { x: 100, z: 200 }, "rot 1: front is west (min x)");
assert.deepEqual(P.toWorld(f(2), 0, 8), { x: 108, z: 200 }, "rot 2: front is north (min z)");
assert.deepEqual(P.toWorld(f(3), 0, 8), { x: 108, z: 208 }, "rot 3: front is east (max x)");
for (const rot of [0, 1, 2, 3]) {
  const seen = new Set();
  for (let lx = 0; lx < 9; lx++) for (let lz = 0; lz < 9; lz++) {
    const p = P.toWorld(f(rot), lx, lz);
    assert.ok(P.containsColumn(f(rot), p.x, p.z));
    seen.add(`${p.x},${p.z}`);
  }
  assert.equal(seen.size, 81, `rot ${rot} maps every column once`);
}

// Facing and footprint in front of the player, entrance toward the player.
assert.equal(P.facingOf(0, -1), 2);
assert.equal(P.facingOf(1, 0.2), 3);
const fp = P.footprintInFront(10.5, 10.5, 0, -1, 9, 0); // looking north
assert.equal(fp.rot, 0, "player looks north, entrance faces south (toward the player)");
assert.ok(fp.z + fp.w <= 10, "plot is in front of (north of) the player");
assert.equal(P.footprintInFront(10.5, 10.5, 0, -1, 9, 1).rot, 1, "Rotate turns it a quarter");
assert.equal(P.turn({ ...fp, rot: 3 }).rot, 0);

// Overlap with a 1-block gap, border.
const a = { x: 0, z: 0, w: 9, rot: 0 };
assert.ok(P.overlaps(a, { x: 9, z: 0, w: 9, rot: 0 }), "touching counts as overlap (gap 1)");
assert.ok(!P.overlaps(a, { x: 10, z: 0, w: 9, rot: 0 }));
assert.ok(P.insideBorder({ x: -4, z: -4, w: 9, rot: 0 }, 0, 0, 40));
assert.ok(!P.insideBorder({ x: 35, z: 0, w: 9, rot: 0 }, 0, 0, 40));

// Construction: 4 phases over a day, then finish.
// Phase 1 at once, phases 2 and 3 at 1/3 and 2/3 of the day, phase 4 together with completion.
assert.equal(P.stepsDue(0), 1);
assert.equal(P.stepsDue(7999), 1);
assert.equal(P.stepsDue(8000), 2);
assert.equal(P.stepsDue(16000), 3);
assert.equal(P.stepsDue(23999), 3, "the last phase waits for the full day");
assert.equal(P.stepsDue(24000), 4);
assert.equal(P.STEPS, 4);
assert.equal(P.stepsDue(-50), 1, "clock oddities never go below the first step");
const layers = [1, 2, 3, 4].map((p) => P.phaseLayers(p, 9));
assert.deepEqual(layers[0][0], 0);
assert.deepEqual(layers[3][1], 9);
for (let i = 1; i < 4; i++) assert.equal(layers[i][0], layers[i - 1][1], "phases tile the height");
assert.equal(P.minutesLeft(0), 20);
assert.equal(P.minutesLeft(24000), 0);

// Border points stay near the player and on the circle.
const pts = P.borderPointsNear(0, 0, 40, 40, 0, 10, 2);
assert.ok(pts.length > 0 && pts.every((p) => Math.abs(Math.hypot(p.x - 0.5, p.z - 0.5) - 40) < 0.01));

// Vanilla structure rectangles and the fixed border.
const farm = { x: 0, z: 0, wx: 9, wz: 3 };
assert.ok(P.rectOverlaps({ x: 8, z: 2, w: 5, rot: 0 }, farm));
assert.ok(!P.rectOverlaps({ x: 0, z: 3, w: 5, rot: 0 }, farm), "rectangles are not squared up");
assert.ok(P.rectContains(farm, 8, 2) && !P.rectContains(farm, 9, 0));
assert.equal(P.BORDER_RADIUS.village, P.BORDER_RADIUS.city, "owner: one border size for every tier");
