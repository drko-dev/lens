/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  SessionSnapshotV1,
  NavigationHistoryEntry,
  WorkspaceNavigationHistory,
  WorkspaceContext,
  WorkspaceLayout,
  WorkspaceTab,
  SerializedSplitLayout,
} from "./workspace-types";

export const SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2 MB limit
export const MAX_WORKSPACES = 30;
export const MAX_TABS_PER_WORKSPACE = 100;
export const MAX_HISTORY_ENTRIES = 20;

const FORBIDDEN_PERSISTENCE_PATTERNS = [
  "password",
  "secret",
  "token",
  "kubeconfig",
  "buffer",
  "pty",
  "draft",
  "stringdata",
  "privatekey",
  "credential",
  "execauth",
  "bearer",
  "apikey",
  "sessiontoken",
  "clientcertificate",
  "clientkey",
];

function hasControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0);

    return code <= 0x1f || code === 0x7f;
  });
}

/**
 * Validates and sanitizes a route path for cluster view navigation.
 * Strictly prevents path traversal, schemes, and sensitive query tokens.
 */
export function sanitizeSafePath(path: unknown): string | undefined {
  if (typeof path !== "string" || path.length > 200 || !path.startsWith("/") || path.includes("#")) return undefined;

  const [rawPath, rawQuery, ...extra] = path.split("?");

  if (
    extra.length > 0 ||
    !rawPath ||
    rawPath.startsWith("//") ||
    /%2f|%5c/i.test(rawPath) ||
    rawPath.includes("\\") ||
    hasControlCharacter(rawPath)
  ) {
    return undefined;
  }

  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }

  if (
    decodedPath.includes("%") ||
    decodedPath.includes("//") ||
    decodedPath.includes("\\") ||
    decodedPath.split("/").some(segment => segment === "." || segment === "..") ||
    !/^\/[\p{L}\p{N}._~/-]*$/u.test(decodedPath)
  ) {
    return undefined;
  }

  if (rawQuery === undefined) return decodedPath;

  if (rawQuery.includes("&") || rawQuery.includes(";")) return undefined;

  const query = new URLSearchParams(rawQuery);
  const entries = [...query.entries()];

  if (
    entries.length !== 1 ||
    entries[0][0] !== "namespace" ||
    entries[0][1].length > 100 ||
    !/^[\p{L}\p{N}_.-]+$/u.test(entries[0][1])
  ) {
    return undefined;
  }

  return `${decodedPath}?namespace=${encodeURIComponent(entries[0][1])}`;
}

/**
 * Validates that an object or property hierarchy contains zero forbidden persistence fields.
 */
export function assertNoSensitiveFields(obj: any, path = "snapshot", seen: WeakSet<object> = new WeakSet()): void {
  if (obj === null || obj === undefined || typeof obj !== "object") return;
  if (seen.has(obj)) throw new Error("Security Violation: cyclic data cannot be serialized into workspace snapshots.");

  seen.add(obj);

  try {
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");

      if (normalizedKey === "data" || FORBIDDEN_PERSISTENCE_PATTERNS.some(forbidden => normalizedKey.includes(forbidden))) {
        throw new Error(
          `Security Violation: forbidden field "${key}" detected at ${path}.${key}. Sensitive credentials, buffers, and drafts must never be serialized into snapshots.`,
        );
      }

      assertNoSensitiveFields(value, `${path}.${key}`, seen);
    }
  } finally {
    seen.delete(obj);
  }
}

function lockTabIdentity<T extends WorkspaceTab>(tab: T): T {
  for (const key of ["id", "workspaceId", "clusterId"] as const) {
    Object.defineProperty(tab, key, { writable: false, configurable: false });
  }

  return tab;
}

function requiredId(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    hasControlCharacter(value) ||
    value.length > 100 ||
    ["__proto__", "prototype", "constructor"].includes(value)
  ) {
    throw new Error(`Workspace snapshot requires a valid ${field}.`);
  }

  return value;
}

/**
 * Sanitizes and extracts only the allowlisted fields of a WorkspaceTab.
 */
