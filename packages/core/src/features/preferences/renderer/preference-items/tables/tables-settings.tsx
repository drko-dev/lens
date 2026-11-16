/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import { Input } from "../../../../../renderer/components/input";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { TableDensity } from "../appearance/table-density/table-density";
import type { UserPreferencesState } from "../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../user-preferences/common/state.injectable";

export const tablesRowLineHeightKey = "novakube:tables:row-line-height";
export const tablesSearchHistoryLimitKey = "novakube:tables:search-history-limit";
export const tablesSearchFavoritesLimitKey = "novakube:tables:search-favorites-limit";

function readNumberPref(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedTablesSettings = observer(({ state }: Dependencies) => {
  const [rowLineHeight, setRowLineHeight] = useState<number>(() => readNumberPref(tablesRowLineHeightKey, 18));
  const [searchHistoryLimit, setSearchHistoryLimit] = useState<number>(() => readNumberPref(tablesSearchHistoryLimitKey, 10));
  const [searchFavoritesLimit, setSearchFavoritesLimit] = useState<number>(() => readNumberPref(tablesSearchFavoritesLimitKey, 10));
  const hiddenMap = state.hiddenTableColumns;
  const hiddenEntries = hiddenMap ? Array.from(hiddenMap.entries()).filter(([, cols]) => cols.size > 0) : [];

  const handleResetColumns = () => {
    state.hiddenTableColumns = new Map();
  };

  const updateNumericPref = (key: string, value: string, min: number, max: number, setter: (v: number) => void, cssVar?: string) => {
    const num = Math.max(min, Math.min(max, Number(value) || min));
    setter(num);
    try {
      window.localStorage.setItem(key, String(num));
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, `${num}px`);
      }
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div data-testid="tables-preferences-section">
      <TableDensity />
      <hr className="small" />
      <section id="tables-row-line-height">
        <SubTitle title="Row Line Height" />
        <Input
          theme="round-black"
          type="number"
          min={14}
          max={26}
          value={String(rowLineHeight)}
          onChange={(v) => updateNumericPref(tablesRowLineHeightKey, v, 14, 26, setRowLineHeight, "--table-row-line-height")}
          data-testid="tables-row-line-height-input"
        />
      </section>
      <hr className="small" />
      <section id="tables-search-limits">
        <SubTitle title="Search History Limit" />
        <Input
          theme="round-black"
          type="number"
          min={0}
          max={50}
          value={String(searchHistoryLimit)}
          onChange={(v) => updateNumericPref(tablesSearchHistoryLimitKey, v, 0, 50, setSearchHistoryLimit)}
          data-testid="tables-search-history-limit-input"
        />
        <div className="hint" style={{ marginBottom: "12px" }}>
          Maximum number of recent table searches remembered across lists.
        </div>
        <SubTitle title="Search Favorites Limit" />
        <Input
          theme="round-black"
          type="number"
          min={0}
          max={50}
          value={String(searchFavoritesLimit)}
          onChange={(v) => updateNumericPref(tablesSearchFavoritesLimitKey, v, 0, 50, setSearchFavoritesLimit)}
          data-testid="tables-search-favorites-limit-input"
        />
        <div className="hint">
          How many searches can be starred as favorites.
        </div>
      </section>
      <hr className="small" />
      <section id="tables-hidden-columns">
        <SubTitle title="Column Visibility" />
        <p className="hint" style={{ marginBottom: "12px" }}>
          Individual table columns can be toggled from the column menu (⋮) in any resource table.
        </p>
        {hiddenEntries.length === 0 ? (
          <div className="hint" data-testid="no-hidden-columns-msg">
            All resource table columns are currently visible.
          </div>
        ) : (
          <div>
            <ul style={{ marginBottom: "12px", paddingLeft: "18px", fontSize: "13px" }}>
              {hiddenEntries.map(([tableId, cols]) => (
                <li key={tableId}>
                  <strong>{tableId}</strong>: {Array.from(cols).join(", ")}
                </li>
              ))}
            </ul>
            <Button
              primary
              label="Reset Hidden Columns"
              onClick={handleResetColumns}
              data-testid="reset-hidden-columns-btn"
            />
          </div>
        )}
      </section>
    </div>
  );
});

export const TablesSettings = withInjectables<Dependencies>(NonInjectedTablesSettings, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
