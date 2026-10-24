/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { createReadStream } from "fs";
import { readdir, rm, stat } from "fs/promises";
import { isAbsolute, join } from "path";
import tempy from "tempy";
import zlib from "zlib";
import tarStream from "tar-stream";
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

export const SCHEMA_FILE_NAME = "values.schema.json";

/** Upper bound for the schema document that is read and parsed (2 MiB). */
export const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;

/** Upper bound for the downloaded compressed chart archive (.tgz) (15 MiB). */
export const MAX_DOWNLOAD_ARCHIVE_BYTES = 15 * 1024 * 1024;

/** Upper bound for total uncompressed bytes during decompression (30 MiB) to prevent decompression bombs. */
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;

/** Upper bound for any individual file inside the chart archive (5 MiB). */
export const MAX_INDIVIDUAL_FILE_BYTES = 5 * 1024 * 1024;

/** Upper bound for the number of entries visited while inspecting the chart archive. */
export const MAX_VISITED_ENTRIES = 1000;

/** Upper bound for directory depth within the chart archive. */
export const MAX_DIRECTORY_DEPTH = 16;

/** Maximum concurrent schema extraction operations to prevent system resource exhaustion. */
export const MAX_CONCURRENT_SCHEMA_EXTRACTIONS = 2;

let activeExtractions = 0;
const extractionQueue: (() => void)[] = [];
const MAX_QUEUE_DEPTH = 10;

export async function acquireExtractionSlot(): Promise<() => void> {
  if (activeExtractions < MAX_CONCURRENT_SCHEMA_EXTRACTIONS) {
    activeExtractions++;

    return () => releaseExtractionSlot();
  }

  if (extractionQueue.length >= MAX_QUEUE_DEPTH) {
    throw new Error("Too many concurrent chart schema extraction operations; rejected to protect system resources");
  }

  return new Promise((resolve) => {
    extractionQueue.push(() => {
      activeExtractions++;
      resolve(() => releaseExtractionSlot());
    });
  });
}

export function releaseExtractionSlot(): void {
  activeExtractions--;
  const next = extractionQueue.shift();

  if (next) {
    next();
  }
}

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

export interface SafeExtractionResult {
  schemaRaw?: string;
  errorReason?: string;
  symlinkEncountered?: boolean;
}

/**
 * Streams through a compressed tar (.tgz) archive in-memory without materializing files to disk.
 * Applies strict bounds for downloaded size, uncompressed total, entry counts, nesting depth,
 * individual file size, path traversal, absolute paths, and symbolic/hard links.
 */
