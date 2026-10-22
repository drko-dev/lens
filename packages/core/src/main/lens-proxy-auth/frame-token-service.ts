/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import type { ClusterFrameInfo } from "../../common/cluster-frames.injectable";
import { proxyAuthChannels } from "../../common/lens-proxy-auth/proxy-auth";
import type { ProxyTokenScope } from "../lens-proxy/proxy-auth-tokens";
import { APP_SCOPE } from "../lens-proxy/proxy-auth-tokens";

export interface FrameTokenTarget {
  isDestroyed(): boolean;
  sendToFrame(frameId: [number, number], channel: string, ...args: unknown[]): void;
}

export interface FrameTokenServiceDependencies {
  readonly getClusterFrames: () => ReadonlyMap<string, ClusterFrameInfo>;
  readonly getPort: () => number;
  readonly getToken: (scope: ProxyTokenScope) => string;
}

interface Holder {
  readonly processId: number;
  readonly frameId: number;
  readonly target: FrameTokenTarget;
}

const DENIED = "Unauthorized frame token request.";

function originOf(url: unknown): string | undefined {
  try {
    return typeof url === "string" ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * R4-08: hands each renderer frame the proxy capability token of its own scope only.
 * The scope is derived from the sender (registered frame id AND origin), never from a payload.
 */
export class FrameTokenService {
  /** Frames that were authorized for a scope: rotation is pushed only to these. */
  private readonly holders = new Map<ProxyTokenScope, Holder>();

  constructor(private readonly deps: FrameTokenServiceDependencies) {}

  private scopeOfSender(event: IpcMainInvokeEvent): ProxyTokenScope {
    const { processId, frameId, senderFrame } = (event ?? {}) as Partial<IpcMainInvokeEvent>;

    if (typeof processId !== "number" || typeof frameId !== "number" || !senderFrame) {
      throw new Error(DENIED);
    }

    const origin = originOf(senderFrame.url)?.toLowerCase();
    const port = this.deps.getPort();

    if (origin === `https://lens.app:${port}`) {
      if (senderFrame.parent !== null) {
        throw new Error(DENIED);
      }

      return APP_SCOPE;
    }

    for (const [clusterId, info] of this.deps.getClusterFrames()) {
      if (info.frameId === frameId && info.processId === processId && origin === `https://${clusterId}.lens.app:${port}`.toLowerCase()) {
        return clusterId;
      }
    }

    throw new Error(DENIED);
  }

  handleGetFrameToken(event: IpcMainInvokeEvent, ...args: unknown[]): string {
    if (args.length > 0) {
      throw new Error(DENIED);
    }

    const scope = this.scopeOfSender(event);

    this.holders.set(scope, { processId: event.processId, frameId: event.frameId, target: event.sender as unknown as FrameTokenTarget });

    return this.deps.getToken(scope);
  }

  /** Pushes a rotated token to the single frame that owns the scope. */
  handleRotated(scope: ProxyTokenScope, token: string): void {
    const holder = this.holders.get(scope);

    if (!holder) {
      return;
    }

    try {
      if (!holder.target.isDestroyed()) {
        holder.target.sendToFrame([holder.processId, holder.frameId], proxyAuthChannels.frameTokenRotated, { token });
      }
    } catch {
      this.holders.delete(scope);
    }
  }
}
