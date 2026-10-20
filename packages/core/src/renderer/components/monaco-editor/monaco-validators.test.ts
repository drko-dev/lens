/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  validateYamlSyntax,
  validateKubernetesResourceYaml,
  yamlValidator,
} from "./monaco-validators";

describe("monaco-validators", () => {
  describe("validateYamlSyntax", () => {
    it("returns valid: true for well-formed YAML", () => {
      const result = validateYamlSyntax("key: value\nlist:\n  - item1\n  - item2");

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns line, column, and reason for bad indentation or syntax", () => {
      const badYaml = "key: value\n  bad_indent: 123";
      const result = validateYamlSyntax(badYaml);

      expect(result.valid).toBe(false);
      expect(result.line).toBeDefined();
      expect(result.column).toBeDefined();
      expect(result.error).toContain("bad indentation");
    });

    it("returns line and column for unexpected character or bracket", () => {
      const badYaml = "foo: [unclosed";
      const result = validateYamlSyntax(badYaml);

      expect(result.valid).toBe(false);
      expect(result.line).toBeGreaterThanOrEqual(1);
    });
  });

  describe("validateKubernetesResourceYaml", () => {
    it("returns valid: true for valid single Kubernetes manifest", () => {
      const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: default
spec:
  containers:
    - name: nginx
      image: nginx:latest
`;
      const result = validateKubernetesResourceYaml(yaml);

      expect(result.valid).toBe(true);
    });

    it("rejects empty or whitespace-only YAML", () => {
      expect(validateKubernetesResourceYaml("").valid).toBe(false);
      expect(validateKubernetesResourceYaml("   \n\t  ").valid).toBe(false);
      expect(validateKubernetesResourceYaml("# Just a comment\n").valid).toBe(false);
    });

    it("rejects multiple documents separated by ---", () => {
      const multi = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cfg1
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cfg2
`;
      const result = validateKubernetesResourceYaml(multi);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only a single Kubernetes resource document is supported");
      expect(result.error).toContain("2 documents");
    });

    it("rejects YAML that is not an object/mapping", () => {
      const arrayYaml = `
- item1
- item2
`;
      const result = validateKubernetesResourceYaml(arrayYaml);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a YAML mapping");
    });

    it("validates required fields: apiVersion, kind, metadata, metadata.name", () => {
      expect(validateKubernetesResourceYaml("kind: Pod\nmetadata:\n  name: p").error).toBe(
        "Missing required field: apiVersion",
      );
      expect(validateKubernetesResourceYaml("apiVersion: v1\nmetadata:\n  name: p").error).toBe(
        "Missing required field: kind",
      );
      expect(validateKubernetesResourceYaml("apiVersion: v1\nkind: Pod").error).toBe(
        "Missing required field: metadata",
      );
      expect(validateKubernetesResourceYaml("apiVersion: v1\nkind: Pod\nmetadata:\n  namespace: default").error).toBe(
        "Missing required field: metadata.name",
      );
    });
  });

  describe("yamlValidator", () => {
    it("does not throw for valid YAML", () => {
      expect(() => yamlValidator("apiVersion: v1\nkind: Pod")).not.toThrow();
    });

    it("throws an Error with line and column properties for invalid YAML", () => {
      expect.assertions(3);

      try {
        yamlValidator("foo: [unclosed");
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.line).toBeDefined();
        expect(error.column).toBeDefined();
      }
    });
  });
});