export function extractSchemaFromTgz(archivePath: string): Promise<SafeExtractionResult> {
  return new Promise((resolve) => {
    let settled = false;
    let schemaRaw: string | undefined;
    let totalUncompressedBytes = 0;
    let entryCount = 0;
    let symlinkEncountered = false;

    const readStream = createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    const extract = tarStream.extract();

    const cleanupAndResolve = (result: SafeExtractionResult) => {
      if (settled) {
        return;
      }
      settled = true;

      try {
        readStream.destroy();
        gunzip.destroy();
        extract.destroy();
      } catch {
        // ignore stream destroy errors
      }

      resolve(result);
    };

    const fail = (reason: string) => {
      cleanupAndResolve({ errorReason: reason, symlinkEncountered });
    };

    readStream.on("error", (err) => fail(`Failed to read chart archive: ${err.message}`));
    gunzip.on("error", (err) => fail(`Failed to decompress chart archive (corrupted or invalid gzip): ${err.message}`));
    extract.on("error", (err) => fail(`Failed to parse tar archive: ${err.message}`));

    extract.on("entry", (header, stream, next) => {
      if (settled) {
        stream.resume();

        return;
      }

      entryCount++;

      if (entryCount > MAX_VISITED_ENTRIES) {
        fail(`Chart archive exceeds maximum allowed entry count (${MAX_VISITED_ENTRIES})`);
        stream.resume();

        return;
      }

      // Check header types: reject symlinks and hardlinks
      if (header.type === "symlink" || header.type === "link") {
        symlinkEncountered = true;
        fail("Chart contains symbolic links or hardlinks, so the schema could not be inspected safely");
        stream.resume();

        return;
      }

      const rawName = header.name;

      // Absolute path check
      if (rawName.startsWith("/") || rawName.startsWith("\\") || isAbsolute(rawName)) {
        fail("Chart entry has an absolute path, which is forbidden");
        stream.resume();

        return;
      }

      // Path traversal check
      const segments = rawName.split(/[/\\]+/).filter(Boolean);

      if (segments.some((s) => s === ".." || s === ".")) {
        fail("Chart entry contains path traversal (..), which is forbidden");
        stream.resume();

        return;
      }

      // Depth check
      if (segments.length > MAX_DIRECTORY_DEPTH) {
        fail(`Chart entry exceeds maximum directory depth (${MAX_DIRECTORY_DEPTH})`);
        stream.resume();

        return;
      }

      // Check file size for regular files
      if (header.type === "file") {
        if (typeof header.size === "number" && header.size > MAX_INDIVIDUAL_FILE_BYTES) {
          fail(`File in chart exceeds maximum allowed size (${MAX_INDIVIDUAL_FILE_BYTES} bytes)`);
          stream.resume();

          return;
        }

        const fileName = segments[segments.length - 1];

        if (fileName === SCHEMA_FILE_NAME) {
          if (typeof header.size === "number" && header.size > MAX_SCHEMA_BYTES) {
            fail("values.schema.json is too large to be validated");
            stream.resume();

            return;
          }

          const chunks: Buffer[] = [];
          let currentFileBytes = 0;

          stream.on("data", (chunk: Buffer) => {
            currentFileBytes += chunk.length;
            totalUncompressedBytes += chunk.length;

            if (currentFileBytes > MAX_SCHEMA_BYTES) {
              fail("values.schema.json is too large to be validated");

              return;
            }

            if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
              fail(`Total uncompressed size of chart exceeds limit (${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes)`);

              return;
            }

            chunks.push(chunk);
          });

          stream.on("end", () => {
            if (!settled && !schemaRaw) {
              schemaRaw = Buffer.concat(chunks).toString("utf8");
            }
            next();
          });

          return;
        }
      }

      // For all non-schema entries, track uncompressed bytes without buffering data
      stream.on("data", (chunk: Buffer) => {
        totalUncompressedBytes += chunk.length;

        if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
          fail(`Total uncompressed size of chart exceeds limit (${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes)`);
        }
      });

      stream.on("end", () => {
        next();
      });
      stream.resume();
    });

    extract.on("finish", () => {
      cleanupAndResolve({ schemaRaw, symlinkEncountered });
    });

    readStream.pipe(gunzip).pipe(extract);
  });
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

      let releaseSlot: (() => void) | undefined;

      try {
        releaseSlot = await acquireExtractionSlot();
      } catch (err) {
        return {
          status: "unavailable",
          reason: sanitizeHelmOutput(String((err as Error).message)),
        };
      }

      const downloadDirectory = tempy.directory();

      try {
        const args = [
          "pull",
          chart,
          "--destination",
          downloadDirectory,
        ];

        if (version) {
          args.push("--version", version);
        }

        // Limit Helm execution buffer and timeout during chart download
        const result = await execHelm(args, {
          maxBuffer: 4 * 1024 * 1024,
          timeout: 30_000,
        });

        if (!result.callWasSuccessful) {
          return {
            status: "unavailable",
            reason: sanitizeHelmOutput(String(result.error?.message ?? result.error)),
          };
        }

        // Validate downloaded archive
        const entries = await readdir(downloadDirectory);
        const tgzFiles = entries.filter((f) => f.endsWith(".tgz"));

        if (tgzFiles.length === 0) {
          return {
            status: "unavailable",
            reason: "Chart archive (.tgz) was not found in destination directory",
          };
        }

        const archivePath = join(downloadDirectory, tgzFiles[0]);
        const archiveStat = await stat(archivePath);

        if (archiveStat.size > MAX_DOWNLOAD_ARCHIVE_BYTES) {
          return {
            status: "unavailable",
            reason: `Chart archive size (${archiveStat.size} bytes) exceeds maximum allowed download size (${MAX_DOWNLOAD_ARCHIVE_BYTES} bytes)`,
          };
        }

        // Stream and inspect archive in-memory with strict resource and path limits
        const extraction = await extractSchemaFromTgz(archivePath);

        if (extraction.errorReason) {
          return {
            status: "unavailable",
            reason: extraction.errorReason,
          };
        }

        if (!extraction.schemaRaw) {
          if (extraction.symlinkEncountered) {
            return {
              status: "unavailable",
              reason: "Chart contains symbolic links, so the schema could not be inspected safely",
            };
          }

          return { status: "absent" };
        }

        if (extraction.schemaRaw.length > MAX_SCHEMA_BYTES) {
          return {
            status: "unavailable",
            reason: "values.schema.json is too large to be validated",
          };
        }

        let parsed: unknown;

        try {
          parsed = JSON.parse(extraction.schemaRaw);
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
        try {
          await rm(downloadDirectory, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }

        if (releaseSlot) {
          releaseSlot();
        }
      }
    };
  },
});

export default getHelmChartSchemaInjectable;
