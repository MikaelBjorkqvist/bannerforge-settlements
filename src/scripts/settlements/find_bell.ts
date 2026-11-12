import { type Dimension, system, type Vector3 } from "@minecraft/server";

/**
 * Finds the nearest vanilla village bell around `origin` without freezing the game:
 * the scan runs as a job (system.runJob), a slice at a time.
 */
export function findNearestBell(dimension: Dimension, origin: Vector3, radius = 24, height = 6): Promise<Vector3 | undefined> {
  return new Promise((resolve) => {
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const oz = Math.floor(origin.z);

    function* scan(): Generator<void, void, void> {
      let best: Vector3 | undefined;
      let bestDist = Infinity;
      let checked = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dy = -height; dy <= height; dy++) {
            const pos = { x: ox + dx, y: oy + dy, z: oz + dz };
            try {
              if (dimension.getBlock(pos)?.typeId === "minecraft:bell") {
                const d = dx * dx + dy * dy + dz * dz;
                if (d < bestDist) {
                  best = pos;
                  bestDist = d;
                }
              }
            } catch {
              // Outside the world or in an unloaded chunk: skip.
            }
            if (++checked % 2000 === 0) yield;
          }
        }
      }
      resolve(best);
    }

    system.runJob(scan());
  });
}
