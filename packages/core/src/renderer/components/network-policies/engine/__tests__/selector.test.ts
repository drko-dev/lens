/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { matchesSelector } from "../selector";

describe("Label Selector Engine", () => {
  it("matches empty selector {} against any labels", () => {
    expect(matchesSelector({}, {})).toBe(true);
    expect(matchesSelector({ app: "frontend" }, {})).toBe(true);
    expect(matchesSelector(undefined, {})).toBe(true);
  });

  it("matches undefined selector as true", () => {
    expect(matchesSelector({ app: "web" }, undefined)).toBe(true);
  });

  describe("matchLabels", () => {
    it("matches exact key-value pairs", () => {
      const labels = { app: "web", role: "backend", tier: "api" };

      expect(matchesSelector(labels, { matchLabels: { app: "web" }})).toBe(true);
      expect(matchesSelector(labels, { matchLabels: { app: "web", role: "backend" }})).toBe(true);
      expect(matchesSelector(labels, { matchLabels: { app: "db" }})).toBe(false);
      expect(matchesSelector(labels, { matchLabels: { environment: "prod" }})).toBe(false);
    });

    it("fails when resource has no labels", () => {
      expect(matchesSelector({}, { matchLabels: { app: "web" }})).toBe(false);
      expect(matchesSelector(undefined, { matchLabels: { app: "web" }})).toBe(false);
    });
  });

  describe("matchExpressions", () => {
    it("evaluates In operator", () => {
      const selector = {
        matchExpressions: [{
          key: "env",
          operator: "In" as const,
          values: ["prod", "stage"],
        }],
      };

      expect(matchesSelector({ env: "prod" }, selector)).toBe(true);
      expect(matchesSelector({ env: "stage" }, selector)).toBe(true);
      expect(matchesSelector({ env: "dev" }, selector)).toBe(false);
      expect(matchesSelector({}, selector)).toBe(false);
    });

    it("evaluates NotIn operator", () => {
      const selector = {
        matchExpressions: [{
          key: "env",
          operator: "NotIn" as const,
          values: ["prod", "stage"],
        }],
      };

      expect(matchesSelector({ env: "dev" }, selector)).toBe(true);
      expect(matchesSelector({}, selector)).toBe(true); // absent key is not in values
      expect(matchesSelector({ env: "prod" }, selector)).toBe(false);
    });

    it("evaluates Exists operator", () => {
      const selector = {
        matchExpressions: [{
          key: "isolated",
          operator: "Exists" as const,
        }],
      };

      expect(matchesSelector({ isolated: "true" }, selector)).toBe(true);
      expect(matchesSelector({ isolated: "" }, selector)).toBe(true);
      expect(matchesSelector({ other: "val" }, selector)).toBe(false);
      expect(matchesSelector({}, selector)).toBe(false);
    });

    it("evaluates DoesNotExist operator", () => {
      const selector = {
        matchExpressions: [{
          key: "legacy",
          operator: "DoesNotExist" as const,
        }],
      };

      expect(matchesSelector({}, selector)).toBe(true);
      expect(matchesSelector({ app: "v2" }, selector)).toBe(true);
      expect(matchesSelector({ legacy: "true" }, selector)).toBe(false);
    });

    it("evaluates combined matchLabels and matchExpressions", () => {
      const selector = {
        matchLabels: { app: "frontend" },
        matchExpressions: [{
          key: "tier",
          operator: "In" as const,
          values: ["ui", "client"],
        }],
      };

      expect(matchesSelector({ app: "frontend", tier: "ui" }, selector)).toBe(true);
      expect(matchesSelector({ app: "frontend", tier: "api" }, selector)).toBe(false);
      expect(matchesSelector({ app: "backend", tier: "ui" }, selector)).toBe(false);
    });
  });
});