export function sanitizeWorkspaceTab(raw: any): WorkspaceTab {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid workspace tab: expected an object");
  }

  const { id, workspaceId, clusterId, title, kind, pinned, createdAt } = raw;

  requiredId(id, "tab id");
  requiredId(workspaceId, "workspaceId");
  requiredId(clusterId, "clusterId");
  if (!title || typeof title !== "string") throw new Error("Workspace tab requires a string title");

  const base = {
    id,
    workspaceId,
    clusterId,
    title: String(title).slice(0, 200),
    pinned: Boolean(pinned),
    createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
  };

  switch (kind) {
    case "resource":
      return lockTabIdentity({
        ...base,
        kind: "resource",
        resourceKind: String(raw.resourceKind || "").slice(0, 100),
        apiGroup: raw.apiGroup ? String(raw.apiGroup).slice(0, 100) : undefined,
        namespace: raw.namespace ? String(raw.namespace).slice(0, 100) : undefined,
        resourceName: raw.resourceName ? String(raw.resourceName).slice(0, 200) : undefined,
        resourceUid: raw.resourceUid ? String(raw.resourceUid).slice(0, 100) : undefined,
      });

    case "editor":
      return lockTabIdentity({
        ...base,
        kind: "editor",
        resourceKind: String(raw.resourceKind || "").slice(0, 100),
        namespace: raw.namespace ? String(raw.namespace).slice(0, 100) : undefined,
        resourceName: raw.resourceName ? String(raw.resourceName).slice(0, 200) : undefined,
        mode: ["view", "edit", "diff"].includes(raw.mode) ? raw.mode : "view",
      });

    case "logs":
      return lockTabIdentity({
        ...base,
        kind: "logs",
        podName: String(raw.podName || "").slice(0, 200),
        namespace: String(raw.namespace || "").slice(0, 100),
        container: raw.container ? String(raw.container).slice(0, 100) : undefined,
        sinceTime: raw.sinceTime ? String(raw.sinceTime).slice(0, 50) : undefined,
      });

    case "terminal":
      return lockTabIdentity({
        ...base,
        kind: "terminal",
        podName: raw.podName ? String(raw.podName).slice(0, 200) : undefined,
        namespace: raw.namespace ? String(raw.namespace).slice(0, 100) : undefined,
        container: raw.container ? String(raw.container).slice(0, 100) : undefined,
      });

    case "port-forward":
      return lockTabIdentity({
        ...base,
        kind: "port-forward",
        resourceKind: ["pod", "service"].includes(raw.resourceKind) ? raw.resourceKind : undefined,
        resourceName: raw.resourceName ? String(raw.resourceName).slice(0, 200) : undefined,
        namespace: raw.namespace ? String(raw.namespace).slice(0, 100) : undefined,
        port: typeof raw.port === "number" && raw.port > 0 && raw.port <= 65535 ? raw.port : undefined,
      });

    case "inspector":
      return lockTabIdentity({
        ...base,
        kind: "inspector",
        subjectKind: String(raw.subjectKind || "").slice(0, 100),
        subjectName: String(raw.subjectName || "").slice(0, 200),
        namespace: raw.namespace ? String(raw.namespace).slice(0, 100) : undefined,
      });

    case "cluster":
      return lockTabIdentity({
        ...base,
        kind: "cluster",
        environment: ["development", "staging", "production", "testing", "local", "custom"].includes(raw.environment)
          ? raw.environment
          : undefined,
        isProduction: Boolean(raw.isProduction),
        accentColor: typeof raw.accentColor === "string" ? raw.accentColor.slice(0, 50) : undefined,
        customEnvironmentName: typeof raw.customEnvironmentName === "string" ? raw.customEnvironmentName.slice(0, 100) : undefined,
        path: sanitizeSafePath(raw.path),
      });

    default:
      throw new Error(`Unsupported workspace tab kind: "${kind}"`);
  }
}

/**
 * Sanitizes and validates workspace navigation history entries.
 */
