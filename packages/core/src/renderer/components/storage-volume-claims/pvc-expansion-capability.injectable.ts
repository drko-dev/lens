/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import storageClassStoreInjectable from "../storage-classes/store.injectable";
import storageClassApiInjectable from "../../../common/k8s-api/endpoints/storage-class.api.injectable";

export type PvcExpansionCapability =
  | "allowed"
  | "denied"
  | "unknown"
  | "forbidden"
  | "unreachable";

export type PvcExpansionCapabilityResolver = (
  clusterId: string,
  storageClassName: string | undefined,
) => Promise<PvcExpansionCapability>;

const pvcExpansionCapabilityInjectable = getInjectable({
  id: "pvc-expansion-capability",

  instantiate: (di): PvcExpansionCapabilityResolver => {
    const storageClassStore = di.inject(storageClassStoreInjectable);
    const storageClassApi = di.inject(storageClassApiInjectable);
    const cache = new Map<string, Promise<PvcExpansionCapability>>();

    return (clusterId, storageClassName) => {
      if (!storageClassName) {
        return Promise.resolve("unknown");
      }

      const cacheKey = `${clusterId}/${storageClassName}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const resolution = (async (): Promise<PvcExpansionCapability> => {
        try {
          const storageClass = storageClassStore.getByName(storageClassName)
            ?? await storageClassApi.get({ name: storageClassName });

          if (!storageClass) {
            return "unknown";
          }

          return storageClass.allowVolumeExpansion === true ? "allowed" : "denied";
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;

          if (statusCode === 403) {
            return "forbidden";
          }

          if (statusCode !== undefined) {
            return "unknown";
          }

          return "unreachable";
        }
      })();

      cache.set(cacheKey, resolution);

      return resolution;
    };
  },
});

export default pvcExpansionCapabilityInjectable;
