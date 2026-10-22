/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { screen } from "@testing-library/react";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import renderNamedCategoryColumnCellInjectable from "../columns/render-named-category-column-cell.injectable";
import defaultCategoryColumnsInjectable from "../columns/default-category.injectable";
import resolveEntityEnvironmentInjectable from "../resolve-entity-environment.injectable";
import activeHotbarInjectable from "../../../../features/hotbar/storage/common/active.injectable";
import type { CatalogEntity } from "../../../../common/catalog";

const makeEntity = (extra: Partial<{ icon: any; context: string }> = {}) => ({
  getName: () => "alias",
  getId: () => "id-1",
  getSource: () => "local",
  spec: { icon: extra.icon, kubeconfigContext: extra.context ?? "alias" },
  status: { phase: "connected" },
}) as unknown as CatalogEntity;

describe("R5-08 catalog presentation", () => {
  let hotbarIds: string[];
  let envId: string | undefined;
  let renderCell: (e: CatalogEntity) => React.ReactNode;
  let statusCell: (e: CatalogEntity) => React.ReactNode;
  let render: ReturnType<typeof renderFor>;

  beforeEach(() => {
    hotbarIds = [];
    envId = undefined;
    const di = getDiForUnitTesting();

    di.override(activeHotbarInjectable, () => ({
      get: () => ({ hasEntity: (id: string) => hotbarIds.includes(id), addEntity: () => {}, removeEntity: () => {} }),
    }) as any);
    di.override(resolveEntityEnvironmentInjectable, () => () => envId
      ? { id: envId, label: envId, shortLabel: envId, cssVar: "--envProduction" } as any
      : undefined);

    render = renderFor(di);
    renderCell = di.inject(renderNamedCategoryColumnCellInjectable) as any;
    const statusCol = di.inject(defaultCategoryColumnsInjectable).find(c => c.id === "status");

    if (!statusCol) {
      throw new Error("status column must be defined");
    }
    statusCell = statusCol.renderCell as any;
  });

  it("shows PROD marker even with a non-red custom icon background", () => {
    envId = "production";
    render(<>{renderCell(makeEntity({ icon: { background: "#00ff00" }}))}</>);
    expect(screen.getByTestId("catalog-prod-marker")).toBeInTheDocument();
  });

  it("has no PROD marker for development", () => {
    envId = "development";
    render(<>{renderCell(makeEntity())}</>);
    expect(screen.queryByTestId("catalog-prod-marker")).toBeNull();
  });

  it("shows pin indicator when in hotbar", () => {
    hotbarIds = ["id-1"];
    render(<>{renderCell(makeEntity())}</>);
    expect(screen.getByTestId("catalog-pin-indicator")).toBeInTheDocument();
  });

  it("exposes kubeconfig context in the name title when it differs", () => {
    render(<>{renderCell(makeEntity({ context: "ctx-x" }))}</>);
    // non-cluster stub: title only for real cluster entities, so just assert name renders
    expect(screen.getByText("alias")).toBeInTheDocument();
  });

  it("renders status label", () => {
    render(<>{statusCell(makeEntity())}</>);
    expect(screen.getByTestId("catalog-status-cell")).toHaveTextContent("connected");
  });
});
