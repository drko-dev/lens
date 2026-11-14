/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { RootNavigatorPanel } from "../root-navigator-panel";
import catalogEntityRegistryInjectable from "../../../api/catalog/entity/registry.injectable";
import activeThemeInjectable from "../../../themes/active.injectable";
import { novakubeThemeName } from "../../../themes/novakube.injectable";
import currentPathInjectable from "../../../routes/current-path.injectable";
import { KubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";

const makeCluster = (id: string, name: string) => new KubernetesCluster({
  metadata: { uid: id, name, labels: {}},
  spec: { kubeconfigPath: "/mock/kubeconfig", kubeconfigContext: name, icon: { background: "#ff0000" }},
  status: { phase: "disconnected" },
});

describe("RootNavigatorPanel", () => {
  const onRun = jest.fn();
  const clusters = [makeCluster("c-1", "dev-cluster"), makeCluster("c-2", "prod-cluster")];

  const render = (theme: string, path: string) => {
    const di = getDiForUnitTesting();

    di.override(catalogEntityRegistryInjectable, () => ({
      getItemsForApiKind: () => clusters,
      onRun,
    }) as any);
    di.override(activeThemeInjectable, () => computed(() => ({ name: theme }) as any));
    di.override(currentPathInjectable, () => computed(() => path));

    return renderFor(di)(<RootNavigatorPanel />);
  };

  beforeEach(() => onRun.mockClear());

  it("renders selector bar, heading and real cluster rows on welcome under NovaKube", () => {
    render(novakubeThemeName, "/welcome");

    expect(screen.getByTestId("root-navigator-selector")).toHaveTextContent("Home");
    expect(screen.getByTestId("navigator-clusters-heading")).toBeInTheDocument();
    expect(screen.getByText("dev-cluster")).toBeInTheDocument();
    expect(screen.getByText("prod-cluster")).toBeInTheDocument();
  });

  it("renders on preferences", () => {
    render(novakubeThemeName, "/preferences/app");

    expect(screen.getByTestId("root-navigator-panel")).toBeInTheDocument();
  });

  it("opens the cluster through entityRegistry.onRun on click", async () => {
    render(novakubeThemeName, "/welcome");
    await userEvent.click(screen.getByLabelText("Open prod-cluster"));

    expect(onRun).toHaveBeenCalledWith(clusters[1]);
  });

  it("is not rendered for another theme", () => {
    render("lens-dark", "/welcome");

    expect(screen.queryByTestId("root-navigator-panel")).not.toBeInTheDocument();
  });

  it("is not rendered on other routes", () => {
    render(novakubeThemeName, "/catalog");

    expect(screen.queryByTestId("root-navigator-panel")).not.toBeInTheDocument();
  });
});
