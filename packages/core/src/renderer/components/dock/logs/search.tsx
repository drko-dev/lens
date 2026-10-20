/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./search.scss";

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { SearchInput } from "../../input";
import { Icon } from "../../icon";
import type { LogTabViewModel } from "./logs-view-model";
import { cssNames } from "@openlens/utilities";

export interface PodLogSearchProps {
  onSearch?: (query: string) => void;
  scrollToOverlay: (lineNumber: number | undefined) => void;
  model: LogTabViewModel;
}

export const LogSearch = observer(({ onSearch, scrollToOverlay, model: { logTabData, searchStore, ...model }}: PodLogSearchProps) => {
  const tabData = logTabData.get();

  if (!tabData) {
    return null;
  }

  const logs = tabData.showTimestamps
    ? model.logs.get()
    : model.logsWithoutTimestamps.get();

  const {
    setNextOverlayActive,
    setPrevOverlayActive,
    searchQuery,
    occurrences,
    activeFind,
    totalFinds,
    searchMode,
    useRegex,
    matchCase,
    regexError,
    filteredCount,
  } = searchStore;

  const jumpDisabled = searchMode === "filter" || !searchQuery || !occurrences.length;

  const setSearch = (query: string) => {
    searchStore.onSearch(logs, query);
    onSearch?.(query);

    if (searchStore.searchMode === "search") {
      scrollToOverlay(searchStore.activeOverlayLine);
    }
  };

  const toggleSearchMode = () => {
    const nextMode = searchMode === "search" ? "filter" : "search";

    searchStore.setSearchMode(nextMode, logs);
  };

  const toggleUseRegex = () => {
    searchStore.setUseRegex(!useRegex, logs);
  };

  const toggleMatchCase = () => {
    searchStore.setMatchCase(!matchCase, logs);
  };

  const onPrevOverlay = () => {
    setPrevOverlayActive();
    scrollToOverlay(searchStore.activeOverlayLine);
  };

  const onNextOverlay = () => {
    setNextOverlayActive();
    scrollToOverlay(searchStore.activeOverlayLine);
  };

  const onClear = () => {
    setSearch("");
  };

  const onKeyDown = (evt: React.KeyboardEvent<any>) => {
    if (evt.key === "Enter") {
      if (searchMode === "search") {
        if (evt.shiftKey) {
          onPrevOverlay();
        } else {
          onNextOverlay();
        }
      }
    } else if (evt.key === "Escape") {
      onClear();
    }
  };

  useEffect(() => {
    // Refresh search or filtering when logs change
    searchStore.onSearch(logs);
  }, [logs]);

  return (
    <div className="LogSearch flex box grow justify-flex-end gaps align-center" data-testid="log-search-bar">
      {regexError && (
        <span className="regex-error" title={regexError} data-testid="log-regex-error">
          <Icon material="warning" small />
          <span>Regex Error</span>
        </span>
      )}

      {/* Mode switcher: Search vs Filter */}
      <button
        type="button"
        className={cssNames("search-toggle-btn", { active: searchMode === "filter" })}
        onClick={toggleSearchMode}
        title={searchMode === "filter" ? "Filter Mode (Only matching lines shown)" : "Search Mode (All lines shown, matches highlighted)"}
        data-testid="log-search-mode-toggle"
      >
        <Icon material={searchMode === "filter" ? "filter_alt" : "search"} small />
        <span>{searchMode === "filter" ? "Filter" : "Search"}</span>
      </button>

      {/* Regex toggle */}
      <button
        type="button"
        className={cssNames("search-toggle-btn text-btn", { active: useRegex })}
        onClick={toggleUseRegex}
        title="Use Regular Expression (.*)"
        data-testid="log-search-regex-toggle"
      >
        .*
      </button>

      {/* Match case toggle */}
      <button
        type="button"
        className={cssNames("search-toggle-btn text-btn", { active: matchCase })}
        onClick={toggleMatchCase}
        title="Match Case (Aa)"
        data-testid="log-search-case-toggle"
      >
        Aa
      </button>

      <SearchInput
        value={searchQuery}
        onChange={setSearch}
        placeholder={searchMode === "filter" ? "Filter..." : "Search..."}
        showClearIcon={true}
        contentRight={
          searchMode === "search" ? (
            totalFinds > 0 ? (
              <div className="find-count" data-testid="log-find-count">
                {`${activeFind} / ${totalFinds}`}
              </div>
            ) : searchQuery && !regexError ? (
              <div className="find-count" data-testid="log-find-count">0 / 0</div>
            ) : null
          ) : (
            searchQuery && !regexError ? (
              <div className="find-count" data-testid="log-filter-count">
                {`${filteredCount} / ${logs.length}`}
              </div>
            ) : null
          )
        }
        onClear={onClear}
        onKeyDown={onKeyDown}
      />

      {searchMode === "search" && (
        <>
          <Icon
            material="keyboard_arrow_up"
            tooltip="Previous Match (Shift+Enter)"
            onClick={onPrevOverlay}
            disabled={jumpDisabled}
            data-testid="log-search-prev-btn"
          />
          <Icon
            material="keyboard_arrow_down"
            tooltip="Next Match (Enter)"
            onClick={onNextOverlay}
            disabled={jumpDisabled}
            data-testid="log-search-next-btn"
          />
        </>
      )}
    </div>
  );
});
