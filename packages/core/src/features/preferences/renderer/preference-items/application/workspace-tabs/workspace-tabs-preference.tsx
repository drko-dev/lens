/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { SubTitle } from "../../../../../../renderer/components/layout/sub-title";
import { Switch } from "../../../../../../renderer/components/switch";
import type { WorkspaceTabsFeatureFlag } from "../../../../../workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import workspaceTabsFeatureFlagInjectable from "../../../../../workspace-tabs/common/workspace-tabs-feature-flag.injectable";

interface Dependencies {
  featureFlag: WorkspaceTabsFeatureFlag;
}

const overrideLabels = {
  cli: "a command-line argument",
  env: "the OPENLENS_WORKSPACE_TABS environment variable",
  url: "a URL parameter",
};

export const NonInjectedWorkspaceTabsPreference = observer(({ featureFlag }: Dependencies) => {
  const source = featureFlag.overrideSource;
  const locked = featureFlag.isLockedByOverride;

  return (
    <section id="workspace-tabs">
      <SubTitle title="Workspace tabs" />
      <Switch
        checked={featureFlag.isEnabled}
        disabled={locked}
        onChange={(checked) => featureFlag.setEnabled(checked)}
      >
        Show workspace tabs
      </Switch>
      {source && (
        <small className="hint" data-testid="workspace-tabs-override-note">
          {`Overridden by ${overrideLabels[source]}; the setting cannot be changed here.`}
        </small>
      )}
    </section>
  );
});

export const WorkspaceTabsPreference = withInjectables<Dependencies>(NonInjectedWorkspaceTabsPreference, {
  getProps: (di) => ({
    featureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
  }),
});
