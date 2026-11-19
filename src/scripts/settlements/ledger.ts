// The steward's ledger: three short screens (approved mockup "BannerForge Steward UI v2", 2026-11-13).
//   Overview  -> Section -> Building
// Each screen is a DDUI CustomForm (stable in @minecraft/server-ui 2.3.0). The Building screen updates in place
// after a purchase, and the result is shown right above its button, with a sound.

import { ItemStack, type Player, type RawMessage, system, world } from "@minecraft/server";
import { CustomForm, ObservableBoolean, ObservableUIRawMessage } from "@minecraft/server-ui";
import { BUILDINGS, CATEGORIES, PROMOTION, SCORES, type BuildingDef, type Category } from "./buildings.js";
import { BORDER_RADIUS } from "./plots.js";
import { bedsFor } from "./blueprint.js";
import { canAfford, countItem, pay } from "./economy.js";
import { celebrate } from "./celebration.js";
import { constructionMinutesLeft } from "./construction.js";
import { devButtonInLedger, showDevMenu } from "./dev.js";
import { showBorder, startPlacement } from "./placement.js";
import { saveSettlement, settlementById } from "./registry.js";
import { applicantsOf } from "./roster.js";
import { news } from "./people.js";
import { built, check, checkPromotion, economyParts, staffedFood, freeBeds, hirePerson, jobStates, recruitable, vanillaTraders, military, score, freeSettlers, garrison, housing, instances, population, promote, prosperity, tier, waitingForWorkers, type Check } from "./rules.js";
import { uiIcon } from "./ui_images.js";
import { FACTION_COLOUR, buildingName, costText, raw, reasonText, say, t, txt } from "./text.js";
import type { Settlement } from "./types.js";
import { sendToWork } from "./work.js";

const icon = uiIcon;

/** One colour per score, used everywhere in the ledger (owner, 2026-11-18). */
const CAT_COLOUR: Record<Category | "prosperity", string> = { prosperity: "§6", economy: "§a", military: "§c", civic: "§9", housing: "§e" };
/** The Prosperity bar (100%) in blocks: a score's bar plus "Economy 14" still fits one line (play-test 2026-11-18). */
const BAR_MAX = 10;

const SECTION_ICON: Record<Category, string> = {
  housing: "house",
  economy: "section_trade",
  military: "section_defence",
  civic: "section_centre",
};

/** Closes the current screen and opens the next one on the following tick. */
function go(form: CustomForm, next: () => void): void {
  form.close();
  system.run(next);
}

/** Construction moves on while menus are closed: always work on the saved settlement. */
const latest = (s: Settlement): Settlement => settlementById(s.id) ?? s;

const siteOf = (s: Settlement, id: string, index: number) => s.sites?.[id]?.[index] ?? null;

/** Minutes left on the soonest construction of this building, if any is underway. */
function minutesLeft(s: Settlement, def: BuildingDef): number | undefined {
  const left = (s.sites?.[def.id] ?? []).map(constructionMinutesLeft).filter((m): m is number => m !== undefined);
  return left.length ? Math.min(...left) : undefined;
}

/** A unique building bought before buildings were placed (old saves): it can be put on a plot for free. */
function unplacedIndex(s: Settlement, def: BuildingDef): number {
  return instances(s, def.id).findIndex((l, i) => l > 0 && !siteOf(s, def.id, i));
}

function show(form: CustomForm): void {
  form.show().catch((e) => console.warn(`[BannerForge] ledger: ${e}`));
}

type RowState = "can" | "done" | "locked" | "busy";

/** Short status for a section row: + can build, ✔ built (or limit reached), ⚒ under construction. */
function rowState(s: Settlement, def: BuildingDef): RowState {
  if (unplacedIndex(s, def) >= 0) return "can";
  const c = check(s, { kind: "build", id: def.id });
  if (c.ok) return "can";
  if (minutesLeft(s, def) !== undefined) return "busy";
  if (c.reasons.every((r) => r.key === "already_built" || r.key === "limit")) return "done";
  return "locked";
}

