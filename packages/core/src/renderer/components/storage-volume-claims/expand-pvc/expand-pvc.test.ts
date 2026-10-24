/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PersistentVolumeClaim, StorageClass } from "@openlens/kube-object";
import {
  buildPvcExpansionPatch,
  classifyPvcExpansionPhase,
  getExpansionSizeComparison,
  parseQuantity,
  validatePvcExpansion,
} from "./expand-pvc";

const makePvc = (size: string, storageClassName?: string) => new PersistentVolumeClaim({
  apiVersion: "v1",
  kind: "PersistentVolumeClaim",
  metadata: {
    name: "data",
    namespace: "default",
    uid: "pvc-uid",
    resourceVersion: "10",
    selfLink: "/api/v1/namespaces/default/persistentvolumeclaims/data",
  },
  spec: {
    accessModes: ["ReadWriteOnce"],
    resources: { requests: { storage: size }},
    storageClassName,
  },
  status: { phase: "Bound" },
} as never);

const makeStorageClass = (allowVolumeExpansion: boolean) => new StorageClass({
  apiVersion: "storage.k8s.io/v1",
  kind: "StorageClass",
  metadata: {
    name: "standard",
    uid: "sc-uid",
    resourceVersion: "1",
    selfLink: "/apis/storage.k8s.io/v1/storageclasses/standard",
  },
  provisioner: "csi.test.io",
  allowVolumeExpansion,
} as never);

