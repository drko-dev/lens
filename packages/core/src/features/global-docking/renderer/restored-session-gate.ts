/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, makeObservable, observable } from "mobx";

/**
 * H7.7: leaves restored from a saved layout must not start sessions by themselves.
 * Restoring marks the session-owning leaves (terminal, pod logs, editor, Kubetail) as inert;
 * their bound component shows a placeholder until the user explicitly resumes them.
 */
export class RestoredSessionGate {
  private readonly inert = observable.set<string>();

  constructor() {
    makeObservable(this);
  }

  @action
  markInert(leafIds: Iterable<string>) {
    for (const id of leafIds) {
      this.inert.add(id);
    }
  }

  isInert(leafId: string): boolean {
    return this.inert.has(leafId);
  }

  @action
  release(leafId: string) {
    this.inert.delete(leafId);
  }
}
