/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { loadConfigFromString, splitConfig } from "../kube-helpers";

/**
 * Verify that an imported file is a kubeconfig with at least one usable
 * context. Never include credential data in return values or errors.
 */
export function isValidKubeconfigForFileImport(content: string): boolean {
  try {
    const { config, error } = loadConfigFromString(content);

    if (error) {
      return false;
    }

    const entries = splitConfig(config);

    return entries.length > 0 && entries.every(({ validationResult }) => !validationResult.error);
  } catch {
    return false;
  }
}
