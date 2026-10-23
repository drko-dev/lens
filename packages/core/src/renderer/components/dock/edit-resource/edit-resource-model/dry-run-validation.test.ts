/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { RawKubeObject } from "@openlens/kube-object";
import {
  classifyDryRunFailure,
  getKubeErrorPayload,
  redactDryRunFailure,
  redactSecretCauses,
  redactSecretText,
} from "./dry-run-validation";

const kubeError = (payload: Record<string, unknown>) => ({ error: payload });

describe("dry-run validation classification (R7-02)", () => {
  it("extracts the structured payload from a wrapped json-api error", () => {
    expect(getKubeErrorPayload(kubeError({ code: 403 }))).toEqual({ code: 403 });
    expect(getKubeErrorPayload(new Error("boom"))).toBeUndefined();
  });

  it.each([
    [400, "bad-request"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [422, "invalid"],
    [500, "connection"],
    [503, "connection"],
  ])("classifies HTTP %s as %s", (code, expected) => {
    const result = classifyDryRunFailure(kubeError({
      code,
      reason: "SomeReason",
      message: "server message",
    }), "fallback");

    expect(result.errorKind).toBe(expected);
    expect(result.statusCode).toBe(code);
    expect(result.message).toBe("server message");
  });

  it("classifies an admission webhook rejection and keeps its exact message", () => {
    const result = classifyDryRunFailure(kubeError({
      code: 400,
      reason: "Invalid",
      message: "admission webhook \"policy.example.com\" denied the request: image tag is not allowed",
    }), "fallback");

    expect(result.errorKind).toBe("admission-denied");
    expect(result.message).toContain("policy.example.com");
    expect(result.message).toContain("image tag is not allowed");
  });

  it("extracts structured causes with field pointers for a 422", () => {
    const result = classifyDryRunFailure(kubeError({
      code: 422,
      reason: "Invalid",
      message: "Deployment.apps \"web\" is invalid",
      details: {
        causes: [
          { field: "spec.replicas", message: "must be greater than or equal to 0" },
          { message: "general failure" },
        ],
      },
    }), "fallback");

    expect(result.errorKind).toBe("invalid");
    expect(result.causes).toEqual([
      { field: "spec.replicas", message: "must be greater than or equal to 0" },
      { message: "general failure" },
    ]);
  });

  it("classifies network failures without a payload from the message", () => {
    expect(classifyDryRunFailure(new Error("request failed: ECONNREFUSED"), "connect ECONNREFUSED 127.0.0.1:443"))
      .toMatchObject({ errorKind: "connection" });

    expect(classifyDryRunFailure(undefined, "The operation was aborted due to timeout"))
      .toMatchObject({ errorKind: "connection" });
  });

  it("falls back to unknown when neither payload nor message are diagnostic", () => {
    expect(classifyDryRunFailure(undefined, "something odd")).toMatchObject({
      errorKind: "unknown",
      message: "something odd",
    });
  });
});

describe("Secret redaction for dry-run results (R7-02)", () => {
  const secret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "app-secret", namespace: "default" },
    data: { password: "ZmFrZS1wYXNzd29yZA==" },
    stringData: { token: "fake-token-value" },
  } as unknown as RawKubeObject;

  it("redacts exact Secret values echoed back in server messages", () => {
    const message = "invalid data.password: ZmFrZS1wYXNzd29yZA== and token fake-token-value rejected";

    expect(redactSecretText("Secret", message, secret)).toBe(
      "invalid data.password: <redacted> and token <redacted> rejected",
    );
  });

  it("does not touch messages for non-Secret kinds", () => {
    const message = "value fake-token-value is fine";

    expect(redactSecretText("ConfigMap", message, secret)).toBe(message);
  });

  it("redacts causes and keeps field pointers", () => {
    const causes = redactSecretCauses("Secret", [
      { field: "data.password", message: "ZmFrZS1wYXNzd29yZA== is invalid base64" },
    ], secret);

    expect(causes).toEqual([
      { field: "data.password", message: "<redacted> is invalid base64" },
    ]);
  });

  it("ignores empty values and non-string entries", () => {
    const oddSecret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "odd" },
      data: { empty: "", nested: { a: "x" }},
    } as unknown as RawKubeObject;

    expect(redactSecretText("Secret", "nothing to redact here", oddSecret)).toBe("nothing to redact here");
  });
});

describe("Secret redaction across versions and server error fields (R7-02 final gate)", () => {
  const previousSecret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "app-secret", namespace: "default" },
    data: { password: "b2xkLXNlY3JldA==" },
    stringData: { token: "old-token-value" },
  } as unknown as RawKubeObject;

  const currentSecret = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "app-secret", namespace: "default" },
    data: { password: "bmV3LXNlY3JldA==" },
    stringData: { token: "new-token-value" },
  } as unknown as RawKubeObject;

  it("redacts values from the previously loaded Secret, not only the current one", () => {
    const text = "removed password b2xkLXNlY3JldA== and token old-token-value";

    expect(redactSecretText("Secret", text, [previousSecret, currentSecret]))
      .toBe("removed password <redacted> and token <redacted>");
  });

  it("redacts values from both versions in a single pass", () => {
    const text = "b2xkLXNlY3JldA== bmV3LXNlY3JldA== old-token-value new-token-value";

    expect(redactSecretText("Secret", text, [previousSecret, currentSecret]))
      .toBe("<redacted> <redacted> <redacted> <redacted>");
  });

  it("redacts longer values first so embedded values do not leave fragments", () => {
    const nested = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "nested" },
      data: { long: "abcdef", short: "abc" },
    } as unknown as RawKubeObject;

    expect(redactSecretText("Secret", "abcdef", nested)).toBe("<redacted>");
  });

  it("redacts reason, message, cause fields and messages", () => {
    const classification = classifyDryRunFailure(kubeError({
      code: 422,
      reason: "Invalid b2xkLXNlY3JldA==",
      message: "data.password: bmV3LXNlY3JldA== is invalid",
      details: {
        causes: [{
          field: "data.b2xkLXNlY3JldA==",
          message: "old-token-value rejected",
        }],
      },
    }), "fallback");

    const redacted = redactDryRunFailure("Secret", classification, [previousSecret, currentSecret]);

    expect(redacted.reason).toBe("Invalid <redacted>");
    expect(redacted.message).toBe("data.password: <redacted> is invalid");
    expect(redacted.causes).toEqual([
      { field: "data.<redacted>", message: "<redacted> rejected" },
    ]);
    expect(JSON.stringify(redacted)).not.toContain("b2xkLXNlY3JldA==");
    expect(JSON.stringify(redacted)).not.toContain("bmV3LXNlY3JldA==");
  });

  it("fails closed when the kind is missing but a source manifest is a Secret", () => {
    expect(redactSecretText(undefined, "value old-token-value", previousSecret))
      .toBe("value <redacted>");
  });

  it("leaves non-Secret classifications untouched", () => {
    const configMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "cm" },
      data: { key: "visible-value" },
    } as unknown as RawKubeObject;
    const classification = classifyDryRunFailure(kubeError({
      code: 422,
      reason: "Invalid",
      message: "key > 10",
    }), "fallback");

    expect(redactDryRunFailure("ConfigMap", classification, [configMap])).toEqual(classification);
  });
});
