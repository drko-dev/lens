/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { randomBytes, timingSafeEqual } from "crypto";

export const APP_SCOPE = "\u0000app";

export type ProxyTokenScope = string | typeof APP_SCOPE;

/**
 * In-memory capability tokens for the lens proxy: one per cluster plus one app-scoped
 * token. 32 random bytes each, base64url. Never persisted, never logged.
 */
export class ProxyAuthTokens {
  private readonly tokens = new Map<ProxyTokenScope, Buffer>();
  private readonly rotationListeners = new Set<(scope: ProxyTokenScope, token: string) => void>();

  constructor(private readonly random: (size: number) => Buffer = randomBytes) {}

  /** Returns the current token for the scope, issuing one if needed. */
  get(scope: ProxyTokenScope): string {
    let token = this.tokens.get(scope);

    if (!token) {
      token = this.random(32);
      this.tokens.set(scope, token);
    }

    return token.toString("base64url");
  }

  /**
   * True only when `presented` is the current token of exactly `scope`.
   * Constant-time for equal lengths; any other input is rejected.
   */
  verify(scope: ProxyTokenScope, presented: unknown): boolean {
    const expected = this.tokens.get(scope);

    if (!expected || typeof presented !== "string" || presented.length === 0 || presented.length > 128) {
      return false;
    }

    const candidate = Buffer.from(presented, "base64url");

    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  /** Invalidates the scope's token immediately and issues a new one for current holders. */
  rotate(scope: ProxyTokenScope): void {
    if (!this.tokens.delete(scope)) {
      return;
    }

    const token = this.get(scope);

    for (const listener of this.rotationListeners) {
      listener(scope, token);
    }
  }

  /** Invalidates the scope's token without issuing a new one (cluster removed). */
  revoke(scope: ProxyTokenScope): void {
    this.tokens.delete(scope);
  }

  revokeAll(): void {
    this.tokens.clear();
  }

  onRotated(listener: (scope: ProxyTokenScope, token: string) => void): () => void {
    this.rotationListeners.add(listener);

    return () => this.rotationListeners.delete(listener);
  }
}
