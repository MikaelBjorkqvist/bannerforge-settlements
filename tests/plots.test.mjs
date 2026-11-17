// Plot geometry and construction timing. Run with: npm test
import assert from "node:assert/strict";
import * as P from "../.test-build/plots.mjs";

// Entrance side (lz = w-1) ends up on the side the rotation names.
const f = (rot) => ({ x: 100, z: 200, w: 9, d: 9, rot });
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
const fp = P.footprintInFront(10.5, 10.5, 0, -1, 9, 9, 0); // looking north
assert.equal(fp.rot, 0, "player looks north, entrance faces south (toward the player)");
assert.ok(fp.z + fp.d <= 10, "plot is in front of (north of) the player");
assert.equal(P.footprintInFront(10.5, 10.5, 0, -1, 9, 9, 1).rot, 1, "Rotate turns it a quarter");
assert.equal(P.turn({ ...fp, rot: 3 }).rot, 0);

// Overlap with a 1-block gap, border.
const a = { x: 0, z: 0, w: 9, d: 9, rot: 0 };
assert.ok(P.overlaps(a, { x: 9, z: 0, w: 9, d: 9, rot: 0 }), "touching counts as overlap (gap 1)");
assert.ok(!P.overlaps(a, { x: 10, z: 0, w: 9, d: 9, rot: 0 }));
assert.ok(!P.overlaps(a, { x: 9, z: 0, w: 9, d: 9, rot: 0 }, 0), "gap 0: buildings may stand right next to each other");
assert.ok(P.overlaps(a, { x: 8, z: 0, w: 9, d: 9, rot: 0 }, 0), "but never share a block");
assert.ok(P.insideBorder({ x: -4, z: -4, w: 9, d: 9, rot: 0 }, 0, 0, 40));
assert.ok(!P.insideBorder({ x: 35, z: 0, w: 9, d: 9, rot: 0 }, 0, 0, 40));
// Square border: corners count (a circle would refuse this one), one block past the edge doesn't.
assert.ok(P.insideBorder({ x: 32, z: 32, w: 9, d: 9, rot: 0 }, 0, 0, 40), "square: the corner is inside");
assert.ok(!P.insideBorder({ x: 33, z: 32, w: 9, d: 9, rot: 0 }, 0, 0, 40));
assert.ok(P.insideBorder({ x: -40, z: -40, w: 9, d: 9, rot: 0 }, 0, 0, 40));
assert.ok(!P.insideBorder({ x: -41, z: 0, w: 9, d: 9, rot: 0 }, 0, 0, 40));
assert.deepEqual(P.townSquare(10, 20, 40), { x0: -30, z0: -20, x1: 51, z1: 61 });

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


// Rectangular plots (owner, 2026-11-16: a plot is as big as its structure). 7 wide, 9 deep.
const r = (rot) => ({ x: 100, z: 200, w: 7, d: 9, rot });
assert.deepEqual(P.extent(r(0)), { wx: 7, wz: 9 });
assert.deepEqual(P.extent(r(1)), { wx: 9, wz: 7 }, "entrance west: depth runs along x");
for (const rot of [0, 1, 2, 3]) {
  const seen = new Set();
  for (let lx = 0; lx < 7; lx++) for (let lz = 0; lz < 9; lz++) {
    const p = P.toWorld(r(rot), lx, lz);
    assert.ok(P.containsColumn(r(rot), p.x, p.z), `rot ${rot}: ${lx},${lz} inside`);
    seen.add(`${p.x},${p.z}`);
  }
  assert.equal(seen.size, 63, `rot ${rot} maps every column of a 7x9 plot once`);
}
assert.deepEqual(P.toWorld(r(1), 0, 8), { x: 100, z: 200 }, "rot 1: entrance row on the west edge");
assert.deepEqual(P.toWorld(r(3), 0, 8), { x: 108, z: 206 }, "rot 3: entrance row on the east edge");
// Turning keeps the centre, so a long plot doesn't jump sideways.
const t1 = P.turn(r(0));
assert.equal(t1.rot, 1);
assert.equal(t1.x + Math.floor(9 / 2), 100 + Math.floor(7 / 2));
assert.equal(t1.z + Math.floor(7 / 2), 200 + Math.floor(9 / 2));
// In front of the player, entrance toward the player, never on the player.
for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
  const g = P.footprintInFront(10.5, 10.5, dx, dz, 7, 9, 0);
  assert.ok(!P.containsColumn(g, 10, 10), `looking ${dx},${dz}: player not on the plot`);
}
assert.ok(!P.overlaps(r(0), { x: 108, z: 200, w: 9, d: 9, rot: 0 }), "7 wide + 1 gap: no overlap at x+8");
assert.ok(P.overlaps(r(1), { x: 108, z: 200, w: 9, d: 9, rot: 0 }), "turned, the 9-deep plot reaches x+8");

// Vanilla structure rectangles and the fixed border.
const farm = { x: 0, z: 0, wx: 9, wz: 3 };
assert.ok(P.rectOverlaps({ x: 8, z: 2, w: 5, d: 5, rot: 0 }, farm));
assert.ok(!P.rectOverlaps({ x: 0, z: 3, w: 5, d: 5, rot: 0 }, farm), "rectangles are not squared up");
assert.ok(P.rectContains(farm, 8, 2) && !P.rectContains(farm, 9, 0));
assert.deepEqual(P.BORDER_RADIUS, { village: 48, town: 72, city: 96 }, "owner 2026-11-17: 48 / 72 / 96");
assert.equal(P.BORDER, 96, "the largest border sets bell ownership and town spacing");

// Aiming (owner, 2026-11-17): the crosshair block is the middle of the entrance edge, the plot lies behind it.
for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
  const g = P.footprintAt(50, 80, dx, dz, 7, 9, 0);
  assert.deepEqual(P.toWorld(g, 3, 8), { x: 50, z: 80 }, `looking ${dx},${dz}: entrance on the aimed block`);
  // The plot is behind the aimed block, seen from the player.
  const c = P.toWorld(g, 3, 0);
  assert.ok((c.x - 50) * dx + (c.z - 80) * dz > 0, `looking ${dx},${dz}: the back is further away`);
}

