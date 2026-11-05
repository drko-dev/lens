/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import type { DetachToolRequest, DetachToolResult, DetachedListRow, DetachedListSpec, DetachedTabsResult, FrameRedockRequest, RedockedNotice } from "../../common/detached-tools/detached-tool-channels";
import type { ClusterFrameInfo } from "../../common/cluster-frames.injectable";
import { getClusterEnvironmentConfig, getConfiguredClusterColor } from "../../common/cluster/environment-types";
import { assertToolActionClusterContext } from "../../common/workspace/tool-context";
import type { DetachedToolDescriptor, DetachedWindowRecord } from "./detached-window-registry";
import { DetachedWindowError, parseDetachedToolDescriptor, sessionKeyOf } from "./detached-window-registry";
import type { DetachedToolWindowHooks, OpenDetachedToolWindowResult } from "./open-detached-tool-window.injectable";

export interface DetachedToolCluster {
  readonly id: string;
  readonly name: string;
  readonly preferences?: Parameters<typeof getClusterEnvironmentConfig>[0];
}

export interface LogStreamParams {
  namespace: string;
  pod: string;
  container: string;
  tailLines: number;
  previous: boolean;
  timestamps: boolean;
}

/** Minimal readable surface used from node-fetch bodies. */
export interface LogByteStream {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  destroy?(): unknown;
}

export interface DetachedToolSessionManagerDependencies {
  readonly isEnabled: () => boolean;
  readonly getCluster: (clusterId: string) => DetachedToolCluster | undefined;
  readonly getClusterFrames: () => ReadonlyMap<string, ClusterFrameInfo>;
  readonly openWindow: (input: unknown, hooks: DetachedToolWindowHooks) => OpenDetachedToolWindowResult;
  readonly listOwned: (clusterId: string) => readonly DetachedWindowRecord[];
  readonly findOwner: (key: FrameRedockRequest) => DetachedWindowRecord | undefined;
  readonly closeWindow: (windowId: number) => void;
  readonly sendToWindow: (windowId: number, payload: unknown) => void;
  readonly sendToClusterFrame: (clusterId: string, notice: RedockedNotice) => void;
  /** Opens `GET pods/{pod}/log?follow=true` against that cluster. Rejects on abort. */
  readonly openLogStream: (clusterId: string, params: LogStreamParams, signal: AbortSignal) => Promise<LogByteStream>;
  /** H7.5: streaming read-only GET (a watch) of a Kubernetes API path; destroying the stream closes it upstream. */
  readonly openApiStream: (clusterId: string, pathAndQuery: string, signal: AbortSignal) => Promise<LogByteStream>;
  /** Plain read-only GET of a Kubernetes API path against that cluster. */
  readonly getJson: (clusterId: string, pathAndQuery: string, signal: AbortSignal) => Promise<unknown>;
  readonly logger: { info(message: string): void; warn(message: string): void; error(message: string, error?: unknown): void };
  readonly now?: () => number;
}

