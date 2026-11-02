/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Opt-in flag for the H7 global docking host. Independent from the Kubetail
 * floating-panels flag and from the detached-tools flag. Default OFF keeps the
 * classic RC3 cluster layout untouched.
 */
export const globalDockingStorageKey = "openlens:global-docking";

export function isGlobalDockingEnabled(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(globalDockingStorageKey) === "true";
  } catch {
    return false;
  }
}