const SYMBOL: Record<RowState, string> = { can: "+", done: "✔", locked: "✘", busy: "⚒" };

/** Row label, kept short because buttons show one line: "Tavern  +" · "Tavern  ✔" · "House ×3  +". */
function rowLabel(s: Settlement, def: BuildingDef): RawMessage {
  const state = rowState(s, def);
  const name = buildingName(def.id);
  if (def.perTier) return raw(name, txt(` ×${instances(s, def.id).length}  ${SYMBOL[state]}`));
  return raw(name, txt(`  ${SYMBOL[state]}`));
}

// ---------- The ledger book (owner 2026-11-18) ----------
// A Town or City can buy its ledger as a book from the steward. It opens the same ledger anywhere inside that town's
// border and nowhere else; one book per town ("<Town> Ledger"), so a player with several towns carries several.

export const BOOK_ID = "bannerforge_settlements:ledger_book";
/** Emeralds for the book. */
export const BOOK_PRICE = 3;
const P_BOOK_TOWN = "bannerforge:settlement";
/** Players reading a book (the overview then hides "buy the book"). */
const readingBook = new Set<string>();

/** Opens the overview; from the steward or from the town's book. */
export function openLedger(player: Player, s: Settlement, viaBook: boolean): void {
  if (viaBook) readingBook.add(player.id);
  else readingBook.delete(player.id);
  showOverview(player, s);
}

/** The town a ledger book belongs to (undefined for an unbound or foreign item). */
export function bookTown(item: ItemStack | undefined): Settlement | undefined {
  if (item?.typeId !== BOOK_ID) return undefined;
  const sid = item.getDynamicProperty(P_BOOK_TOWN);
  return typeof sid === "string" ? settlementById(sid) : undefined;
}

/** Using the book: the town's ledger, inside its border only. */
export function registerLedgerBook(): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId === BOOK_ID) useBook(ev.source, ev.itemStack);
  });
}

export function useBook(player: Player, item: ItemStack): void {
  const s = bookTown(item);
  if (!s) return say(player, "bannerforge.book.no_town");
  const r = BORDER_RADIUS[tier(s)];
  const inside = player.dimension.id === s.dimension && Math.max(Math.abs(player.location.x - s.center.x), Math.abs(player.location.z - s.center.z)) <= r;
  if (!inside) return say(player, "bannerforge.book.outside", s.name);
  openLedger(player, s, true);
}

function buyBook(player: Player, s: Settlement): void {
  if (tier(s) === "village") return say(player, "bannerforge.book.town_only");
  if (!pay(player, [{ item: "minecraft:emerald", amount: BOOK_PRICE }])) return say(player, "bannerforge.book.cannot_afford", String(BOOK_PRICE));
  const book = new ItemStack(BOOK_ID, 1);
  book.setDynamicProperty(P_BOOK_TOWN, s.id);
  // Name tags are plain strings: the town's own name plus "Ledger" (documented exception, like NPC titles).
  book.nameTag = `${s.name} Ledger`;
  const inv = player.getComponent("minecraft:inventory")?.container;
  const left = inv?.addItem(book);
  if (left) player.dimension.spawnItem(left, player.location);
  say(player, "bannerforge.book.bought", s.name);
}

// ---------- 1. Overview ----------

