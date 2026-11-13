/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { computed, observable, reaction, makeObservable, action } from "mobx";
import type { PageParam } from "../../../navigation/page-param";

export enum FilterType {
  SEARCH = "search",
  STATUS = "status",
  LABEL = "label",
  COLUMN = "column",
}

export interface Filter {
  type: FilterType;
  value: string;
}

interface Dependencies {
  readonly searchUrlParam: PageParam<string>;
}

export class PageFiltersStore {
  protected filters = observable.array<Filter>([], { deep: false });
  protected isDisabled = observable.map<FilterType, boolean>();

  // Lens-style search modes: "Aa" (match case) and ".*" (regular expression).
  readonly searchMatchCase = observable.box(false);
  readonly searchUseRegex = observable.box(false);

  /**
   * Builds the predicate used by list search for the current search modes.
   * Returns undefined for an invalid regular expression so callers can keep
   * showing the unfiltered list while the user is still typing.
   */
  createSearchMatcher(search: string): ((source: string) => boolean) | undefined {
    const matchCase = this.searchMatchCase.get();

    if (this.searchUseRegex.get()) {
      try {
        const regex = new RegExp(search, matchCase ? "" : "i");

        return source => regex.test(source);
      } catch {
        return undefined;
      }
    }

    if (matchCase) {
      return source => source.includes(search);
    }

    const needle = search.toLowerCase();

    return source => source.toLowerCase().includes(needle);
  }

  @computed get activeFilters() {
    return this.filters.filter(filter => !this.isDisabled.get(filter.type));
  }

  constructor(protected readonly dependencies: Dependencies) {
    makeObservable(this);
    autoBind(this);

    this.syncWithGlobalSearch();
  }

  protected syncWithGlobalSearch() {
    const disposers = [
      reaction(() => this.getValues(FilterType.SEARCH)[0], search => this.dependencies.searchUrlParam.set(search)),
      reaction(() => this.dependencies.searchUrlParam.get(), search => {
        const filter = this.getByType(FilterType.SEARCH);

        if (filter) {
          this.removeFilter(filter); // search filter might occur once
        }

        if (search) {
          this.addFilter({ type: FilterType.SEARCH, value: search }, true);
        }
      }, {
        fireImmediately: true,
      }),
    ];

    return () => disposers.forEach(dispose => dispose());
  }

  @action
  addFilter(filter: Filter, begin = false) {
    if (begin) this.filters.unshift(filter);
    else {
      this.filters.push(filter);
    }
  }

  @action
  removeFilter(filter: Filter) {
    if (!this.filters.remove(filter)) {
      const filterCopy = this.filters.find(f => f.type === filter.type && f.value === filter.value);

      if (filterCopy) this.filters.remove(filterCopy);
    }
  }

  getByType(type: FilterType, value?: any): Filter | undefined {
    return this.filters.find(filter => filter.type === type && (
      arguments.length > 1 ? filter.value === value : true
    ));
  }

  getValues(type: FilterType) {
    return this.filters
      .filter(filter => filter.type === type)
      .map(filter => filter.value);
  }

  isEnabled(type: FilterType) {
    return !this.isDisabled.get(type);
  }

  @action
  disable(type: FilterType | FilterType[]) {
    [type].flat().forEach(type => this.isDisabled.set(type, true));

    return () => this.enable(type);
  }

  @action
  enable(type: FilterType | FilterType[]) {
    [type].flat().forEach(type => this.isDisabled.delete(type));

    return () => this.disable(type);
  }

  @action
  reset() {
    if (this.isEnabled(FilterType.SEARCH)) {
      this.dependencies.searchUrlParam.clear();
    }

    this.filters.length = 0;
    this.isDisabled.clear();
  }
}
