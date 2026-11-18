// The townsfolk as named people (owner 2026-11-18, M2.5 step 2). The numbers in Citizens (free, staffed) stay the
// rules' source of truth; the roster gives each counted person a name and, once they have walked into town, an entity
// in the world. reconcile() brings the roster in line with the numbers after any rule ran and says what changed, so
// the world side (people.ts) can move entities and tell the player. Pure: no @minecraft imports (unit-tested).

import { pickName } from "./npc.js";
import { citizensOf } from "./rules.js";
import type { Person, Settlement } from "./types.js";

export type Change =
  | { kind: "coming"; person: Person }
  | { kind: "hired"; person: Person; job: string }
  | { kind: "fired"; person: Person; job: string }
  | { kind: "left"; person: Person };

/** "market:0" style key of a building instance's worker slot. */
export const jobKey = (id: string, index: number) => `${id}:${index}`;
export const jobBuilding = (job: string) => job.slice(0, job.lastIndexOf(":"));

export const rosterOf = (s: Settlement): Person[] => (citizensOf(s).people ??= []);

/** A new person with a name nobody in town has yet (if the name list allows). */
function newPerson(s: Settlement): Person {
  const c = citizensOf(s);
  const taken = new Set(rosterOf(s).map((p) => p.name));
  let seed = "";
  let name = "";
  for (let tries = 0; tries < 12; tries++) {
    c.serial = (c.serial ?? 0) + 1;
    seed = `${s.id}:${c.serial}`;
    name = pickName(seed);
    if (!taken.has(name)) break;
  }
  return { seed, name, state: "coming" };
}

/**
 * Makes the roster match the numbers: every worker slot holds as many people as staffed says, and as many people are
 * without a job as there are free settlers. New people are "coming" (they walk in later); extra people leave, those
 * who haven't arrived yet first, then the newest.
 */
export function reconcile(s: Settlement): Change[] {
  const c = citizensOf(s);
  const people = rosterOf(s);
  const out: Change[] = [];

  // Workers: exactly staffed[id][i] people per slot.
  const want = new Map<string, number>();
  for (const [id, list] of Object.entries(c.staffed)) list.forEach((n, i) => n && want.set(jobKey(id, i), n));
  const held = new Map<string, Person[]>();
  for (const p of people) if (p.job) (held.get(p.job) ?? held.set(p.job, []).get(p.job)!).push(p);
  for (const [job, list] of held) {
    for (let n = list.length; n > (want.get(job) ?? 0); n--) {
      const p = list.pop()!;
      p.job = undefined;
      out.push({ kind: "fired", person: p, job });
    }
  }
  const unemployed = () => people.filter((p) => !p.job);
  for (const [job, n] of want) {
    for (let have = held.get(job)?.length ?? 0; have < n; have++) {
      const pool = unemployed();
      // People already in town first, so a shop gets its worker as soon as possible.
      const p = pool.find((q) => q.state === "here") ?? pool.find((q) => q.state === "walking") ?? pool[0];
      if (p) {
        p.job = job;
        out.push({ kind: "hired", person: p, job });
      } else {
        const q = newPerson(s);
        q.job = job;
        people.push(q);
        out.push({ kind: "coming", person: q });
      }
    }
  }

  // Free settlers: as many people without a job as c.free.
  let free = unemployed();
  for (let n = free.length; n < c.free; n++) {
    const q = newPerson(s);
    people.push(q);
    out.push({ kind: "coming", person: q });
  }
  free = unemployed();
  if (free.length > c.free) {
    const order = [...free.filter((p) => p.state === "coming"), ...free.filter((p) => p.state !== "coming").reverse()];
    for (const p of order.slice(0, free.length - c.free)) {
      people.splice(people.indexOf(p), 1);
      out.push({ kind: "left", person: p });
    }
  }
  return out;
}

/** A person died (or was turned into a zombie): they leave the roster and the numbers. */
export function removeDead(s: Settlement, p: Person): void {
  const c = citizensOf(s);
  const people = rosterOf(s);
  const i = people.indexOf(p);
  if (i < 0) return;
  people.splice(i, 1);
  if (p.job) {
    const id = jobBuilding(p.job);
    const index = Number(p.job.slice(p.job.lastIndexOf(":") + 1));
    const list = c.staffed[id];
    if (list?.[index]) list[index] -= 1;
  } else {
    c.free = Math.max(0, c.free - 1);
  }
}