export function showOverview(player: Player, s: Settlement): void {
  s = latest(s);
  const form = new CustomForm(player, t("bannerforge.ledger.title", s.name));

  // Faction above the town name, in one element. (No image rows: owner prefers icons on buttons only.)
  form.header(raw(txt(FACTION_COLOUR[s.faction] ?? ""), t(`bannerforge.faction.${s.faction}`), txt(`\n§f${s.name} · `), t(`bannerforge.tier.${tier(s)}`)));

  // Town overview (owner, 2026-11-17): the numbers, then warnings. Population = people living there, Housing = room.
  // Prosperity and a bar per score it is made of (owner, 2026-11-18: "a graph"), then people in grey. The bars
  // start at the left edge, so they line up whatever the font.
  form.divider();
  const waiting = waitingForWorkers(s).length;
  // Each score's bar is its share of Prosperity, BAR_MAX blocks in total (owner, 2026-11-18). Largest-remainder rounding so the shares add up to exactly BAR_MAX blocks.
  const scores = SCORES.map((c) => ({ c, v: score(s, c) }));
  const total = scores.reduce((n, x) => n + x.v, 0);
  const exact = scores.map((x) => (total ? (x.v / total) * BAR_MAX : 0));
  const blocks = exact.map(Math.floor);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; total && blocks.reduce((n, b) => n + b, 0) < BAR_MAX; k++) blocks[order[k].i]++;
  const bar = (i: number) => `${CAT_COLOUR[scores[i].c]}${"█".repeat(blocks[i])}`;
  const info: RawMessage[] = [txt(CAT_COLOUR.prosperity), t("bannerforge.steward.prosperity"), txt(` §f${prosperity(s)}`)];
  // No separate Prosperity bar (owner, 2026-11-18): an empty line, then the share bars.
  info.push(txt("\n"));
  scores.forEach(({ c, v }, i) => {
    info.push(txt(`\n${bar(i)}${blocks[i] ? " " : ""}§7`), t(`bannerforge.category.${c}`), txt(` §f${v}`));
  });
  const grey = (key: string, value: number, sep = true): RawMessage[] => [t(key), txt(` ${value}${sep ? " · " : ""}`)];
  // Two kinds of people (owner 2026-11-18): the townsfolk (word by tier, they live in houses) and the garrison (in
  // its buildings). Who does what is on the People page.
  info.push(
    txt("\n\n§7"),
    ...grey("bannerforge.steward.population", population(s)),
    ...grey("bannerforge.steward.housing", housing(s), false),
    txt("\n"),
    ...grey(`bannerforge.folk.${tier(s)}`, population(s)),
    ...grey("bannerforge.steward.garrison", garrison(s), false),
  );
  // Alerts, one short line each.
  const waitingNew = applicantsOf(s).filter((p) => p.state === "here").length;
  if (waitingNew) info.push(txt("\n§e"), t("bannerforge.citizens.newcomers_waiting", String(waitingNew)));
  if (waiting > 0) info.push(txt("\n§6⚠ "), t("bannerforge.citizens.buildings_waiting", String(waiting)));
  form.label(raw(...info));

  // Growing to the next tier has its own page (requirements, what it brings, "Upgrade now").
  const promo = checkPromotion(s);
  form.divider();
  if (promo.next) {
    const ready = promo.reasons.length === 0;
    form.button(raw({ translate: "bannerforge.grow.button", with: { rawtext: [{ translate: `bannerforge.tier.${promo.next}` }] } }, txt(ready ? "  ▲" : "")), () =>
      go(form, () => showGrow(player, s)),
    );
  } else {
    form.label(raw(txt("§a"), t("bannerforge.steward.top_tier")));
  }

  form.divider();
  form.button(raw(t("bannerforge.people.title"), txt(waiting || waitingNew ? "  !" : "")), () => go(form, () => showPeople(player, s)), {
    imageDetails: icon("section_population"),
  });
  for (const category of CATEGORIES) {
    const defs = BUILDINGS.filter((b) => b.category === category);
    const anyCan = defs.some((d) => rowState(s, d) === "can");
    form.button(raw(t(`bannerforge.category.${category}`), txt(anyCan ? "  +" : "")), () => go(form, () => showSection(player, s, category)), {
      imageDetails: icon(SECTION_ICON[category]),
    });
  }
  form.divider();
  form.button(t("bannerforge.ledger.show_border"), () => go(form, () => showBorder(player, s)));
  // The town's ledger book, bought from the steward (owner 2026-11-18): not offered when reading the book itself.
  if (!readingBook.has(player.id) && tier(s) !== "village") {
    form.button(raw(t("bannerforge.book.buy", String(BOOK_PRICE))), () => {
      form.close();
      system.run(() => buyBook(player, latest(s)));
    });
  }
  if (devButtonInLedger()) form.button(t("bannerforge.dev.title"), () => go(form, () => showDevMenu(player)));
  show(form);
}