describe("expand-pvc helpers", () => {
  describe("parseQuantity", () => {
    it("parses binary SI units exactly", () => {
      expect(parseQuantity("1Ki")).toEqual({ valid: true, bytes: BigInt(1024) });
      expect(parseQuantity("1Mi")).toEqual({ valid: true, bytes: BigInt(1024) ** BigInt(2) });
      expect(parseQuantity("512Mi")).toEqual({ valid: true, bytes: BigInt(512) * BigInt(1024) ** BigInt(2) });
      expect(parseQuantity("1Gi")).toEqual({ valid: true, bytes: BigInt(1024) ** BigInt(3) });
      expect(parseQuantity("1Ei")).toEqual({ valid: true, bytes: BigInt(1024) ** BigInt(6) });
    });

    it("parses decimal SI units exactly", () => {
      expect(parseQuantity("1G")).toEqual({ valid: true, bytes: BigInt(1000) ** BigInt(3) });
      expect(parseQuantity("500M")).toEqual({ valid: true, bytes: BigInt(500) * BigInt(1000) ** BigInt(2) });
      expect(parseQuantity("1295m").valid).toBe(false);
    });

    it("parses exponent notation exactly", () => {
      expect(parseQuantity("1e3")).toEqual({ valid: true, bytes: BigInt(1000) });
      expect(parseQuantity("1.5e3")).toEqual({ valid: true, bytes: BigInt(1500) });
      expect(parseQuantity("1E+3")).toEqual({ valid: true, bytes: BigInt(1000) });
      expect(parseQuantity("1e-3")).toEqual({ valid: false, error: expect.stringContaining("whole number") });
    });

    it("resolves fractional quantities to exact byte counts when representable", () => {
      expect(parseQuantity("1.5Gi")).toEqual({ valid: true, bytes: BigInt(1610612736) });
      expect(parseQuantity("0.5Ki")).toEqual({ valid: true, bytes: BigInt(512) });
    });

    it("rejects quantities whose exact value is not a whole number of bytes", () => {
      expect(parseQuantity("1.51Gi").valid).toBe(false);
      expect(parseQuantity("1.001Mi").valid).toBe(false);
    });

    it("rejects values beyond the int64 Kubernetes ceiling", () => {
      expect(parseQuantity("9223372036854775807")).toEqual({
        valid: true,
        bytes: BigInt("9223372036854775807"),
      });

      expect(parseQuantity("9223372036854775808")).toEqual({
        valid: false,
        error: expect.stringContaining("int64"),
      });

      expect(parseQuantity("1Ei")).toEqual({ valid: true, bytes: BigInt(1024) ** BigInt(6) });
      expect(parseQuantity("1024Ei")).toEqual({
        valid: false,
        error: expect.stringContaining("int64"),
      });
    });

    it("rejects invalid and unsupported inputs", () => {
      expect(parseQuantity("hello").valid).toBe(false);
      expect(parseQuantity("").valid).toBe(false);
      expect(parseQuantity("-1Gi").valid).toBe(false);
      expect(parseQuantity("1K").valid).toBe(false);
    });

    it("bounds exponent magnitude to a cheap, deterministic range", () => {
      expect(parseQuantity("1e999999999999").valid).toBe(false);
      expect(parseQuantity("1e999999999999")).toEqual({
        valid: false,
        error: expect.stringContaining("exponent"),
      });

      expect(parseQuantity("1e40").valid).toBe(false);
      expect(parseQuantity("1e-40").valid).toBe(false);
      expect(parseQuantity("1E+40").valid).toBe(false);

      expect(parseQuantity("1e20").valid).toBe(false);
      expect(parseQuantity("1e20")).toEqual({
        valid: false,
        error: expect.stringContaining("int64"),
      });
    });

    it("rejects oversized quantity strings", () => {
      expect(parseQuantity("1".repeat(65)).valid).toBe(false);
      expect(parseQuantity(`${"0".repeat(65)}1Gi`)).toEqual({
        valid: false,
        error: expect.stringContaining("too long"),
      });
      expect(parseQuantity(`${"0".repeat(60)}1Gi`)).toEqual({
        valid: true,
        bytes: BigInt("1073741824"),
      });
    });
  });

  describe("validatePvcExpansion", () => {
    it("accepts a strictly larger size", () => {
      const result = validatePvcExpansion(makePvc("1Gi", "standard"), "2Gi", makeStorageClass(true));

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts a strictly larger fractional size", () => {
      const result = validatePvcExpansion(makePvc("1Gi", "standard"), "1.5Gi", makeStorageClass(true));

      expect(result.valid).toBe(true);
    });

    it("rejects an equal size across equivalent suffixes", () => {
      const pvc = makePvc("1073741824", "standard");
      const result = validatePvcExpansion(pvc, "1Gi", makeStorageClass(true));

      expect(result.valid).toBe(false);
    });

    it("rejects a smaller size", () => {
      const result = validatePvcExpansion(makePvc("2Gi"), "1Gi", makeStorageClass(true));

      expect(result.valid).toBe(false);
    });

    it("rejects zero and invalid quantities", () => {
      expect(validatePvcExpansion(makePvc("1Gi"), "0", makeStorageClass(true)).valid).toBe(false);
      expect(validatePvcExpansion(makePvc("1Gi"), "abc", makeStorageClass(true)).valid).toBe(false);
      expect(validatePvcExpansion(makePvc("1Gi"), "8.5Ei", makeStorageClass(true)).valid).toBe(false);
    });

    it("rejects when storage class does not allow expansion", () => {
      const result = validatePvcExpansion(makePvc("1Gi", "standard"), "2Gi", makeStorageClass(false));

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/does not allow volume expansion/);
    });

    it("rejects when storage class is missing", () => {
      const result = validatePvcExpansion(makePvc("1Gi"), "2Gi");

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no storage class/);
    });
  });

  describe("getExpansionSizeComparison", () => {
    it("compares sizes exactly as bigints", () => {
      const comparison = getExpansionSizeComparison(makePvc("1Gi", "standard"), "2Gi");

      expect(comparison.currentBytes).toBe(BigInt(1073741824));
      expect(comparison.requestedBytes).toBe(BigInt(2147483648));
    });
  });

  describe("buildPvcExpansionPatch", () => {
    it("includes mandatory uid and resourceVersion preconditions", () => {
      const patch = buildPvcExpansionPatch(makePvc("1Gi", "standard"), "2Gi");

      expect(patch).toContainEqual({ op: "test", path: "/metadata/uid", value: "pvc-uid" });
      expect(patch).toContainEqual({ op: "test", path: "/metadata/resourceVersion", value: "10" });
      expect(patch).toContainEqual({ op: "replace", path: "/spec/resources/requests/storage", value: "2Gi" });
    });

    it("preserves the operator-entered valid representation verbatim", () => {
      const patch = buildPvcExpansionPatch(makePvc("1Gi", "standard"), "1.5Gi ");

      expect(patch).toContainEqual({ op: "replace", path: "/spec/resources/requests/storage", value: "1.5Gi" });
    });

    it("fails safely when uid is missing", () => {
      const pvc = makePvc("1Gi", "standard") as never as PersistentVolumeClaim;

      (pvc.metadata as { uid?: string }).uid = undefined;

      expect(() => buildPvcExpansionPatch(pvc, "2Gi")).toThrow(/metadata is incomplete/);
    });

    it("fails safely when resourceVersion is missing", () => {
      const pvc = makePvc("1Gi", "standard") as never as PersistentVolumeClaim;

      (pvc.metadata as { resourceVersion?: string }).resourceVersion = "";

      expect(() => buildPvcExpansionPatch(pvc, "2Gi")).toThrow(/metadata is incomplete/);
    });

    it("refuses to build a patch for an invalid or non-positive quantity", () => {
      expect(() => buildPvcExpansionPatch(makePvc("1Gi", "standard"), "not-a-size")).toThrow(/invalid quantity/i);
      expect(() => buildPvcExpansionPatch(makePvc("1Gi", "standard"), "0")).toThrow(/non-positive quantity/i);
    });
  });

  describe("classifyPvcExpansionPhase", () => {
    it("reports capacityUpdated when capacity matches or exceeds the request", () => {
      const pvc = makePvc("2Gi", "standard");

      pvc.status = { phase: "Bound", capacity: { storage: "2Gi" }};

      expect(classifyPvcExpansionPhase(pvc, "2Gi")).toBe("capacityUpdated");

      pvc.status = { phase: "Bound", capacity: { storage: "3Gi" }};

      expect(classifyPvcExpansionPhase(pvc, "2Gi")).toBe("capacityUpdated");
    });

    it("reports pending while the controller is resizing", () => {
      const pvc = makePvc("2Gi", "standard");

      pvc.status = {
        phase: "Bound",
        capacity: { storage: "1Gi" },
        conditions: [{ type: "Resizing", status: "True" }],
      };

      expect(classifyPvcExpansionPhase(pvc, "2Gi")).toBe("pending");
    });

    it("reports pending and not success while a filesystem resize is pending", () => {
      const pvc = makePvc("2Gi", "standard");

      pvc.status = {
        phase: "Bound",
        capacity: { storage: "1Gi" },
        conditions: [{ type: "FileSystemResizePending", status: "True" }],
      };

      expect(classifyPvcExpansionPhase(pvc, "2Gi")).toBe("pending");
    });

    it("reports error when the controller resize failed or the spec no longer matches", () => {
      const failed = makePvc("2Gi", "standard");

      failed.status = {
        phase: "Bound",
        capacity: { storage: "1Gi" },
        conditions: [{ type: "ControllerResizeFailed", status: "True", message: "driver error" }],
      };

      expect(classifyPvcExpansionPhase(failed, "2Gi")).toBe("error");
      expect(classifyPvcExpansionPhase(makePvc("3Gi", "standard"), "2Gi")).toBe("error");
    });
  });
});
