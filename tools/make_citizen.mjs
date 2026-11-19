// Builds packs/BP/entities/citizen.json: the full vanilla villager_v2 (beds, job sites, trading, breeding, schedules)
// under our identifier, plus BannerForge roles on top. Lab test 2026-11-18 showed an exact copy keeps the whole village
// routine; our first hand-written citizen missed parts of it. So we never hand-edit the result: change this file, run
//   node tools/make_citizen.mjs <path to a bedrock-samples checkout>
// and commit the output. Behaviour JSON comes from Mojang's bedrock-samples (EULA), names changed; see docs/ASSETS.md.
//
// Roles (owner decisions 2026-11-18, docs/DESIGN.md):
//   settler  - arrives jobless (never a nitwit), then lives the vanilla life: takes a vanilla job block, trades, breeds.
//   worker   - staff of one of our buildings: by day within 8 blocks of its door, at night home in bed.
//   guard    - garrison of a military building: no trading, no breeding, no fleeing; fights monsters near its post.
import fs from "node:fs";
import path from "node:path";

const SAMPLES = process.argv[2];
if (!SAMPLES) throw new Error("usage: node tools/make_citizen.mjs <bedrock-samples path>");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ID = "bannerforge_settlements:citizen";
const P = "bannerforge_settlements:";

/** Mojang's sample JSON has // comments; strip them outside strings. */
function readJsonc(file) {
  const src = fs.readFileSync(file, "utf8");
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += src[++i];
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }
  return JSON.parse(out);
}

const vanilla = readJsonc(path.join(SAMPLES, "behavior_pack/entities/villager_v2.json"));
const doc = JSON.parse(JSON.stringify(vanilla).replaceAll('"minecraft:villager_v2"', JSON.stringify(ID)));
const ent = doc["minecraft:entity"];
const groups = ent.component_groups;
const events = ent.events;

// --- description: our identifier and look/role properties -------------------------------------------------------
ent.description = {
  identifier: ID,
  is_spawnable: false,
  is_summonable: true,
  properties: {
    [`${P}outfit`]: { type: "int", range: [0, 3], default: 0, client_sync: true },
    [`${P}role`]: { type: "enum", values: ["villager", "settler", "worker", "guard", "applicant"], default: "villager", client_sync: true },
    [`${P}rank`]: { type: "int", range: [1, 3], default: 1, client_sync: true },
  },
};

// --- arriving: a new settler walks in from the border (owner 2026-11-18) -------------------------------------------
// The vanilla raid goal "move to village" walks a mob to the nearest village; the script removes this group once the
// settler is in town (bannerforge:arrived). If they die on the way, they die (no fallback).
groups[`${P}arriving`] = {
  "minecraft:behavior.move_to_village": { priority: 2, speed_multiplier: 0.8, goal_radius: 6 },
};

// --- our soldiers never hurt townsfolk (a stray arrow, a wide swing): first damage_sensor trigger wins ------------
ent.components["minecraft:damage_sensor"].triggers.unshift({
  on_damage: { filters: { test: "is_family", subject: "other", value: "bannerforge_soldier" } },
  deals_damage: "no",
});

// --- the groups a role change has to clear --------------------------------------------------------------------------
// Do exactly what vanilla's own job change (minecraft:become_<job>) does: swap the profession, its trades and its
// daily plan, and leave the time-of-day state groups (wander/gather/home/bed_schedule_villager, work_schedule_<job>)
// alone. Lab 2026-11-18: clearing those too left citizens awake at night, because the scheduler only fires an event
// when the time window changes, so nothing re-added the bed behaviour.
const PROFESSIONS = ["armorer", "butcher", "cartographer", "cleric", "farmer", "fisherman", "fletcher", "leatherworker",
  "librarian", "mason", "shepherd", "toolsmith", "weaponsmith", "nitwit", "unskilled"];
const PLANS = ["basic_schedule", "work_schedule", "jobless_schedule", "farmer_schedule", "librarian_schedule",
  "fisher_schedule", "child_schedule"];
const CLEAR = [...PROFESSIONS, ...PLANS, "behavior_peasant", "behavior_non_peasant", "baby", "job_specific_goals",
  "trade_components", "bannerforge_settlements:worker", "bannerforge_settlements:applicant",
  "bannerforge_settlements:worker_schedule", "bannerforge_settlements:at_work", "bannerforge_settlements:moving_in"];
