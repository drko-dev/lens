/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { mkdir, symlink, writeFile } from "fs/promises";
import { join } from "path";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import execHelmInjectable from "../exec-helm/exec-helm.injectable";
import type { ExecHelm } from "../exec-helm/exec-helm.injectable";
import getHelmChartSchemaInjectable from "../get-helm-chart-schema.injectable";
import type { GetHelmChartSchema } from "../get-helm-chart-schema.injectable";
import { sanitizeHelmOutput } from "../sanitize-helm-output";

describe("getHelmChartSchema", () => {
  let execHelmMock: jest.MockedFunction<ExecHelm>;
  let getHelmChartSchema: GetHelmChartSchema;
  let untarDirectory: string;

  /**
   * The service untars the chart into a temporary directory it creates itself, so the fake
   * helm invocation writes the chart content into the directory given in the `--untardir` arg.
   */
  const fakeChartContent = (content: { schema?: string; withoutSchema?: boolean }) => {
    execHelmMock.mockImplementation(async (args) => {
      const untarDirIndex = args.indexOf("--untardir");

      untarDirectory = args[untarDirIndex + 1];
      const chartDirectory = join(untarDirectory, "my-chart");

      await mkdir(chartDirectory, { recursive: true });

      if (content.withoutSchema) {
        await writeFile(join(chartDirectory, "Chart.yaml"), "name: my-chart\nversion: 1.0.0\n");
      } else {
        await writeFile(join(chartDirectory, "values.schema.json"), content.schema ?? "{}");
      }

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

  it("pulls the requested chart version", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart", version: "2.3.4" });

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toContain("pull");
    expect(args).toContain("my-chart");
    expect(args).toContain("--version");
    expect(args[args.indexOf("--version") + 1]).toBe("2.3.4");
    expect(args).toContain("--untar");
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
    const result = await getHelmChartSchema({ chart: "my-chart", version: "--untardir=/tmp/evil" });

    expect(result).toEqual({ status: "unavailable", reason: "The chart version is not a valid value" });
    expect(execHelmMock).not.toHaveBeenCalled();
  });

  it("rejects an empty chart reference", async () => {
    const result = await getHelmChartSchema({ chart: "   " });

    expect(result.status).toBe("unavailable");
    expect(execHelmMock).not.toHaveBeenCalled();
  });

  it("does not follow a symlinked schema that points outside the extraction directory", async () => {
    const outsideFile = join(await import("os").then(os => os.tmpdir()), `r7-07-outside-${process.pid}.json`);

    await writeFile(outsideFile, JSON.stringify({ type: "object" }));

    execHelmMock.mockImplementation(async (args) => {
      const untarDirectory = args[args.indexOf("--untardir") + 1];
      const chartDirectory = join(untarDirectory, "my-chart");

      await mkdir(chartDirectory, { recursive: true });
      await symlink(outsideFile, join(chartDirectory, "values.schema.json"));

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result).toEqual({
      status: "unavailable",
      reason: "Chart contains symbolic links, so the schema could not be inspected safely",
    });
  });

  it("refuses a schema that is larger than the accepted limit", async () => {
    const oversized = `{ "type": "object", "description": "${"x".repeat(2 * 1024 * 1024 + 1)}" }`;

    fakeChartContent({ schema: oversized });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect((result as { reason: string }).reason).toContain("too large");
  });

  it("does not classify a chart beyond the safe traversal depth as schema-free", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const untarDir = args[args.indexOf("--untardir") + 1];
      let directory = join(untarDir, "my-chart");

      for (let depth = 0; depth < 66; depth++) {
        directory = join(directory, `nested-${depth}`);
      }

      await mkdir(directory, { recursive: true });

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result).toEqual({
      status: "unavailable",
      reason: "Chart contains too many files or nested directories to inspect safely",
    });
  });

  it("does not classify a chart beyond the safe entry count as schema-free", async () => {
    execHelmMock.mockImplementation(async (args) => {
      const untarDir = args[args.indexOf("--untardir") + 1];
      const chartDirectory = join(untarDir, "my-chart");

      await mkdir(chartDirectory, { recursive: true });

      for (let index = 0; index < 5001; index++) {
        await writeFile(join(chartDirectory, `entry-${index}`), "");
      }

      return { callWasSuccessful: true, response: "" };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result).toEqual({
      status: "unavailable",
      reason: "Chart contains too many files or nested directories to inspect safely",
    });
  });

  it("cleans up the temporary directory when the pull fails", async () => {
    let untarDirectory = "";

    execHelmMock.mockImplementation(async (args) => {
      untarDirectory = args[args.indexOf("--untardir") + 1];

      return {
        callWasSuccessful: false,
        error: new Error("offline: no repository reachable") as never,
      };
    });

    const result = await getHelmChartSchema({ chart: "my-chart" });

    expect(result.status).toBe("unavailable");
    expect(untarDirectory).not.toBe("");

    const { stat } = await import("fs/promises");

    await expect(stat(untarDirectory)).rejects.toThrow();
  });

  it("cleans up the temporary directory it used", async () => {
    fakeChartContent({ schema: "{}" });

    await getHelmChartSchema({ chart: "my-chart" });

    const { stat } = await import("fs/promises");

    await expect(stat(untarDirectory)).rejects.toThrow();
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
