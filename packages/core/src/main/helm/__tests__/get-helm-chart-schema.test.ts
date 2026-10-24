/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createWriteStream } from "fs";
import { stat, writeFile } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import zlib from "zlib";
import tarStream from "tar-stream";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import execHelmInjectable from "../exec-helm/exec-helm.injectable";
import type { ExecHelm } from "../exec-helm/exec-helm.injectable";
import getHelmChartSchemaInjectable, {
  MAX_DOWNLOAD_ARCHIVE_BYTES,
  MAX_VISITED_ENTRIES,
  MAX_DIRECTORY_DEPTH,
} from "../get-helm-chart-schema.injectable";
import type { GetHelmChartSchema } from "../get-helm-chart-schema.injectable";
import { sanitizeHelmOutput } from "../sanitize-helm-output";

interface TestArchiveEntry {
  name: string;
  content?: string | Buffer;
  type?: string;
  linkname?: string;
  size?: number;
}

async function createChartArchive(
  destDir: string,
  chartName: string,
  entries: TestArchiveEntry[],
): Promise<string> {
  const pack = tarStream.pack();
  const gzip = zlib.createGzip();
  const archivePath = join(destDir, `${chartName}-1.0.0.tgz`);
  const outStream = createWriteStream(archivePath);

  const p = pipeline(pack, gzip, outStream);

  for (const entry of entries) {
    const content = entry.content ?? "";
    const size = entry.size ?? (typeof content === "string" ? Buffer.byteLength(content) : content.length);

    pack.entry(
      {
        name: entry.name,
        type: (entry.type as any) ?? "file",
        linkname: entry.linkname,
        size,
      },
      content,
    );
  }

  pack.finalize();
  await p;

  return archivePath;
}