/** What growing into the next tier takes and brings, with the "Upgrade now" button. */
function showGrow(player: Player, s: Settlement): void {
  s = latest(s);
  const promo = checkPromotion(s);
  const next = promo.next;
  if (!next) {
    showOverview(player, s);
    return;
  }
  const tierArg = { rawtext: [{ translate: `bannerforge.tier.${next}` }] };
  const form = new CustomForm(player, { translate: "bannerforge.grow.button", with: tierArg });
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showOverview(player, s)));
  const goal = PROMOTION[next];
  const line = (ok: boolean, ...body: RawMessage[]) => raw(txt(ok ? "§a✔§r " : "§c✘§r "), ...body, txt("\n"));
  form.header(t("bannerforge.grow.requirements"));
  form.label(
    raw(
      ...goal.requires.map((id) => line(built(s, id) > 0, buildingName(id))),
      line(prosperity(s) >= goal.prosperity, t("bannerforge.steward.prosperity"), txt(` ${prosperity(s)} / ${goal.prosperity}`)),
      line(population(s) >= goal.population, t("bannerforge.steward.population"), txt(` ${population(s)} / ${goal.population}`)),
      line(military(s) >= goal.military, t("bannerforge.category.military"), txt(` ${military(s)} / ${goal.military}`)),
    ),
  );
  // What the new tier brings, worked out from the real numbers (owner, 2026-11-18: "+6 watchtowers" was misleading).
  const now = tier(s);
  // The border as the area players see: blocks across, the bell's block in the middle (owner, 2026-11-18).
  const across = (r: number) => String(2 * r + 1);
  // Short lines that fit the form without wrapping (owner, 2026-11-18).
  const gets: RawMessage[] = [t("bannerforge.grow.border", across(BORDER_RADIUS[next]), across(BORDER_RADIUS[next]))];
  for (const def of BUILDINGS) {
    if (!def.perTier || !Number.isFinite(def.perTier[next])) continue;
    if (def.perTier[next] > def.perTier[now]) {
      const with_ = { rawtext: [{ translate: `bannerforge.plural.${def.id}` }, { text: String(def.perTier[now]) }, { text: String(def.perTier[next]) }] };
      gets.push({ translate: "bannerforge.grow.more", with: with_ });
    }
  }
  gets.push(t(`bannerforge.grow.training.${next}`), t("bannerforge.grow.worker_ranks"));
  form.header({ translate: "bannerforge.grow.gets", with: tierArg });
  form.label(raw(...gets.flatMap((g, n) => [txt(n ? "\n§a+ §r" : "§a+ §r"), g])));
  form.divider();
  form.button(t("bannerforge.grow.now"), () => go(form, () => doPromote(player, s)), { disabled: new ObservableBoolean(promo.reasons.length > 0) });
  show(form);
}

function doPromote(player: Player, s: Settlement): void {
  s = latest(s);
  if (checkPromotion(s).reasons.length) {
    showOverview(player, s);
    return;
  }
  promote(s);
  saveSettlement(s);
  // The ledger stays closed so the title and fireworks can be seen (play-test 2026-11-17).
  celebrate(s);
}

// ---------- 2. Section ----------