export function sanitizeWorkspaceNavigationHistory(
  raw: any,
  workspace: WorkspaceContext,
  layout?: WorkspaceLayout,
): WorkspaceNavigationHistory {
  if (!raw || typeof raw !== "object") {
    return {
      workspaceId: workspace.id,
      entries: [],
      currentIndex: -1,
    };
  }

  assertNoSensitiveFields(raw);

  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: NavigationHistoryEntry[] = [];
  const tabClusterIds = new Map((layout?.tabs ?? []).map(tab => [tab.id, tab.clusterId]));

  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    if (entries.length >= MAX_HISTORY_ENTRIES) break;

    const tabId = rawEntry.tabId;
    const clusterId = rawEntry.clusterId;
    const wsId = rawEntry.workspaceId;

    if (
      typeof tabId !== "string" || !tabId.trim() || tabId.length > 100 ||
      typeof clusterId !== "string" || !clusterId.trim() || clusterId.length > 100 ||
      wsId !== workspace.id ||
      tabClusterIds.get(tabId) !== clusterId ||
      !workspace.clusterIds.includes(clusterId)
    ) continue;

    const path = sanitizeSafePath(rawEntry.path);

    if (path !== undefined) {
      const clusterRoute = path.split("?")[0].match(/^\/cluster\/([^/]+)(?:\/|$)/);

      if (clusterRoute && clusterRoute[1] !== clusterId) continue;
    }

    const timestamp = typeof rawEntry.timestamp === "number" ? rawEntry.timestamp : Date.now();

    entries.push(Object.freeze({
      tabId,
      workspaceId: workspace.id,
      clusterId,
      path,
      timestamp,
    }));
  }

  let currentIndex = typeof raw.currentIndex === "number" ? Math.floor(raw.currentIndex) : entries.length - 1;

  if (entries.length === 0) {
    currentIndex = -1;
  } else {
    currentIndex = Math.max(0, Math.min(currentIndex, entries.length - 1));
  }

  return Object.freeze({
    workspaceId: workspace.id,
    entries: Object.freeze(entries),
    currentIndex,
  });
}

function sanitizeLayoutTreeNode(node: any, depth = 0, nodeCount = { count: 0 }, seenIds = new Set<string>()): any {
  if (!node || typeof node !== "object" || Array.isArray(node) || depth > 8 || nodeCount.count >= 32) {
    return undefined;
  }

  nodeCount.count++;
  let id = typeof node.id === "string" ? node.id.slice(0, 100) : `node-${Date.now()}`;
  if (seenIds.has(id)) {
    id = `${id}-${nodeCount.count}`;
  }
  seenIds.add(id);

  if (node.type === "leaf") {
    const validKinds = ["kubetail", "resource-details", "pods", "deployments", "events", "terminal", "resource-editor"];
    const panelKind = validKinds.includes(node.panelKind) ? node.panelKind : "kubetail";
    const title = typeof node.title === "string" ? node.title.slice(0, 100) : undefined;

    return { type: "leaf", id, panelKind, title };
  }

  if (node.type === "branch") {
    const orientation = ["horizontal", "vertical"].includes(node.orientation) ? node.orientation : "horizontal";
    const ratio = typeof node.ratio === "number" && !isNaN(node.ratio) ? Math.max(0.15, Math.min(node.ratio, 0.85)) : 0.5;
    const first = sanitizeLayoutTreeNode(node.first, depth + 1, nodeCount, seenIds) || { type: "leaf", id: `leaf-1-${id}`, panelKind: "kubetail" };
    const second = sanitizeLayoutTreeNode(node.second, depth + 1, nodeCount, seenIds) || { type: "leaf", id: `leaf-2-${id}`, panelKind: "resource-details" };

    return { type: "branch", id, orientation, ratio, first, second };
  }

  if (node.type === "group") {
    const panels = Array.isArray(node.panels)
      ? node.panels.map((p: any) => sanitizeLayoutTreeNode(p, depth + 1, nodeCount, seenIds)).filter(Boolean)
      : [];

    if (panels.length === 0) return { type: "leaf", id, panelKind: "kubetail" };
    const activePanelId = typeof node.activePanelId === "string" ? node.activePanelId : panels[0].id;

    return { type: "group", id, activePanelId, panels };
  }

  return undefined;
}

