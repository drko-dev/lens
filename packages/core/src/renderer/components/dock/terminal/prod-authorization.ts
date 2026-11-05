/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, observable } from "mobx";

const keyOf = (clusterId: string, tabId: string) => `${clusterId}:${tabId}`;

/**
 * H7.6.3D: PROD terminal authorization, owned outside React.
 * An authorization is bound to one (clusterId, tabId) pair: a remount keeps it,
 * another tab or another cluster never inherits it, closing the tab revokes it.
 */
export class TerminalProdAuthorization {
  private readonly granted = observable.set<string>();

  isAuthorized(clusterId: string, tabId: string) {
    return this.granted.has(keyOf(clusterId, tabId));
  }

  @action
  authorize(clusterId: string, tabId: string) {
    this.granted.add(keyOf(clusterId, tabId));
  }

  @action
  revoke(tabId: string) {
    for (const key of [...this.granted]) {
      if (key.endsWith(`:${tabId}`)) {
        this.granted.delete(key);
      }
    }
  }

  /** Invalidate every authorization that does not belong to `clusterId`. */
  @action
  keepOnlyCluster(clusterId: string) {
    for (const key of [...this.granted]) {
      if (!key.startsWith(`${clusterId}:`)) {
        this.granted.delete(key);
      }
    }
  }

  @action
  revokeCluster(clusterId: string) {
    for (const key of [...this.granted]) {
      if (key.startsWith(`${clusterId}:`)) {
        this.granted.delete(key);
      }
    }
  }

  @action
  clear() {
    this.granted.clear();
  }
}
