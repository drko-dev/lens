/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  getClusterEnvironmentConfig,
  isProductionEnvironment,
  CLUSTER_ENVIRONMENTS,
} from "../environment-types";

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
  });
});
