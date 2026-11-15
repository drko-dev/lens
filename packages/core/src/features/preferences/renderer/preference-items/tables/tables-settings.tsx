/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { TableDensity } from "../appearance/table-density/table-density";
import type { UserPreferencesState } from "../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedTablesSettings = observer(({ state }: Dependencies) => {
  const hiddenMap = state.hiddenTableColumns;
  const hiddenEntries = hiddenMap ? Array.from(hiddenMap.entries()).filter(([, cols]) => cols.size > 0) : [];

  const handleResetColumns = () => {
    state.hiddenTableColumns = new Map();
  };

  return (
    <div data-testid="tables-preferences-section">
      <TableDensity />
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
