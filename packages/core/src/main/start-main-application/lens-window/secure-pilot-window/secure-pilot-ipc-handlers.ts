/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { app, ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createImmutableClusterContext } from "../../../../common/workspace/cluster-isolation";
import type { ClusterContext, WindowContext, WorkspaceTab } from "../../../../common/workspace/workspace-types";

export interface SyntheticClusterData extends ClusterContext {
  readonly id: string;
  readonly accentColor: string;
  readonly pods: readonly string[];
}

function syntheticCluster(
  context: ClusterContext,
  accentColor: string,
  pods: readonly string[],
): SyntheticClusterData {
  return Object.freeze({
    ...createImmutableClusterContext(context),
    id: context.clusterId,
    accentColor,
    pods: Object.freeze([...pods]),
  });
}

export const SYNTHETIC_CLUSTERS: Readonly<Record<string, SyntheticClusterData>> = Object.freeze({
  "cluster-dev-01": syntheticCluster({
    clusterId: "cluster-dev-01",
    name: "minikube-dev",
    environment: "development",
    isProduction: false,
  }, "#3d90ce", ["api", "frontend", "worker"]),
  "cluster-prod-99": syntheticCluster({
    clusterId: "cluster-prod-99",
    name: "aws-k8s-prod",
    environment: "production",
    isProduction: true,
  }, "#e65100", ["api", "payments", "auth"]),
});

const PILOT_TABS: Readonly<Record<string, WorkspaceTab>> = Object.freeze({
  "pilot-tab-dev": Object.freeze({
    id: "pilot-tab-dev",
    workspaceId: "r4-secure-pilot",
    clusterId: "cluster-dev-01",
    title: "DEV: api",
    kind: "resource",
    resourceKind: "Pod",
    namespace: "default",
    resourceName: "api",
    createdAt: 1,
  }),
  "pilot-tab-prod": Object.freeze({
    id: "pilot-tab-prod",
    workspaceId: "r4-secure-pilot",
    clusterId: "cluster-prod-99",
    title: "PROD: api",
    kind: "resource",
    resourceKind: "Pod",
    namespace: "default",
    resourceName: "api",
    createdAt: 1,
  }),
});

const ALLOWED_CHANNELS = Object.freeze([
  "secure-pilot:get-info",
  "secure-pilot:list-clusters",
  "secure-pilot:query-resource",
]);

function isRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isExpectedFile(url: string, expectedPath: string): boolean {
  try {
    return path.resolve(fileURLToPath(new URL(url))) === path.resolve(expectedPath);
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent, browserWindow: BrowserWindow, htmlPath: string): void {
  const frame = event.senderFrame;

  if (browserWindow.isDestroyed() || event.sender !== browserWindow.webContents || !frame ||
    frame !== browserWindow.webContents.mainFrame || !isExpectedFile(frame.url, htmlPath)) {
    throw new Error("Unauthorized IPC sender.");
  }
}

function validIdentifier(value: unknown, pattern: RegExp, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && pattern.test(value);
}

export function registerSecurePilotIpcHandlers(browserWindow: BrowserWindow, htmlPath: string): () => void {
  const windowContext: WindowContext = Object.freeze({
    windowId: String(browserWindow.webContents.id),
    windowType: "pilot",
    workspaceId: "r4-secure-pilot",
    allowedClusterIds: Object.freeze(Object.keys(SYNTHETIC_CLUSTERS)),
    allowedIpcChannels: ALLOWED_CHANNELS,
    isIsolated: true,
  });

  ipcMain.handle("secure-pilot:get-info", async event => {
    assertTrustedSender(event, browserWindow, htmlPath);

    return {
      windowId: windowContext.windowId,
      workspaceId: windowContext.workspaceId,
      version: "R4-01-PILOT",
      isPackaged: app.isPackaged,
      isIsolated: windowContext.isIsolated,
      nodeIntegration: false,
      sandbox: true,
    };
  });

  ipcMain.handle("secure-pilot:list-clusters", async event => {
    assertTrustedSender(event, browserWindow, htmlPath);

    return windowContext.allowedClusterIds.map(clusterId => {
      const { id, name, environment, isProduction, accentColor } = SYNTHETIC_CLUSTERS[clusterId];

      return { id, name, environment, isProduction, accentColor };
    });
  });

  ipcMain.handle("secure-pilot:query-resource", async (event, params: unknown) => {
    assertTrustedSender(event, browserWindow, htmlPath);

    if (!isRecord(params) || Object.keys(params).some(key => !["tabId", "namespace", "kind", "name"].includes(key))) {
      throw new Error("Invalid synthetic resource query.");
    }

    const { tabId, namespace, kind, name } = params;
    const tab = typeof tabId === "string" ? PILOT_TABS[tabId] : undefined;

    if (!tab || !validIdentifier(namespace, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/, 253) ||
      !validIdentifier(kind, /^[A-Za-z][A-Za-z0-9.-]*$/, 100) ||
      !validIdentifier(name, /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/, 253)) {
      throw new Error("Unauthorized synthetic resource query.");
    }

    if (!windowContext.allowedClusterIds.includes(tab.clusterId) ||
      tab.kind !== "resource" || namespace !== tab.namespace || kind !== tab.resourceKind || name !== tab.resourceName) {
      throw new Error("Synthetic resource query does not match its immutable tab context.");
    }

    const cluster = SYNTHETIC_CLUSTERS[tab.clusterId];

    if (!cluster || !cluster.pods.includes(name)) {
      throw new Error("Synthetic resource fixture was not found.");
    }

    const scopedKey = `fixture://${encodeURIComponent(cluster.id)}/${encodeURIComponent(namespace)}/${encodeURIComponent(kind.toLowerCase())}/${encodeURIComponent(name)}`;

    return {
      source: "synthetic-fixture",
      resourceKey: scopedKey,
      cluster: {
        id: cluster.id,
        name: cluster.name,
        environment: cluster.environment,
        isProduction: cluster.isProduction,
      },
      resource: {
        kind,
        metadata: {
          name,
          namespace,
          clusterId: cluster.id,
          creationTimestamp: "2000-01-01T00:00:00Z",
          labels: { app: name, env: cluster.environment },
        },
        status: {
          phase: "SyntheticFixture",
          ready: true,
          podIP: cluster.isProduction ? "192.0.2.99" : "192.0.2.10",
        },
      },
    };
  });

  return () => {
    for (const channel of ALLOWED_CHANNELS) ipcMain.removeHandler(channel);
  };
}
