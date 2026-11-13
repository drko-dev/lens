/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import pageFiltersStoreInjectable from "./page-filters/store.injectable";
import type { PageFiltersStore } from "./page-filters/store";
import { SearchModeToggles } from "./search-mode-toggles";

describe("list search modes (Aa / .*)", () => {
  let store: PageFiltersStore;
  let render: ReturnType<typeof renderFor>;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    store = di.inject(pageFiltersStoreInjectable);
    render = renderFor(di);
  });

  const filter = (search: string) => {
    const matches = store.createSearchMatcher(search);

    return matches ? ["nginx-Abc", "redis-abc", "kube-proxy"].filter(matches) : "invalid";
  };

  it("matches case-insensitively by default", () => {
    expect(filter("ABC")).toEqual(["nginx-Abc", "redis-abc"]);
  });

  it("respects case when Aa is toggled on", () => {
    const result = render(<SearchModeToggles />);

    fireEvent.click(result.getByTestId("search-mode-match-case"));

    expect(result.getByTestId("search-mode-match-case")).toHaveAttribute("aria-pressed", "true");
    expect(filter("Abc")).toEqual(["nginx-Abc"]);
  });

  it("treats the query as a regular expression when .* is toggled on", () => {
    const result = render(<SearchModeToggles />);

    fireEvent.click(result.getByTestId("search-mode-regex"));

    expect(filter("^(nginx|kube)-")).toEqual(["nginx-Abc", "kube-proxy"]);
    expect(filter("(")).toBe("invalid");
  });
});
