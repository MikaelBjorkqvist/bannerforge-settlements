// Temporary probe: which UI APIs exist in the pinned STABLE @minecraft/server-ui? (not merged)
import type { Player } from "@minecraft/server";
import { ActionFormData, CustomForm, ObservableString, ObservableBoolean } from "@minecraft/server-ui";

export function probe(player: Player): void {
  const status = new ObservableString("hello");
  const off = new ObservableBoolean(false);
  new CustomForm(player, "Probe")
    .header("Header")
    .label(status)
    .divider()
    .spacer()
    .button("Buy", () => status.setData("bought"), { tooltip: "tip", disabled: off })
    .closeButton()
    .show();
  new ActionFormData().title("A").header("H").label("L").divider().button("B", "textures/ui/emerald");
}
