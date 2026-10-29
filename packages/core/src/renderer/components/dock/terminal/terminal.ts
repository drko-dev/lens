/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import debounce from "lodash/debounce";
import type { IComputedValue } from "mobx";
import { reaction } from "mobx";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import type { ISearchOptions } from "xterm-addon-search";
import type { TabId } from "../dock/store";
import type { TerminalApi } from "../../../api/terminal-api";
import { disposer } from "@openlens/utilities";
import { once } from "lodash";
import { clipboard } from "electron";
import type { Logger } from "@openlens/logger";
import assert from "assert";
import { TerminalChannels } from "../../../../common/terminal/channels";
import { LinkProvider } from "xterm-link-provider";
import type { OpenLinkInBrowser } from "../../../../common/utils/open-link-in-browser.injectable";
import type { TerminalConfig } from "../../../../features/user-preferences/common/preferences-helpers";
import { defaultTerminalScrollback } from "../../../../features/user-preferences/common/preferences-helpers";

export interface TerminalDependencies {
  readonly spawningPool: HTMLElement;
  readonly terminalConfig: IComputedValue<TerminalConfig>;
  readonly terminalCopyOnSelect: IComputedValue<boolean>;
  readonly isMac: boolean;
  readonly xtermColorTheme: IComputedValue<Record<string, string>>;
  readonly logger: Logger;
  openLinkInBrowser: OpenLinkInBrowser;
}

export interface TerminalArguments {
  tabId: TabId;
  api: TerminalApi;
}

export class Terminal {
  private readonly xterm: XTerm;
  private readonly fitAddon = new FitAddon();
  private readonly searchAddon = new SearchAddon();
  private scrollPos = 0;
  private pendingInput: string[] = [];
  private flushingInput = false;
  private readonly disposer = disposer();
  private onSearchOpenCallback?: () => void;
  public readonly tabId: TabId;
  protected readonly api: TerminalApi;

