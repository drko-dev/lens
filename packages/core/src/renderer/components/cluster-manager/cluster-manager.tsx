/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./cluster-manager.scss";

import React from "react";
import { Redirect } from "react-router";
import { disposeOnUnmount, observer } from "mobx-react";
import { StatusBar } from "../status-bar/status-bar";
import { HotbarMenu } from "../hotbar/hotbar-menu";
import { DeleteClusterDialog } from "../delete-cluster-dialog";
import { withInjectables } from "@ogre-tools/injectable-react";
import { TopBar } from "../layout/top-bar/top-bar";
import type { IComputedValue } from "mobx";
import currentRouteComponentInjectable from "../../routes/current-route-component.injectable";
import welcomeRouteInjectable from "../../../common/front-end-routing/routes/welcome/welcome-route.injectable";
import { buildURL } from "@openlens/utilities";
import type { WatchForGeneralEntityNavigation } from "../../api/helpers/watch-for-general-entity-navigation.injectable";
import watchForGeneralEntityNavigationInjectable from "../../api/helpers/watch-for-general-entity-navigation.injectable";
import currentPathInjectable from "../../routes/current-path.injectable";
import { WorkspaceTabBar } from "../../../features/workspace-tabs/renderer/workspace-tab-bar";
import type { WorkspaceTabsFeatureFlag } from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import workspaceTabsFeatureFlagInjectable from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import shouldUseRootPanelHostInjectable from "./cluster-manager-root-panel.injectable";
import { RootPanelHost } from "../../../features/global-docking/renderer/root-panel-host";

interface Dependencies {
  currentRouteComponent: IComputedValue<React.ElementType | undefined>;
  welcomeUrl: string;
  watchForGeneralEntityNavigation: WatchForGeneralEntityNavigation;
  currentPath: IComputedValue<string>;
  workspaceTabsFeatureFlag: WorkspaceTabsFeatureFlag;
  shouldUseRootPanelHost: IComputedValue<boolean>;
}

@observer
class NonInjectedClusterManager extends React.Component<Dependencies> {
  componentDidMount() {
    disposeOnUnmount(this, [
      this.props.watchForGeneralEntityNavigation(),
    ]);
  }

  renderMainComponent() {
    const Component = this.props.currentRouteComponent.get();

    if (Component) {
      // H7.6.4: with global docking on, Settings and the Catalog dock like cluster views (the route reveals its panel).
      if (this.props.shouldUseRootPanelHost.get()) {
        return (
          <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, background: "var(--mainBackground)" }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <RootPanelHost />
            </div>
          </div>
        );
      }

      return <Component />;
    }

    const currentPath = this.props.currentPath.get();

    if (currentPath !== this.props.welcomeUrl) {
      return <Redirect exact to={this.props.welcomeUrl} />;
    }

    return (
      <div className="error">
        <h2>ERROR!!</h2>
        <p>
          No matching route for the current path:
          {" "}
          <code>{currentPath}</code>
          {" "}
          which is the welcomeUrl. This is a bug.
        </p>
      </div>
    );
  }

  render() {
    // Read at render time so toggling the preference updates the shell immediately
    const isWorkspaceTabsEnabled = this.props.workspaceTabsFeatureFlag.isEnabled;

    return (
      <div className="ClusterManager">
        <TopBar />
        <main>
          {isWorkspaceTabsEnabled && <WorkspaceTabBar />}
          <div id="lens-views" className={isWorkspaceTabsEnabled ? "with-tab-bar" : undefined} />
          {this.renderMainComponent()}
        </main>
        <HotbarMenu />
        <StatusBar />
        <DeleteClusterDialog />
      </div>
    );
  }
}

export const ClusterManager = withInjectables<Dependencies>(NonInjectedClusterManager, {
  getProps: (di) => ({
    currentRouteComponent: di.inject(currentRouteComponentInjectable),
    welcomeUrl: buildURL(di.inject(welcomeRouteInjectable).path),
    watchForGeneralEntityNavigation: di.inject(watchForGeneralEntityNavigationInjectable),
    currentPath: di.inject(currentPathInjectable),
    workspaceTabsFeatureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
    shouldUseRootPanelHost: di.inject(shouldUseRootPanelHostInjectable),
  }),
});
