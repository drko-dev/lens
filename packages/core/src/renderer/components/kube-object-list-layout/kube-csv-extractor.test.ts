/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { resolveExportColumns } from "./kube-csv-extractor";
import { buildCsv } from "../../utils/csv/csv-builder";
import { Pod } from "@openlens/kube-object";

describe("kube-csv-extractor", () => {
  it("resolves and extracts columns for Pod resources", () => {
    const fakePod = new Pod({
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "test-pod",
        namespace: "default",
        uid: "uid-123",
        selfLink: "/api/v1/namespaces/default/pods/test-pod",
        resourceVersion: "100",
        creationTimestamp: "2026-10-20T10:00:00Z",
        labels: { app: "web", env: "production" },
      },
      status: {
        phase: "Running",
        podIP: "10.244.0.5",
        qosClass: "BestEffort",
      } as any,
      spec: {
        nodeName: "node-1",
        containers: [{ name: "nginx", image: "nginx:latest" }],
      },
    });

    const columns = [
      { id: "name", header: { title: "Name" } },
      { id: "namespace", header: { title: "Namespace" } },
      { id: "status", header: { title: "Status" } },
      { id: "node", header: { title: "Node" } },
      { id: "labels", header: { title: "Labels" } },
    ];

    const exportCols = resolveExportColumns(
      "workloads_pods",
      undefined,
      columns,
      () => false, // no columns hidden
    );

    expect(exportCols.map(c => c.header)).toEqual(["Name", "Namespace", "Status", "Node", "Labels"]);

    const row = exportCols.map(c => c.extractValue(fakePod));
    expect(row[0]).toBe("test-pod");
    expect(row[1]).toBe("default");
    expect(row[2]).toBe("Running");
    expect(row[3]).toBe("node-1");
    expect(row[4]).toContain("app=web");
  });

  describe("Secret security enforcement", () => {
    it("STRICTLY permits only metadata and key names, never data or stringData", () => {
      const sensitiveSecret = {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: "db-credentials",
          namespace: "prod",
          uid: "sec-999",
          selfLink: "/api/v1/namespaces/prod/secrets/db-credentials",
          creationTimestamp: "2026-10-20T10:00:00Z",
          labels: { tier: "backend" },
        },
        type: "Opaque",
        // SENSITIVE PAYLOADS:
        data: {
          password: "c3VwZXItc2VjcmV0LXBhc3N3b3JkLTEyMw==", // "super-secret-password-123"
          api_token: "ZXlKaGJHY2lPaUpTVXpJMU5pSXNJblI1Y0NJN...",
        },
        stringData: {
          raw_token: "secret-token-xyz-abc",
        },
        getName: () => "db-credentials",
        getNs: () => "prod",
        getLabels: () => ["tier=backend"],
        getKeys: () => ["password", "api_token", "raw_token"],
        getAge: () => "5m",
      } as any;

      // Notice columns trying to export "data", "payload", "token"
      const columns = [
        { id: "name", header: { title: "Name" } },
        { id: "namespace", header: { title: "Namespace" } },
        { id: "keys", header: { title: "Keys" } },
        { id: "type", header: { title: "Type" } },
        { id: "data", header: { title: "Secret Data" }, content: (item: any) => JSON.stringify(item.data) },
        { id: "stringData", header: { title: "Raw Token" }, content: (item: any) => item.stringData.raw_token },
      ];

      const exportCols = resolveExportColumns(
        "configuration_secrets",
        undefined,
        columns,
        () => false,
        {},
        true, // isSecret = true
      );

      // Data and stringData MUST NOT be included in export columns!
      const headers = exportCols.map(c => c.header);
      expect(headers).toEqual(["Name", "Namespace", "Keys", "Type"]);
      expect(headers).not.toContain("Secret Data");
      expect(headers).not.toContain("Raw Token");

      const row = exportCols.map(c => c.extractValue(sensitiveSecret));
      const csv = buildCsv(headers, [row]);

      // Verify complete absence of secret values in output
      expect(csv).toContain("db-credentials");
      expect(csv).toContain("password; api_token; raw_token");
      expect(csv).toContain("Opaque");
      expect(csv).not.toContain("c3VwZXItc2VjcmV0LXBhc3N3b3JkLTEyMw==");
      expect(csv).not.toContain("super-secret-password-123");
      expect(csv).not.toContain("secret-token-xyz-abc");
    });
  });

  describe("hidden columns filtering", () => {
    it("skips columns marked as hidden in preferences", () => {
      const columns = [
        { id: "name", header: { title: "Name" } },
        { id: "namespace", header: { title: "Namespace" } },
        { id: "node", header: { title: "Node" } },
      ];

      const isHidden = (tableId: string, colId: string) => colId === "node";

      const exportCols = resolveExportColumns(
        "workloads_pods",
        undefined,
        columns,
        isHidden,
      );

      expect(exportCols.map(c => c.id)).toEqual(["name", "namespace"]);
    });
  });
});
