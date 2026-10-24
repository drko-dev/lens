/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, waitFor } from "@testing-library/react";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import type { DiRender } from "../../../test-utils/renderFor";
import { renderFor } from "../../../test-utils/renderFor";
import { ValuesSchemaValidation } from "../values-schema-validation";
import requestHelmChartSchemaInjectable from "../../../../../common/k8s-api/endpoints/helm-charts.api/request-schema.injectable";

describe("ValuesSchemaValidation component", () => {
  let render: DiRender;

  const renderWith = (options: {
    response?: unknown;
    rejection?: Error;
    valuesYaml?: string;
    chart?: string;
    version?: string;
  } = {}) => {
    const di = getDiForUnitTesting();
    const requestHelmChartSchema = jest.fn(() => (
      options.rejection
        ? Promise.reject(options.rejection)
        : Promise.resolve(options.response ?? { status: "absent" })
    ));

    di.override(requestHelmChartSchemaInjectable, () => requestHelmChartSchema as never);

    render = renderFor(di);

    render(
      <ValuesSchemaValidation
        chart={options.chart ?? "my-chart"}
        version={options.version ?? "1.0.0"}
        valuesYaml={options.valuesYaml ?? "replicaCount: 1\n"}
      />,
    );

    return { requestHelmChartSchema };
  };

  it("requests the schema of the release chart and version", async () => {
    const { requestHelmChartSchema } = renderWith({
      response: { status: "absent" },
      chart: "nginx",
      version: "1.25.0",
    });

    await waitFor(() => expect(screen.getByTestId("values-schema-absent")).toBeInTheDocument());

    expect(requestHelmChartSchema).toHaveBeenCalledWith("nginx", "1.25.0");
  });

  it("states explicitly that no validation was performed when the chart has no schema", async () => {
    renderWith({ response: { status: "absent" }});

    await waitFor(() => expect(screen.getByTestId("values-schema-absent")).toBeInTheDocument());
    expect(screen.getByTestId("values-schema-absent")).toHaveTextContent("does not define a values.schema.json");
  });

  it("states explicitly that validation could not be performed when the schema is not available", async () => {
    renderWith({ response: { status: "unavailable", reason: "chart not found in any repository" }});

    await waitFor(() => expect(screen.getByTestId("values-schema-unavailable")).toBeInTheDocument());
    expect(screen.getByTestId("values-schema-unavailable")).toHaveTextContent("validation could not be performed");
    expect(screen.getByTestId("values-schema-unavailable")).toHaveTextContent("chart not found in any repository");
  });

  it("states explicitly that the schema is invalid", async () => {
    renderWith({ response: { status: "invalid", reason: "not valid JSON" }});

    await waitFor(() => expect(screen.getByTestId("values-schema-invalid")).toBeInTheDocument());
    expect(screen.getByTestId("values-schema-invalid")).toHaveTextContent("The chart schema is invalid");
  });

  it("accepts values that conform to the schema", async () => {
    renderWith({
      response: {
        status: "present",
        schema: {
          type: "object",
          required: ["replicaCount"],
          properties: { replicaCount: { type: "integer", minimum: 1 }},
        },
      },
      valuesYaml: "replicaCount: 2\n",
    });

    await waitFor(() => expect(screen.getByTestId("values-schema-valid")).toBeInTheDocument());
  });

  it("reports a partial validation instead of claiming the values conform when the schema uses unsupported constructs", async () => {
    renderWith({
      response: {
        status: "present",
        schema: {
          type: "object",
          properties: { replicas: { type: "integer", "x-chart-policy": "required" }},
        },
      },
      valuesYaml: "replicas: 3\n",
    });

    await waitFor(() => expect(screen.getByTestId("values-schema-partial")).toBeInTheDocument());

    expect(screen.getByTestId("values-schema-partial")).toHaveTextContent("could not be completed");
    expect(screen.queryByTestId("values-schema-valid")).not.toBeInTheDocument();
    expect(screen.getByTestId("values-schema-unsupported")).toHaveTextContent("x-chart-policy");
  });

  it("reports every invalid field with its path and keyword", async () => {
    renderWith({
      response: {
        status: "present",
        schema: {
          type: "object",
          properties: {
            replicaCount: { type: "integer", minimum: 1 },
            image: { type: "object", properties: { tag: { type: "string" }}},
          },
        },
      },
      valuesYaml: "replicaCount: 0\nimage:\n  tag: 12\n",
    });

    await waitFor(() => expect(screen.getByTestId("values-schema-errors")).toBeInTheDocument());

    expect(screen.getByTestId("values-schema-error-0")).toHaveTextContent("replicaCount");
    expect(screen.getByTestId("values-schema-error-0")).toHaveTextContent("minimum");
    expect(screen.getByTestId("values-schema-error-1")).toHaveTextContent("image.tag");
    expect(screen.getByTestId("values-schema-error-1")).toHaveTextContent("type");
  });

  it("reports invalid YAML without claiming the values are invalid against the schema", async () => {
    renderWith({
      response: { status: "present", schema: { type: "object" }},
      valuesYaml: "replicaCount: [\n",
    });

    await waitFor(() => expect(screen.getByTestId("values-schema-yaml-error")).toBeInTheDocument());
  });

  it("reports a failure to obtain the schema as unavailable", async () => {
    renderWith({ rejection: new Error("network down") });

    await waitFor(() => expect(screen.getByTestId("values-schema-unavailable")).toBeInTheDocument());
    expect(screen.getByTestId("values-schema-unavailable")).toHaveTextContent("network down");
  });
});
