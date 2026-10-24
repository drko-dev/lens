/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./values-schema-validation.scss";

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { load as parseYaml } from "js-yaml";
import { Icon } from "../../icon";
import type { HelmChartSchemaResult } from "../../../../common/helm/helm-chart-schema";
import type { RequestHelmChartSchema } from "../../../../common/k8s-api/endpoints/helm-charts.api/request-schema.injectable";
import requestHelmChartSchemaInjectable from "../../../../common/k8s-api/endpoints/helm-charts.api/request-schema.injectable";
import type { SchemaValidationError, SchemaValidationResult } from "../values-schema/schema-validator";
import { validateValuesAgainstSchema } from "../values-schema/schema-validator";

export interface ValuesSchemaValidationProps {
  chart: string;
  version?: string;
  valuesYaml: string;
}

interface Dependencies {
  requestHelmChartSchema: RequestHelmChartSchema;
}

type SchemaState =
  | { status: "loading" }
  | { status: "present"; schema: unknown }
  | { status: "absent" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid"; reason: string };

function yamlError(yaml: string): SchemaValidationError | undefined {
  try {
    parseYaml(yaml);

    return undefined;
  } catch (error) {
    return {
      path: "(yaml)",
      pathSegments: [],
      keyword: "yaml",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

const NonInjectedValuesSchemaValidation = observer(({
  chart,
  version,
  valuesYaml,
  requestHelmChartSchema,
}: ValuesSchemaValidationProps & Dependencies) => {
  const [schemaState, setSchemaState] = useState<SchemaState>({ status: "loading" });
  const [result, setResult] = useState<SchemaValidationResult | undefined>(undefined);
  const [parseError, setParseError] = useState<SchemaValidationError | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    setSchemaState({ status: "loading" });

    requestHelmChartSchema(chart, version)
      .then((response: HelmChartSchemaResult) => {
        if (cancelled) {
          return;
        }

        setSchemaState(response.status === "present"
          ? { status: "present", schema: response.schema }
          : response);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setSchemaState({
          status: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [chart, version, requestHelmChartSchema]);

  useEffect(() => {
    if (schemaState.status !== "present") {
      setResult(undefined);
      setParseError(undefined);

      return;
    }

    const error = yamlError(valuesYaml);

    if (error) {
      setParseError(error);
      setResult(undefined);

      return;
    }

    setParseError(undefined);
    setResult(validateValuesAgainstSchema(parseYaml(valuesYaml) ?? {}, schemaState.schema));
  }, [schemaState, valuesYaml]);

  if (schemaState.status === "loading") {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message">Validating the values against the chart schema…</span>
      </div>
    );
  }

  if (schemaState.status === "absent") {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message" data-testid="values-schema-absent">
          <Icon material="info" small />
          {" "}
          This chart does not define a values.schema.json: schema validation was not performed.
        </span>
      </div>
    );
  }

  if (schemaState.status === "unavailable") {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message warning" data-testid="values-schema-unavailable">
          <Icon material="warning" small />
          {" "}
          The chart schema is not available, so validation could not be performed.
          {" "}
          {schemaState.reason}
        </span>
      </div>
    );
  }

  if (schemaState.status === "invalid") {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message warning" data-testid="values-schema-invalid">
          <Icon material="warning" small />
          {" "}
          The chart schema is invalid, so validation could not be performed.
          {" "}
          {schemaState.reason}
        </span>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message error" data-testid="values-schema-yaml-error">
          <Icon material="error" small />
          {" "}
          The values are not valid YAML:
          {" "}
          {parseError.message}
        </span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation" />
    );
  }

  if (result.valid && !result.complete) {
    // The schema could not be compiled, so no complete validation was performed.
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message warning" data-testid="values-schema-partial">
          <Icon material="help_outline" small />
          {" "}
          Validation could not be completed: the schema uses an unsupported or invalid construct.
          No validation was performed, and the values are NOT fully validated.
        </span>

        <span className="values-schema-unsupported" data-testid="values-schema-unsupported">
          Not evaluated:
          {" "}
          {result.unsupportedKeywords.join(", ")}
        </span>
      </div>
    );
  }

  if (result.valid) {
    return (
      <div className="values-schema-validation" data-testid="values-schema-validation">
        <span className="values-schema-message success" data-testid="values-schema-valid">
          <Icon material="check_circle" small />
          {" "}
          The values conform to the chart schema.
        </span>
      </div>
    );
  }

  return (
    <div className="values-schema-validation" data-testid="values-schema-validation">
      <span className="values-schema-message error" data-testid="values-schema-errors-title">
        <Icon material="error" small />
        {" "}
        The values do not conform to the chart schema
        {" "}
        (
        {result.errors.length}
        {" "}
        {result.errors.length === 1 ? "problem" : "problems"}
        ):
      </span>

      <ul className="values-schema-errors" data-testid="values-schema-errors">
        {result.errors.map((error, index) => (
          <li key={`${error.path}-${error.keyword}-${index}`} data-testid={`values-schema-error-${index}`}>
            <code>{error.path}</code>
            {" — "}
            {error.message}
            <span className="keyword">{error.keyword}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

export const ValuesSchemaValidation = withInjectables<Dependencies, ValuesSchemaValidationProps>(
  NonInjectedValuesSchemaValidation,
  {
    getProps: (di, props) => ({
      ...props,
      requestHelmChartSchema: di.inject(requestHelmChartSchemaInjectable),
    }),
  },
);
