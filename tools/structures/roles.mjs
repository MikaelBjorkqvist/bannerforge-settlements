// Classifies a building by name: which vanilla village building it stands in for ("vanilla" + role),
// or "new" when vanilla villages have nothing like it. Used for dev-tool sign labels and listings.
// Keyword order matters: the first match wins.
const ROLES = [
  [/apothecary|church|temple/i, "temple (cleric)"],
  [/armou?r|foundry/i, "armorer"],
  [/weapon|black ?smith/i, "weaponsmith"],
  [/tool/i, "toolsmith"],
  [/butcher/i, "butcher"],
  [/cartograph|observatory/i, "cartographer"],
  [/fish/i, "fisher"],
  [/fletch|archery/i, "fletcher"],
  [/leather|tanner/i, "tannery"],
  [/librar/i, "library"],
  [/mason/i, "mason"],
  [/shepherd/i, "shepherd"],
  [/farm|crop|green ?house/i, "farm"],
  [/stable|animal|pen/i, "stable / pen"],
  [/fountain|well|camp|crystal|meeting/i, "town centre"],
  [/house|igloo|cottage/i, "house"],
  [/lamp|decoration|accessory/i, "decoration"],
];

/** @returns {{ kind: "vanilla" | "new", role: string }} */
export function classify(name) {
  for (const [re, role] of ROLES) if (re.test(name)) return { kind: "vanilla", role };
  return { kind: "new", role: "addon" };
}
