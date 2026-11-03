/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R4-06: central registry of detached tool windows.
 *
 * Pure bookkeeping, no Electron or Kubernetes access. A descriptor names WHICH
 * tool session a window shows; registering one never opens a connection, PTY,
 * log stream or port-forward. Session transfer and the single-PTY-owner lock are
 * deferred until the Dock/tool code from R4-04 is committed.
 */

export const detachedToolKinds = ["logs", "terminal", "inspector", "resource-list"] as const;
export type DetachedToolKind = typeof detachedToolKinds[number];

export const detachedEnvironments = ["development", "staging", "production", "test", "testing", "local", "custom", "none"] as const;
export type DetachedEnvironment = typeof detachedEnvironments[number];

export interface DetachedToolDescriptor {
  readonly workspaceId: string;
  readonly tabId: string;
  readonly clusterId: string;
  readonly toolKind: DetachedToolKind;
  readonly environment: DetachedEnvironment;
  readonly isProduction: boolean;
  readonly title: string;
  readonly resource?: {
    readonly kind: string;
    readonly namespace?: string;
    readonly name: string;
    readonly uid?: string;
  };
  /** H7.5: cluster color (#rrggbb) read by Main from the cluster preferences. */
  readonly accent?: string;
  /** H7.5: what a "resource-list" window shows. */
  readonly list?: {
    readonly kind: "Pod" | "Deployment";
    readonly namespace?: string;
  };
}

export interface DetachedWindowRecord {
  readonly windowId: number;
  readonly sessionKey: string;
  readonly descriptor: DetachedToolDescriptor;
  readonly createdAt: number;
}

