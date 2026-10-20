/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  sanitizeFormulaInjection,
  escapeCsvCell,
  buildCsv,
  generateCsvFilename,
} from "./csv-builder";

describe("csv-builder", () => {
  describe("sanitizeFormulaInjection", () => {
    it("neutralizes standard formula injection prefixes with leading apostrophe", () => {
      expect(sanitizeFormulaInjection("=1+1")).toBe("'=1+1");
      expect(sanitizeFormulaInjection("+SUM(A1:A10)")).toBe("'+SUM(A1:A10)");
      expect(sanitizeFormulaInjection("-2+3")).toBe("'-2+3");
      expect(sanitizeFormulaInjection("@SUM(1,2)")).toBe("'@SUM(1,2)");
      expect(sanitizeFormulaInjection("|' /C calc'!A0")).toBe("'|' /C calc'!A0");
      expect(sanitizeFormulaInjection("%COMSPEC%")).toBe("'%COMSPEC%");
    });

    it("neutralizes formula injection attempts preceded by whitespace or control characters", () => {
      expect(sanitizeFormulaInjection("\t=1+1")).toBe("'\t=1+1");
      expect(sanitizeFormulaInjection("\r=1+1")).toBe("'\r=1+1");
      expect(sanitizeFormulaInjection("\n=1+1")).toBe("'\n=1+1");
      expect(sanitizeFormulaInjection("   =1+1")).toBe("'   =1+1");
      expect(sanitizeFormulaInjection("\x00=cmd|' /C calc'!A0")).toBe("'\x00=cmd|' /C calc'!A0");
      expect(sanitizeFormulaInjection("  \t\r\n@SUM")).toBe("'  \t\r\n@SUM");
    });

    it("leaves safe strings untouched", () => {
      expect(sanitizeFormulaInjection("nginx-deployment")).toBe("nginx-deployment");
      expect(sanitizeFormulaInjection("kube-system")).toBe("kube-system");
      expect(sanitizeFormulaInjection("running")).toBe("running");
      expect(sanitizeFormulaInjection("")).toBe("");
    });
  });

  describe("escapeCsvCell", () => {
    it("handles null and undefined as empty string", () => {
      expect(escapeCsvCell(null)).toBe("");
      expect(escapeCsvCell(undefined)).toBe("");
    });

    it("formats numbers without quotes", () => {
      expect(escapeCsvCell(42)).toBe("42");
      expect(escapeCsvCell(0)).toBe("0");
      expect(escapeCsvCell(-15)).toBe("-15");
    });

    it("formats dates as ISO strings in quotes", () => {
      const date = new Date("2026-10-20T12:00:00.000Z");
      expect(escapeCsvCell(date)).toBe('"2026-10-20T12:00:00.000Z"');
    });

    it("escapes quotes and wraps in quotes when cell contains commas or quotes", () => {
      expect(escapeCsvCell('hello "world"')).toBe('"hello ""world"""');
      expect(escapeCsvCell("pod1,pod2")).toBe('"pod1,pod2"');
    });

    it("quotes formula-sanitized cells", () => {
      expect(escapeCsvCell("=1+1")).toBe('"\'=1+1"');
      expect(escapeCsvCell("@cmd")).toBe('"\'@cmd"');
      expect(escapeCsvCell("+CMD()")).toBe('"\'+CMD()"');
    });

    it("handles multiline cells with newlines", () => {
      expect(escapeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    });
  });

  describe("buildCsv", () => {
    it("generates a valid CSV with BOM by default", () => {
      const headers = ["Name", "Namespace", "Status"];
      const rows = [
        ["nginx-pod", "default", "Running"],
        ["redis-pod", "prod", "Pending"],
      ];

      const csv = buildCsv(headers, rows);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("Name,Namespace,Status\r\n");
      expect(csv).toContain("nginx-pod,default,Running\r\n");
      expect(csv).toContain("redis-pod,prod,Pending");
    });

    it("omits BOM when withBom is false", () => {
      const headers = ["Name"];
      const rows = [["my-pod"]];

      const csv = buildCsv(headers, rows, { withBom: false });

      expect(csv.startsWith("\uFEFF")).toBe(false);
      expect(csv).toBe("Name\r\nmy-pod");
    });

    it("sanitizes malicious formula cells across both headers and data rows", () => {
      const headers = ["=MaliciousHeader", "Namespace"];
      const rows = [
        ["=1+1", "default"],
        ["\t@DDE(\"cmd\",\"/c calc\")", "prod"],
        ["+SUM(A1:A5)", "dev"],
      ];

      const csv = buildCsv(headers, rows, { withBom: false });

      // Headers must be sanitized
      expect(csv).toContain('"\'=MaliciousHeader",Namespace');

      // Rows must be sanitized
      expect(csv).toContain('"\'=1+1",default');
      expect(csv).toContain('"\'\t@DDE(""cmd"",""/c calc"")",prod');
      expect(csv).toContain('"\'+SUM(A1:A5)",dev');
    });

    it("handles Unicode characters properly (Spanish, accents, etc.)", () => {
      const headers = ["Descripción", "Estado"];
      const rows = [["Servicio de autenticación", "Activo"]];

      const csv = buildCsv(headers, rows);

      expect(csv).toContain("Descripción,Estado");
      expect(csv).toContain("Servicio de autenticación,Activo");
    });
  });

  describe("generateCsvFilename", () => {
    it("creates a safe filename containing cluster alias and kind", () => {
      const fixedDate = new Date(2026, 9, 20, 15, 30, 45); // Oct 20, 2026 15:30:45
      const filename = generateCsvFilename("prod-eu-west-1", "Pods", fixedDate);

      expect(filename).toBe("openlens-devops_prod-eu-west-1_pods_20261020-153045.csv");
    });

    it("sanitizes dangerous or special characters in cluster name", () => {
      const fixedDate = new Date(2026, 9, 20, 10, 0, 0);
      const filename = generateCsvFilename("../../etc/passwd!@#$", "Secrets & Keys", fixedDate);

      expect(filename).not.toContain("..");
      expect(filename).not.toContain("/");
      expect(filename).toContain("openlens-devops_etc-passwd");
      expect(filename).toContain("_secrets-keys_");
      expect(filename.endsWith(".csv")).toBe(true);
    });

    it("falls back to defaults when cluster name or kind is empty", () => {
      const filename = generateCsvFilename("", "");
      expect(filename.startsWith("openlens-devops_cluster_resources_")).toBe(true);
      expect(filename.endsWith(".csv")).toBe(true);
    });
  });
});
