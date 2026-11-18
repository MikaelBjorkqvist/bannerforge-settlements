// The roster follows the numbers (owner 2026-11-18): named people come, get hired, lose jobs and leave.
import assert from "node:assert/strict";
import * as Ro from "../.test-build/roster.mjs";

const s = { id: "t", name: "T", buildings: { market: [1] }, citizens: { free: 2, staffed: {} } };
const kinds = (ch) => ch.map((c) => c.kind).join(",");

// Two free settlers counted: two people are coming, with names.
assert.equal(kinds(Ro.reconcile(s)), "coming,coming");
const people = Ro.rosterOf(s);
assert.equal(people.length, 2);
assert.ok(people[0].name && people[0].name !== people[1].name || people[0].seed !== people[1].seed);
assert.equal(kinds(Ro.reconcile(s)), "", "nothing changes twice");

// One arrives; the market hires: the one already in town gets the job.
people[1].state = "here";
s.citizens.free = 1;
s.citizens.staffed = { market: [1] };
const ch = Ro.reconcile(s);
assert.equal(kinds(ch), "hired");
assert.equal(ch[0].person, people[1]);
assert.equal(people[1].job, "market:0");

// The market is gone: its worker is free again.
s.citizens.staffed = { market: [0] };
s.citizens.free = 2;
assert.equal(kinds(Ro.reconcile(s)), "fired");
assert.equal(people[1].job, undefined);

// Too few beds: people leave, those who haven't arrived first.
s.citizens.free = 1;
const left = Ro.reconcile(s);
assert.equal(kinds(left), "left");
assert.equal(left[0].person.state, "coming");
assert.equal(Ro.rosterOf(s).length, 1);

// A worker counted but nobody in the roster (old save): someone comes, already hired.
const old = { id: "o", name: "O", buildings: {}, citizens: { free: 0, staffed: { market: [1] } } };
const och = Ro.reconcile(old);
assert.equal(kinds(och), "coming");
assert.equal(och[0].person.job, "market:0");

// Death: out of the roster and the numbers.
Ro.removeDead(old, och[0].person);
assert.equal(old.citizens.staffed.market[0], 0);
assert.equal(Ro.rosterOf(old).length, 0);
const p = Ro.rosterOf(s)[0];
Ro.removeDead(s, p);
assert.equal(s.citizens.free, 0);

// Names are unique within a town (play-test 2026-11-18: two Gretas).
{
  const big = { id: "b", name: "B", buildings: {}, citizens: { free: 12, staffed: {} } };
  Ro.reconcile(big);
  const names = Ro.rosterOf(big).map((p) => p.name);
  assert.equal(new Set(names).size, names.length, names.join(","));
}

// Converted villagers: their own list, outside the numbers; reconcile leaves them alone; names stay unique.
{
  const v = { id: "v", name: "V", buildings: {}, citizens: { free: 1, staffed: {} } };
  Ro.reconcile(v);
  const a = Ro.addVillager(v, 5);
  const b = Ro.addVillager(v, 0, "Bob the Builder");
  assert.equal(a.state, "here");
  assert.equal(b.name, "Bob the Builder");
  assert.notEqual(a.name, Ro.rosterOf(v)[0].name);
  assert.equal(Ro.reconcile(v).length, 0);
  assert.equal(v.citizens.free, 1);
  Ro.removeVillager(v, a);
  assert.deepEqual(Ro.villagersOf(v), [b]);
}
