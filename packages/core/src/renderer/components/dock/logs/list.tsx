/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./list.scss";

import type { ForwardedRef } from "react";
import React from "react";
import AnsiUp from "ansi_up";
import DOMPurify from "dompurify";
import debounce from "lodash/debounce";
import { action, computed, observable, makeObservable, reaction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import moment from "moment-timezone";
import type { Align, ListOnScrollProps } from "react-window";
import { array, cssNames } from "@openlens/utilities";
import type { VirtualListRef } from "../../virtual-list";
import { VirtualList } from "../../virtual-list";
import { ToBottom } from "./to-bottom";
import type { LogTabViewModel } from "../logs/logs-view-model";
import { Spinner } from "../../spinner";
import { withInjectables } from "@ogre-tools/injectable-react";
import autoBindReact from "auto-bind/react";
import type { UserPreferencesState } from "../../../../features/user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../features/user-preferences/common/state.injectable";
import { stripAnsiCodes } from "./log-buffer-utils";

export interface LogListProps {
  model: LogTabViewModel;
}

const colorConverter = new AnsiUp();

export interface LogListRef {
  scrollToItem: (index: number, align: Align) => void;
}

interface Dependencies {
  state: UserPreferencesState;
}

@observer
class NonForwardedLogList extends React.Component<Dependencies & LogListProps & { innerRef: ForwardedRef<LogListRef> }> {
  @observable isJumpButtonVisible = false;
  @observable isLastLineVisible = true;
  @observable containerWidth = 800;

  private virtualListDiv = React.createRef<HTMLDivElement>(); // A reference for outer container in VirtualList
  private virtualListRef = React.createRef<VirtualListRef>(); // A reference for VirtualList component
  private lineHeight = 18; // Height of a log line. Should correlate with styles in pod-log-list.scss
  private resizeObserver?: ResizeObserver;

  constructor(props: any) {
    super(props);
    makeObservable(this);
    autoBindReact(this);
  }

  componentDidMount() {
    disposeOnUnmount(this, [
      reaction(() => this.props.model.logs.get(), (logs, prevLogs) => {
        this.onLogsInitialLoad(logs, prevLogs);
        this.onLogsUpdate();
        this.onUserScrolledUp(logs, prevLogs);
      }),
      reaction(() => this.logs, (logs) => {
        if (this.props.model.searchStore.searchQuery) {
          this.props.model.searchStore.onSearch(logs);
        }
      }),
    ]);

    if (this.virtualListDiv.current && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;

          if (width > 0 && Math.abs(width - this.containerWidth) > 10) {
            this.containerWidth = width;
          }
        }
      });
      this.resizeObserver.observe(this.virtualListDiv.current);
    }

    this.bindInnerRef({
      scrollToItem: this.scrollToItem,
    });
  }

  componentDidUpdate() {
    this.bindInnerRef({
      scrollToItem: this.scrollToItem,
    });
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
    this.bindInnerRef(null);
  }

  private bindInnerRef(value: LogListRef | null) {
    if (typeof this.props.innerRef === "function") {
      this.props.innerRef(value);
    } else if (this.props.innerRef && typeof this.props.innerRef === "object") {
      this.props.innerRef.current = value;
    }
  }

  onLogsInitialLoad(logs: string[], prevLogs: string[]) {
    if (!prevLogs.length && logs.length) {
      this.isLastLineVisible = true;
    }
  }

  onLogsUpdate() {
    if (this.isLastLineVisible) {
      setTimeout(() => {
        this.scrollToBottom();
      }, 500); // Giving some time to VirtualList to prepare its outerRef (this.virtualListDiv) element
    }
  }

  onUserScrolledUp(logs: string[], prevLogs: string[]) {
    if (!this.virtualListDiv.current) return;

    const newLogsAdded = prevLogs.length < logs.length;
    const scrolledToBeginning = this.virtualListDiv.current.scrollTop === 0;

    if (newLogsAdded && scrolledToBeginning) {
      const firstLineContents = prevLogs[0];
      const lineToScroll = logs.findIndex((value) => value == firstLineContents);

      if (lineToScroll !== -1) {
        this.scrollToItem(lineToScroll, "start");
      }
    }
  }

  /**
   * Returns logs with or without timestamps regarding to showTimestamps prop
   */
  @computed
  get logs(): string[] {
    const { showTimestamps } = this.props.model.logTabData.get() ?? {};

    if (!showTimestamps) {
      return this.props.model.logsWithoutTimestamps.get();
    }

    return this.props.model.timestampSplitLogs
      .get()
      .map(([logTimestamp, log]) => (`${logTimestamp && moment.tz(logTimestamp, this.props.state.localeTimezone).format()}${log}`));
  }

  /**
   * Returns visible logs: either all logs, or filtered subset when filter mode is active
   */
  @computed
  get displayLogs(): string[] {
    const { searchMode, searchQuery, filteredIndices } = this.props.model.searchStore;

    if (searchMode === "filter" && searchQuery.trim()) {
      return filteredIndices
        .map(index => this.logs[index])
        .filter((line): line is string => typeof line === "string");
    }

    return this.logs;
  }

  /**
   * Dynamic row heights computation supporting word wrap
   */
  @computed
  get rowHeights(): number[] {
    const isWordWrap = Boolean(this.props.model.logTabData.get()?.wordWrap);
    const count = this.displayLogs.length;

    if (!isWordWrap) {
      return array.filled(count, this.lineHeight);
    }

    const availableWidth = Math.max(200, this.containerWidth - 40);
    const charsPerLine = Math.max(20, Math.floor(availableWidth / 7.2));

    return this.displayLogs.map((log) => {
      const stripped = stripAnsiCodes(log);
      const lines = Math.max(1, Math.ceil(stripped.length / charsPerLine));

      return lines * this.lineHeight;
    });
  }

  /**
   * Checks if JumpToBottom button should be visible and sets its observable
   * @param props Scrolling props from virtual list core
   */
  setButtonVisibility = action(({ scrollOffset }: ListOnScrollProps, { scrollHeight }: HTMLDivElement) => {
    const offset = 100 * this.lineHeight;

    if (scrollHeight - scrollOffset < offset) {
      this.isJumpButtonVisible = false;
    } else {
      this.isJumpButtonVisible = true;
    }
  });

  /**
   * Checks if last log line considered visible to user, setting its observable
   * @param props Scrolling props from virtual list core
   */
  setLastLineVisibility = action(({ scrollOffset }: ListOnScrollProps, { scrollHeight, clientHeight }: HTMLDivElement) => {
    this.isLastLineVisible = (clientHeight + scrollOffset) === scrollHeight;
  });

  /**
   * Check if user scrolled to top and new logs should be loaded
   * @param props Scrolling props from virtual list core
   */
  checkLoadIntent = (props: ListOnScrollProps) => {
    const { scrollOffset } = props;

    if (scrollOffset === 0) {
      this.props.model.loadLogs();
    }
  };

  scrollToBottom = () => {
    if (!this.virtualListDiv.current) return;
    this.virtualListDiv.current.scrollTop = this.virtualListDiv.current.scrollHeight;
  };

  scrollToItem = (index: number, align: Align) => {
    this.virtualListRef.current?.scrollToItem(index, align);
  };

  onScroll = (props: ListOnScrollProps) => {
    this.isLastLineVisible = false;
    this.onScrollDebounced(props);
  };

  onScrollDebounced = debounce((props: ListOnScrollProps) => {
    const virtualList = this.virtualListDiv.current;

    if (virtualList) {
      this.setButtonVisibility(props, virtualList);
      this.setLastLineVisibility(props, virtualList);
      this.checkLoadIntent(props);
    }
  }, 700); // Increasing performance and giving some time for virtual list to settle down

  /**
   * A function is called by VirtualList for rendering each of the rows
   * @param rowIndex index of the log element in displayLogs array
   * @returns A react element with a row itself
   */
  getLogRow = (rowIndex: number) => {
    const { searchQuery, searchMode, filteredIndices, isActiveOverlay } = this.props.model.searchStore;
    const item = this.displayLogs[rowIndex];

    if (item === undefined) {
      return null;
    }

    const ansiToHtml = (ansi: string) => DOMPurify.sanitize(colorConverter.ansi_to_html(ansi));
    const originalLineIndex = (searchMode === "filter" && searchQuery.trim())
      ? (filteredIndices[rowIndex] ?? rowIndex)
      : rowIndex;

    if (searchQuery.trim()) {
      const regex = this.props.model.searchStore.getCurrentRegex();

      if (regex) {
        const matchRegex = new RegExp(regex.source, regex.flags);
        const matches: Array<{ start: number; end: number; text: string }> = [];
        let match: RegExpExecArray | null;

        while ((match = matchRegex.exec(item)) !== null) {
          if (match[0].length === 0) {
            matchRegex.lastIndex++;
            continue;
          }
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
          });
          if (!matchRegex.global) break;
        }

        if (matches.length > 0) {
          const contents: React.ReactElement[] = [];
          let lastIndex = 0;

          matches.forEach((m, matchIdx) => {
            if (m.start > lastIndex) {
              const textBefore = item.substring(lastIndex, m.start);

              contents.push(
                <span
                  key={`text-${lastIndex}`}
                  dangerouslySetInnerHTML={{ __html: ansiToHtml(textBefore) }}
                />,
              );
            }

            const active = isActiveOverlay(originalLineIndex, matchIdx);

            contents.push(
              <span
                key={`match-${m.start}-${matchIdx}`}
                className={cssNames("overlay", { active })}
                dangerouslySetInnerHTML={{ __html: ansiToHtml(m.text) }}
              />,
            );

            lastIndex = m.end;
          });

          if (lastIndex < item.length) {
            const textAfter = item.substring(lastIndex);

            contents.push(
              <span
                key={`text-${lastIndex}`}
                dangerouslySetInnerHTML={{ __html: ansiToHtml(textAfter) }}
              />,
            );
          }

          return (
            <div className={cssNames("LogRow")}>
              {contents}
              <br />
            </div>
          );
        }
      }
    }

    return (
      <div className={cssNames("LogRow")}>
        <span dangerouslySetInnerHTML={{ __html: ansiToHtml(item) }} />
        <br />
      </div>
    );
  };

  render() {
    if (this.props.model.isLoading.get()) {
      return (
        <div className="LogList flex box grow align-center justify-center">
          <Spinner />
        </div>
      );
    }

    if (!this.logs.length) {
      return (
        <div className="LogList flex box grow align-center justify-center">
          There are no logs available for container
          {" "}
          {this.props.model.logTabData.get()?.selectedContainer}
        </div>
      );
    }

    const isFilterActive = this.props.model.searchStore.searchMode === "filter" && Boolean(this.props.model.searchStore.searchQuery.trim());

    if (isFilterActive && !this.displayLogs.length) {
      return (
        <div className="LogList flex box grow align-center justify-center">
          No log entries matching filter &quot;{this.props.model.searchStore.searchQuery}&quot;
        </div>
      );
    }

    const isWordWrap = Boolean(this.props.model.logTabData.get()?.wordWrap);

    return (
      <div className={cssNames("LogList flex", { "word-wrap": isWordWrap })}>
        <VirtualList
          items={this.displayLogs}
          rowHeights={this.rowHeights}
          getRow={this.getLogRow}
          onScroll={this.onScroll}
          outerRef={this.virtualListDiv}
          ref={this.virtualListRef}
          className="box grow"
        />
        {this.isJumpButtonVisible && (
          <ToBottom onClick={this.scrollToBottom} />
        )}
      </div>
    );
  }
}

const InjectedNonForwardedLogList = withInjectables<Dependencies, LogListProps & { innerRef: ForwardedRef<LogListRef> }>(NonForwardedLogList, {
  getProps: (di, props) => ({
    ...props,
    state: di.inject(userPreferencesStateInjectable),
  }),
});

export const LogList = React.forwardRef<LogListRef, LogListProps>((props, ref) => (
  <InjectedNonForwardedLogList {...props} innerRef={ref} />
));