export function showSection(player: Player, s: Settlement, category: Category): void {
  s = latest(s);
  const form = new CustomForm(player, t(`bannerforge.category.${category}`));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showOverview(player, s)));
  // Economy: where its score comes from (owner 2026-11-18), above the buildings.
  if (category === "economy") {
    const p = economyParts(s);
    const g = (key: string, v: number, sep = true): RawMessage[] => [t(key), txt(` ${CAT_COLOUR.economy}${v}§7${sep ? " · " : ""}`)];
    form.label(
      raw(
        txt(CAT_COLOUR.economy),
        t("bannerforge.category.economy"),
        txt(` §f${score(s, "economy")}\n§7`),
        ...g("bannerforge.group.shops", p.shops),
        ...g("bannerforge.group.craftsmen", p.craftsmen),
        ...g("bannerforge.group.food", p.food, false),
        txt("\n"),
        t("bannerforge.economy.vanilla", `${CAT_COLOUR.economy}+${p.vanilla}§7`, String(vanillaTraders(s))),
        txt(" "),
        t(`bannerforge.folk.${tier(s)}`),
        txt(" "),
        t("bannerforge.economy.vanilla_2"),
      ),
    );
    form.divider();
  }
  form.label(raw(txt("§7"), t("bannerforge.ledger.legend_1"), txt("\n"), t("bannerforge.ledger.legend_2")));
  form.divider();

  const defs = BUILDINGS.filter((b) => b.category === category);
  const addRow = (def: BuildingDef) =>
    form.button(rowLabel(s, def), () => go(form, () => showBuilding(player, s, def)), { imageDetails: icon(def.id) });
  defs.filter((d) => !d.group).forEach(addRow);
  const groups = [...new Set(defs.map((d) => d.group).filter((g): g is NonNullable<BuildingDef["group"]> => !!g))];
  for (const g of groups) {
    form.header(t(`bannerforge.group.${g}`));
    defs.filter((d) => d.group === g).forEach(addRow);
  }
  show(form);
}

// ---------- People ----------

/**
 * Who lives in town and what they do (owner 2026-11-18): Workers (our buildings), Tradesfolk (their own trade at a
 * workstation), Unemployed, Nitwits, Children; then growth, and every building waiting for a worker with Recruit.
 */
export function showPeople(player: Player, s: Settlement): void {
  s = latest(s);
  const form = new CustomForm(player, t("bannerforge.people.title"));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showOverview(player, s)));
  const js = jobStates(s);
  const kinds: RawMessage[] = [];
  (
    [
      ["bannerforge.citizens.workers", js.workers],
      ["bannerforge.citizens.tradesfolk", js.vanilla],
      ["bannerforge.citizens.unemployed", js.jobless],
      ["bannerforge.citizens.nitwits", js.nitwits],
      ["bannerforge.citizens.children", js.children],
    ] as [string, number][]
  ).forEach(([key, n]) => kinds.push(txt("\n§7"), t(key), txt(` §f${n}`)));
  form.label(raw(txt("§f"), t(`bannerforge.folk.${tier(s)}`), txt(` ${population(s)}`), ...kinds));
  form.divider();
  const growth: RawMessage[] = [txt("§7"), t("bannerforge.citizens.free_beds", String(freeBeds(s))), txt("\n"), t("bannerforge.citizens.births", String(staffedFood(s)))];
  const waitingNew = applicantsOf(s).filter((p) => p.state === "here").length;
  if (waitingNew) growth.push(txt("\n§e"), t("bannerforge.citizens.newcomers_waiting", String(waitingNew)));
  form.label(raw(...growth));
  // Buildings waiting for a worker: Recruit right here (owner 2026-11-18: hard to find on each building's page).
  const waiting = waitingForWorkers(s);
  if (waiting.length) {
    form.header(t("bannerforge.people.need_worker"));
    for (const w of waiting) {
      const def = BUILDINGS.find((b) => b.id === w.id);
      if (!def) continue;
      form.button(raw(t("bannerforge.recruit.button"), txt(": "), buildingName(def.id)), () => go(form, () => showRecruit(player, s, def)), { imageDetails: icon(def.id) });
    }
  }
  show(form);
}

// ---------- Recruit ----------

/** Villagers with a vanilla job; picking one opens the confirmation. */
function showRecruit(player: Player, s: Settlement, def: BuildingDef): void {
  s = latest(s);
  const form = new CustomForm(player, t("bannerforge.recruit.title"));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showPeople(player, s)));
  const list = recruitable(s);
  form.label(raw(txt("§7"), t(list.length ? "bannerforge.recruit.intro" : "bannerforge.recruit.none")));
  for (const v of list) {
    form.button(raw(txt(`${v.name} · `), t(`bannerforge.job.${v.vjob}`)), () => go(form, () => confirmRecruit(player, s, def, v.seed)));
  }
  show(form);
}

