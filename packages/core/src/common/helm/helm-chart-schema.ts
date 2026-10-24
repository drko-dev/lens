/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Result of asking for the `values.schema.json` of a chart.
 *
 * The four states are deliberately distinct, because they mean very different things to an
 * operator and must never be conflated:
 *
 * - `present`: the chart ships a schema and it could be parsed.
 * - `absent`: the chart was obtained and it simply does not ship a `values.schema.json`.
 * - `unavailable`: the chart (or its schema) could not be obtained at all.
 * - `invalid`: a schema file exists but could not be parsed as a JSON Schema object.
 */
export type HelmChartSchemaResult =
  | {
    status: "present";
    schema: unknown;
  }
  | {
    status: "absent";
  }
  | {
    status: "unavailable";
    reason: string;
  }
  | {
    status: "invalid";
    reason: string;
  };
