/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { IpcMainInvokeEvent } from "electron";
import type { ClusterFrameInfo } from "../../../common/cluster-frames.injectable";
import { getClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import { assertToolActionClusterContext } from "../../../common/workspace/tool-context";
import type { DetachTerminalResult, TerminalRedockedNotice } from "../../../common/terminal/detached-terminal-channels";
import type { DetachedToolDescriptor, DetachedWindowRecord, DetachedWindowRegistry } from "../detached-window-registry";
import { DetachedWindowError, parseDetachedToolDescriptor, sessionKeyOf } from "../detached-window-registry";
import type { DetachedTerminalBridge } from "./detached-terminal-bridge";

export interface DetachedTerminalCluster {
  readonly id: string;
  readonly name: string;
  readonly preferences?: Parameters<typeof getClusterEnvironmentConfig>[0];
}

export interface ProductionTerminalDetachRequest {
  clusterId: string;
  clusterName: string;
  environmentLabel: string;
  tabId: string;
}

export interface DetachedTerminalWindowHooks {
  readonly onClosed: (record: DetachedWindowRecord, reason: "redock" | "crash") => void;
}

export interface DetachedTerminalManagerDependencies {
  readonly isEnabled: () => boolean;
  readonly registry: DetachedWindowRegistry;
  readonly bridge: DetachedTerminalBridge;
  readonly getCluster: (clusterId: string) => DetachedTerminalCluster | undefined;
  readonly getClusterFrames: () => ReadonlyMap<string, ClusterFrameInfo>;
  /** Resolves `true` only on an explicit user acceptance. */
  readonly confirmProduction: (request: ProductionTerminalDetachRequest) => Promise<boolean>;
  readonly openWindow: (descriptor: DetachedToolDescriptor, hooks: DetachedTerminalWindowHooks) => { windowId: number; reused: boolean };
  readonly closeWindow: (windowId: number) => void;
  readonly getMainFrame: (windowId: number) => unknown;
  readonly isExpectedDocument: (url: string) => boolean;
  readonly notifyClusterFrame: (clusterId: string, notice: TerminalRedockedNotice) => void;
  readonly logger: { info(message: string): void; warn(message: string): void; error(message: string, error?: unknown): void };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDENTITY_KEYS = ["clusterId", "workspaceId", "tabId"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function parseIdentity(input: unknown): { clusterId: string; workspaceId: string; tabId: string } {
  if (!isPlainRecord(input) || !Object.keys(input).every(key => IDENTITY_KEYS.includes(key))) {
    throw new DetachedWindowError("Invalid terminal request.");
  }

  const { clusterId, workspaceId, tabId } = input;

  for (const value of [clusterId, workspaceId, tabId]) {
    if (typeof value !== "string" || !ID.test(value)) {
      throw new DetachedWindowError("Invalid terminal identity.");
    }
  }

  return { clusterId, workspaceId, tabId } as { clusterId: string; workspaceId: string; tabId: string };
}

/**
 * R4-06B: Main-side policy for detaching a terminal. Identity, environment and PROD status
 * are always resolved here (from the requesting cluster frame and the cluster entity),
 * never taken from the renderer or from the detached page.
 */
export class DetachedTerminalManager {
  private readonly inProgress = new Set<string>();

  constructor(private readonly deps: DetachedTerminalManagerDependencies) {}

  private clusterIdOfSender(event: IpcMainInvokeEvent): string {
    const { frameId, processId } = (event ?? {}) as Partial<IpcMainInvokeEvent>;

    if (typeof frameId !== "number" || typeof processId !== "number") {
      throw new DetachedWindowError("Unauthorized detach sender.");
    }

    for (const [clusterId, info] of this.deps.getClusterFrames()) {
      if (info.frameId === frameId && info.processId === processId) {
        return clusterId;
      }
    }

    throw new DetachedWindowError("Detach request did not come from a registered cluster frame.");
  }

  /** cluster frame -> Main */
  handleDetach = async (event: IpcMainInvokeEvent, input: unknown): Promise<DetachTerminalResult> => {
    if (!this.deps.isEnabled()) {
      throw new DetachedWindowError("Detached tool windows are disabled.");
    }

    const senderClusterId = this.clusterIdOfSender(event);
    const request = parseIdentity(input);

    assertToolActionClusterContext(senderClusterId, request.clusterId, "detach-terminal-window");

    const cluster = this.deps.getCluster(request.clusterId);

    if (!cluster) {
      throw new DetachedWindowError("Unknown cluster.");
    }

    const environment = getClusterEnvironmentConfig(cluster.preferences);
    const isProduction = environment.id === "production";
    const descriptor = parseDetachedToolDescriptor({
      workspaceId: request.workspaceId,
      tabId: request.tabId,
      clusterId: cluster.id,
      toolKind: "terminal",
      environment: environment.id,
      isProduction,
      title: `${cluster.name} · terminal`.slice(0, 200),
    });
    const sessionKey = sessionKeyOf(descriptor);
    const existing = this.deps.registry.findOwner(descriptor);

    if (existing) {
      // One owner per session: just focus it, nothing is transferred again.
      return { accepted: true, ...this.deps.openWindow(descriptor, { onClosed: this.closed }) };
    }

    if (this.inProgress.has(sessionKey)) {
      throw new DetachedWindowError("A detach for this terminal is already in progress.");
    }

    this.inProgress.add(sessionKey);

    try {
      if (!this.deps.bridge.hasPty(cluster.id, request.tabId)) {
        throw new DetachedWindowError("The terminal session is not running.");
      }

      if (isProduction) {
        const confirmed = await this.deps.confirmProduction({
          clusterId: cluster.id,
          clusterName: cluster.name,
          environmentLabel: environment.label,
          tabId: request.tabId,
        });

        if (!confirmed) {
          return { accepted: false, reason: "declined" };
        }

        // Re-validate everything that could have changed while the dialog was open.
        if (!this.deps.isEnabled() || !this.deps.bridge.hasPty(cluster.id, request.tabId) || this.deps.registry.findOwner(descriptor)) {
          throw new DetachedWindowError("The terminal changed while waiting for confirmation.");
        }
      }

      const opened = this.deps.openWindow(descriptor, { onClosed: this.closed });
      const record = this.deps.registry.get(opened.windowId);

      try {
        if (!record) {
          throw new DetachedWindowError("Detached window was not registered.");
        }

        this.deps.bridge.attach(record);
      } catch (error) {
        // Nothing was transferred: the dock keeps its websocket.
        this.deps.closeWindow(opened.windowId);
        throw error;
      }

      return { accepted: true, ...opened };
    } finally {
      this.inProgress.delete(sessionKey);
    }
  };

  /** cluster frame -> Main: close the owning window; the close path notifies the dock. */
  handleFrameRedock = (event: IpcMainInvokeEvent, input: unknown): { accepted: boolean } => {
    const senderClusterId = this.clusterIdOfSender(event);
    const request = parseIdentity(input);

    assertToolActionClusterContext(senderClusterId, request.clusterId, "redock-terminal-window");

    const owner = this.deps.registry.findOwner({ ...request, toolKind: "terminal" });

    if (!owner) {
      return { accepted: false };
    }

    this.deps.closeWindow(owner.windowId);

    return { accepted: true };
  };

  /** Fail-closed: top frame of a registered TERMINAL window showing the packaged document. */
  private assertTrustedWindow(event: IpcMainInvokeEvent): DetachedWindowRecord {
    const windowId = event?.sender?.id;
    const record = typeof windowId === "number" ? this.deps.registry.get(windowId) : undefined;

    if (!record || record.descriptor.toolKind !== "terminal") {
      throw new DetachedWindowError("Unauthorized IPC sender.");
    }

    const frame = event.senderFrame;
    const mainFrame = this.deps.getMainFrame(record.windowId);

    if (!frame || !mainFrame || frame !== mainFrame || !this.deps.isExpectedDocument(frame.url)) {
      throw new DetachedWindowError("Unauthorized IPC sender frame.");
    }

    return record;
  }

  handleWindowGetContext = (event: IpcMainInvokeEvent) => {
    const record = this.assertTrustedWindow(event);

    return { windowId: record.windowId, descriptor: record.descriptor };
  };

  handleWindowStart = (event: IpcMainInvokeEvent, payload?: unknown) => {
    const record = this.assertTrustedWindow(event);

    if (payload !== undefined) throw new DetachedWindowError("Start takes no payload.");
    this.deps.bridge.start(record.windowId);

    return { accepted: true };
  };

  handleWindowInput = (event: IpcMainInvokeEvent, data: unknown) => {
    const record = this.assertTrustedWindow(event);

    this.deps.bridge.input(record.windowId, data);

    return { accepted: true };
  };

  handleWindowResize = (event: IpcMainInvokeEvent, size: unknown) => {
    const record = this.assertTrustedWindow(event);

    this.deps.bridge.resize(record.windowId, size);

    return { accepted: true };
  };

  handleWindowRedock = (event: IpcMainInvokeEvent, payload?: unknown) => {
    const record = this.assertTrustedWindow(event);

    if (payload !== undefined) throw new DetachedWindowError("Redock takes no payload.");
    this.deps.closeWindow(record.windowId);

    return { accepted: true };
  };

  /** Window gone (button, OS close, crash): stop listening, keep the shell, tell the originating frame. */
  closed = (record: DetachedWindowRecord, reason: "redock" | "crash" = "redock"): void => {
    this.deps.bridge.release(record.windowId);
    this.notify(record, reason);
  };

  /** Called by the bridge when the shell ended while detached. */
  ptyExited = (record: DetachedWindowRecord): void => this.notify(record, "exited");

  private notify(record: DetachedWindowRecord, reason: TerminalRedockedNotice["reason"]): void {
    const { clusterId, workspaceId, tabId } = record.descriptor;

    try {
      this.deps.notifyClusterFrame(clusterId, { clusterId, workspaceId, tabId, reason });
    } catch (error) {
      this.deps.logger.warn(`[DETACHED-TERMINAL]: could not notify cluster frame ${clusterId}: ${error}`);
    }
  }
}