  private get elem() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.xterm.element!;
  }

  private get viewport() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.elem.querySelector(".xterm-viewport")!;
  }

  attachTo(parentElem: HTMLElement) {
    assert(this.elem, "Terminal should always be mounted somewhere");
    parentElem.appendChild(this.elem);
    this.onActivate();
  }

  detach() {
    const { elem } = this;

    if (elem) {
      this.dependencies.spawningPool.appendChild(elem);
    }
  }

  get fontFamily() {
    return this.dependencies.terminalConfig.get().fontFamily;
  }

  get fontSize() {
    return this.dependencies.terminalConfig.get().fontSize;
  }

  get scrollback() {
    return this.dependencies.terminalConfig.get().scrollback ?? defaultTerminalScrollback;
  }

  constructor(protected readonly dependencies: TerminalDependencies, {
    tabId,
    api,
  }: TerminalArguments) {
    this.tabId = tabId;
    this.api = api;

    this.xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      scrollback: this.scrollback,
    });
    // enable terminal addons
    this.xterm.loadAddon(this.fitAddon);
    this.xterm.loadAddon(this.searchAddon);

    this.xterm.open(this.dependencies.spawningPool);
    this.xterm.attachCustomKeyEventHandler(this.keyHandler);
    this.xterm.onSelectionChange(this.onSelectionChange);

    // bind events
    const onDataHandler = this.xterm.onData(this.onData);
    const clearOnce = once(this.onClear);

    this.viewport.addEventListener("scroll", this.onScroll);
    this.elem.addEventListener("contextmenu", this.onContextMenu);
    this.api.once("ready", clearOnce);
    this.api.once("connected", clearOnce);
    this.api.on("ready", this.flushPendingInput);
    this.api.on("data", this.onApiData);
    window.addEventListener("resize", this.onResize);

    const linkProvider = new LinkProvider(
      this.xterm,
      /https?:\/\/[^\s]+/i,
      (event, link) => this.dependencies.openLinkInBrowser(link),
      undefined,
      0,
    );

    this.disposer.push(
      this.xterm.registerLinkProvider(linkProvider),
      reaction(() => this.dependencies.xtermColorTheme.get(),
        colors => this.xterm.options.theme = colors,
        {
          fireImmediately: true,
        },
      ),
      reaction(() => this.fontSize, this.setFontSize, { fireImmediately: true }),
      reaction(() => this.fontFamily, this.setFontFamily, { fireImmediately: true }),
      reaction(() => this.scrollback, this.setScrollback, { fireImmediately: true }),
      () => onDataHandler.dispose(),
      () => this.fitAddon.dispose(),
      () => this.searchAddon.dispose(),
      () => this.api.removeAllListeners(),
      () => window.removeEventListener("resize", this.onResize),
      () => this.elem.removeEventListener("contextmenu", this.onContextMenu),
      this.xterm.onResize(({ cols, rows }) => {
        this.api.sendTerminalSize(cols, rows);
      }),
    );
  }

  destroy() {
    this.pendingInput = [];
    this.disposer();
    this.xterm.dispose();
  }

  fit = () => this.fitAddon.fit();

  fitLazy = debounce(this.fit, 250);

  focus = () => {
    this.xterm.focus();
  };

  onApiData = (data: string) => {
    this.xterm.write(data);
  };

  onData = (data: string) => {
    if (!this.api.isReady || this.flushingInput) {
      this.pendingInput.push(data);
      return;
    }

    this.api.sendMessage({
      type: TerminalChannels.STDIN,
      data,
    });
  };

  flushPendingInput = () => {
    this.flushingInput = true;

    queueMicrotask(() => {
      const pendingInput = this.pendingInput;
      this.pendingInput = [];
      this.flushingInput = false;

      pendingInput.forEach(data => this.api.sendMessage({
        type: TerminalChannels.STDIN,
        data,
      }));
    });
  };

  onScroll = () => {
    this.scrollPos = this.viewport.scrollTop;
  };

  onClear = () => {
    this.xterm.clear();
  };

  onResize = () => {
    this.fitLazy();
    this.focus();
  };

  onActivate = () => {
    this.fit();
    this.focus();
    this.viewport.scrollTop = this.scrollPos; // restore last scroll position
  };

  onContextMenu = () => {
    if (
      // don't paste if user hasn't turned on the feature
      this.dependencies.terminalCopyOnSelect.get()

      // don't paste if the clipboard doesn't have text
      && clipboard.availableFormats().includes("text/plain")
    ) {
      this.xterm.paste(clipboard.readText());
    }
  };

  onSelectionChange = () => {
    const selection = this.xterm.getSelection().trim();

    if (this.dependencies.terminalCopyOnSelect.get() && selection) {
      clipboard.writeText(selection);
    }
  };

  setFontSize = (fontSize: number) => {
    this.dependencies.logger.info(`[TERMINAL]: set fontSize to ${fontSize}`);

    this.xterm.options.fontSize = fontSize;
    this.fit();
  };

  setFontFamily = (fontFamily: string) => {
    this.dependencies.logger.info(`[TERMINAL]: set fontFamily to ${fontFamily}`);

    this.xterm.options.fontFamily = fontFamily;
    this.fit();

    // provide css-variable within `:root {}`
    document.documentElement.style.setProperty("--font-terminal", fontFamily);
  };

  setScrollback = (scrollback: number) => {
    this.dependencies.logger.info(`[TERMINAL]: set scrollback to ${scrollback}`);
    this.xterm.options.scrollback = scrollback;
  };

  findNext = (keyword: string, options?: ISearchOptions): boolean => {
    if (!keyword) {
      this.clearSearch();

      return false;
    }

    return this.searchAddon.findNext(keyword, options);
  };

  findPrevious = (keyword: string, options?: ISearchOptions): boolean => {
    if (!keyword) {
      this.clearSearch();

      return false;
    }

    return this.searchAddon.findPrevious(keyword, options);
  };

  clearSearch = (): void => {
    this.xterm.clearSelection();
  };

  setOnSearchOpen = (callback: () => void): void => {
    this.onSearchOpenCallback = callback;
  };

  keyHandler = (evt: KeyboardEvent): boolean => {
    const { code, ctrlKey, metaKey } = evt;

    // Handle Cmd+F (Mac) or Ctrl+F (Linux/Win) to open terminal search
    const isSearchShortcut = (this.dependencies.isMac && metaKey && code === "KeyF")
      || (!this.dependencies.isMac && ctrlKey && code === "KeyF");

    if (isSearchShortcut) {
      evt.preventDefault();
      this.onSearchOpenCallback?.();

      return false;
    }

    // Handle custom hotkey bindings
    if (ctrlKey) {
      switch (code) {
        // Ctrl+C: prevent terminal exit on windows / linux (?)
        case "KeyC":
          if (this.xterm.hasSelection()) return false;
          break;

        // Ctrl+W: prevent unexpected terminal tab closing, e.g. editing file in vim
        case "KeyW":
          evt.preventDefault();
          break;
      }
    }

    //Ctrl+K: clear the entire buffer, making the prompt line the new first line on mac os
    if (this.dependencies.isMac && metaKey) {
      switch (code) {
        case "KeyK":
          this.onClear();
          break;
      }
    }

    return true;
  };
}
