/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { Switch } from "../../../../../renderer/components/switch";
import { Input } from "../../../../../renderer/components/input";
import type { UserPreferencesState } from "../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedExternalToolsSettings = observer(({ state }: Dependencies) => (
  <div data-testid="external-tools-preferences-section">
    <section id="external-tools-kubectl">
      <SubTitle title="Kubectl Binary Management" />
      <Switch
        checked={state.downloadKubectlBinaries ?? true}
        onChange={() => (state.downloadKubectlBinaries = !(state.downloadKubectlBinaries ?? true))}
        data-testid="external-tools-download-kubectl-switch"
      >
        Automatically download matching kubectl binaries
      </Switch>
      <div className="hint" style={{ marginBottom: "12px" }}>
        Download and manage version-matched kubectl binaries for connected clusters.
      </div>
      <SubTitle title="Path to kubectl Binary" />
      <Input
        theme="round-black"
        value={state.kubectlBinariesPath ?? ""}
        onChange={(value) => (state.kubectlBinariesPath = value || undefined)}
        placeholder="Default managed kubectl binary"
        data-testid="external-tools-kubectl-path-input"
      />
    </section>
    <hr className="small" />
    <section id="external-tools-binaries-dir">
      <SubTitle title="Binaries Download Directory" />
      <Input
        theme="round-black"
        value={state.downloadBinariesPath ?? ""}
        onChange={(value) => (state.downloadBinariesPath = value || undefined)}
        placeholder="Default application binaries folder"
        data-testid="external-tools-binaries-dir-input"
      />
    </section>
    <hr className="small" />
    <section id="external-tools-shell">
      <SubTitle title="Default Terminal Shell" />
      <Input
        theme="round-black"
        value={state.shell ?? ""}
        onChange={(value) => (state.shell = value || undefined)}
        placeholder="System default (/bin/zsh)"
        data-testid="external-tools-shell-input"
      />
    </section>
  </div>
));

export const ExternalToolsSettings = withInjectables<Dependencies>(NonInjectedExternalToolsSettings, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
