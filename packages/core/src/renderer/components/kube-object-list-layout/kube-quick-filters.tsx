/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./kube-quick-filters.scss";

import React, { useState } from "react";
import { observer } from "mobx-react";
import { cssNames } from "@openlens/utilities";
import { Icon } from "../icon";
import type { PageFiltersStore } from "../item-object-list/page-filters/store";
import { FilterType } from "../item-object-list/page-filters/store";
import { withInjectables } from "@ogre-tools/injectable-react";
import pageFiltersStoreInjectable from "../item-object-list/page-filters/store.injectable";
import type { KubeObject } from "@openlens/kube-object";

export interface KubeQuickFiltersProps<K extends KubeObject = KubeObject> {
  rawItems: K[];
  resourceKind?: string;
  onExportCsv?: () => void;
  showExportCsv?: boolean;
}

interface Dependencies {
  pageFiltersStore: PageFiltersStore;
}

const COMMON_POD_STATUSES = ["Running", "Pending", "Failed", "Succeeded"];

const NonInjectedKubeQuickFilters = observer(<K extends KubeObject>({
  rawItems,
  resourceKind,
  onExportCsv,
  showExportCsv = true,
  pageFiltersStore,
}: KubeQuickFiltersProps<K> & Dependencies) => {
  const [labelInput, setLabelInput] = useState("");

  const activeStatusValues = new Set(
    pageFiltersStore.getValues(FilterType.STATUS).map(s => s.toLowerCase()),
  );
  const activeLabelValues = pageFiltersStore.getValues(FilterType.LABEL);
  const hasActiveFilters = pageFiltersStore.activeFilters.length > 0;

  // Determine available statuses from rawItems
  const statusCounts = new Map<string, number>();
  for (const item of rawItems) {
    const status = (
      typeof (item as unknown as { getStatusMessage?: () => string }).getStatusMessage === "function"
        ? (item as unknown as { getStatusMessage: () => string }).getStatusMessage()
        : (item as unknown as { status?: { phase?: string } }).status?.phase
    );
    if (status) {
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
  }

  // Choose statuses to display: either common pod statuses or discovered statuses
  let displayStatuses: string[] = [];
  if (resourceKind === "Pod" || resourceKind === "Pods") {
    // Show standard pod statuses if present or relevant
    displayStatuses = COMMON_POD_STATUSES.filter(s => statusCounts.has(s) || activeStatusValues.has(s.toLowerCase()));
    if (displayStatuses.length === 0) {
      displayStatuses = Array.from(statusCounts.keys()).slice(0, 5);
    }
  } else if (statusCounts.size > 0 && statusCounts.size <= 8) {
    displayStatuses = Array.from(statusCounts.keys());
  }

  const toggleStatusFilter = (status: string) => {
    const isCurrentlyActive = activeStatusValues.has(status.toLowerCase());
    if (isCurrentlyActive) {
      pageFiltersStore.removeFilter({
        type: FilterType.STATUS,
        value: status,
      });
    } else {
      pageFiltersStore.addFilter({
        type: FilterType.STATUS,
        value: status,
      });
    }
  };

  const onAddLabelFilter = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = labelInput.trim();
    if (!trimmed) return;

    if (!activeLabelValues.includes(trimmed)) {
      pageFiltersStore.addFilter({
        type: FilterType.LABEL,
        value: trimmed,
      });
    }
    setLabelInput("");
  };

  const onClearAllFilters = () => {
    pageFiltersStore.reset();
  };

  return (
    <div className="KubeQuickFilters" data-testid="kube-quick-filters">
      {displayStatuses.length > 0 && (
        <>
          <span className="quick-filters-label">
            <Icon material="filter_list" small />
            Status:
          </span>
          <div className="status-chips" data-testid="quick-filter-status-chips">
            {displayStatuses.map(status => {
              const isActive = activeStatusValues.has(status.toLowerCase());
              const count = statusCounts.get(status) || 0;

              return (
                <button
                  key={status}
                  type="button"
                  className={cssNames("status-chip", { active: isActive })}
                  onClick={() => toggleStatusFilter(status)}
                  data-testid={`quick-filter-chip-${status.toLowerCase()}`}
                >
                  <span>{status}</span>{" "}
                  <span className="chip-count">({count})</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <form className="label-filter-container" onSubmit={onAddLabelFilter}>
        <input
          type="text"
          placeholder="Filter label (key=value)..."
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
          data-testid="quick-filter-label-input"
        />
        <button
          type="submit"
          className="status-chip"
          disabled={!labelInput.trim()}
          data-testid="quick-filter-add-label-btn"
        >
          <Icon material="add" small />
          Add
        </button>
      </form>

      {hasActiveFilters && (
        <button
          type="button"
          className="clear-all-btn"
          onClick={onClearAllFilters}
          data-testid="quick-filter-clear-all-btn"
        >
          <Icon material="clear_all" small />
          Clear filters
        </button>
      )}

      {showExportCsv && onExportCsv && (
        <button
          type="button"
          className="export-csv-btn"
          onClick={onExportCsv}
          data-testid="export-csv-btn"
        >
          <Icon material="file_download" small />
          Export CSV
        </button>
      )}
    </div>
  );
});

export const KubeQuickFilters = withInjectables<Dependencies, KubeQuickFiltersProps<KubeObject>>(
  NonInjectedKubeQuickFilters,
  {
    getProps: (di, props) => ({
      ...props,
      pageFiltersStore: di.inject(pageFiltersStoreInjectable),
    }),
  },
) as <K extends KubeObject>(props: KubeQuickFiltersProps<K>) => React.ReactElement;
