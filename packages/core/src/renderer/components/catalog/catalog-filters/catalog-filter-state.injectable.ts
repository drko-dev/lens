/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { action, makeObservable, observable } from "mobx";
import type { CatalogEntity } from "../../../../common/catalog";
import type { ClusterEnvironment } from "../../../../common/cluster/environment-types";
import type { ResolveEntityEnvironment } from "../resolve-entity-environment.injectable";

export type CatalogEnvironmentFilter = "all" | ClusterEnvironment;

/**
 * R5-08: in-memory UI state only, nothing is persisted.
 */
export class CatalogFilterState {
  environment: CatalogEnvironmentFilter = "all";
  pinnedOnly = false;

  constructor() {
    makeObservable(this, {
      environment: observable,
      pinnedOnly: observable,
      setEnvironment: action,
      setPinnedOnly: action,
      reset: action,
    });
  }

  get isActive() {
    return this.environment !== "all" || this.pinnedOnly;
  }

  setEnvironment(environment: CatalogEnvironmentFilter) {
    this.environment = environment;
  }

  setPinnedOnly(pinnedOnly: boolean) {
    this.pinnedOnly = pinnedOnly;
  }

  reset() {
    this.environment = "all";
    this.pinnedOnly = false;
  }

  apply(
    entities: CatalogEntity[],
    resolveEnvironment: ResolveEntityEnvironment,
    isPinned: (entity: CatalogEntity) => boolean,
  ) {
    return entities.filter(entity => (
      (this.environment === "all" || resolveEnvironment(entity)?.id === this.environment)
      && (!this.pinnedOnly || isPinned(entity))
    ));
  }
}

const catalogFilterStateInjectable = getInjectable({
  id: "catalog-filter-state",
  instantiate: () => new CatalogFilterState(),
});

export default catalogFilterStateInjectable;