function confirmRecruit(player: Player, s: Settlement, def: BuildingDef, seed: string): void {
  s = latest(s);
  const v = recruitable(s).find((p) => p.seed === seed);
  if (!v) return showRecruit(player, s, def);
  const form = new CustomForm(player, t("bannerforge.recruit.title"));
  form.button(t("bannerforge.ledger.back"), () => go(form, () => showRecruit(player, s, def)));
  form.label(raw(t("bannerforge.recruit.confirm", v.name), txt(" "), t(`bannerforge.job.${v.vjob}`), txt(" "), t("bannerforge.recruit.confirm_2"), txt(" "), buildingName(def.id), txt(".\n\n§6⚠ "), t("bannerforge.recruit.warning")));
  form.button(raw(t("bannerforge.recruit.do"), txt(` ${v.name}`)), () => {
    s = latest(s);
    const now = recruitable(s).find((p) => p.seed === seed);
    const slot = waitingForWorkers(s).find((w) => w.id === def.id);
    if (now && slot) {
      hirePerson(s, now, slot.id, slot.index);
      saveSettlement(s);
      const e = now.eid ? world.getEntity(now.eid) : undefined;
      if (e) {
        sendToWork(s, now, e);
        saveSettlement(s);
        news(s, raw(txt("§7"), t("bannerforge.people.hired", now.name), txt(" "), buildingName(def.id)));
      }
    }
    go(form, () => showPeople(player, s));
  });
  show(form);
}

// ---------- 3. Building ----------