export const MIN_REFRESH_INTERVAL_MS = 2000;
const MAX_LINE_LENGTH = 8000;
const MAX_LINES_PER_MESSAGE = 2000;
const MAX_PARTIAL_LINE = 64 * 1024;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const K8S_NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const CONTAINER = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const KIND = /^[A-Za-z][A-Za-z0-9]{0,62}$/;
const UID = /^[0-9a-fA-F-]{1,64}$/;
const API_VERSION = /^([a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?\/)?v[0-9]{1,3}((alpha|beta)[0-9]{1,3})?$/;
const REQUEST_KEYS = ["clusterId", "workspaceId", "tabId", "toolKind", "resource", "logs", "list"];
const LIST_KEYS = ["kind", "namespace"];
const REDOCKABLE_KINDS = ["logs", "inspector", "resource-list"];
const MAX_LIST_ROWS = 2000;
const LIST_RETRY_MS = 2000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LIST_TITLES: Record<DetachedListSpec["kind"], string> = { Pod: "Pods", Deployment: "Deployments" };
const RESOURCE_KEYS = ["apiVersion", "kind", "namespace", "name", "uid"];
const LOGS_KEYS = ["container", "tailLines", "previous", "timestamps", "pod"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function ok(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

interface SessionParams {
  readonly apiVersion?: string;
  readonly logs?: LogStreamParams;
  readonly list?: DetachedListSpec;
}

interface ActiveSession {
  readonly record: DetachedWindowRecord;
  readonly controller: AbortController;
}

/**
 * R4-06: Main owns every data stream of a detached window. The window never
 * names a cluster, namespace, pod or URL: everything is taken from the registry
 * record (identity) and the parameters captured here when the cluster frame asked.
 */
export class DetachedToolSessionManager {
  private readonly params = new Map<string, SessionParams>();
  private readonly active = new Map<string, ActiveSession>();
  private readonly lastRefreshAt = new Map<string, number>();

  constructor(private readonly deps: DetachedToolSessionManagerDependencies) {}

  /** Resolves the cluster whose frame sent this event; fail-closed for any other sender. */
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

  private parseRequest(input: unknown): DetachToolRequest {
    if (!isPlainRecord(input) || !hasOnly(input, REQUEST_KEYS)) {
      throw new DetachedWindowError("Invalid detach request.");
    }

    const { clusterId, workspaceId, tabId, toolKind, resource, logs, list } = input;

    if (!ok(clusterId, ID) || !ok(workspaceId, ID) || !ok(tabId, ID)) {
      throw new DetachedWindowError("Invalid detach identity.");
    }

    if (toolKind === "resource-list") {
      // H7.5: a list window names only a kind and an optional namespace; Main builds the path.
      if (resource !== undefined || logs !== undefined || !isPlainRecord(list) || !hasOnly(list, LIST_KEYS)
        || (list.kind !== "Pod" && list.kind !== "Deployment")
        || (list.namespace !== undefined && !ok(list.namespace, K8S_NAME))) {
        throw new DetachedWindowError("Invalid resource list request.");
      }

      return input as unknown as DetachToolRequest;
    }

    if (toolKind !== "logs" && toolKind !== "inspector") {
      throw new DetachedWindowError("Unsupported detached tool kind.");
    }

    if (list !== undefined) {
      throw new DetachedWindowError("Only resource-list windows take a list.");
    }

    if (!isPlainRecord(resource) || !hasOnly(resource, RESOURCE_KEYS) || !ok(resource.kind, KIND) || !ok(resource.name, K8S_NAME)
      || (resource.namespace !== undefined && !ok(resource.namespace, K8S_NAME))
      || (resource.uid !== undefined && !ok(resource.uid, UID))
      || (resource.apiVersion !== undefined && !ok(resource.apiVersion, API_VERSION))) {
      throw new DetachedWindowError("Invalid resource reference.");
    }

    const parsedResource = resource as NonNullable<DetachToolRequest["resource"]>;

    if (toolKind === "logs") {
      if (!isPlainRecord(logs) || !hasOnly(logs, LOGS_KEYS) || !ok(logs.container, CONTAINER)
        || (logs.pod !== undefined && !ok(logs.pod, K8S_NAME))
        || !Number.isInteger(logs.tailLines) || (logs.tailLines as number) < 1 || (logs.tailLines as number) > 10_000
        || typeof logs.previous !== "boolean" || typeof logs.timestamps !== "boolean") {
        throw new DetachedWindowError("Invalid log options.");
      }

      if ((parsedResource.kind !== "Pod" && parsedResource.kind !== "Deployment") || !parsedResource.namespace) {
        throw new DetachedWindowError("Logs can only be detached from a namespaced Pod or Deployment.");
      }
    } else if (logs !== undefined || !parsedResource.uid || !parsedResource.apiVersion) {
      throw new DetachedWindowError("An inspector window needs apiVersion and uid and takes no log options.");
    }

    return input as unknown as DetachToolRequest;
  }

  /** cluster frame -> Main. Throws (rejects the invoke) unless every check passes. */
  handleDetach = (event: IpcMainInvokeEvent, input: unknown): DetachToolResult => {
    if (!this.deps.isEnabled()) {
      throw new DetachedWindowError("Detached tool windows are disabled.");
    }

    const senderClusterId = this.clusterIdOfSender(event);
    const request = this.parseRequest(input);

    assertToolActionClusterContext(senderClusterId, request.clusterId, "detach-tool-window");

    const cluster = this.deps.getCluster(request.clusterId);

    if (!cluster) {
      throw new DetachedWindowError("Unknown cluster.");
    }

    // Environment identity always comes from Main's own cluster entity, never from the renderer.
    const environment = getClusterEnvironmentConfig(cluster.preferences);
    const isProduction = environment.id === "production";

    if (request.toolKind === "resource-list" && request.list) {
      const color = getConfiguredClusterColor(cluster.preferences);

      return this.open(parseDetachedToolDescriptor({
        workspaceId: request.workspaceId,
        tabId: request.tabId,
        clusterId: cluster.id,
        toolKind: request.toolKind,
        environment: environment.id,
        isProduction,
        title: `${cluster.name} · ${LIST_TITLES[request.list.kind]}`,
        ...(color && HEX_COLOR.test(color) ? { accent: color } : {}),
        list: { ...request.list },
      }), { list: { ...request.list }});
    }

    const resource = request.resource as NonNullable<DetachToolRequest["resource"]>;
    const resourceLabel = `${resource.kind}/${resource.name}`;
    const descriptor: DetachedToolDescriptor = parseDetachedToolDescriptor({
      workspaceId: request.workspaceId,
      tabId: request.tabId,
      clusterId: cluster.id,
      toolKind: request.toolKind,
      environment: environment.id,
      isProduction,
      title: request.toolKind === "logs" && request.logs
        ? `${cluster.name} · ${resource.name}/${request.logs.container}`
        : `${cluster.name} · ${resourceLabel}`,
      resource: {
        kind: resource.kind,
        name: resource.name,
        ...(resource.namespace ? { namespace: resource.namespace } : {}),
        ...(resource.uid ? { uid: resource.uid } : {}),
      },
    });

    return this.open(descriptor, {
      apiVersion: resource.apiVersion,
      logs: request.logs && resource.namespace ? {
        namespace: resource.namespace,
        pod: request.logs.pod || resource.name,
        container: request.logs.container,
        tailLines: request.logs.tailLines,
        previous: request.logs.previous,
        timestamps: request.logs.timestamps,
      } : undefined,
    });
  };

  private open(descriptor: DetachedToolDescriptor, params: SessionParams): DetachToolResult {
    const sessionKey = sessionKeyOf(descriptor);

    // Only a brand new window keeps these parameters; a second detach just focuses the owner.
    const previousParams = this.params.get(sessionKey);

    this.params.set(sessionKey, previousParams ?? params);

    let result: OpenDetachedToolWindowResult;

    try {
      result = this.deps.openWindow(descriptor, {
        onStart: record => this.start(record),
        onRefresh: record => this.refresh(record),
        onClosed: record => this.closed(record),
      });
    } catch (error) {
      if (!previousParams) this.params.delete(sessionKey);
      throw error;
    }

    return { windowId: result.windowId, reused: result.reused };
  }

  /** H7.5: the cluster frame that owns these panels is gone (cluster deactivated or removed); nothing could redock them. */
  closeListWindowsOfCluster(clusterId: string): void {
    for (const record of this.deps.listOwned(clusterId)) {
      if (record.descriptor.toolKind === "resource-list") {
        this.deps.closeWindow(record.windowId);
      }
    }
  }

  /** cluster frame -> Main: close the window that owns this tab's tool; the normal close path then notifies the dock. */
  handleFrameRedock = (event: IpcMainInvokeEvent, input: unknown): { accepted: boolean } => {
    const senderClusterId = this.clusterIdOfSender(event);

    if (!isPlainRecord(input) || !hasOnly(input, ["clusterId", "workspaceId", "tabId", "toolKind"])
      || !ok(input.clusterId, ID) || !ok(input.workspaceId, ID) || !ok(input.tabId, ID)
      || !REDOCKABLE_KINDS.includes(input.toolKind as string)) {
      throw new DetachedWindowError("Invalid redock request.");
    }

    assertToolActionClusterContext(senderClusterId, input.clusterId, "redock-tool-window");

    const owner = this.deps.findOwner(input as unknown as FrameRedockRequest);

    if (!owner) {
      return { accepted: false };
    }

    this.deps.closeWindow(owner.windowId);

    return { accepted: true };
  };

  /** cluster frame -> Main: Main is the source of truth for which tabs of the SENDER's cluster are detached (frame reload). */
  handleFrameListDetached = (event: IpcMainInvokeEvent, input?: unknown): DetachedTabsResult => {
    const clusterId = this.clusterIdOfSender(event);

    if (input !== undefined) {
      throw new DetachedWindowError("List request takes no payload.");
    }

    return {
      tabs: this.deps.listOwned(clusterId)
        // R5-07F: terminal windows live in the same registry; ids only, so the dock can show the placeholder after a reload.
        .map(({ descriptor: { workspaceId, tabId, toolKind }}) => ({ workspaceId, tabId, toolKind })),
    };
  };

  private start(record: DetachedWindowRecord): void {
    this.stop(record.sessionKey);

    const params = this.params.get(record.sessionKey);
    const controller = new AbortController();

    if (!params) {
      return;
    }

    this.active.set(record.sessionKey, { record, controller });

    const task = record.descriptor.toolKind === "logs" && params.logs
      ? this.runLogs(record, params.logs, controller)
      : record.descriptor.toolKind === "inspector"
        ? this.runInspector(record, params, controller)
        : record.descriptor.toolKind === "resource-list" && params.list
          ? this.runList(record, params.list, controller)
          : Promise.resolve();

    task.catch(error => {
      if (!controller.signal.aborted) {
        this.deps.logger.error(`[DETACHED-TOOL]: ${record.descriptor.toolKind} session failed`, error);
        this.send(record, { type: "error", message: "The data stream failed." });
      }
    });
  }

  private refresh(record: DetachedWindowRecord): void {
    const params = this.params.get(record.sessionKey);
    const now = (this.deps.now ?? Date.now)();
    const last = this.lastRefreshAt.get(record.sessionKey);

    if (record.descriptor.toolKind !== "inspector" || !params || (last !== undefined && now - last < MIN_REFRESH_INTERVAL_MS)) {
      return;
    }

    this.lastRefreshAt.set(record.sessionKey, now);
    this.stop(record.sessionKey);

    const controller = new AbortController();

    this.active.set(record.sessionKey, { record, controller });
    this.runInspector(record, params, controller).catch(() => this.send(record, { type: "error", message: "Refresh failed." }));
  }

  private send(record: DetachedWindowRecord, payload: Record<string, unknown>): void {
    this.deps.sendToWindow(record.windowId, payload);
  }

  private async runLogs(record: DetachedWindowRecord, params: LogStreamParams, controller: AbortController): Promise<void> {
    this.send(record, { type: "status", status: "connecting" });

    const stream = await this.deps.openLogStream(record.descriptor.clusterId, params, controller.signal);

    if (controller.signal.aborted) {
      stream.destroy?.();

      return;
    }

    controller.signal.addEventListener("abort", () => stream.destroy?.());

    let partial = "";
    const emit = (lines: string[]) => {
      for (let i = 0; i < lines.length; i += MAX_LINES_PER_MESSAGE) {
        this.send(record, { type: "log-lines", lines: lines.slice(i, i + MAX_LINES_PER_MESSAGE) });
      }
    };

    this.send(record, { type: "status", status: "live" });
    stream.on("data", chunk => {
      if (controller.signal.aborted) return;

      const parts = (partial + chunk.toString()).split("\n");

      partial = parts.pop() ?? "";

      if (partial.length > MAX_PARTIAL_LINE) {
        parts.push(partial);
        partial = "";
      }

      emit(parts.map(line => line.slice(0, MAX_LINE_LENGTH)));
    });
    stream.on("end", () => {
      if (controller.signal.aborted) return;

      if (partial) emit([partial.slice(0, MAX_LINE_LENGTH)]);
      this.send(record, { type: "status", status: "ended" });
    });
    stream.on("error", error => {
      if (controller.signal.aborted) return;

      this.deps.logger.warn(`[DETACHED-TOOL]: log stream error: ${error?.message}`);
      this.send(record, { type: "status", status: "error" });
    });
  }

  private async runInspector(record: DetachedWindowRecord, params: SessionParams, controller: AbortController): Promise<void> {
    const { clusterId, resource } = record.descriptor;

    if (!resource || !params.apiVersion) {
      return;
    }

    this.send(record, { type: "status", status: "connecting" });

    const base = params.apiVersion.includes("/") ? `/apis/${params.apiVersion}` : `/api/${params.apiVersion}`;
    const discovery = await this.deps.getJson(clusterId, base, controller.signal) as { resources?: { name: string; kind: string; namespaced: boolean }[] };
    const kind = discovery?.resources?.find(entry => entry.kind === resource.kind && !entry.name.includes("/"));

    if (!kind || (kind.namespaced && !resource.namespace)) {
      return this.send(record, { type: "error", message: "Unknown resource kind for this cluster." });
    }

    const path = `${base}${kind.namespaced ? `/namespaces/${encodeURIComponent(resource.namespace as string)}` : ""}/${encodeURIComponent(kind.name)}/${encodeURIComponent(resource.name)}`;
    const object = await this.deps.getJson(clusterId, path, controller.signal) as { metadata?: { uid?: string }} & Record<string, any>;

    if (controller.signal.aborted) return;

    if (object?.metadata?.uid !== resource.uid) {
      return this.send(record, { type: "error", message: "Resource identity changed (uid mismatch); it was deleted or recreated. No data shown." });
    }

    this.send(record, { type: "inspector", object: redactForInspector(resource.kind, object) });
  }

  /**
   * H7.5: LIST, then WATCH from that resourceVersion, keeping a name-keyed map of display rows.
   * The window only ever receives projected rows. On watch end or error it re-lists after a pause
   * until the session is aborted (window closed or app quit).
   */
  private async runList(record: DetachedWindowRecord, list: DetachedListSpec, controller: AbortController): Promise<void> {
    const { signal } = controller;
    const base = list.kind === "Pod" ? "/api/v1" : "/apis/apps/v1";
    const path = `${base}${list.namespace ? `/namespaces/${encodeURIComponent(list.namespace)}` : ""}/${list.kind === "Pod" ? "pods" : "deployments"}`;
    const rows = new Map<string, DetachedListRow>();
    const publish = () => this.send(record, {
      type: "rows",
      kind: list.kind,
      rows: [...rows.values()].sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`)).slice(0, MAX_LIST_ROWS),
    });

    while (!signal.aborted) {
      try {
        this.send(record, { type: "status", status: "connecting" });

        const listed = await this.deps.getJson(record.descriptor.clusterId, path, signal) as { metadata?: { resourceVersion?: string }; items?: unknown[] };

        if (signal.aborted) return;

        rows.clear();

        for (const item of listed?.items ?? []) {
          const row = toListRow(list.kind, item);

          if (row) rows.set(`${row.namespace}/${row.name}`, row);
        }

        publish();

        const query = new URLSearchParams({ watch: "1", resourceVersion: listed?.metadata?.resourceVersion ?? "0", allowWatchBookmarks: "false" });
        const stream = await this.deps.openApiStream(record.descriptor.clusterId, `${path}?${query}`, signal);

        if (signal.aborted) {
          stream.destroy?.();

          return;
        }

        this.send(record, { type: "status", status: "live" });

        // One pass of the loop: every abort listener it adds is removed when the watch ends,
        // so reconnecting for hours does not pile them up on the session's signal.
        let finish: () => void = () => {};
        const onAbort = () => {
          stream.destroy?.();
          finish();
        };

        signal.addEventListener("abort", onAbort);

        await new Promise<void>((resolve) => {
          finish = resolve;
          let partial = "";

          stream.on("data", (chunk) => {
            const parts = (partial + chunk.toString()).split("\n");

            partial = parts.pop() ?? "";

            if (partial.length > MAX_PARTIAL_LINE) partial = "";

            let changed = false;

            for (const line of parts) {
              const event = parseWatchEvent(line);
              const row = event && toListRow(list.kind, event.object);

              if (!event || !row) continue;

              const key = `${row.namespace}/${row.name}`;

              if (event.type === "DELETED") rows.delete(key);
              else rows.set(key, row);
              changed = true;
            }

            if (changed && !signal.aborted) publish();
          });
          stream.on("end", () => resolve());
          stream.on("error", () => resolve());
        });
        signal.removeEventListener("abort", onAbort);
      } catch (error) {
        if (signal.aborted) return;

        this.deps.logger.warn(`[DETACHED-TOOL]: resource list failed: ${(error as Error)?.message}`);
        this.send(record, { type: "status", status: "error" });
      }

      if (signal.aborted) return;

      this.send(record, { type: "status", status: "reconnecting" });
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, LIST_RETRY_MS);

        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
  }

  private stop(sessionKey: string): void {
    this.active.get(sessionKey)?.controller.abort();
    this.active.delete(sessionKey);
  }

  /** Window closed by redock, the OS close button or a crash: stop everything it owned and tell the dock. */
  private closed(record: DetachedWindowRecord): void {
    this.stop(record.sessionKey);
    this.params.delete(record.sessionKey);
    this.lastRefreshAt.delete(record.sessionKey);

    const { clusterId, workspaceId, tabId, toolKind } = record.descriptor;

    this.deps.sendToClusterFrame(clusterId, { clusterId, workspaceId, tabId, toolKind });
  }

  /** App quit: abort every stream. */
  disposeAll(): void {
    for (const key of [...this.active.keys()]) this.stop(key);
  }

  get activeStreamCount(): number {
    return this.active.size;
  }
}

function redactForInspector(kind: string, object: Record<string, any>): Record<string, unknown> {
  const copy: Record<string, any> = { ...object, metadata: { ...object.metadata }};

  delete copy.metadata.managedFields;

  if (kind === "Secret") {
    if (copy.metadata.annotations) {
      copy.metadata.annotations = { ...copy.metadata.annotations };
      delete copy.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"];
    }

    for (const field of ["data", "stringData"]) {
      if (copy[field] && typeof copy[field] === "object") {
        copy[field] = Object.fromEntries(Object.keys(copy[field]).map(key => [key, "<redacted>"]));
      }
    }
  }

  return copy;
}

function parseWatchEvent(line: string): { type: string; object: unknown } | undefined {
  if (!line.trim()) return undefined;

  try {
    const event = JSON.parse(line) as { type?: unknown; object?: unknown };

    return event && (event.type === "ADDED" || event.type === "MODIFIED" || event.type === "DELETED")
      ? { type: event.type, object: event.object }
      : undefined;
  } catch {
    return undefined;
  }
}

/** H7.5: the only data a list window gets. Never spec, env, annotations or anything else from the object. */
export function toListRow(kind: DetachedListSpec["kind"], object: unknown): DetachedListRow | undefined {
  const item = object as { metadata?: { name?: unknown; namespace?: unknown; creationTimestamp?: unknown }; spec?: any; status?: any } | undefined;
  const name = item?.metadata?.name;

  if (typeof name !== "string" || !K8S_NAME.test(name)) return undefined;

  const namespace = typeof item?.metadata?.namespace === "string" ? item.metadata.namespace : undefined;
  const createdAt = typeof item?.metadata?.creationTimestamp === "string" ? item.metadata.creationTimestamp.slice(0, 40) : undefined;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

  if (kind === "Pod") {
    const statuses: unknown[] = Array.isArray(item?.status?.containerStatuses) ? item?.status.containerStatuses : [];
    const ready = statuses.filter((s) => (s as { ready?: unknown })?.ready === true).length;
    const phase = typeof item?.status?.phase === "string" ? item.status.phase.slice(0, 40) : "Unknown";

    return { name, namespace, status: phase, ready: `${ready}/${statuses.length}`, createdAt };
  }

  return {
    name,
    namespace,
    status: `${count(item?.status?.availableReplicas)} available`,
    ready: `${count(item?.status?.readyReplicas)}/${count(item?.spec?.replicas)}`,
    createdAt,
  };
}
