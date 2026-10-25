/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./column-filter-popover.scss";

import React, { useState } from "react";
import { cssNames, stopPropagation } from "@openlens/utilities";
import { Icon } from "../icon";
import { Checkbox } from "../checkbox";
import { MenuActions } from "../menu/menu-actions";
import { MenuItem } from "../menu";
import { Input } from "../input";

export interface ColumnFilterPopoverProps {
  columnId: string;
  columnTitle?: string;
  values: string[];
  selectedValues: string[];
  onSelect: (selected: string[]) => void;
}

export function ColumnFilterPopover({
  columnId,
  columnTitle,
  values,
  selectedValues,
  onSelect,
}: ColumnFilterPopoverProps) {
  const [search, setSearch] = useState("");
  const isFiltered = selectedValues.length > 0;

  const filteredValues = values.filter(val =>
    val.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const toggleValue = (val: string) => {
    if (selectedValues.includes(val)) {
      onSelect(selectedValues.filter(v => v !== val));
    } else {
      onSelect([...selectedValues, val]);
    }
  };

  const selectAll = () => {
    const combined = Array.from(new Set([...selectedValues, ...filteredValues]));

    onSelect(combined);
  };

  const clearAll = () => {
    onSelect([]);
  };

  const trigger = (
    <Icon
      material="filter_alt"
      className={cssNames("column-filter-icon", { active: isFiltered })}
      data-testid={`column-filter-${columnId}`}
      tooltip={isFiltered ? `Filtered (${selectedValues.length})` : `Filter ${columnTitle || columnId}`}
    />
  );

  return (
    <div
      className="ColumnFilterPopover"
      onClick={stopPropagation}
      onMouseDown={stopPropagation}
    >
      <MenuActions
        id={`column-filter-menu-${columnId}`}
        className="ColumnFilterMenu"
        triggerIcon={trigger}
        toolbar={false}
        autoCloseOnSelect={false}
      >
        <div className="column-filter-header">
          <span>{columnTitle || columnId}</span>
          {isFiltered && (
            <span className="active-badge">
              {selectedValues.length}
              {" "}
              active
            </span>
          )}
        </div>

        {values.length > 4 && (
          <div className="column-filter-search">
            <Input
              theme="round-black"
              placeholder="Search..."
              value={search}
              onChange={setSearch}
            />
          </div>
        )}

        <div className="column-filter-actions">
          <a onClick={selectAll}>Select all</a>
          <a onClick={clearAll}>Clear</a>
        </div>

        <div className="column-filter-list">
          {filteredValues.length === 0 ? (
            <div className="column-filter-empty">No values found</div>
          ) : (
            filteredValues.map(val => (
              <MenuItem
                key={val}
                className="input"
                onClick={() => toggleValue(val)}
              >
                <div
                  className="checkbox-wrapper"
                  onClick={stopPropagation}
                >
                  <Checkbox
                    label={val}
                    value={selectedValues.includes(val)}
                    onChange={() => toggleValue(val)}
                  />
                </div>
              </MenuItem>
            ))
          )}
        </div>
      </MenuActions>
    </div>
  );
}
