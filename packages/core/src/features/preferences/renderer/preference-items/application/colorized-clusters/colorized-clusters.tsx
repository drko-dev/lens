/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { SubTitle } from "../../../../../../renderer/components/layout/sub-title";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Switch } from "../../../../../../renderer/components/switch";
import { observer } from "mobx-react";
import type { UserPreferencesState } from "../../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedColorizedClusters = observer(({ state }: Dependencies) => (
  <section id="colorized-clusters">
    <SubTitle title="Colorized Clusters" />
    <Switch
      checked={state.colorizedClusters ?? true}
      onChange={() => (state.colorizedClusters = !(state.colorizedClusters ?? true))}
      data-testid="colorized-clusters-switch"
    >
      Differentiate Kubernetes clusters by color
    </Switch>
    <div className="hint">
      A specific color can be set per cluster or environment in cluster settings and Appearance.
    </div>
  </section>
));

export const ColorizedClusters = withInjectables<Dependencies>(NonInjectedColorizedClusters, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
