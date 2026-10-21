/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  getClusterEnvironmentConfig,
  isProductionEnvironment,
  CLUSTER_ENVIRONMENTS,
} from "../environment-types";
import type { ClusterPreferences } from "../../cluster-types";

// Raw user-entered values are not limited to the canonical union.
const withEnvironment = (clusterEnvironment: string) => ({ clusterEnvironment }) as ClusterPreferences;

describe("cluster environment types and helpers", () => {
  describe("getClusterEnvironmentConfig", () => {
    it("returns none configuration when preferences are missing or unset", () => {
      expect(getClusterEnvironmentConfig()).toEqual(CLUSTER_ENVIRONMENTS.none);
      expect(getClusterEnvironmentConfig(null)).toEqual(CLUSTER_ENVIRONMENTS.none);
      expect(getClusterEnvironmentConfig({})).toEqual(CLUSTER_ENVIRONMENTS.none);
    });

    it("returns production configuration with hazard flag enabled", () => {
      const config = getClusterEnvironmentConfig({ clusterEnvironment: "production" });

      expect(config.id).toBe("production");
      expect(config.isProduction).toBe(true);
      expect(config.defaultColor).toBe("#EF4444");
      expect(config.shortLabel).toBe("PRD");
    });

    it("returns staging, dev, testing, and local configs correctly", () => {
      expect(getClusterEnvironmentConfig({ clusterEnvironment: "staging" }).shortLabel).toBe("STG");
      expect(getClusterEnvironmentConfig({ clusterEnvironment: "development" }).shortLabel).toBe("DEV");
      expect(getClusterEnvironmentConfig({ clusterEnvironment: "testing" }).shortLabel).toBe("TEST");
      expect(getClusterEnvironmentConfig({ clusterEnvironment: "local" }).shortLabel).toBe("LOC");
    });

    it("supports custom environment names with dynamic label and 4-letter uppercase shortLabel", () => {
      const config = getClusterEnvironmentConfig({
        clusterEnvironment: "custom",
        customEnvironmentName: "Sandbox-Alpha",
      });

      expect(config.id).toBe("custom");
      expect(config.label).toBe("Sandbox-Alpha");
      expect(config.shortLabel).toBe("SAND");
      expect(config.isProduction).toBe(false);
    });
  });

  describe("isProductionEnvironment", () => {
    it("returns true only when clusterEnvironment is strictly 'production'", () => {
      expect(isProductionEnvironment({ clusterEnvironment: "production" })).toBe(true);
      expect(isProductionEnvironment({ clusterEnvironment: "staging" })).toBe(false);
      expect(isProductionEnvironment({ clusterEnvironment: "development" })).toBe(false);
      expect(isProductionEnvironment({})).toBe(false);
      expect(isProductionEnvironment(null)).toBe(false);
      expect(isProductionEnvironment(undefined)).toBe(false);
    });

    it("never infers production environment solely from cluster or context name", () => {
      const clusterWithProdName = {
        clusterName: "k8s-production-eu-west-1",
        clusterEnvironment: undefined,
      };

      expect(isProductionEnvironment(clusterWithProdName)).toBe(false);
    });

    it("never infers production from a prod-like name when environment is unset", () => {
      expect(isProductionEnvironment({ clusterName: "prod" } as ClusterPreferences)).toBe(false);
      expect(getClusterEnvironmentConfig({ clusterName: "prd-cluster" } as ClusterPreferences)).toEqual(CLUSTER_ENVIRONMENTS.none);
    });
  });

  describe("inherited Object.prototype keys (R4-04)", () => {
    it.each(["toString", "constructor", "__proto__"])("resolves '%s' to none without production classification", (value) => {
      expect(getClusterEnvironmentConfig(withEnvironment(value))).toEqual(CLUSTER_ENVIRONMENTS.none);
      expect(isProductionEnvironment(withEnvironment(value))).toBe(false);
    });
  });

  describe("environment alias normalization (R4-04)", () => {
    it.each([
      ["prod", "production"],
      ["prd", "production"],
      ["dev", "development"],
      ["stg", "staging"],
      ["stage", "staging"],
      ["qa", "testing"],
    ])("normalizes alias '%s' to '%s'", (alias, canonical) => {
      expect(getClusterEnvironmentConfig(withEnvironment(alias))).toEqual(
        getClusterEnvironmentConfig(withEnvironment(canonical)),
      );
    });

    it.each(["prod", "prd"])("keeps production hazard flags for alias '%s'", (alias) => {
      const config = getClusterEnvironmentConfig(withEnvironment(alias));

      expect(config.isProduction).toBe(true);
      expect(config.shortLabel).toBe("PRD");
      expect(config.defaultColor).toBe("#EF4444");
      expect(isProductionEnvironment(withEnvironment(alias))).toBe(true);
    });

    it.each(["dev", "stg", "stage", "qa"])("does not classify non-production alias '%s' as production", (alias) => {
      expect(isProductionEnvironment(withEnvironment(alias))).toBe(false);
    });

    it.each(["PROD", "Production", "live", "unknown", "prod-eu"])("does not infer any environment from unknown value '%s'", (value) => {
      expect(getClusterEnvironmentConfig(withEnvironment(value))).toEqual(CLUSTER_ENVIRONMENTS.none);
      expect(isProductionEnvironment(withEnvironment(value))).toBe(false);
    });
  });
});