/** Daily state groups the scheduler adds; only a guard (who leaves the village routine) drops them. */
const DAILY = Object.keys(groups).filter((g) => /_schedule_villager$|^work_schedule_/.test(g));
for (const g of [...CLEAR, ...DAILY].filter((g) => !g.startsWith(P) && !g.startsWith("bannerforge_settlements:"))) if (!groups[g]) throw new Error(`villager_v2 has no group ${g}: update tools/make_citizen.mjs`);

const unskilled = events["minecraft:become_unskilled"].add.component_groups; // adult, love, unskilled, peasant, schedule

// --- guard: a garrison soldier with the villager body ---------------------------------------------------------------
const NEVER = { test: "is_family", subject: "other", value: "bannerforge_none" };
groups[`${P}guard`] = {
  "minecraft:type_family": { family: ["villager", "bannerforge_guard", "mob"] },
  "minecraft:attack": { damage: 3 },
  "minecraft:home": { restriction_radius: 12 },
  // Villagers flee monsters and panic when hurt; a guard does neither (component in a group overrides the base one).
  "minecraft:behavior.avoid_mob_type": { priority: 4, entity_types: [{ filters: NEVER, max_dist: 1 }] },
  "minecraft:behavior.panic": { priority: 1, speed_multiplier: 0.6, damage_sources: ["none"] },
  "minecraft:behavior.hurt_by_target": { priority: 1 },
  "minecraft:behavior.nearest_attackable_target": {
    priority: 2,
    must_see: true,
    reselect_targets: true,
    within_radius: 16,
    entity_types: [
      {
        filters: {
          all_of: [
            { test: "is_family", subject: "other", value: "monster" },
            { test: "is_family", subject: "other", operator: "not", value: "creeper" },
          ],
        },
        max_dist: 16,
      },
    ],
  },
  "minecraft:behavior.melee_attack": { priority: 3, speed_multiplier: 0.9, track_target: true },
  "minecraft:behavior.go_home": { priority: 5, speed_multiplier: 0.6, interval: 1, goal_radius: 3 },
};

// --- worker: staff of one of our buildings, never a vanilla job ---------------------------------------------------
// Owner 2026-11-18: a worker is a worker and nothing else until the building is lost or they die. Lab 2026-11-18: the
// game keeps a villager out of the vanilla job search by its "nitwit" family. Job variant 14 alone, or a dweller that
// prefers a job no block offers, still took a job within minutes; with the nitwit family a worker stayed a worker for
// 4.5 minutes next to a free job block. The vanilla look shows the nitwit robe until our model (role property) exists.
groups[`${P}worker`] = {
  "minecraft:type_family": { family: ["villager", "peasant", "nitwit", "bannerforge_worker", "mob"] },
  "minecraft:variant": { value: 14 },
  // The home spot is saved when the component is first added, so it must be there from the spawn at the workplace
  // door and never be removed (play-test 2026-11-19: added each morning, it saved wherever he stood, and a hired
  // tavern keeper never went to the tavern).
  "minecraft:home": { restriction_radius: 8, restriction_type: "random_movement" },
};
// Owner 2026-11-19: a worker stays within 8 blocks of his workplace by day. The script spawns him at the building's
// door when he is hired (his home: the walk-in trick), so vanilla's home + go_home keep him there. His own day plan
// replaces the villager's (no exploring the outskirts or gathering at the bell): at work from morning to evening,
// then home and to bed like any villager.
groups[`${P}at_work`] = {
  "minecraft:behavior.random_stroll": { priority: 9, speed_multiplier: 0.5, xz_dist: 4, y_dist: 2, interval: 120 },
  "minecraft:behavior.go_home": { priority: 8, speed_multiplier: 0.6, interval: 60, goal_radius: 3 },
};
const window = (from, to) => ({ all_of: [{ test: "hourly_clock_time", operator: ">=", value: from }, { test: "hourly_clock_time", operator: "<", value: to }] });
groups[`${P}worker_schedule`] = {
  "minecraft:scheduler": {
    min_delay_secs: 0,
    max_delay_secs: 10,
    scheduled_events: [
      { event: "bannerforge:worker_shift", filters: window(0, 11000) },
      { event: "bannerforge:worker_home", filters: window(11000, 12000) },
      { event: "bannerforge:worker_off", filters: window(12000, 24000) },
    ],
  },
};
const DAY_GROUPS = ["home_schedule_villager", "bed_schedule_villager", "wander_schedule_villager", "gather_schedule_villager",
  "job_specific_goals", "play_schedule_villager", "trade_resupply_component_group"];
