/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { validateValuesAgainstSchema } from "../schema-validator";

describe("validateValuesAgainstSchema (JSON Schema draft-07)", () => {
  it("validates nested values and reports paths, expected type, and actual type", () => {
    const result = validateValuesAgainstSchema(
      { image: { tag: 123 }, hosts: ["valid", 2] },
      {
        type: "object",
        properties: {
          image: { type: "object", properties: { tag: { type: "string" }}},
          hosts: { type: "array", items: { type: "string" }},
        },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "image.tag", keyword: "type", expected: "string", actual: "integer" }),
      expect.objectContaining({ path: "hosts[1]", keyword: "type", expected: "string", actual: "integer" }),
    ]));
    expect(result.complete).toBe(true);
  });

  it("supports the common draft-07 assertions, including conditional and property constraints", () => {
    const result = validateValuesAgainstSchema(
      { enabled: true, replicas: 2, name: "x", tags: ["a"], child: { port: "bad" }},
      {
        type: "object",
        minProperties: 6,
        maxProperties: 4,
        properties: {
          enabled: { type: "boolean" },
          replicas: { type: "integer", minimum: 1, multipleOf: 0.1 },
          name: { type: "string", minLength: 2 },
          tags: { type: "array", contains: { const: "required" }},
          child: {
            type: "object",
            propertyNames: { pattern: "^allowed$" },
          },
        },
        if: { properties: { enabled: { const: true }}, required: ["enabled"] },
        then: { properties: { child: { properties: { port: { type: "integer" }}}}},
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.keyword)).toEqual(expect.arrayContaining([
      "minProperties",
      "maxProperties",
      "minLength",
      "contains",
      "propertyNames",
      "type",
    ]));
    expect(result.complete).toBe(true);
  });

  it("supports draft-07 dependencies and negation", () => {
    const result = validateValuesAgainstSchema(
      { creditCard: "1234", blocked: "present" },
      {
        type: "object",
        dependencies: { creditCard: ["billingAddress"] },
        properties: { blocked: { not: { const: "present" }}},
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.keyword)).toEqual(expect.arrayContaining(["dependencies", "not"]));
    expect(result.complete).toBe(true);
  });

  it("treats format as an annotation and does not validate it by default", () => {
    const result = validateValuesAgainstSchema("not-an-email", { type: "string", format: "email" });

    expect(result).toEqual({ valid: true, errors: [], unsupportedKeywords: [], complete: true });
  });

  it("supports boolean schemas at the root and in nested properties", () => {
    expect(validateValuesAgainstSchema("anything", true).valid).toBe(true);

    const result = validateValuesAgainstSchema({ blocked: "value" }, {
      type: "object",
      properties: { blocked: false },
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe("blocked");
    expect(result.complete).toBe(true);
  });

  it("supports local references, structural equality, and decimal multipleOf", () => {
    const result = validateValuesAgainstSchema(
      { config: { b: [1, 2], a: 1 }, ratio: 0.3 },
      {
        type: "object",
        properties: {
          config: { $ref: "#/definitions/config" },
          ratio: { type: "number", multipleOf: 0.1 },
        },
        definitions: { config: { const: { a: 1, b: [1, 2] }}},
      },
    );

    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
  });

  it("marks an unknown keyword as incomplete and never reports a full pass", () => {
    const result = validateValuesAgainstSchema(
      { value: "ok" },
      { type: "object", properties: { value: { type: "string", "x-chart-policy": "required" }}},
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.complete).toBe(false);
    expect(result.unsupportedKeywords.join(" ")).toContain("x-chart-policy");
  });

  it("treats an unresolved remote reference as incomplete without fetching it", () => {
    const result = validateValuesAgainstSchema(
      { value: 1 },
      { type: "object", properties: { value: { $ref: "https://example.invalid/schema.json" }}},
    );

    expect(result.valid).toBe(true);
    expect(result.complete).toBe(false);
  });

  it("does not include secret values in validation messages", () => {
    const result = validateValuesAgainstSchema(
      { password: "not-for-logs" },
      { type: "object", properties: { password: { enum: ["expected"] }}},
    );

    expect(result.errors[0].message).not.toContain("not-for-logs");
  });

  it("reports root-level errors at the root", () => {
    const result = validateValuesAgainstSchema("not-an-object", { type: "object" });

    expect(result.errors[0].path).toBe("(root)");
  });

  it("rejects schemas with excessively long regex patterns to mitigate ReDoS", () => {
    const dangerousPattern = "a".repeat(300);
    const result = validateValuesAgainstSchema(
      { text: "hello" },
      { type: "object", properties: { text: { type: "string", pattern: dangerousPattern }}},
    );

    expect(result.complete).toBe(false);
    expect(result.unsupportedKeywords[0]).toContain("mitigate ReDoS");
  });

  it("rejects values payloads that exceed maximum validation size", () => {
    const hugeObject: Record<string, string> = {};

    for (let i = 0; i < 20000; i++) {
      hugeObject[`key_${i}`] = "x".repeat(60);
    }

    const result = validateValuesAgainstSchema(hugeObject, { type: "object" });

    expect(result.complete).toBe(false);
    expect(result.unsupportedKeywords[0]).toContain("maximum validation size");
  });
});
