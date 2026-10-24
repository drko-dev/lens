/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { lstat, readdir, readFile, realpath, rm, stat } from "fs/promises";
import { join, sep } from "path";
import tempy from "tempy";
import type { HelmChartSchemaResult } from "../../common/helm/helm-chart-schema";
import execHelmInjectable from "./exec-helm/exec-helm.injectable";
import { sanitizeHelmOutput } from "./sanitize-helm-output";

export interface GetHelmChartSchemaData {
  /** Chart name as known by helm, optionally prefixed with its repository. */
  chart: string;
  /** Version of the chart, when known. */
  version?: string;
}

export type GetHelmChartSchema = (data: GetHelmChartSchemaData) => Promise<HelmChartSchemaResult>;

const SCHEMA_FILE_NAME = "values.schema.json";

/** Upper bound for the schema document that is read and parsed. */
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;

/** Upper bound for the number of directory entries visited while looking for the schema. */
const MAX_VISITED_ENTRIES = 5000;
const MAX_DIRECTORY_DEPTH = 64;

/**
 * Rejects values that helm would interpret as an option instead of as the value of an option.
 * Arguments are never passed through a shell, but a leading dash would still be parsed by helm as
 * a flag (for example a chart named `--post-renderer=/tmp/x`).
 */
export function unsafeArgumentReason(value: string, label: string): string | undefined {
  if (value.trim() === "") {
    return `The ${label} is required to look up the chart schema`;
  }

  if (value.startsWith("-")) {
    return `The ${label} is not a valid value`;
  }

  return undefined;
}

/** True when `candidate` is inside `directory` (both already resolved). */
function isInside(directory: string, candidate: string): boolean {
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

/**
 * Looks for a `values.schema.json` inside a directory tree.
 *
 * Symbolic links are never followed: a chart could otherwise point outside the extraction
 * directory. Every visited path must stay inside the extraction directory.
 */
async function findSchemaFile(
  directory: string,
  rootDirectory: string,
  state: { visited: number; limitExceeded: boolean; symlinkEncountered: boolean },
  depth = 0,
): Promise<string | undefined> {
  if (state.visited >= MAX_VISITED_ENTRIES || depth > MAX_DIRECTORY_DEPTH) {
    state.limitExceeded = true;

    return undefined;
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (state.visited >= MAX_VISITED_ENTRIES) {
      state.limitExceeded = true;

      return undefined;
    }

    state.visited++;
    const entryPath = join(directory, entry.name);
    const entryStat = await lstat(entryPath);

    if (entryStat.isSymbolicLink()) {
      state.symlinkEncountered = true;

      continue;
    }

    const resolved = await realpath(entryPath);

    if (!isInside(rootDirectory, resolved)) {
      continue;
    }

    if (entryStat.isDirectory()) {
      const found = await findSchemaFile(entryPath, rootDirectory, state, depth + 1);

      if (found) {
        return found;
      }

      continue;
    }

    if (entry.name === SCHEMA_FILE_NAME) {
      return resolved;
    }
  }

  return undefined;
}

const getHelmChartSchemaInjectable = getInjectable({
  id: "get-helm-chart-schema",

  instantiate: (di): GetHelmChartSchema => {
    const execHelm = di.inject(execHelmInjectable);

    return async ({ chart, version }: GetHelmChartSchemaData): Promise<HelmChartSchemaResult> => {
      const unsafeChart = unsafeArgumentReason(chart, "chart reference");

      if (unsafeChart) {
        return { status: "unavailable", reason: unsafeChart };
      }

      if (version !== undefined) {
        const unsafeVersion = unsafeArgumentReason(version, "chart version");

        if (unsafeVersion) {
          return { status: "unavailable", reason: unsafeVersion };
        }
      }

      // `helm pull` only downloads the chart: it never installs, upgrades, rolls back, runs hooks
      // or renders resources in the cluster.
      const untarDirectory = tempy.directory();

      try {
        const args = [
          "pull",
          chart,
          "--untar",
          "--untardir",
          untarDirectory,
        ];

        if (version) {
          args.push("--version", version);
        }

        const result = await execHelm(args);

        if (!result.callWasSuccessful) {
          return {
            status: "unavailable",
            reason: sanitizeHelmOutput(String(result.error?.message ?? result.error)),
          };
        }

        const rootDirectory = await realpath(untarDirectory);
        const searchState = { visited: 0, limitExceeded: false, symlinkEncountered: false };
        const schemaPath = await findSchemaFile(rootDirectory, rootDirectory, searchState);

        if (searchState.limitExceeded) {
          return {
            status: "unavailable",
            reason: "Chart contains too many files or nested directories to inspect safely",
          };
        }

        if (!schemaPath) {
          if (searchState.symlinkEncountered) {
            return {
              status: "unavailable",
              reason: "Chart contains symbolic links, so the schema could not be inspected safely",
            };
          }

          return { status: "absent" };
        }

        const schemaStat = await stat(schemaPath);

        if (schemaStat.size > MAX_SCHEMA_BYTES) {
          return {
            status: "unavailable",
            reason: "values.schema.json is too large to be validated",
          };
        }

        const rawSchema = await readFile(schemaPath, "utf8");

        let parsed: unknown;

        try {
          parsed = JSON.parse(rawSchema);
        } catch (error) {
          return {
            status: "invalid",
            reason: `values.schema.json is not valid JSON: ${sanitizeHelmOutput(String((error as Error).message))}`,
          };
        }

        if ((typeof parsed !== "object" && typeof parsed !== "boolean") || parsed === null || Array.isArray(parsed)) {
          return {
            status: "invalid",
            reason: "values.schema.json does not contain a JSON Schema",
          };
        }

        return { status: "present", schema: parsed };
      } finally {
        await rm(untarDirectory, { recursive: true, force: true });
      }
    };
  },
});

export default getHelmChartSchemaInjectable;
