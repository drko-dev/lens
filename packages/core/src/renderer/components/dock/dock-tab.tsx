/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./dock-tab.module.scss";

import React from "react";
import { observer } from "mobx-react";
import type { StrictReactNode } from "@openlens/utilities";
import { cssNames, prevDefault, isMiddleClick } from "@openlens/utilities";
import type { DockStore, DockTab as DockTabModel } from "./dock/store";
import type { TabProps } from "../tabs";
import { Tab } from "../tabs";
import { Icon } from "../icon";
import { Menu, MenuItem } from "../menu";
import { observable } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import dockStoreInjectable from "./dock/store.injectable";
import { Tooltip, TooltipPosition } from "@openlens/tooltip";
import isMacInjectable from "../../../common/vars/is-mac.injectable";
import autoBindReact from "auto-bind/react";
import workspaceTabsFeatureFlagInjectable from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import type { WorkspaceTabsFeatureFlag } from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import type { Cluster } from "../../../common/cluster/cluster";
import { createToolContextFromCluster } from "../../../common/workspace/tool-context";
import { EnvironmentBadge } from "../environment-badge";
import { getClusterEnvironmentConfig } from "../../../common/cluster/environment-types";

export interface DockTabProps extends TabProps<DockTabModel> {
  moreActions?: StrictReactNode;
}

interface Dependencies {
  dockStore: DockStore;
  isMac: boolean;
  workspaceTabsFeatureFlag?: WorkspaceTabsFeatureFlag;
  hostedCluster?: Cluster;
}

@observer
class NonInjectedDockTab extends React.Component<DockTabProps & Dependencies> {
  private readonly menuVisible = observable.box(false);

  constructor(props: DockTabProps & Dependencies) {
    super(props);
    autoBindReact(this);
  }

  close(id: string) {
    this.props.dockStore.closeTab(id);
  }

  renderMenu(tabId: string) {
    const { closeTab, closeAllTabs, closeOtherTabs, closeTabsToTheRight, tabs, getTabIndex } = this.props.dockStore;
    const closeAllDisabled = tabs.length === 1;
    const closeOtherDisabled = tabs.length === 1;
    const closeRightDisabled = getTabIndex(tabId) === tabs.length - 1;

    return (
      <Menu
        usePortal
        htmlFor={`tab-${tabId}`}
        className="DockTabMenu"
        isOpen={this.menuVisible.get()}
        open={() => this.menuVisible.set(true)}
        close={() => this.menuVisible.set(false)}
        toggleEvent="contextmenu"
      >
        <MenuItem onClick={() => closeTab(tabId)}>
          Close
        </MenuItem>
        <MenuItem onClick={() => closeAllTabs()} disabled={closeAllDisabled}>
          Close all tabs
        </MenuItem>
        <MenuItem onClick={() => closeOtherTabs(tabId)} disabled={closeOtherDisabled}>
          Close other tabs
        </MenuItem>
        <MenuItem onClick={() => closeTabsToTheRight(tabId)} disabled={closeRightDisabled}>
          Close tabs to the right
        </MenuItem>
      </Menu>
    );
  }

  render() {
    const {
      className,
      moreActions,
      dockStore,
      active,
      isMac,
      workspaceTabsFeatureFlag,
      hostedCluster: _hostedCluster,
      ...tabProps
    } = this.props;

    if (!tabProps.value) {
      return;
    }

    const { title, pinned, id } = tabProps.value;
    const close = prevDefault(() => this.close(id));
    const isWorkspaceTabsEnabled = Boolean(this.props.workspaceTabsFeatureFlag?.isEnabled);
    const hostedCluster = this.props.hostedCluster;
    const toolContext = isWorkspaceTabsEnabled && hostedCluster ? createToolContextFromCluster(hostedCluster, id) : null;

    return (
      <>
        <Tab
          {...tabProps}
          id={`tab-${id}`}
          className={cssNames(styles.DockTab, className, {
            [styles.pinned]: pinned,
          })}
          onContextMenu={() => this.menuVisible.set(true)}
          label={(
            <div className="flex align-center" onAuxClick={isMiddleClick(close)}>
              {toolContext && toolContext.environment && toolContext.environment !== "none" && (
                <EnvironmentBadge
                  environment={getClusterEnvironmentConfig(hostedCluster?.preferences)}
                  data-testid={`dock-tab-env-badge-${id}`}
                  className={styles.envBadge}
                />
              )}
              <span className={styles.title}>{title}</span>
              {moreActions}
              {!pinned && (
                <div className={styles.close}>
                  <Icon
                    small
                    material="close"
                    tooltip={`Close ${this.props.isMac ? "⌘+W" : "Ctrl+W"}`}
                    onClick={close}
                    aria-label={`Close ${title}`}
                    data-testid={`dock-tab-close-for-${id}`}
                  />
                </div>
              )}
              <Tooltip
                targetId={`tab-${id}`}
                preferredPositions={[TooltipPosition.TOP, TooltipPosition.TOP_LEFT]}
                style={{ transitionDelay: "700ms" }}
              >
                {title}
              </Tooltip>
            </div>
          )}
          data-testid={`dock-tab-for-${id}`}
        />
        {this.renderMenu(id)}
      </>
    );
  }
}

export const DockTab = withInjectables<Dependencies, DockTabProps>(NonInjectedDockTab, {
  getProps: (di, props) => ({
    dockStore: di.inject(dockStoreInjectable),
    isMac: di.inject(isMacInjectable),
    workspaceTabsFeatureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
    ...props,
  }),
});
