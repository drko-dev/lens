/** OpenLens DevOps icon variants. Dock changes at runtime on macOS; Finder icon is packaged. */
import React, { useState } from "react";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { UserPreferencesState } from "../../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";
import { SubTitle } from "../../../../../../renderer/components/layout/sub-title";
import { applicationIconChannel, applicationIconIds, type ApplicationIconId } from "../../../../../../common/application-icon-channels";

const labels: Record<ApplicationIconId, string> = {
  azul: "Kubernetes blue (default)", grafito: "White on graphite",
  inverso: "Blue on white", negro: "White on black",
  blanco: "Black on white", indigo: "Indigo", turquesa: "Turquoise",
  verde: "Green", violeta: "Violet", naranja: "Orange", rojo: "Red",
};

const ApplicationIconPreference = observer(({ state }: { state: UserPreferencesState }) => {
  const [message, setMessage] = useState("");
  const selected = applicationIconIds.includes(state.applicationIconId as ApplicationIconId)
    ? state.applicationIconId : "azul";
  const choose = async (id: ApplicationIconId) => {
    if (process.platform === "darwin") {
      try {
        const applied = await ipcRenderer.invoke(applicationIconChannel, id) as boolean;
        if (!applied) { setMessage("Could not change the Dock icon. The Finder icon stays packaged."); return; }
      } catch { setMessage("Dock icon change failed. Selection was not changed."); return; }
    }
    state.applicationIconId = id;
    setMessage(process.platform === "darwin"
      ? "Dock icon applied. Finder uses the packaged icon."
      : "Preference saved. Dock icon changes are only supported on macOS.");
  };
  return (
    <section id="application-icon-preferences" data-testid="application-icon-preferences">
      <SubTitle title="Application Icon" />
      <p className="text-secondary">Select an OpenLens DevOps icon. The Dock updates on macOS; Finder uses the icon packaged with the app.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, marginBottom: 12 }}>
        {applicationIconIds.map(id => (
          <button key={id} type="button"
            data-testid={"application-icon-" + id}
            onClick={() => { void choose(id); }}
            aria-pressed={selected === id}
            style={{ border: selected === id ? "2px solid var(--colorInfo)" : "1px solid var(--border-1)",
              background: "var(--layoutBackground)", color: "inherit", borderRadius: 8,
              width: 125, padding: 10, cursor: "pointer" }}>
            <img src={"/branding/app-icons/" + id + ".png"} alt="" width={72} height={72}
              style={{ width: 72, height: 72, display: "block", margin: "0 auto 8px" }} />
            <span>{labels[id]}</span>
          </button>
        ))}
      </div>
      <p role="status" data-testid="application-icon-feedback">{message}</p>
    </section>
  );
});
export const ApplicationIconPreferences = withInjectables<{ state: UserPreferencesState }>(ApplicationIconPreference, {
  getProps: di => ({ state: di.inject(userPreferencesStateInjectable) }),
});
