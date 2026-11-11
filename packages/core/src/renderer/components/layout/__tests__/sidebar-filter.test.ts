/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { computed } from "mobx";
import type { HierarchicalSidebarItem } from "../sidebar-items.injectable";
import { filterNavigatorItems } from "../sidebar-filter";

const makeItem = (id: string, children: HierarchicalSidebarItem[] = []): HierarchicalSidebarItem => ({
  id,
  parentId: null,
  orderNumber: 0,
  title: id,
  children,
  onClick: jest.fn(),
  isVisible: computed(() => true),
  isActive: computed(() => false),
});

describe("Navigator search tree", () => {
  const pods = makeItem("pods");
  const deployments = makeItem("deployments");
  const workloads = makeItem("workloads", [pods, deployments]);
  const config = makeItem("config", [makeItem("secrets")]);
  const items = [workloads, config];

  it("returns the original hierarchy when search is empty", () => {
    expect(filterNavigatorItems(items, "  ")).toBe(items);
  });

  it("keeps ancestry and just the matching descendants", () => {
    const filtered = filterNavigatorItems(items, "PODS");
    expect(filtered.map(item => item.id)).toEqual(["workloads"]);
    expect(filtered[0].children.map(item => item.id)).toEqual(["pods"]);
    expect(workloads.children).toEqual([pods, deployments]);
  });

  it("returns an entire matching section with its children", () => {
    expect(filterNavigatorItems(items, "workload")).toEqual([workloads]);
  });

  it("returns no items for an unmatched query", () => {
    expect(filterNavigatorItems(items, "not-a-resource")).toEqual([]);
  });

  it("matches case-insensitively and trims whitespace", () => {
    expect(filterNavigatorItems(items, " SECRETS ")[0].children.map(item => item.id)).toEqual(["secrets"]);
  });
});