function sanitizeDetachedWindow(raw: any): any {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  assertNoSensitiveFields(raw, "detachedWindow");

  const panelId = typeof raw.panelId === "string" ? raw.panelId.slice(0, 100) : undefined;
  if (!panelId) return undefined;

  const validKinds = ["kubetail", "resource-details", "pods", "deployments", "events", "terminal", "resource-editor"];
  const panelKind = validKinds.includes(raw.panelKind) ? raw.panelKind : "kubetail";
  const workspaceId = typeof raw.workspaceId === "string" ? raw.workspaceId.slice(0, 100) : "default";
  const clusterId = typeof raw.clusterId === "string" ? raw.clusterId.slice(0, 100) : "";
  const sessionKey = typeof raw.sessionKey === "string" ? raw.sessionKey.slice(0, 200) : `${clusterId}/${workspaceId}/${panelId}/${panelKind}`;
  const detachedAt = typeof raw.detachedAt === "number" ? raw.detachedAt : Date.now();
  const title = typeof raw.title === "string" ? raw.title.slice(0, 100) : undefined;

  let resource: any;
  if (raw.resource && typeof raw.resource === "object" && !Array.isArray(raw.resource)) {
    resource = {
      kind: typeof raw.resource.kind === "string" ? raw.resource.kind.slice(0, 64) : "Pod",
      name: typeof raw.resource.name === "string" ? raw.resource.name.slice(0, 253) : "unknown",
      namespace: typeof raw.resource.namespace === "string" ? raw.resource.namespace.slice(0, 253) : undefined,
      uid: typeof raw.resource.uid === "string" && /^[0-9a-fA-F-]{1,64}$/.test(raw.resource.uid) ? raw.resource.uid : undefined,
      apiVersion: typeof raw.resource.apiVersion === "string" ? raw.resource.apiVersion.slice(0, 64) : undefined,
    };
  }

  let geometry: any;
  if (raw.geometry && typeof raw.geometry === "object" && !Array.isArray(raw.geometry)) {
    geometry = {
      x: typeof raw.geometry.x === "number" && !isNaN(raw.geometry.x) ? Math.round(raw.geometry.x) : 100,
      y: typeof raw.geometry.y === "number" && !isNaN(raw.geometry.y) ? Math.round(raw.geometry.y) : 100,
      width: typeof raw.geometry.width === "number" && !isNaN(raw.geometry.width) ? Math.max(320, Math.min(raw.geometry.width, 7680)) : 960,
      height: typeof raw.geometry.height === "number" && !isNaN(raw.geometry.height) ? Math.max(240, Math.min(raw.geometry.height, 4320)) : 640,
      isMaximized: Boolean(raw.geometry.isMaximized),
      displayId: typeof raw.geometry.displayId === "number" ? raw.geometry.displayId : undefined,
    };
  }

  return {
    panelId,
    panelKind,
    workspaceId,
    clusterId,
    sessionKey,
    title,
    resource,
    geometry,
    detachedAt,
  };
}