export class DetachedWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetachedWindowError";
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const K8S_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const KIND_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,62}$/;
const UID_PATTERN = /^[0-9a-fA-F-]{1,64}$/;
const DESCRIPTOR_KEYS = new Set(["workspaceId", "tabId", "clusterId", "toolKind", "environment", "isProduction", "title", "resource", "accent", "list"]);
const LIST_KEYS = new Set(["kind", "namespace"]);
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RESOURCE_KEYS = new Set(["kind", "namespace", "name", "uid"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}

/**
 * Validates untrusted input and returns a deeply frozen copy. Unknown fields
 * (commands, tokens, buffers...) are rejected instead of being stripped.
 */
export function parseDetachedToolDescriptor(input: unknown): DetachedToolDescriptor {
  if (!isPlainRecord(input) || !hasOnlyKeys(input, DESCRIPTOR_KEYS)) {
    throw new DetachedWindowError("Descriptor must be a plain object with allowlisted fields only.");
  }

  const { workspaceId, tabId, clusterId, toolKind, environment, isProduction, title, resource, accent, list } = input;

  if (!matches(workspaceId, ID_PATTERN) || !matches(tabId, ID_PATTERN) || !matches(clusterId, ID_PATTERN)) {
    throw new DetachedWindowError("workspaceId, tabId and clusterId must be safe identifiers.");
  }

  if (!detachedToolKinds.includes(toolKind as DetachedToolKind)) {
    throw new DetachedWindowError("Unsupported detached tool kind.");
  }

  if (!detachedEnvironments.includes(environment as DetachedEnvironment) || typeof isProduction !== "boolean") {
    throw new DetachedWindowError("Environment identity is missing or invalid.");
  }

  // Production identity must be consistent in both directions so a PROD window can never render as non-PROD.
  if ((environment === "production") !== isProduction) {
    throw new DetachedWindowError("Production flag does not match the environment.");
  }

  if (typeof title !== "string" || title.length === 0 || title.length > 200) {
    throw new DetachedWindowError("Title must be a non-empty string up to 200 characters.");
  }

  let parsedResource: DetachedToolDescriptor["resource"];

  if (resource !== undefined) {
    if (!isPlainRecord(resource) || !hasOnlyKeys(resource, RESOURCE_KEYS)
      || !matches(resource.kind, KIND_PATTERN) || !matches(resource.name, K8S_NAME_PATTERN)
      || (resource.namespace !== undefined && !matches(resource.namespace, K8S_NAME_PATTERN))
      || (resource.uid !== undefined && !matches(resource.uid, UID_PATTERN))) {
      throw new DetachedWindowError("Resource reference is invalid.");
    }

    parsedResource = Object.freeze({
      kind: resource.kind,
      name: resource.name,
      ...(resource.namespace !== undefined ? { namespace: resource.namespace as string } : {}),
      ...(resource.uid !== undefined ? { uid: resource.uid as string } : {}),
    });
  }

  if ((toolKind === "logs" || toolKind === "inspector") && !parsedResource) {
    throw new DetachedWindowError(`A ${toolKind} window requires a resource reference.`);
  }

  if (accent !== undefined && !matches(accent, HEX_COLOR_PATTERN)) {
    throw new DetachedWindowError("Accent must be a #rrggbb color.");
  }

  let parsedList: DetachedToolDescriptor["list"];

  if (list !== undefined || toolKind === "resource-list") {
    if (toolKind !== "resource-list" || parsedResource || !isPlainRecord(list) || !hasOnlyKeys(list, LIST_KEYS)
      || (list.kind !== "Pod" && list.kind !== "Deployment")
      || (list.namespace !== undefined && !matches(list.namespace, K8S_NAME_PATTERN))) {
      throw new DetachedWindowError("A resource-list window needs a Pod or Deployment list and nothing else.");
    }

    parsedList = Object.freeze({
      kind: list.kind,
      ...(list.namespace !== undefined ? { namespace: list.namespace as string } : {}),
    });
  }

  return Object.freeze({
    workspaceId,
    tabId,
    clusterId,
    toolKind: toolKind as DetachedToolKind,
    environment: environment as DetachedEnvironment,
    isProduction,
    title,
    ...(parsedResource ? { resource: parsedResource } : {}),
    ...(accent !== undefined ? { accent: accent as string } : {}),
    ...(parsedList ? { list: parsedList } : {}),
  });
}

/** One tool session is identified by its cluster, workspace, tab and tool kind. */
export function sessionKeyOf(descriptor: Pick<DetachedToolDescriptor, "clusterId" | "workspaceId" | "tabId" | "toolKind">): string {
  return [descriptor.clusterId, descriptor.workspaceId, descriptor.tabId, descriptor.toolKind].join("/");
}

export class DetachedWindowRegistry {
  private readonly byWindow = new Map<number, DetachedWindowRecord>();
  private readonly bySession = new Map<string, number>();

  constructor(private readonly maxWindows = 16, private readonly now: () => number = Date.now) {}

  /** Returns the window that already owns this session, so callers focus it instead of duplicating it. */
  findOwner(descriptor: Pick<DetachedToolDescriptor, "clusterId" | "workspaceId" | "tabId" | "toolKind">): DetachedWindowRecord | undefined {
    const windowId = this.bySession.get(sessionKeyOf(descriptor));

    return windowId === undefined ? undefined : this.byWindow.get(windowId);
  }

  register(windowId: number, descriptor: DetachedToolDescriptor): DetachedWindowRecord {
    if (!Number.isInteger(windowId) || windowId <= 0) {
      throw new DetachedWindowError("Invalid window id.");
    }

    if (this.byWindow.has(windowId)) {
      throw new DetachedWindowError("Window already owns a tool session; identities are immutable.");
    }

    const sessionKey = sessionKeyOf(descriptor);

    if (this.bySession.has(sessionKey)) {
      throw new DetachedWindowError("Tool session is already detached in another window.");
    }

    if (this.byWindow.size >= this.maxWindows) {
      throw new DetachedWindowError("Detached window limit reached.");
    }

    const record = Object.freeze({ windowId, sessionKey, descriptor, createdAt: this.now() });

    this.byWindow.set(windowId, record);
    this.bySession.set(sessionKey, windowId);

    return record;
  }

  get(windowId: number): DetachedWindowRecord | undefined {
    return this.byWindow.get(windowId);
  }

  /**
   * Fail-closed check for every request coming from a window: the window must be
   * registered and any identity it sends must equal the one it was created with.
   */
  authorize(windowId: number, claimed?: Partial<Pick<DetachedToolDescriptor, "workspaceId" | "tabId" | "clusterId">>): DetachedWindowRecord {
    const record = this.byWindow.get(windowId);

    if (!record) {
      throw new DetachedWindowError("Unknown detached window.");
    }

    if (claimed) {
      for (const key of ["workspaceId", "tabId", "clusterId"] as const) {
        if (claimed[key] !== undefined && claimed[key] !== record.descriptor[key]) {
          throw new DetachedWindowError(`${key} does not match the window's immutable identity.`);
        }
      }
    }

    return record;
  }

  release(windowId: number): DetachedWindowRecord | undefined {
    const record = this.byWindow.get(windowId);

    if (record) {
      this.byWindow.delete(windowId);
      this.bySession.delete(record.sessionKey);
    }

    return record;
  }

  /** Drops windows whose WebContents no longer exist (crash or unexpected close). */
  releaseStale(isAlive: (windowId: number) => boolean): DetachedWindowRecord[] {
    return [...this.byWindow.keys()].filter(id => !isAlive(id)).map(id => this.release(id) as DetachedWindowRecord);
  }

  /** Windows that belong to a cluster, e.g. to close them when that cluster is removed. */
  windowsForCluster(clusterId: string): DetachedWindowRecord[] {
    return [...this.byWindow.values()].filter(record => record.descriptor.clusterId === clusterId);
  }

  windowIds(): number[] {
    return [...this.byWindow.keys()];
  }

  get size(): number {
    return this.byWindow.size;
  }
}
