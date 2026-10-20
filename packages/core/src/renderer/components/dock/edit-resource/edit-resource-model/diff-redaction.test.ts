/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { sanitizeSecretForDiff, sanitizeYamlForDiff } from "./diff-redaction";
import type { RawKubeObject } from "@openlens/kube-object";
import yaml from "js-yaml";

describe("diff-redaction", () => {
  it("does not redact non-Secret resources (e.g. ConfigMap)", () => {
    const cm = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "test-cm", namespace: "default", selfLink: "/api/v1/namespaces/default/configmaps/test-cm" },
      data: { config: "visible value" },
    } as unknown as RawKubeObject;

    const sanitized = sanitizeSecretForDiff(cm);

    expect((sanitized.data as any).config).toBe("visible value");
    expect(sanitizeYamlForDiff(yaml.dump(cm))).toBe(yaml.dump(cm));
  });

  it("redacts Secret data and stringData without exposing raw values", () => {
    const secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "test-secret",
        namespace: "default",
        selfLink: "/api/v1/namespaces/default/secrets/test-secret",
        annotations: {
          "kubectl.kubernetes.io/last-applied-configuration": '{"data":{"password":"supersecret"}}',
        },
      },
      data: {
        password: "c3VwZXJzZWNyZXQ=",
        apiKey: "YWJjMTIz",
      },
    } as unknown as RawKubeObject;

    const sanitized = sanitizeSecretForDiff(secret);

    expect((sanitized.data as any).password).toBe("<redacted>");
    expect((sanitized.data as any).apiKey).toBe("<redacted>");
    expect(
      sanitized.metadata.annotations?.["kubectl.kubernetes.io/last-applied-configuration"],
    ).toBe("<redacted last-applied-configuration>");

    const sanitizedYaml = sanitizeYamlForDiff(yaml.dump(secret));

    expect(sanitizedYaml).not.toContain("c3VwZXJzZWNyZXQ=");
    expect(sanitizedYaml).not.toContain("supersecret");
    expect(sanitizedYaml).not.toContain("YWJjMTIz");
    expect(sanitizedYaml).toContain("<redacted>");
  });

  it("marks modified, new, and unchanged keys in Secret diffs without revealing content", () => {
    const base = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "my-secret", namespace: "default", selfLink: "/api/v1/namespaces/default/secrets/my-secret" },
      data: {
        unchanged: "c2FtZQ==",
        changed: "b2xk",
        removed: "dG9EZWw=",
      },
    } as unknown as RawKubeObject;

    const draft = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "my-secret", namespace: "default", selfLink: "/api/v1/namespaces/default/secrets/my-secret" },
      data: {
        unchanged: "c2FtZQ==",
        changed: "bmV3",
        added: "YnJhbmROZXc=",
      },
    } as unknown as RawKubeObject;

    const sanitizedDraft = sanitizeSecretForDiff(draft, base);

    expect((sanitizedDraft.data as any).unchanged).toBe("<redacted>");
    expect((sanitizedDraft.data as any).changed).toBe("<redacted (modified)>");
    expect((sanitizedDraft.data as any).added).toBe("<redacted (new)>");
    expect((sanitizedDraft.data as any).removed).toBeUndefined();

    // Verify raw values are completely absent
    const draftYaml = sanitizeYamlForDiff(yaml.dump(draft), "Secret", yaml.dump(base));

    expect(draftYaml).not.toContain("bmV3");
    expect(draftYaml).not.toContain("YnJhbmROZXc=");
  });
});
