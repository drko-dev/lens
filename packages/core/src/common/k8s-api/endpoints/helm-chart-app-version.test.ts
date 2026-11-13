/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { HelmChart } from "./helm-charts.api";

describe("HelmChart", () => {
  it("keeps the chart appVersion from the repository index", () => {
    const chart = HelmChart.create({
      apiVersion: "v2",
      name: "airflow",
      version: "25.0.2",
      repo: "bitnami",
      created: "2026-01-01T00:00:00Z",
      appVersion: "3.0.5",
    });

    expect(chart.getAppVersion()).toBe("3.0.5");
  });
});
