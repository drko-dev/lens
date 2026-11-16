/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import debounce from "lodash/debounce";
import { autorun, observable, makeObservable } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import type { InputProps } from "./input";
import { SearchInput } from "./search-input";
import type { PageParam } from "../../navigation/page-param";
import { withInjectables } from "@ogre-tools/injectable-react";
import searchUrlPageParamInjectable from "./search-url-page-param.injectable";
import { Icon } from "../icon";
import {
  tablesSearchFavoritesLimitKey,
  tablesSearchHistoryLimitKey,
} from "../../../features/preferences/renderer/preference-items/tables/tables-settings-keys";

const SEARCH_HISTORY_KEY = "novakube:tables:search-history";
const SEARCH_FAVORITES_KEY = "novakube:tables:search-favorites";

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readLimit(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const num = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(num) ? Math.max(0, num) : fallback;
  } catch {
    return fallback;
  }
}

export interface SearchInputUrlProps extends InputProps {
  compact?: boolean; // show only search-icon when not focused
}

interface Dependencies {
  searchUrlParam: PageParam<string>;
}

@observer
class NonInjectedSearchInputUrl extends React.Component<SearchInputUrlProps & Dependencies> {
  @observable inputVal = ""; // fix: use empty string on init to avoid react warnings
  @observable dropdownOpen = false;
  @observable history: string[] = readList(SEARCH_HISTORY_KEY);
  @observable favorites: string[] = readList(SEARCH_FAVORITES_KEY);

  readonly updateUrl = debounce((val: string) => this.props.searchUrlParam.set(val), 250);

  componentDidMount(): void {
    disposeOnUnmount(this, [
      autorun(() => this.inputVal = this.props.searchUrlParam.get()),
    ]);
  }

  recordHistory = (term: string) => {
    const trimmed = term.trim();
    const limit = readLimit(tablesSearchHistoryLimitKey, 10);

    if (!trimmed || limit <= 0) return;

    const next = [trimmed, ...this.history.filter((x) => x !== trimmed)].slice(0, limit);
    this.history = next;
    try { window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  toggleFavorite = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    const exists = this.favorites.includes(trimmed);
    const limit = readLimit(tablesSearchFavoritesLimitKey, 10);
    const next = exists
      ? this.favorites.filter((x) => x !== trimmed)
      : limit > 0
        ? [trimmed, ...this.favorites].slice(0, limit)
        : this.favorites;

    this.favorites = next;
    try { window.localStorage.setItem(SEARCH_FAVORITES_KEY, JSON.stringify(next)); } catch {}
  };

  setValue = (value: string) => {
    this.inputVal = value;
    this.updateUrl(value);
  };

  clear = () => {
    this.setValue("");
    this.updateUrl.flush();
  };

  onChange = (val: string, evt: React.ChangeEvent<any>) => {
    this.setValue(val);
    this.props.onChange?.(val, evt);
  };

  constructor(props: SearchInputUrlProps & Dependencies) {
    super(props);
    makeObservable(this);
  }

  render() {
    const { searchUrlParam, onFocus, onBlur, onKeyDown, ...searchInputProps } = this.props;
    const query = this.inputVal.trim().toLowerCase();
    const matchingFavorites = this.favorites.filter((x) => !query || x.toLowerCase().includes(query));
    const matchingHistory = this.history.filter((x) => !this.favorites.includes(x) && (!query || x.toLowerCase().includes(query)));
    const hasSuggestions = matchingFavorites.length > 0 || matchingHistory.length > 0 || this.inputVal.trim().length > 0;

    return (
      <div style={{ position: "relative" }}>
        <SearchInput
          value={this.inputVal}
          onChange={(val, event) => {
            this.setValue(val);
            this.props.onChange?.(val, event);
          }}
          onFocus={(e) => {
            this.history = readList(SEARCH_HISTORY_KEY);
            this.favorites = readList(SEARCH_FAVORITES_KEY);
            this.dropdownOpen = true;
            onFocus?.(e);
          }}
          onBlur={(e) => {
            if (this.inputVal.trim()) {
              this.recordHistory(this.inputVal);
            }
            setTimeout(() => { this.dropdownOpen = false; }, 160);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && this.inputVal.trim()) {
              this.recordHistory(this.inputVal);
            }
            onKeyDown?.(e);
          }}
          onClear={this.clear}
          {...searchInputProps}
        />
        {this.dropdownOpen && hasSuggestions && (
          <div
            data-testid="search-history-popover"
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 40,
              background: "var(--dialogBackground, #25272b)",
              border: "1px solid var(--borderColor, #3a3d42)",
              borderRadius: 4,
              boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
              padding: "4px 0",
              maxHeight: 240,
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            {this.inputVal.trim() && !this.favorites.includes(this.inputVal.trim()) && (
              <button
                type="button"
                data-testid="search-star-current"
                onClick={() => this.toggleFavorite(this.inputVal)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "6px 10px",
                  border: 0,
                  background: "transparent",
                  color: "var(--textColorPrimary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Icon material="star_border" smallest />
                <span>Star &ldquo;{this.inputVal.trim()}&rdquo; as favorite</span>
              </button>
            )}
            {matchingFavorites.map((term) => (
              <div
                key={`fav-${term}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    this.setValue(term);
                    this.updateUrl.flush();
                    this.dropdownOpen = false;
                  }}
                  style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, color: "inherit", cursor: "pointer" }}
                >
                  {term}
                </button>
                <button
                  type="button"
                  aria-label={`Unstar ${term}`}
                  onClick={() => this.toggleFavorite(term)}
                  style={{ background: "transparent", border: 0, color: "#f6ad55", cursor: "pointer" }}
                >
                  <Icon material="star" smallest />
                </button>
              </div>
            ))}
            {matchingHistory.map((term) => (
              <div
                key={`hist-${term}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    this.setValue(term);
                    this.updateUrl.flush();
                    this.dropdownOpen = false;
                  }}
                  style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, color: "inherit", cursor: "pointer" }}
                >
                  {term}
                </button>
                <button
                  type="button"
                  aria-label={`Star ${term}`}
                  onClick={() => this.toggleFavorite(term)}
                  style={{ background: "transparent", border: 0, color: "var(--textColorSecondary)", cursor: "pointer" }}
                >
                  <Icon material="star_border" smallest />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}

export const SearchInputUrl = withInjectables<Dependencies, SearchInputUrlProps>(NonInjectedSearchInputUrl, {
  getProps: (di, props) => ({
    ...props,
    searchUrlParam: di.inject(searchUrlPageParamInjectable),
  }),
});
