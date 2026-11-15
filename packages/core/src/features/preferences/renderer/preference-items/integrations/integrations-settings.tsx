/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { IncidentRetentionPreference } from "../../../../../renderer/components/preferences/incident-retention-preference";
import navigateInjectable from "../../../../../renderer/navigation/navigate.injectable";
import type { UserPreferencesState } from "../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
  navigate: (url: string) => void;
}

const NonInjectedIntegrationsSettings = observer(({ state, navigate }: Dependencies) => (
  <div data-testid="integrations-preferences-section">
    <section id="integrations-ai-providers">
      <SubTitle title="AI Diagnostics & Incident Center" />
      <p className="hint" style={{ marginBottom: "12px" }}>
        Configure local or external AI provider profiles, API keys, and diagnostic consent rules for Incident Center.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Button
          primary
          label="Configure AI Providers"
          onClick={() => navigate("/ai-settings")}
          data-testid="open-ai-settings-btn"
        />
        <Button
          label="Open Incident Center"
          onClick={() => navigate("/incidents")}
          data-testid="open-incidents-btn"
        />
      </div>
    </section>
    <hr className="small" />
    <section id="integrations-extension-registry">
      <SubTitle title="Extension Registry" />
      <div className="hint" style={{ marginBottom: "8px" }}>
        Active registry mode: <strong>{state.extensionRegistryUrl?.location ?? "default"}</strong>
        {state.extensionRegistryUrl?.customUrl ? ` (${state.extensionRegistryUrl.customUrl})` : ""}
      </div>
      <Button
        label="Manage Extensions"
        onClick={() => navigate("/extensions")}
        data-testid="open-extensions-btn"
      />
    </section>
    <hr className="small" />
    <IncidentRetentionPreference />
  </div>
));

export const IntegrationsSettings = withInjectables<Dependencies>(NonInjectedIntegrationsSettings, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
    navigate: di.inject(navigateInjectable),
  }),
});