events["bannerforge:worker_shift"] = { remove: { component_groups: DAY_GROUPS }, add: { component_groups: ["make_and_receive_love", `${P}at_work`] } };
events["bannerforge:worker_home"] = { remove: { component_groups: [...DAY_GROUPS.filter((g) => g !== "home_schedule_villager"), `${P}at_work`] }, add: { component_groups: ["home_schedule_villager"] } };
events["bannerforge:worker_off"] = { remove: { component_groups: [...DAY_GROUPS.filter((g) => g !== "bed_schedule_villager"), "make_and_receive_love", `${P}at_work`] }, add: { component_groups: ["bed_schedule_villager"] } };
const worker = ["adult", "behavior_peasant", `${P}worker_schedule`, `${P}worker`];

// --- applicant: a newcomer waiting at the Town Hall for the player's word (owner 2026-11-18) ------------------------
// Like the steward's walk-in: the script spawns them at the Town Hall door (their home), moves them out to a safe spot
// and they walk back with go_home. The nitwit family keeps them out of vanilla jobs while they wait.
groups[`${P}applicant`] = {
  "minecraft:type_family": { family: ["villager", "peasant", "nitwit", "bannerforge_applicant", "mob"] },
  "minecraft:variant": { value: 0 },
  "minecraft:home": { restriction_radius: 6, restriction_type: "random_movement" },
  "minecraft:behavior.go_home": { priority: 2, speed_multiplier: 0.7, interval: 1, goal_radius: 2.5 },
  "minecraft:follow_range": { value: 64, max: 64 },
};
const applicant = ["adult", "behavior_peasant", "basic_schedule", `${P}applicant`];
// Turned away (play-test 2026-11-18: vanishing on the spot looked odd): they walk straight out of town. The script
// spawns them at the nearest spot outside the border (their home, the walk-in trick) and go_home takes them there
// (play-test 2026-11-19: running from the player went in circles); it removes them on arrival, out of sight or after
// half a minute.
groups[`${P}leaving`] = {
  "minecraft:type_family": { family: ["villager", "peasant", "nitwit", "bannerforge_leaving", "mob"] },
  "minecraft:home": { restriction_radius: 2, restriction_type: "random_movement" },
  "minecraft:behavior.go_home": { priority: 1, speed_multiplier: 0.75, interval: 1, goal_radius: 2 },
  "minecraft:follow_range": { value: 128, max: 128 },
};

// --- role events (scripts trigger these right after spawning) --------------------------------------------------------
const role = (name, remove, add) => ({
  remove: { component_groups: [...new Set([...remove, `${P}guard`, `${P}worker`, `${P}applicant`])].filter((g) => !add.includes(g)) },
  add: { component_groups: add },
  set_property: { [`${P}role`]: name },
});
events["bannerforge:become_settler"] = role("settler", CLEAR, unskilled);
events["bannerforge:become_worker"] = role("worker", CLEAR, worker);
events["bannerforge:become_guard"] = role("guard", [...CLEAR, ...DAILY, "make_and_receive_love"], ["adult", `${P}guard`]);