function sanitizeCustomWorkspaces(raw: any): Record<string, any> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  assertNoSensitiveFields(raw, "customWorkspaces");
  const result: Record<string, any> = {};

  for (const [key, ws] of Object.entries(raw)) {
    if (ws && typeof ws === "object" && !Array.isArray(ws)) {
      const sanitizedNode = sanitizeLayoutTreeNode((ws as any).layout);
      if (sanitizedNode) {
        result[key.slice(0, 100)] = {
          id: typeof (ws as any).id === "string" ? (ws as any).id.slice(0, 100) : key,
          name: typeof (ws as any).name === "string" ? (ws as any).name.slice(0, 100) : "Custom Workspace",
          description: typeof (ws as any).description === "string" ? (ws as any).description.slice(0, 200) : "",
          layout: sanitizedNode,
        };
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Sanitizes and extracts only the allowlisted fields of a WorkspaceLayout.
 */
export function sanitizeSplitLayout(raw: any): SerializedSplitLayout | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  // Handle H4 LayoutV1 format
  if (raw.schemaVersion === "LayoutV1" || raw.version === 3) {
    const activeWorkspaceId = typeof raw.activeWorkspaceId === "string" ? raw.activeWorkspaceId.slice(0, 100) : "custom";
    const isClassicMode = Boolean(raw.isClassicMode);
    const maximizedPanelId = typeof raw.maximizedPanelId === "string" ? raw.maximizedPanelId.slice(0, 100) : undefined;
    const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now();
    const rootNode = sanitizeLayoutTreeNode(raw.rootNode) || {
      type: "branch",
      id: "root-branch-default",
      orientation: "horizontal",
      ratio: 0.58,
      first: { type: "leaf", id: "leaf-kubetail", panelKind: "kubetail" },
      second: { type: "leaf", id: "leaf-details", panelKind: "resource-details" },
    };

    const detachedWindows = Array.isArray(raw.detachedWindows)
      ? raw.detachedWindows.slice(0, 16).map(sanitizeDetachedWindow).filter(Boolean)
      : [];

    return {
      schemaVersion: "LayoutV1",
      version: 3,
      updatedAt,
      activeWorkspaceId,
      isClassicMode,
      maximizedPanelId,
      rootNode,
      detachedWindows,
      customWorkspaces: sanitizeCustomWorkspaces(raw.customWorkspaces),
    };
  }

  if (raw.version === 2) {
    const validWorkspaces = ["operation", "incidents", "development", "h1-default", "custom"];
    const activeWorkspaceId = validWorkspaces.includes(raw.activeWorkspaceId) ? raw.activeWorkspaceId : "custom";
    const isClassicMode = Boolean(raw.isClassicMode);
    const maximizedPanelId = typeof raw.maximizedPanelId === "string" ? raw.maximizedPanelId.slice(0, 100) : undefined;
    const rootNode = sanitizeLayoutTreeNode(raw.rootNode) || {
      type: "branch",
      id: "root-branch-default",
      orientation: "horizontal",
      ratio: 0.58,
      first: { type: "leaf", id: "leaf-kubetail", panelKind: "kubetail" },
      second: { type: "leaf", id: "leaf-details", panelKind: "resource-details" },
    };

    return {
      version: 2,
      activeWorkspaceId,
      isClassicMode,
      maximizedPanelId,
      rootNode,
    };
  }

  if (raw.version !== 1) return undefined;

  const ratio = typeof raw.ratio === "number" && !isNaN(raw.ratio)
    ? Math.max(0.2, Math.min(raw.ratio, 0.8))
    : 0.58;
  const isSwapped = Boolean(raw.isSwapped);
  const isLeftClosed = Boolean(raw.isLeftClosed);
  const isRightClosed = Boolean(raw.isRightClosed);
  const isClassicMode = Boolean(raw.isClassicMode);

  let resourceBinding: { kind: string; name: string; namespace: string } | undefined;

  if (raw.resourceBinding && typeof raw.resourceBinding === "object" && !Array.isArray(raw.resourceBinding)) {
    const kind = typeof raw.resourceBinding.kind === "string" ? raw.resourceBinding.kind.slice(0, 64) : undefined;
    const name = typeof raw.resourceBinding.name === "string" ? raw.resourceBinding.name.slice(0, 253) : undefined;
    const namespace = typeof raw.resourceBinding.namespace === "string" ? raw.resourceBinding.namespace.slice(0, 253) : undefined;

    if (kind && name && namespace) {
      resourceBinding = { kind, name, namespace };
    }
  }

  return {
    version: 1,
    ratio,
    isSwapped,
    isLeftClosed: isLeftClosed && isRightClosed ? false : isLeftClosed,
    isRightClosed: isLeftClosed && isRightClosed ? false : isRightClosed,
    isClassicMode,
    resourceBinding,
  };
}

export function sanitizeWorkspaceLayout(raw: any): WorkspaceLayout {
  if (!raw || typeof raw !== "object") {
    return { tabs: [] };
  }

  if (Array.isArray(raw.tabs) && raw.tabs.length > MAX_TABS_PER_WORKSPACE) {
    throw new Error("Workspace layout exceeds the maximum tab count.");
  }

  const rawTabs = Array.isArray(raw.tabs) ? raw.tabs : [];
  const tabs = rawTabs.map(sanitizeWorkspaceTab);

  const activeTabId = raw.activeTabId === undefined ? undefined : requiredId(raw.activeTabId, "active tab id");

  return {
    tabs,
    activeTabId,
    splitDirection: ["horizontal", "vertical"].includes(raw.splitDirection) ? raw.splitDirection : undefined,
    dockHeight: typeof raw.dockHeight === "number" ? Math.max(100, Math.min(raw.dockHeight, 2000)) : undefined,
    dockOpen: Boolean(raw.dockOpen),
    sidebarPinned: Boolean(raw.sidebarPinned),
    splitLayout: sanitizeSplitLayout(raw.splitLayout),
  };
}

/**
 * Sanitizes and extracts only the allowlisted fields of a WorkspaceContext.
 */
export function sanitizeWorkspaceContext(raw: any): WorkspaceContext {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid workspace context: expected an object");
  }

  const id = requiredId(raw.id, "workspace id");

  if (Array.isArray(raw.clusterIds) && raw.clusterIds.length > 50) {
    throw new Error("Workspace exceeds the maximum cluster count.");
  }

  const clusterIds = Array.isArray(raw.clusterIds)
    ? raw.clusterIds.map((clusterId: unknown) => requiredId(clusterId, "clusterId"))
    : [];

  if (new Set(clusterIds).size !== clusterIds.length) {
    throw new Error("Workspace cluster scope cannot contain duplicate cluster IDs.");
  }
  const activeClusterId = raw.activeClusterId === undefined ? undefined : requiredId(raw.activeClusterId, "activeClusterId");

  if (activeClusterId && !clusterIds.includes(activeClusterId)) {
    throw new Error("Active cluster must belong to the workspace.");
  }

  return Object.freeze({
    id,
    name: String(raw.name || "Default Workspace").slice(0, 100),
    activeClusterId,
    clusterIds: Object.freeze(clusterIds),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  });
}

function validateLayoutForWorkspace(workspace: WorkspaceContext, layout: WorkspaceLayout): WorkspaceLayout {
  if (layout.activeTabId && !layout.tabs.some(tab => tab.id === layout.activeTabId)) {
    throw new Error("Active tab must belong to the workspace layout.");
  }

  for (const tab of layout.tabs) {
    if (tab.workspaceId !== workspace.id || !workspace.clusterIds.includes(tab.clusterId)) {
      throw new Error("Workspace tab context does not match its workspace cluster scope.");
    }
  }

  if (new Set(layout.tabs.map(tab => tab.id)).size !== layout.tabs.length) {
    throw new Error("Workspace layout cannot contain duplicate tab IDs.");
  }

  return layout;
}

/**
 * Serializes a SessionSnapshotV1 into a safe, validated JSON string.
 */
export function serializeSessionSnapshot(snapshot: SessionSnapshotV1): string {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  assertNoSensitiveFields(snapshot);

  if (!Array.isArray(snapshot.workspaces) || snapshot.workspaces.length > MAX_WORKSPACES) {
    throw new Error("Snapshot exceeds the maximum workspace count.");
  }

  const workspaces = snapshot.workspaces.map(sanitizeWorkspaceContext);
  const workspacesById = new Map<string, WorkspaceContext>(workspaces.map(workspace => [workspace.id, workspace]));

  if (workspacesById.size !== workspaces.length) {
    throw new Error("Snapshot cannot contain duplicate workspace IDs.");
  }

  const activeWorkspaceId = requiredId(snapshot.activeWorkspaceId, "activeWorkspaceId");

  if (!workspacesById.has(activeWorkspaceId)) {
    throw new Error("Active workspace must belong to the session snapshot.");
  }

  const cleanSnapshot: SessionSnapshotV1 = {
    version: 1,
    timestamp: typeof snapshot.timestamp === "number" ? snapshot.timestamp : Date.now(),
    activeWorkspaceId,
    workspaces,
    layouts: {},
  };

  if (snapshot.layouts && typeof snapshot.layouts === "object") {
    cleanSnapshot.layouts = Object.create(null) as Record<string, WorkspaceLayout>;

    for (const [wsId, layout] of Object.entries(snapshot.layouts)) {
      const workspace = workspacesById.get(wsId);

      if (!workspace) throw new Error("Snapshot layout references an unknown workspace.");
      cleanSnapshot.layouts[wsId] = validateLayoutForWorkspace(workspace, sanitizeWorkspaceLayout(layout));
    }
  }

  if (snapshot.history && typeof snapshot.history === "object") {
    cleanSnapshot.history = Object.create(null) as Record<string, WorkspaceNavigationHistory>;

    for (const [wsId, rawHistory] of Object.entries(snapshot.history)) {
      const workspace = workspacesById.get(wsId);

      if (workspace) {
        cleanSnapshot.history[wsId] = sanitizeWorkspaceNavigationHistory(rawHistory, workspace, cleanSnapshot.layouts[wsId]);
      }
    }
  }

  const json = JSON.stringify(cleanSnapshot);

  const byteLength = new TextEncoder().encode(json).length;

  if (byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error(`Snapshot exceeds maximum allowed size (${byteLength} bytes > ${MAX_SNAPSHOT_BYTES} bytes)`);
  }

  return json;
}

/**
 * Deserializes and validates a JSON string into a SessionSnapshotV1.
 */
export function deserializeSessionSnapshot(json: string): SessionSnapshotV1 {
  if (typeof json !== "string") {
    throw new Error("Invalid snapshot payload: expected a string");
  }

  if (json.length > MAX_SNAPSHOT_BYTES) {
    throw new Error("Snapshot payload exceeds size limit");
  }

  const byteLength = new TextEncoder().encode(json).length;

  if (byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error(`Snapshot payload exceeds size limit (${byteLength} bytes)`);
  }

  let parsed: any;

  try {
    parsed = JSON.parse(json);
  } catch (err: any) {
    throw new Error(`Failed to parse snapshot JSON: ${err?.message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid snapshot structure: parsed value must be an object");
  }

  if (parsed.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version "${parsed.version}". Only version ${SNAPSHOT_VERSION} is supported.`);
  }

  assertNoSensitiveFields(parsed);

  const activeWorkspaceId = requiredId(parsed.activeWorkspaceId, "activeWorkspaceId");

  if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length > MAX_WORKSPACES) {
    throw new Error("Snapshot exceeds the maximum workspace count.");
  }

  const rawWorkspaces = parsed.workspaces;
  const workspaces = rawWorkspaces.map(sanitizeWorkspaceContext);
  const workspacesById = new Map<string, WorkspaceContext>(workspaces.map((workspace: WorkspaceContext) => [workspace.id, workspace]));

  if (workspacesById.size !== workspaces.length || !workspacesById.has(activeWorkspaceId)) {
    throw new Error("Snapshot workspace identities are inconsistent.");
  }

  const layouts: Record<string, WorkspaceLayout> = Object.create(null) as Record<string, WorkspaceLayout>;

  if (parsed.layouts && typeof parsed.layouts === "object") {
    for (const [wsId, rawLayout] of Object.entries(parsed.layouts)) {
      const workspace = workspacesById.get(wsId);

      if (!workspace) throw new Error("Snapshot layout references an unknown workspace.");
      layouts[wsId] = validateLayoutForWorkspace(workspace, sanitizeWorkspaceLayout(rawLayout));
    }
  }

  const history: Record<string, WorkspaceNavigationHistory> = Object.create(null) as Record<string, WorkspaceNavigationHistory>;

  if (parsed.history && typeof parsed.history === "object") {
    for (const [wsId, rawHistory] of Object.entries(parsed.history)) {
      const workspace = workspacesById.get(wsId);

      if (workspace) {
        history[wsId] = sanitizeWorkspaceNavigationHistory(rawHistory, workspace, layouts[wsId]);
      }
    }
  }

  return {
    version: 1,
    timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
    activeWorkspaceId,
    workspaces,
    layouts,
    history: Object.keys(history).length > 0 ? history : undefined,
  };
}

