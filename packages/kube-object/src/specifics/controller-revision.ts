/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { NamespaceScopedMetadata } from "../api-types";
import { KubeObject } from "../kube-object";
import type { PodTemplateSpec } from "../types/pod-template-spec";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPodTemplate = (value: unknown): value is PodTemplateSpec =>
  isRecord(value) &&
  isRecord(value.spec) &&
  (Array.isArray(value.spec.containers) || Array.isArray(value.spec.initContainers));

export class ControllerRevision extends KubeObject<NamespaceScopedMetadata, void, void> {
  static readonly kind = "ControllerRevision";

  static readonly namespaced = true;

  static readonly apiBase = "/apis/apps/v1/controllerrevisions";

  declare data?: unknown;

  declare revision?: number;

  getRevision(): number {
    return this.revision ?? 0;
  }

  getTemplate(): PodTemplateSpec | undefined {
    const data = this.data;

    if (!isRecord(data)) {
      return undefined;
    }

    // ControllerRevision.data is controller-owned RawExtension data, not one stable schema.
    const patchSpec = isRecord(data.spec) ? data.spec : undefined;
    const candidates = [patchSpec?.template, data.template, data];

    return candidates.find(isPodTemplate);
  }

  getImages(): string[] {
    const template = this.getTemplate();
    const containers = [...(template?.spec?.containers ?? []), ...(template?.spec?.initContainers ?? [])];

    return containers
      .map((container) => container.image)
      .filter((image): image is string => typeof image === "string" && image !== "");
  }

  getChangeCause(): string | undefined {
    const value = this.metadata?.annotations?.["kubernetes.io/change-cause"];

    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  }
}