// Spawn events: born straight into a role, the way vanilla's own entity_spawned sets a villager up (skin, then age and
// job, then the biome outfit), so no groups are swapped at runtime. Scripts spawn citizens with these.
const spawned = events["minecraft:entity_spawned"].sequence;
const [skinStep, , ...biomeSteps] = spawned;
const spawnAs = (name, add) => ({
  sequence: [skinStep, { add: { component_groups: add }, set_property: { [`${P}role`]: name } }, ...biomeSteps],
});
events["bannerforge:spawn_settler"] = spawnAs("settler", unskilled);
events["bannerforge:spawn_worker"] = spawnAs("worker", worker);
events["bannerforge:spawn_guard"] = spawnAs("guard", ["adult", `${P}guard`]);
events["bannerforge:spawn_arriving"] = spawnAs("settler", [...unskilled, `${P}arriving`]);
events["bannerforge:spawn_arriving_worker"] = spawnAs("worker", [...worker, `${P}arriving`]);
events["bannerforge:arrived"] = { remove: { component_groups: [`${P}arriving`] } };
events["bannerforge:spawn_applicant"] = spawnAs("applicant", applicant);
// An accepted newcomer walks to a house (owner 2026-11-19: "they just stand there"): spawned at the house (his home,
// the walk-in trick), go_home takes him there and ends the walk itself.
groups[`${P}moving_in`] = {
  "minecraft:home": { restriction_radius: 16, restriction_type: "random_movement" },
  "minecraft:behavior.go_home": { priority: 2, speed_multiplier: 0.7, interval: 1, goal_radius: 3, on_home: [{ event: "bannerforge:moved_in", target: "self" }] },
  "minecraft:follow_range": { value: 96, max: 96 },
};
events["bannerforge:moved_in"] = { remove: { component_groups: [`${P}moving_in`] } };
events["bannerforge:spawn_moving_in"] = spawnAs("settler", [...unskilled, `${P}moving_in`]);
events["bannerforge:spawn_leaving"] = spawnAs("villager", ["adult", `${P}leaving`]);
events["bannerforge:leave"] = role("villager", CLEAR, ["adult", `${P}leaving`]);
// A child born in town (owner 2026-11-18): a vanilla baby that grows up as a settler.
events["bannerforge:spawn_child"] = spawnAs("settler", ["baby", "child_schedule"]);

// --- conversion of a vanilla villager (script: spawn with spawn_converted, then set look and job) ---------------------
// Owner 2026-11-18: keep profession and looks; the script reads them from the villager and replays them with these
// events and vanilla's own minecraft:become_<job> events.
const BIOMES = ["desert", "jungle", "savanna", "snow", "swamp", "taiga"].map((b) => `${b}_villager`);
const SKINS = Object.keys(groups).filter((g) => g.startsWith("villager_skin_"));
SKINS.forEach((g) => {
  events[`bannerforge:skin_${g.slice("villager_skin_".length)}`] = {
    remove: { component_groups: SKINS.filter((o) => o !== g) },
    add: { component_groups: [g] },
  };
});
BIOMES.forEach((g) => {
  events[`bannerforge:look_${g.replace("_villager", "")}`] = {
    remove: { component_groups: BIOMES.filter((o) => o !== g) },
    add: { component_groups: [g] },
  };
});
events["bannerforge:become_nitwit"] = role("villager", CLEAR, ["adult", "make_and_receive_love", "nitwit",
  "behavior_peasant", "jobless_schedule"]);
events["bannerforge:spawn_converted"] = { add: { component_groups: ["adult"] }, set_property: { [`${P}role`]: "villager" } };
events["bannerforge:spawn_converted_baby"] = {
  add: { component_groups: ["baby", "child_schedule"] },
  set_property: { [`${P}role`]: "villager" },
};

fs.writeFileSync(path.join(ROOT, "packs/BP/entities/citizen.json"), JSON.stringify(doc, null, 2) + "\n");

// Client entity: for now the vanilla villager look, referenced by name (model, textures, animations incl. the bed pose;
// nothing copied or overridden). Our illager-like model replaces this in the next step (owner 2026-11-18).
const rp = readJsonc(path.join(SAMPLES, "resource_pack/entity/villager_v2.entity.json"));
rp["minecraft:client_entity"].description.identifier = ID;
delete rp["minecraft:client_entity"].description.spawn_egg;
// The vanilla villager's arm pose reads variable.raise_arms, which the game sets natively only for real villagers;
// without this every citizen floods the content log with "unknown variable" errors each frame.
rp["minecraft:client_entity"].description.scripts.pre_animation.unshift("variable.raise_arms = 0.0;");
fs.writeFileSync(path.join(ROOT, "packs/RP/entity/citizen.entity.json"), JSON.stringify(rp, null, 2) + "\n");
console.log(`wrote ${ID}: ${Object.keys(groups).length} groups, a role change clears ${CLEAR.length} (+${DAILY.length} for guards)`);
