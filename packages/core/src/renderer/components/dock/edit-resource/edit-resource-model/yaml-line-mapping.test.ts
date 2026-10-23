/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { mapJsonPointerToYamlLine } from "./yaml-line-mapping";

const yamlText = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: nginx:1.25
          env:
            - name: A
              value: "1"
            - name: B
              value: "2"
`;

describe("mapJsonPointerToYamlLine (R7-02)", () => {
  it("maps top-level and nested mapping keys", () => {
    expect(mapJsonPointerToYamlLine(yamlText, "/kind")).toMatchObject({ line: 2 });
    expect(mapJsonPointerToYamlLine(yamlText, "/metadata/name")).toMatchObject({ line: 4 });
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/replicas")).toMatchObject({ line: 7 });
  });

  it("maps sequence items and their inline keys", () => {
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/template/spec/containers/0/name")).toMatchObject({ line: 11 });
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/template/spec/containers/0/image")).toMatchObject({ line: 12 });
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/template/spec/containers/0/env/1")).toMatchObject({ line: 16 });
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/template/spec/containers/0/env/1/value")).toMatchObject({ line: 17 });
  });

  it("decodes JSON pointer escapes", () => {
    const withSlashes = `metadata:
  annotations:
    example.com/a~b: value
`;
    const location = mapJsonPointerToYamlLine(withSlashes, "/metadata/annotations/example.com~1a~0b");

    expect(location).toMatchObject({ line: 3 });
  });

  it("supports quoted keys", () => {
    const quoted = `metadata:
  labels:
    "app.kubernetes.io/name": web
`;
    const location = mapJsonPointerToYamlLine(quoted, "/metadata/labels/app.kubernetes.io~1name");

    expect(location).toMatchObject({ line: 3 });
  });

  it("refuses to map pointers under a block scalar", () => {
    const scalar = `apiVersion: v1
kind: ConfigMap
metadata:
  name: cm
data:
  script: |
    line one
    line two
  other: value
`;

    expect(mapJsonPointerToYamlLine(scalar, "/data/script")).toMatchObject({ line: 6 });
    expect(mapJsonPointerToYamlLine(scalar, "/data/other")).toMatchObject({ line: 9 });
  });

  it("refuses to map pointers under flow containers", () => {
    const flow = `metadata:
  labels: { app: web }
  annotations:
    note: ok
`;

    expect(mapJsonPointerToYamlLine(flow, "/metadata/labels/app")).toBeUndefined();
    expect(mapJsonPointerToYamlLine(flow, "/metadata/annotations/note")).toMatchObject({ line: 4 });
  });

  it("returns undefined for unknown paths", () => {
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/doesNotExist")).toBeUndefined();
    expect(mapJsonPointerToYamlLine(yamlText, "/spec/replicas/nested")).toBeUndefined();
  });

  it("refuses multi-document YAML and invalid pointers", () => {
    const multi = "---\nkind: A\n---\nkind: B\n";

    expect(mapJsonPointerToYamlLine(multi, "/kind")).toBeUndefined();
    expect(mapJsonPointerToYamlLine(yamlText, "kind")).toBeUndefined();
    expect(mapJsonPointerToYamlLine(yamlText, "/")).toBeUndefined();
  });

  it("does not confuse a numeric mapping key with a sequence index", () => {
    const numericKeys = `metadata:
  labels:
    "2026": year
`;

    expect(mapJsonPointerToYamlLine(numericKeys, "/metadata/labels/2026")).toMatchObject({ line: 3 });
  });
});