export function showBuilding(player: Player, s: Settlement, def: BuildingDef): void {
  s = latest(s);
  const form = new CustomForm(player, buildingName(def.id));
  const now = new ObservableUIRawMessage(txt(""));
  const needs = new ObservableUIRawMessage(txt(""));
  const feedback = new ObservableUIRawMessage(txt(""));
  const feedbackVisible = new ObservableBoolean(false);
  const label = new ObservableUIRawMessage(txt(""));
  const disabled = new ObservableBoolean(true);

  form.button(t("bannerforge.ledger.back"), () => go(form, () => showSection(player, s, def.category)));
  form.label(now);
  form.spacer();
  form.label(needs);
  form.label(feedback, { visible: feedbackVisible });
  form.spacer();
  form.button(label, onBuy, { disabled, imageDetails: icon(def.id) });
  // A building waiting for its worker can take a villager with a vanilla job (owner 2026-11-18: free, with a warning).
  if (waitingForWorkers(s).some((w) => w.id === def.id)) {
    form.button(t("bannerforge.recruit.button"), () => go(form, () => showRecruit(player, s, def)));
  }

  function refresh(): void {
    const c: Check = check(s, { kind: "build", id: def.id });
    const count = instances(s, def.id).length;

    // What it is (white), then one stat per line: grey label, value in the category's colour (owner, 2026-11-18).
    const lines: RawMessage[] = [t(`bannerforge.desc.${def.id}.1`), txt("\n")];
    const stat = (key: string, value: RawMessage | string) => lines.push(txt("\n§7"), t(key), txt(" "), typeof value === "string" ? txt(value) : value);
    if (def.prosperity) stat(`bannerforge.category.${def.category}`, `${CAT_COLOUR[def.category]}+${def.prosperity}`);
    if (def.defence) stat("bannerforge.category.military", `${CAT_COLOUR.military}+${def.defence}`);
    const sleeps = def.category === "housing" ? bedsFor(def, s.faction, undefined) ?? def.housing : def.housing;
    if (sleeps) stat("bannerforge.steward.housing", `${CAT_COLOUR.housing}+${sleeps}`);
    if (def.npcs) stat("bannerforge.citizens.workers", `§f${def.npcs}`);
    // Garrisons start at the lowest rank; the tier only unlocks training by the Captain (owner, 2026-11-18).
    if (def.garrison) stat("bannerforge.steward.garrison", raw(txt("§f"), t(`bannerforge.garrison.${def.id}.village`)));
    if (def.perTier) {
      const limit = def.perTier[tier(s)];
      stat("bannerforge.ledger.built", `§f${count}${Number.isFinite(limit) ? ` / ${limit}` : ""}`);
    } else {
      stat("bannerforge.ledger.built", raw(txt("§f"), t(count ? "bannerforge.ledger.yes" : "bannerforge.ledger.no")));
    }
    const short = waitingForWorkers(s).filter((w) => w.id === def.id).length;
    if (short) lines.push(txt("\n§6⚠ "), t("bannerforge.citizens.this_waits", String(short)));
    let nowMsg: RawMessage = raw(...lines);
    const left = minutesLeft(s, def);
    if (left !== undefined) nowMsg = raw(nowMsg, txt("\n§e⚒ "), t("bannerforge.ledger.construction_line", String(left)));
    now.setData(nowMsg);

    // What's needed: reasons in red (or ready in green), cost and wallet.
    const wallet = countItem(player, "minecraft:emerald");
    const parts: RawMessage[] = [];
    const unplaced = unplacedIndex(s, def);
    if (unplaced >= 0) {
      label.setData(t("bannerforge.ledger.place_free"));
      disabled.setData(false);
    } else if (c.ok) {
      const price = c.cost[0]?.amount ?? 0;
      if (wallet >= price) parts.push(txt("§a✔ "), t("bannerforge.ledger.ready"), txt("§r\n"));
      else parts.push(txt("§c✘ "), t("bannerforge.ledger.short_by", String(price - wallet)), txt("§r\n"));
      // No free person for the job: it can be built, and waits for a worker (owner, 2026-11-17).
      if (def.npcs > 0 && freeSettlers(s) < def.npcs) parts.push(txt("§6⚠ "), t("bannerforge.ledger.no_free_worker"), txt("§r\n"));
      parts.push(t("bannerforge.ledger.cost"), txt(" "), costText(c.cost), txt("\n"));
      label.setData(raw(t(def.perTier && count ? "bannerforge.ledger.build_another" : "bannerforge.ledger.build"), txt(": "), costText(c.cost)));
      disabled.setData(!canAfford(player, c.cost));
    } else {
      for (const r of c.reasons) if (r.key !== "already_built") parts.push(txt("§c✘ "), reasonText(r), txt("§r\n"));
      label.setData(raw(t(left !== undefined ? "bannerforge.ledger.under_construction" : count && !def.perTier ? "bannerforge.ledger.complete" : "bannerforge.ledger.locked"), txt(left !== undefined ? " ⚒" : count ? " ✔" : " ✘")));
      disabled.setData(true);
    }
    parts.push(t("bannerforge.ledger.you_have"), txt(` ${wallet}`));
    needs.setData(raw(...parts));
  }

  function onBuy(): void {
    s = latest(s);
    const unplaced = unplacedIndex(s, def);
    if (unplaced >= 0) {
      go(form, () => startPlacement(player, s, def, { kind: "existing", index: unplaced }));
      return;
    }
    const c = check(s, { kind: "build", id: def.id });
    if (!c.ok) {
      feedback.setData(raw(txt("§c"), reasonText(c.reasons[0])));
      feedbackVisible.setData(true);
      player.playSound("note.bass");
      refresh();
      return;
    }
    // A new building is placed first and paid for when you press Build on the plot.
    if (!canAfford(player, c.cost)) {
      feedback.setData(raw(txt("§c"), t("bannerforge.ledger.cannot_afford"), txt(" "), costText(c.cost)));
      feedbackVisible.setData(true);
      player.playSound("note.bass");
      return;
    }
    go(form, () => startPlacement(player, s, def, { kind: "new", cost: c.cost }));
  }

  refresh();
  show(form);
}
