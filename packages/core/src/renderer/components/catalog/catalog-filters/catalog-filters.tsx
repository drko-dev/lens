/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import styles from "./catalog-filters.module.scss";

import { observer } from "mobx-react";
import React from "react";
import type { CatalogEnvironmentFilter, CatalogFilterState } from "./catalog-filter-state.injectable";

const environmentOptions: { id: CatalogEnvironmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "production", label: "PROD" },
  { id: "staging", label: "STG" },
  { id: "development", label: "DEV" },
  { id: "testing", label: "TEST" },
  { id: "local", label: "LOCAL" },
  { id: "custom", label: "CUSTOM" },
  { id: "none", label: "None" },
];

export interface CatalogFiltersProps {
  state: CatalogFilterState;
  /** hide the environment/pinned controls (categories other than clusters) */
  showFilters: boolean;
  /** when provided, renders the visible "Add cluster" button */
  onAddCluster?: () => void;
}

export const CatalogFilters = observer(({ state, showFilters, onAddCluster }: CatalogFiltersProps) => (
  <div className={styles.filters} data-testid="catalog-filters">
    {showFilters && (
      <>
        <div
          className={styles.segmented}
          role="group"
          aria-label="Environment filter">
          {environmentOptions.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={styles.segment}
              aria-pressed={state.environment === id}
              data-testid={`catalog-filter-env-${id}`}
              onClick={() => state.setEnvironment(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.segment}
          aria-pressed={state.pinnedOnly}
          data-testid="catalog-filter-pinned"
          onClick={() => state.setPinnedOnly(!state.pinnedOnly)}
        >
          Pinned
        </button>
      </>
    )}
    {onAddCluster && (
      <button
        type="button"
        className={styles.add}
        data-testid="catalog-add-cluster-button"
        onClick={onAddCluster}
      >
        Add cluster
      </button>
    )}
  </div>
));

export const CatalogFilterEmpty = ({ onShowAll }: { onShowAll: () => void }) => (
  <div className={styles.empty} data-testid="catalog-filter-empty">
    <span>No entities match the current filters.</span>
    <button
      type="button"
      className={styles.segment}
      onClick={onShowAll}>
      Show all
    </button>
  </div>
);

export interface CatalogFilterEmptyFooterProps {
  state: CatalogFilterState;
  hasMatches: () => boolean;
}

export const CatalogFilterEmptyFooter = observer(({ state, hasMatches }: CatalogFilterEmptyFooterProps) => {
  if (state.isActive && !hasMatches()) {
    return <CatalogFilterEmpty onShowAll={() => state.reset()} />;
  }

  return null;
});
