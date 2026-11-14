/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { CatalogEntity } from "../../../../common/catalog";
import type { Cluster } from "../../../../common/cluster/cluster";
import {
  NavigatorClusterRow,
  resolveConfiguredClusterFallbackColor,
} from "../navigator-cluster-row";

const makeEntity = (id: string, name: string, background?: string): CatalogEntity => ({
  getId: () => id,
  getName: () => name,
  metadata: { uid: id, name, source: "kubeconfig" },
  spec: { icon: background ? { background } : undefined },
} as unknown as CatalogEntity);

const makeCluster = (id: string, name: string, clusterColor?: string): Cluster => ({
  id,
  contextName: { get: () => name },
  preferences: clusterColor ? { clusterColor } : {},
} as unknown as Cluster);

describe("NavigatorClusterRow", () => {
  it("uses configured clusterColor over random fallback", () => {
    const entity = makeEntity("c1", "k3s-vps-wireguard");
    const cluster = makeCluster("c1", "k3s-vps-wireguard", "#06B6D4");

    render(<NavigatorClusterRow entity={entity} cluster={cluster} onRun={jest.fn()} />);

    const row = screen.getByTestId("navigator-cluster-other");

    expect(row.style.getPropertyValue("--nv-active-cluster-color")).toBe("#06B6D4");
  });

  it("inherits configured color from matching duplicate cluster context", () => {
    const duplicateEntity = makeEntity("c-dup", "k3s-vps-wireguard");
    const duplicateCluster = makeCluster("c-dup", "k3s-vps-wireguard");
    const primaryCluster = makeCluster("c-primary", "k3s-vps-wireguard", "#06B6D4");

    const fallbackColor = resolveConfiguredClusterFallbackColor(duplicateEntity, [duplicateCluster, primaryCluster]);

    expect(fallbackColor).toBe("#06B6D4");

    const onRun = jest.fn();

    render(
      <NavigatorClusterRow
        entity={duplicateEntity}
        cluster={duplicateCluster}
        fallbackColor={fallbackColor}
        onRun={onRun}
      />,
    );

    const row = screen.getByTestId("navigator-cluster-other");

    expect(row.style.getPropertyValue("--nv-active-cluster-color")).toBe("#06B6D4");
    fireEvent.click(row);
    expect(onRun).toHaveBeenCalledWith(duplicateEntity);
  });
});
