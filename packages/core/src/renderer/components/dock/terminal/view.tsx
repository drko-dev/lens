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
import type { IComputedValue } from "mobx";
import { TerminalSearch } from "./terminal-search";
import { Icon } from "../../icon";

export interface TerminalWindowProps {
  tab: DockTab;
}

interface Dependencies {
  dockStore: DockStore;
  terminalStore: TerminalStore;
  activeTheme: IComputedValue<LensTheme>;
}

@observer
class NonInjectedTerminalWindow extends React.Component<TerminalWindowProps & Dependencies> {
  public elem: HTMLElement | null = null;
  public terminal!: Terminal;

  @observable isSearchOpen = false;

  constructor(props: TerminalWindowProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    this.props.terminalStore.connect(this.props.tab);
    const terminal = this.props.terminalStore.getTerminal(this.props.tab.id);

    assert(terminal, "Terminal must be created for tab before mounting");
    this.terminal = terminal;
    this.terminal.setOnSearchOpen(this.openSearch);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.terminal.attachTo(this.elem!);

    disposeOnUnmount(this, [
      // refresh terminal available space (cols/rows) when <Dock/> resized
      this.props.dockStore.onResize(() => this.terminal.onResize(), {
        fireImmediately: true,
      }),
    ]);
  }

  componentDidUpdate(): void {
    this.terminal.detach();
    this.props.terminalStore.connect(this.props.tab);
    const terminal = this.props.terminalStore.getTerminal(this.props.tab.id);

    assert(terminal, "Terminal must be created for tab before mounting");
    this.terminal = terminal;
    this.terminal.setOnSearchOpen(this.openSearch);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.terminal.attachTo(this.elem!);
  }

  componentWillUnmount(): void {
    this.terminal.detach();
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

    return (
      <div
        className={cssNames("TerminalWindow", this.props.activeTheme.get().type)}
        ref={elem => this.elem = elem}
      >
        {this.isSearchOpen && (
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
    );
  }
}

export const TerminalWindow = withInjectables<Dependencies, TerminalWindowProps>(NonInjectedTerminalWindow, {
  getProps: (di, props) => ({
    ...props,
    dockStore: di.inject(dockStoreInjectable),
    terminalStore: di.inject(terminalStoreInjectable),
    activeTheme: di.inject(activeThemeInjectable),
  }),
});