/**
 * Creates a minimal default SessionSnapshotV1.
 */
export function createDefaultSessionSnapshot(workspaceId = "default"): SessionSnapshotV1 {
  const ws: WorkspaceContext = {
    id: workspaceId,
    name: "Default Workspace",
    clusterIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    version: 1,
    timestamp: Date.now(),
    activeWorkspaceId: workspaceId,
    workspaces: [ws],
    layouts: {
      [workspaceId]: { tabs: [] },
    },
    history: {
      [workspaceId]: {
        workspaceId,
        entries: [],
        currentIndex: -1,
      },
    },
  };
}

/**
 * Safely deserializes a snapshot string with fail-closed corruption recovery.
 * Never throws uncaught error and never leaks sensitive data to logs.
 */
export function safeDeserializeSessionSnapshot(
  json: unknown,
  fallbackWorkspaceId = "default",
): { snapshot: SessionSnapshotV1; isCorrupted: boolean; error?: string } {
  if (typeof json !== "string" || !json.trim()) {
    return {
      snapshot: createDefaultSessionSnapshot(fallbackWorkspaceId),
      isCorrupted: false,
    };
  }

  if (json.length > MAX_SNAPSHOT_BYTES) {
    return {
      snapshot: createDefaultSessionSnapshot(fallbackWorkspaceId),
      isCorrupted: true,
      error: "Snapshot payload exceeds size limit",
    };
  }

  try {
    const parsed = JSON.parse(json);
    const payload =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed.version === undefined || parsed.version === 0)
        ? JSON.stringify(migrateLegacySnapshot(parsed, fallbackWorkspaceId))
        : json;
    const deserialized = deserializeSessionSnapshot(payload);

    return { snapshot: deserialized, isCorrupted: false };
  } catch (err: any) {
    return {
      snapshot: createDefaultSessionSnapshot(fallbackWorkspaceId),
      isCorrupted: true,
      error: String(err?.message || "Snapshot payload is corrupted or invalid"),
    };
  }
}

