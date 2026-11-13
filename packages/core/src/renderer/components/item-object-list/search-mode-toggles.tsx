/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { cssNames } from "@openlens/utilities";
import type { PageFiltersStore } from "./page-filters/store";
import pageFiltersStoreInjectable from "./page-filters/store.injectable";

interface Dependencies {
  pageFiltersStore: PageFiltersStore;
}

const NonInjectedSearchModeToggles = observer(({ pageFiltersStore }: Dependencies) => {
  const { searchMatchCase, searchUseRegex } = pageFiltersStore;
  const renderToggle = (box: typeof searchMatchCase, label: string, title: string, testId: string) => (
    <button
      type="button"
      className={cssNames("search-mode-toggle", { active: box.get() })}
      aria-pressed={box.get()}
      aria-label={title}
      title={title}
      data-testid={testId}
      onMouseDown={event => event.preventDefault()}
      onClick={() => box.set(!box.get())}
    >
      {label}
    </button>
  );

  return (
    <span className="search-mode-toggles" data-testid="search-mode-toggles">
      {renderToggle(searchMatchCase, "Aa", "Match case", "search-mode-match-case")}
      {renderToggle(searchUseRegex, ".*", "Use regular expression", "search-mode-regex")}
    </span>
  );
});

export const SearchModeToggles = withInjectables<Dependencies>(NonInjectedSearchModeToggles, {
  getProps: (di, props) => ({
    ...props,
    pageFiltersStore: di.inject(pageFiltersStoreInjectable),
  }),
});
