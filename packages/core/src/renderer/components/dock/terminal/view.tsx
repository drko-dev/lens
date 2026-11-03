/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./terminal-window.scss";

import React from "react";
import { disposeOnUnmount, observer } from "mobx-react";
import { makeObservable, observable } from "mobx";
import { cssNames } from "@openlens/utilities";
import type { Terminal } from "./terminal";
import type { TerminalStore } from "./store";
import type { LensTheme } from "../../../themes/lens-theme";
import type { DockTab, DockStore } from "../dock/store";
import { withInjectables } from "@ogre-tools/injectable-react";
import dockStoreInjectable from "../dock/store.injectable";
import terminalStoreInjectable from "./store.injectable";
import assert from "assert";
import activeThemeInjectable from "../../../themes/active.injectable";
import type { IComputedValue, ObservableMap } from "mobx";
import { TerminalSearch } from "./terminal-search";
import { Icon } from "../../icon";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import type { Cluster } from "../../../../common/cluster/cluster";
import { createToolContextFromCluster } from "../../../../common/workspace/tool-context";
import { ToolContextHeader } from "../tool-context-header";
import { Alert } from "../../alert";
import { getClusterEnvironmentConfig } from "../../../../common/cluster/environment-types";
import { Button } from "@openlens/button";
import terminalProdAuthorizationInjectable from "./prod-authorization.injectable";
import type { TerminalProdAuthorization } from "./prod-authorization";
import detachedTerminalTabsInjectable from "./detached-terminal-tabs.injectable";
import { DetachedTerminalPlaceholder, TerminalDetachButton } from "./detach-terminal-controls";

export interface TerminalWindowProps {
  tab: DockTab;
}

interface Dependencies {
  dockStore: DockStore;
  terminalStore: TerminalStore;
  activeTheme: IComputedValue<LensTheme>;
  hostedCluster?: Cluster;
  detachedTabs: ObservableMap<string, "detached" | "ended">;
  prodAuthorization: TerminalProdAuthorization;
}

@observer
class NonInjectedTerminalWindow extends React.Component<TerminalWindowProps & Dependencies> {
  public elem: HTMLElement | null = null;
  public terminal?: Terminal;

  @observable isSearchOpen = false;