/**
 * Migrates a legacy or unversioned snapshot object to SessionSnapshotV1.
 * Only safe, allowlisted fields are migrated. Secrets, tokens, and kubeconfigs are never imported.
 */
export function migrateLegacySnapshot(raw: any, defaultWorkspaceId = "default"): SessionSnapshotV1 {
  if (!raw || typeof raw !== "object") {
    return createDefaultSessionSnapshot(defaultWorkspaceId);
  }

  // If already version 1, validate strictly
  if (raw.version === SNAPSHOT_VERSION) {
    return deserializeSessionSnapshot(JSON.stringify(raw));
  }

  // Reject future versions fail-closed
  if (typeof raw.version === "number" && raw.version > SNAPSHOT_VERSION) {
    throw new Error(`Cannot migrate future snapshot version "${raw.version}". Supported version is ${SNAPSHOT_VERSION}.`);
  }

  if (raw.version !== undefined && raw.version !== 0) {
    throw new Error(`Cannot migrate unsupported snapshot version "${String(raw.version)}".`);
  }

  // Legacy v0 migration: extract allowlisted cluster IDs if available
  const rawClusters: unknown[] = Array.isArray(raw.clusters)
    ? raw.clusters
    : Array.isArray(raw.clusterIds)
      ? raw.clusterIds
      : [];

  requiredId(defaultWorkspaceId, "workspace id");

  const safeClusterIds = [...new Set(rawClusters
    .filter((id): id is string =>
      typeof id === "string" &&
      id.trim().length > 0 &&
      id === id.trim() &&
      id.length <= 100 &&
      !hasControlCharacter(id) &&
      !["__proto__", "prototype", "constructor"].includes(id),
    ))]
    .slice(0, 50);

  const activeClusterId = typeof raw.activeClusterId === "string" && safeClusterIds.includes(raw.activeClusterId)
    ? raw.activeClusterId
    : safeClusterIds[0];

  const ws: WorkspaceContext = {
    id: defaultWorkspaceId,
    name: typeof raw.workspaceName === "string" ? raw.workspaceName.slice(0, 100) : "Default Workspace",
    clusterIds: safeClusterIds,
    activeClusterId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const tabs: WorkspaceTab[] = safeClusterIds.map((clusterId) => ({
    id: `tab-${clusterId}`,
    workspaceId: defaultWorkspaceId,
    clusterId,
    title: clusterId,
    kind: "cluster",
    createdAt: Date.now(),
  }));

  return {
    version: 1,
    timestamp: Date.now(),
    activeWorkspaceId: defaultWorkspaceId,
    workspaces: [ws],
    layouts: {
      [defaultWorkspaceId]: {
        tabs,
        activeTabId: activeClusterId ? `tab-${activeClusterId}` : undefined,
      },
    },
    history: {
      [defaultWorkspaceId]: {
        workspaceId: defaultWorkspaceId,
        entries: [],
        currentIndex: -1,
      },
    },
  };
}