describe("getHelmChartSchema", () => {
  let execHelmMock: jest.MockedFunction<ExecHelm>;
  let getHelmChartSchema: GetHelmChartSchema;
  let downloadDirectory: string;

  const fakeChartContent = (content: { schema?: string; withoutSchema?: boolean }) => {
    execHelmMock.mockImplementation(async (args) => {
      const destDirIndex = args.indexOf("--destination");

      downloadDirectory = args[destDirIndex + 1];

      const entries: TestArchiveEntry[] = content.withoutSchema
        ? [{ name: "my-chart/Chart.yaml", content: "name: my-chart\nversion: 1.0.0\n" }]
        : [{ name: "my-chart/values.schema.json", content: content.schema ?? "{}" }];

      await createChartArchive(downloadDirectory, "my-chart", entries);

      return { callWasSuccessful: true, response: "" };
    });
  };

  beforeEach(() => {
    const di = getDiForUnitTesting();

    execHelmMock = jest.fn();
    di.override(execHelmInjectable, () => execHelmMock);
    di.permitSideEffects(getHelmChartSchemaInjectable);

    getHelmChartSchema = di.inject(getHelmChartSchemaInjectable);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // 1. Chart comprimido pequeño con contenido válido
  it("returns the schema when the chart ships one", async () => {
    fakeChartContent({ schema: JSON.stringify({ type: "object", properties: { replicas: { type: "integer" }}}) });

    const result = await getHelmChartSchema({ chart: "my-chart", version: "1.0.0" });

    expect(result).toEqual({
      status: "present",
      schema: { type: "object", properties: { replicas: { type: "integer" }}},
    });
  });

  it("accepts boolean JSON Schema documents", async () => {
    fakeChartContent({ schema: "false" });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result).toEqual({ status: "present", schema: false });
  });

  it("pulls the requested chart version with --destination and without --untar", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart", version: "2.3.4" });

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toContain("pull");
    expect(args).toContain("my-chart");
    expect(args).toContain("--version");
    expect(args[args.indexOf("--version") + 1]).toBe("2.3.4");
    expect(args).toContain("--destination");
    expect(args).not.toContain("--untar");
    expect(args).not.toContain("--untardir");
  });

  it("does not request a version when none is known", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart" });

    expect(execHelmMock.mock.calls[0][0]).not.toContain("--version");
  });

  it("reports an absent schema when the chart does not ship one", async () => {
    fakeChartContent({ withoutSchema: true });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result).toEqual({ status: "absent" });
  });

  it("reports the schema as unavailable when the chart cannot be pulled", async () => {
    execHelmMock.mockResolvedValue({
      callWasSuccessful: false,
      error: new Error('Error: failed to download "https://user:token@charts.example.com/my-chart"') as never,
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("***@charts.example.com");
    expect((result as { reason: string }).reason).not.toContain("token");
  });

  it("reports the schema as invalid when it is not valid JSON", async () => {
    fakeChartContent({ schema: "{ this is not json" });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("invalid");
    expect((result as { reason: string }).reason).toContain("not valid JSON");
  });

  it("reports the schema as invalid when it is not a JSON Schema object", async () => {
    fakeChartContent({ schema: JSON.stringify(["not", "an", "object"]) });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("invalid");
  });

  it("rejects a chart reference that helm would parse as an option", async () => {
    const result = await getHelmChartSchema({ chart: "--post-renderer=/tmp/evil" });

    expect(result).toEqual({ status: "unavailable", reason: "The chart reference is not a valid value" });
    expect(execHelmMock).not.toHaveBeenCalled();
  });

  it("rejects a chart version that helm would parse as an option", async () => {
    const result = await getHelmChartSchema({ chart: "my-chart", version: "--destination=/tmp/evil" });

    expect(result).toEqual({ status: "unavailable", reason: "The chart version is not a valid value" });
    expect(execHelmMock).not.toHaveBeenCalled();
  });

  it("rejects an empty chart reference", async () => {
    const result = await getHelmChartSchema({ chart: "   " });

    expect(result.status).toBe("unavailable");
    expect(execHelmMock).not.toHaveBeenCalled();
  });

  // 2. Archivo comprimido excesivo
  it("rejects a compressed archive that exceeds MAX_DOWNLOAD_ARCHIVE_BYTES", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];
      const archivePath = join(destDir, "my-chart-1.0.0.tgz");
      // Write a sparse/large file exceeding 15 MiB limit
      const oversizedBuffer = Buffer.alloc(MAX_DOWNLOAD_ARCHIVE_BYTES + 1024);

      await writeFile(archivePath, oversizedBuffer);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("exceeds maximum allowed download size");
  });

  // 3. Archivo pequeño con descompresión desproporcionada (tar bomb)
  it("rejects an archive that expands beyond MAX_TOTAL_UNCOMPRESSED_BYTES (decompression bomb)", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];
      // Create a small archive with a large uncompressed chunk (e.g. 31 MiB of zero bytes)
      const chunk = Buffer.alloc(1024 * 1024); // 1 MiB
      const entries: TestArchiveEntry[] = [];

      for (let i = 0; i < 31; i++) {
        entries.push({ name: `my-chart/chunk-${i}.bin`, content: chunk });
      }

      await createChartArchive(destDir, "my-chart", entries);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("Total uncompressed size of chart exceeds limit");
  });

  // 4. Miles de entradas (archive with > MAX_VISITED_ENTRIES)
  it("rejects an archive with more entries than MAX_VISITED_ENTRIES", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];
      const entries: TestArchiveEntry[] = [];

      for (let i = 0; i < MAX_VISITED_ENTRIES + 5; i++) {
        entries.push({ name: `my-chart/file-${i}.txt`, content: "x" });
      }

      await createChartArchive(destDir, "my-chart", entries);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("exceeds maximum allowed entry count");
  });

  // 5. Profundidad de directorios excesiva (depth > MAX_DIRECTORY_DEPTH)
  it("rejects an archive with directory nesting deeper than MAX_DIRECTORY_DEPTH", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];
      let deepPath = "my-chart";

      for (let i = 0; i < MAX_DIRECTORY_DEPTH + 2; i++) {
        deepPath += `/level-${i}`;
      }
      deepPath += "/values.schema.json";

      await createChartArchive(destDir, "my-chart", [{ name: deepPath, content: "{}" }]);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("exceeds maximum directory depth");
  });

  // 6. Path traversal
  it("rejects an archive with path traversal in entry names (..)", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];

      await createChartArchive(destDir, "my-chart", [
        { name: "my-chart/../../etc/passwd", content: "root:x:0:0" },
      ]);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("path traversal");
  });

  // 7. Rutas absolutas
  it("rejects an archive with absolute paths in entry names", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];

      await createChartArchive(destDir, "my-chart", [
        { name: "/root/values.schema.json", content: "{}" },
      ]);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("absolute path");
  });

  // 8. Symlinks y hardlinks
  it("rejects an archive containing symbolic links", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];

      await createChartArchive(destDir, "my-chart", [
        { name: "my-chart/symlink-target", type: "symlink", linkname: "/etc/passwd" },
      ]);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("symbolic links or hardlinks");
  });

  it("rejects an archive containing hard links", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const destDir = args[args.indexOf("--destination") + 1];

      await createChartArchive(destDir, "my-chart", [
        { name: "my-chart/hardlink-target", type: "link", linkname: "my-chart/Chart.yaml" },
      ]);

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("symbolic links or hardlinks");
  });

  // 9. Schema mayor que el límite permitido (> 2 MiB)
  it("refuses a schema that is larger than MAX_SCHEMA_BYTES", async () => {
    const oversized = `{ "type": "object", "description": "${"x".repeat(2 * 1024 * 1024 + 1)}" }`;

    fakeChartContent({ schema: oversized });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("too large");
  });

  // 10. Proceso Helm colgado (killed by timeout)
  it("handles a hung helm pull execution that terminates with timeout", async () => {
    const timeoutError: any = new Error("Command timed out after 30000ms");

    timeoutError.killed = true;
    timeoutError.signal = "SIGKILL";

    execHelmMock.mockResolvedValue({
      callWasSuccessful: false,
      error: timeoutError,
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("timed out");
  });

  // 11. Timeout y cancelación
  it("passes safe timeout and buffer options to execHelm", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart" });

    expect(execHelmMock).toHaveBeenCalledWith(
      expect.arrayContaining(["pull", "my-chart", "--destination"]),
      expect.objectContaining({
        maxBuffer: 4 * 1024 * 1024,
        timeout: 30_000,
      }),
    );
  });

  // 12. Error de conexión
  it("reports connection error when helm fails to connect to remote repo", async () => {
    execHelmMock.mockResolvedValue({
      callWasSuccessful: false,
      error: new Error("dial tcp 192.0.2.1:443: connect: connection refused") as never,
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("connection refused");
  });

  // 13. Repositorio no disponible en modo offline
  it("reports repository unreachable in offline mode", async () => {
    execHelmMock.mockResolvedValue({
      callWasSuccessful: false,
      error: new Error("Error: no repository definition -- unable to download chart in offline mode") as never,
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("offline mode");
  });

  // 14. Dos solicitudes simultáneas (concurrency control)
  it("safely handles multiple concurrent schema extraction requests", async () => {
    fakeChartContent({ schema: JSON.stringify({ type: "object" }) });

    const [res1, res2] = await Promise.all([
      getHelmChartSchema({ chart: "chart-1" }),
      getHelmChartSchema({ chart: "chart-2" }),
    ]);

    expect(res1).toEqual({ status: "present", schema: { type: "object" }});
    expect(res2).toEqual({ status: "present", schema: { type: "object" }});
  });

  // 15. Limpieza después de extracción fallida
  it("cleans up the temporary directory when the pull fails", async () => {
    let capturedDir = "";

    execHelmMock.mockImplementation(async (args) => {
      capturedDir = args[args.indexOf("--destination") + 1];

      return {
        callWasSuccessful: false,
        error: new Error("offline: no repository reachable") as never,
      };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect(capturedDir).not.toBe("");

    await expect(stat(capturedDir)).rejects.toThrow();
  });

  // 16. Limpieza después de extracción exitosa (sin archivos huérfanos)
  it("cleans up the temporary directory it used on success", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart" });

    await expect(stat(downloadDirectory)).rejects.toThrow();
  });

  // 17. Ausencia de efectos en clústeres Kubernetes
  it("only invokes helm pull and never calls any install, upgrade, or cluster mutation commands", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart" });

    const allCalls = execHelmMock.mock.calls;

    for (const call of allCalls) {
      const args = call[0];

      expect(args[0]).toBe("pull");
      expect(args).not.toContain("install");
      expect(args).not.toContain("upgrade");
      expect(args).not.toContain("rollback");
      expect(args).not.toContain("template");
    }
  });
});

describe("sanitizeHelmOutput", () => {
  it("removes the credentials of a repository URL", () => {
    expect(sanitizeHelmOutput("failed to fetch https://user:sup3rs3cret@charts.example.com/index.yaml"))
      .toBe("failed to fetch https://***@charts.example.com/index.yaml");
  });

  it("removes bearer tokens", () => {
    expect(sanitizeHelmOutput("Authorization: Bearer abcdef123456")).toBe("Authorization: Bearer ***");
  });

  it("removes inline tokens and passwords", () => {
    expect(sanitizeHelmOutput("token=abc123 password=hunter2")).toBe("token=*** password=***");
  });

  it("keeps harmless output untouched", () => {
    expect(sanitizeHelmOutput("Error: chart \"my-chart\" not found")).toBe("Error: chart \"my-chart\" not found");
  });
});