  constructor(props: TerminalWindowProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  get toolContext() {
    return createToolContextFromCluster(this.props.hostedCluster, this.props.tab.id);
  }

  get requiresProdConfirmation() {
    // H7.6.3D: authorization lives outside React, bound to (clusterId, tabId); a remount keeps it.
    const clusterId = this.props.hostedCluster?.id;

    return this.toolContext.isProduction
      && !(clusterId && this.props.prodAuthorization.isAuthorized(clusterId, this.props.tab.id));
  }

  componentDidMount() {
    if (this.requiresProdConfirmation) {
      return;
    }

    // R5-07F: Main owns the session while the tab is detached/ended; do not open a dock websocket.
    if (this.props.detachedTabs.has(this.props.tab.id)) {
      return;
    }
    this.connectTerminal();
  }

  connectTerminal() {
    this.props.terminalStore.connect(this.props.tab);
    const terminal = this.props.terminalStore.getTerminal(this.props.tab.id);

    assert(terminal, "Terminal must be created for tab before mounting");
    this.terminal = terminal;
    this.terminal.setOnSearchOpen(this.openSearch);

    if (this.elem) {
      this.terminal.attachTo(this.elem);
    }

    disposeOnUnmount(this, [
      // refresh terminal available space (cols/rows) when <Dock/> resized
      this.props.dockStore.onResize(() => this.terminal?.onResize(), {
        fireImmediately: true,
      }),
    ]);
  }

  confirmProdConnection = () => {
    const clusterId = this.props.hostedCluster?.id;

    if (!clusterId) {
      return;
    }
    this.props.prodAuthorization.authorize(clusterId, this.props.tab.id);
    this.connectTerminal();
  };

  componentDidUpdate(): void {
    if (this.requiresProdConfirmation) {
      return;
    }

    // R5-07F: Main owns the session while the tab is detached/ended; do not open a dock websocket.
    if (this.props.detachedTabs.has(this.props.tab.id)) {
      return;
    }

    if (!this.terminal) {
      this.connectTerminal();

      return;
    }

    this.terminal.detach();
    this.props.terminalStore.connect(this.props.tab);
    const terminal = this.props.terminalStore.getTerminal(this.props.tab.id);

    assert(terminal, "Terminal must be created for tab before mounting");
    this.terminal = terminal;
    this.terminal.setOnSearchOpen(this.openSearch);

    if (this.elem) {
      this.terminal.attachTo(this.elem);
    }
  }

  componentWillUnmount(): void {
    this.terminal?.detach();
  }

  openSearch = () => {
    this.isSearchOpen = true;
  };

  closeSearch = () => {
    this.isSearchOpen = false;
  };

  reconnect = () => {
    this.props.terminalStore.reconnect(this.props.tab.id);
  };

  render() {
    const isDisconnected = this.props.terminalStore.isDisconnected(this.props.tab.id);
    const { toolContext, requiresProdConfirmation } = this;
    const tab = this.props.tab as any;

    return (
      <div
        className={cssNames("TerminalWindow", this.props.activeTheme.get().type)}
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        {/* Contextual Terminal Header (R4-04) */}
        <ToolContextHeader
          data-testid={`terminal-context-header-${this.props.tab.id}`}
          clusterName={toolContext.clusterName}
          environment={getClusterEnvironmentConfig(this.props.hostedCluster?.preferences)}
          title={[
            tab.pod && `Pod: ${tab.pod} (${tab.container || "default"})`,
            tab.node && `Node: ${tab.node}`,
          ].filter(Boolean).join(" · ") || undefined}
          session={isDisconnected ? "disconnected" : "active"}
          actions={(
            <>
              {toolContext.isProduction && (
                <span data-testid="terminal-prod-hazard" style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
                  Production Environment — Guarded
                </span>
              )}
              {!requiresProdConfirmation && <TerminalDetachButton tabId={this.props.tab.id} />}
            </>
          )}
        />

        {this.props.detachedTabs.has(this.props.tab.id) ? (
          <DetachedTerminalPlaceholder tabId={this.props.tab.id} />
        ) : requiresProdConfirmation ? (
          <div
            className="terminal-prod-gate flex column align-center justify-center gaps"
            data-testid={`terminal-prod-gate-${this.props.tab.id}`}
            style={{
              flex: 1,
              padding: "32px 16px",
              textAlign: "center",
              backgroundColor: "var(--mainBackground)",
            }}
          >
            <Alert type="danger" title="Production Terminal Confirmation Required">
              You are about to establish a direct terminal shell connection to
              {" "}
              <b>{toolContext.clusterName}</b>
              {" "}
              [PRODUCTION].
              Interactive commands execute directly on live production infrastructure.
            </Alert>
            <Button
              primary
              style={{ backgroundColor: "var(--envProduction)", borderColor: "var(--envProduction)" }}
              label="Connect to Production"
              data-testid={`terminal-prod-confirm-btn-${this.props.tab.id}`}
              onClick={this.confirmProdConnection}
            />
          </div>
        ) : (
          <div
            className="terminal-body"
            style={{ flex: 1, position: "relative", minHeight: 0 }}
            ref={elem => this.elem = elem}
          >
            {this.isSearchOpen && this.terminal && (
              <TerminalSearch
                terminal={this.terminal}
                onClose={this.closeSearch}
              />
            )}
            {isDisconnected && (
              <div className="terminal-disconnected-banner flex gaps align-center" data-testid="terminal-disconnected-banner">
                <Icon material="warning" small />
                <span>Terminal session disconnected</span>
                <button
                  type="button"
                  className="terminal-reconnect-btn"
                  onClick={this.reconnect}
                  data-testid="terminal-reconnect-btn"
                >
                  Reconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}

export const TerminalWindow = withInjectables<Dependencies, TerminalWindowProps>(NonInjectedTerminalWindow, {
  getProps: (di, props) => ({
    ...props,
    dockStore: di.inject(dockStoreInjectable),
    terminalStore: di.inject(terminalStoreInjectable),
    activeTheme: di.inject(activeThemeInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
    detachedTabs: di.inject(detachedTerminalTabsInjectable),
    prodAuthorization: di.inject(terminalProdAuthorizationInjectable),
  }),
});
