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
import { EnvironmentBadge } from "../../environment-badge";
import { Alert } from "../../alert";
import { getClusterEnvironmentConfig } from "../../../../common/cluster/environment-types";
import { Button } from "@openlens/button";
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
}

@observer
class NonInjectedTerminalWindow extends React.Component<TerminalWindowProps & Dependencies> {
  public elem: HTMLElement | null = null;
  public terminal?: Terminal;

  @observable isSearchOpen = false;
  @observable isProdConfirmed = false;

  constructor(props: TerminalWindowProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  get toolContext() {
    return createToolContextFromCluster(this.props.hostedCluster, this.props.tab.id);
  }

  get requiresProdConfirmation() {
    return this.toolContext.isProduction && !this.isProdConfirmed;
  }

  componentDidMount() {
    if (this.requiresProdConfirmation) {
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
    this.isProdConfirmed = true;
    this.connectTerminal();
  };

  componentDidUpdate(): void {
    if (this.requiresProdConfirmation) {
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
        <div
          className="terminal-context-header flex align-center justify-between"
          data-testid={`terminal-context-header-${this.props.tab.id}`}
          style={{
            padding: "3px 10px",
            backgroundColor: "var(--boxBackground)",
            borderBottom: "1px solid var(--border)",
            fontSize: "11px",
            flexShrink: 0,
          }}
        >
          <div className="flex gaps align-center">
            <span style={{ fontWeight: 600, color: toolContext.clusterColor }}>
              {toolContext.clusterName}
            </span>
            <EnvironmentBadge
              environment={getClusterEnvironmentConfig(this.props.hostedCluster?.preferences)}
              data-testid={toolContext.isProduction ? "terminal-prod-hazard" : undefined}
            />
            {tab.pod && (
              <span style={{ opacity: 0.8, marginLeft: "4px" }}>
                Pod:
                {" "}
                <b>{tab.pod}</b>
                {" "}
                (
                {tab.container || "default"}
                )
              </span>
            )}
            {tab.node && (
              <span style={{ opacity: 0.8, marginLeft: "4px" }}>
                Node:
                {" "}
                <b>{tab.node}</b>
              </span>
            )}
          </div>
          <div className="flex gaps align-center">
            {toolContext.isProduction && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
                Production Environment — Guarded
              </span>
            )}
            {!requiresProdConfirmation && <TerminalDetachButton tabId={this.props.tab.id} />}
          </div>
        </div>

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
  }),
});
