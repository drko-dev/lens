/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { screen, fireEvent } from "@testing-library/react";
import { ClusterAppearancePicker } from "../cluster-appearance-picker";
import { Cluster } from "../../../../common/cluster/cluster";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";

describe("<ClusterAppearancePicker />", () => {
  let cluster: Cluster;
  let onChange: jest.Mock;
  let render: any;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    render = renderFor(di);

    onChange = jest.fn();
    cluster = new Cluster({
      id: "test-cluster-id",
      contextName: "my-context-eu-west-1",
      kubeConfigPath: "/path/to/kubeconfig",
      preferences: {
        clusterName: "Production EU West",
        clusterEnvironment: "staging",
        clusterColor: "#F59E0B",
        clusterIcon: "cloud",
      },
    });
  });

  it("renders environment buttons and marks staging as active", () => {
    render(<ClusterAppearancePicker cluster={cluster} onChange={onChange} />);

    expect(screen.getByText("Environment Classification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Production" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Staging" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Development" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("changes environment to production and triggers onChange with hazard flag", () => {
    render(<ClusterAppearancePicker cluster={cluster} onChange={onChange} />);

    const prodButton = screen.getByRole("button", { name: "Production" });

    fireEvent.click(prodButton);

    expect(cluster.preferences.clusterEnvironment).toBe("production");
    expect(screen.getByText("PRODUCTION")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
  });

  it("allows setting a custom cluster alias", () => {
    render(<ClusterAppearancePicker cluster={cluster} onChange={onChange} />);

    const aliasInput = screen.getByPlaceholderText("my-context-eu-west-1");

    fireEvent.change(aliasInput, { target: { value: "EU Core Production" }});

    expect(cluster.preferences.clusterAlias).toBe("EU Core Production");
    expect(onChange).toHaveBeenCalled();
  });

  it("shows custom environment name input when Custom is selected", () => {
    render(<ClusterAppearancePicker cluster={cluster} onChange={onChange} />);

    const customButton = screen.getByRole("button", { name: "Custom" });

    fireEvent.click(customButton);

    const customEnvInput = screen.getByPlaceholderText("Enter custom environment name (e.g. Sandbox, DR)...");

    expect(customEnvInput).toBeInTheDocument();

    fireEvent.change(customEnvInput, { target: { value: "Disaster Recovery" }});
    expect(cluster.preferences.customEnvironmentName).toBe("Disaster Recovery");
  });

  it("resets appearance preferences to defaults when clicking reset", () => {
    render(<ClusterAppearancePicker cluster={cluster} onChange={onChange} />);

    const resetButton = screen.getByRole("button", { name: /Reset to default/i });

    fireEvent.click(resetButton);

    expect(cluster.preferences.clusterColor).toBeFalsy();
    expect(cluster.preferences.clusterIcon).toBeFalsy();
    expect(cluster.preferences.clusterEnvironment).toBe("none");
    expect(onChange).toHaveBeenCalled();
  });
});
