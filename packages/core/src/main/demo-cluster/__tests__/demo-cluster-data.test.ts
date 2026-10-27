/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDemoNodes } from "../demo-cluster-data";

describe("demo cluster node fixtures", () => {
  it("gives every Node a spec so the Nodes view can read taints", () => {
    const { items } = getDemoNodes();

    expect(items.length).toBeGreaterThan(0);

    for (const node of items) {
      expect(node.spec).toBeDefined();
    }
  });

  it("taints only the control-plane node", () => {
    const { items } = getDemoNodes();
    const taintsOf = (name: string) => items.find(n => n.metadata.name === name)?.spec?.taints ?? [];

    expect(taintsOf("demo-control-plane")).toHaveLength(1);
    expect(taintsOf("demo-worker-1")).toHaveLength(0);
  });
});
