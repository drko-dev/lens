/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  getConfiguredClusterColor,
  resolveClusterEnvironment,
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
      expect(config.shortLabel).toBe("PROD");
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

    it("strictly requires explicit environment configuration (negative checks)", () => {
      // 1. cluster named 'prod' without configured environment
      expect(isProductionEnvironment({ clusterName: "prod" } as any)).toBe(false);

      // 2. contextName containing 'production' without configured environment
      expect(isProductionEnvironment({ contextName: "production-us-east-1" } as any)).toBe(false);

      // 3. clusterId containing 'prd' without configured environment
      expect(isProductionEnvironment({ clusterId: "c-prd-998877" } as any)).toBe(false);

      // Positive check: explicit environment 'production' flags as production regardless of misleading name
      expect(isProductionEnvironment({
        clusterName: "local-dev-sandbox",
        contextName: "minikube-local",
        clusterId: "dev-01",
        clusterEnvironment: "production",
      } as any)).toBe(true);
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
      expect(config.shortLabel).toBe("PROD");
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

describe("resolveClusterEnvironment", () => {
  it("prefers preferences over spec", () => {
    expect(resolveClusterEnvironment({
      preferences: withEnvironment("staging"),
      spec: { environment: "production" },
    }).id).toBe("staging");
  });

  it("falls back to spec when preferences have no environment", () => {
    expect(resolveClusterEnvironment({ preferences: {} as ClusterPreferences, spec: { environment: "production" }}).id).toBe("production");
    expect(resolveClusterEnvironment({ spec: { environment: "custom", customEnvironmentName: "qa1x" }}).shortLabel).toBe("QA1X");
  });

  it("ignores labels and names; unknown or empty resolves to none", () => {
    const source = { spec: { labels: { "devops.openlens.dev/env": "production" }, name: "prod-cluster" }} as any;

    expect(resolveClusterEnvironment(source).id).toBe("none");
    expect(resolveClusterEnvironment({ spec: { environment: "bogus" }}).id).toBe("none");
    expect(resolveClusterEnvironment({}).id).toBe("none");
    expect(resolveClusterEnvironment({ preferences: null, spec: null }).id).toBe("none");
  });

  it("uses PROD short label and css vars", () => {
    expect(CLUSTER_ENVIRONMENTS.production.shortLabel).toBe("PROD");
    expect(CLUSTER_ENVIRONMENTS.production.cssVar).toBe("--envProduction");
  });
});

describe("getConfiguredClusterColor (H7.4)", () => {
  it("prefers clusterColor, falls back to a plain-color legacy icon and ignores images and material icons", () => {
    expect(getConfiguredClusterColor({ clusterColor: "#10B981", icon: "#EF4444" } as ClusterPreferences)).toBe("#10B981");
    expect(getConfiguredClusterColor({ icon: "#EF4444" } as ClusterPreferences)).toBe("#EF4444");
    expect(getConfiguredClusterColor({ icon: "data:image/png;base64,AAAA" } as ClusterPreferences)).toBeUndefined();
    expect(getConfiguredClusterColor({ icon: "material:dns" } as ClusterPreferences)).toBeUndefined();
    expect(getConfiguredClusterColor({ clusterName: "prod-cluster" } as ClusterPreferences)).toBeUndefined();
    expect(getConfiguredClusterColor(undefined)).toBeUndefined();
  });
});
