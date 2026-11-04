/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { PanelKind } from "../../../renderer/components/split-panel/split-panel-types";

/**
 * H7.7: pure, versioned (de)serialization of the Global Docking VISUAL layout.
 * Persists organisation only (tree, ratios, tabs, collapse); never sessions, secrets or buffers.
 * Independent from SplitPanelStore persistence and from the shared WORKSPACE_TEMPLATES map.
 */
export const GLOBAL_LAYOUT_VERSION = 1;

export type GlobalLayoutScope = "cluster" | "root";

export interface SerializedBinding {
  clusterId?: string;
  apiVersion?: string;
  kind: string;
  namespace?: string;
  name: string;
  uid?: string;
  selfLink?: string;
  container?: string;
  tabId?: string;
}

export interface SerializedLeaf { type: "leaf"; id: string; panelKind: PanelKind; title?: string; resourceBinding?: SerializedBinding }
export interface SerializedGroup { type: "group"; id: string; activePanelId: string; panels: SerializedLeaf[] }
export interface SerializedBranch { type: "branch"; id: string; orientation: "horizontal" | "vertical"; ratio: number; first: SerializedLayoutNode; second: SerializedLayoutNode }
export type SerializedLayoutNode = SerializedBranch | SerializedGroup | SerializedLeaf;

export interface GlobalLayoutV1 {
  version: 1;
  scope: GlobalLayoutScope;
  clusterId?: string;
  root: SerializedLayoutNode;
  collapsedLeafIds: string[];
  updatedAt: number;
}

export type RestoreFailure = "empty" | "malformed" | "unknown-version" | "scope-mismatch" | "cluster-mismatch" | "invalid-tree";

export type RestoreResult =
  | { ok: true; rootNode: SerializedLayoutNode; collapsedLeafIds: string[]; inertLeafIds: string[]; dropped: number }
  | { ok: false; reason: RestoreFailure };

export interface RestoreContext {
  scope: GlobalLayoutScope;
  clusterId?: string;
  allowedKinds: readonly PanelKind[];
  singleInstance: boolean;
  generateId?: () => string;
}

const MAX_DEPTH = 8;
const MAX_NODES = 64;
const MAX_PANELS = 24;
const MAX_STRING = 256;
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/** Kinds that start something (PTY, stream, model fetch) when mounted: restored inert. */
const INERT_KINDS: ReadonlySet<string> = new Set(["terminal", "pod-logs", "resource-editor", "kubetail"]);
/** Kinds legitimately opened several times (identity-bound), exempt from singleInstance. */
const MULTI_KINDS: ReadonlySet<string> = new Set(["terminal", "pod-logs", "resource-editor", "resource-details"]);
const BINDING_FIELDS = ["clusterId", "apiVersion", "namespace", "uid", "selfLink", "container", "tabId"] as const;

export function globalLayoutStorageKeys(target: { scope: GlobalLayoutScope; clusterId?: string }) {
  const primary = target.scope === "root"
    ? "openlens:root-layout:v1"
    : `openlens:global-layout:v1:${target.clusterId ?? ""}`;

  return { primary, previous: `${primary}:prev`, corrupted: `${primary}:corrupted` };
}

class LimitError extends Error {}

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max = MAX_STRING): string | undefined => (typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined);

function sanitizeBinding(value: unknown): SerializedBinding | undefined {
  if (!isObj(value)) return undefined;

  const kind = str(value.kind);
  const name = str(value.name);

  if (!kind || !name) return undefined;

  const out: SerializedBinding = { kind, name };

  for (const field of BINDING_FIELDS) {
    const v = str(value[field], 512);

    if (v) out[field] = v;
  }

  return out;
}

interface Rules {
  clusterId?: string;
  /** undefined = serialize mode: no policy filtering. */
  allowed?: ReadonlySet<string>;
  singleInstance: boolean;
  newId: () => string;
  restoring: boolean;
}

function sanitizeTree(root: unknown, rules: Rules) {
  const seenIds = new Set<string>();
  const seenKinds = new Set<string>();
  const inert: string[] = [];
  let nodes = 0;
  let panels = 0;
  let dropped = 0;

  const countNode = (depth: number) => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new LimitError();
  };

  const sanitizeLeaf = (raw: unknown, depth: number): SerializedLeaf | undefined => {
    countNode(depth);

    if (++panels > MAX_PANELS) throw new LimitError();

    if (!isObj(raw) || raw.type !== "leaf") { dropped++; return undefined; }

    const id = str(raw.id);
    const kind = str(raw.panelKind);

    if (!id || !kind || seenIds.has(id) || (rules.allowed && !rules.allowed.has(kind))) { dropped++; return undefined; }

    const binding = sanitizeBinding(raw.resourceBinding);

    if (rules.restoring && rules.clusterId && binding?.clusterId && binding.clusterId !== rules.clusterId) { dropped++; return undefined; }

    if (rules.restoring && rules.singleInstance && !MULTI_KINDS.has(kind)) {
      if (seenKinds.has(kind)) { dropped++; return undefined; }
      seenKinds.add(kind);
    }

    seenIds.add(id);

    const leaf: SerializedLeaf = { type: "leaf", id, panelKind: kind as PanelKind };
    const title = str(raw.title);

    if (title) leaf.title = title;

    if (binding) {
      leaf.resourceBinding = binding;

      if (rules.restoring && kind === "terminal") {
        // Never reuse a PTY/grant identity from a previous run.
        binding.tabId = `docked-terminal:${rules.clusterId ?? ""}:${rules.newId()}`;
      }
    }

    if (rules.restoring && INERT_KINDS.has(kind)) inert.push(id);

    return leaf;
  };

  const freshId = (raw: unknown) => {
    let id = str(raw);

    if (!id || seenIds.has(id)) id = rules.newId();
    seenIds.add(id);

    return id;
  };

  const walk = (raw: unknown, depth: number): SerializedLayoutNode | undefined => {
    if (isObj(raw) && raw.type === "leaf") return sanitizeLeaf(raw, depth);

    countNode(depth);

    if (isObj(raw) && raw.type === "group" && Array.isArray(raw.panels)) {
      const kept = raw.panels.map((p) => sanitizeLeaf(p, depth + 1)).filter((p): p is SerializedLeaf => Boolean(p));

      if (kept.length === 0) { dropped++; return undefined; }

      const active = kept.find((p) => p.id === raw.activePanelId) ?? kept[0];

      return { type: "group", id: freshId(raw.id), activePanelId: active.id, panels: kept };
    }

    if (isObj(raw) && raw.type === "branch") {
      const first = walk(raw.first, depth + 1);
      const second = walk(raw.second, depth + 1);

      if (!first || !second) return first ?? second;

      const ratio = typeof raw.ratio === "number" && Number.isFinite(raw.ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, raw.ratio)) : 0.5;

      return {
        type: "branch",
        id: freshId(raw.id),
        orientation: raw.orientation === "vertical" ? "vertical" : "horizontal",
        ratio,
        first,
        second,
      };
    }

    dropped++;

    return undefined;
  };

  try {
    const node = walk(root, 1);

    return node ? { node, inert, dropped, ids: seenIds } : undefined;
  } catch (error) {
    if (error instanceof LimitError) return undefined;
    throw error;
  }
}

const filterIds = (value: unknown, alive: ReadonlySet<string>): string[] =>
  (Array.isArray(value) ? value : []).filter((id): id is string => typeof id === "string" && alive.has(id));

const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function serializeGlobalLayout(input: {
  scope: GlobalLayoutScope;
  clusterId?: string;
  rootNode: unknown;
  collapsedLeafIds: Iterable<string>;
  now: number;
}): string | undefined {
  const tree = sanitizeTree(input.rootNode, { clusterId: input.clusterId, singleInstance: false, newId: randomId, restoring: false });

  if (!tree) return undefined;

  const layout: GlobalLayoutV1 = {
    version: GLOBAL_LAYOUT_VERSION,
    scope: input.scope,
    ...(input.scope === "cluster" && input.clusterId ? { clusterId: input.clusterId } : {}),
    root: tree.node,
    collapsedLeafIds: filterIds([...input.collapsedLeafIds], tree.ids),
    updatedAt: input.now,
  };

  return JSON.stringify(layout);
}

export function restoreGlobalLayout(raw: string | null | undefined, ctx: RestoreContext): RestoreResult {
  if (raw === null || raw === undefined || raw === "") return { ok: false, reason: "empty" };

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isObj(parsed)) return { ok: false, reason: "malformed" };
  if (parsed.version !== GLOBAL_LAYOUT_VERSION) return { ok: false, reason: "unknown-version" };
  if (parsed.scope !== ctx.scope) return { ok: false, reason: "scope-mismatch" };
  if (ctx.scope === "cluster" && parsed.clusterId !== ctx.clusterId) return { ok: false, reason: "cluster-mismatch" };

  const tree = sanitizeTree(parsed.root, {
    clusterId: ctx.clusterId,
    allowed: new Set(ctx.allowedKinds),
    singleInstance: ctx.singleInstance,
    newId: ctx.generateId ?? randomId,
    restoring: true,
  });

  if (!tree) return { ok: false, reason: "invalid-tree" };

  return {
    ok: true,
    rootNode: tree.node,
    collapsedLeafIds: filterIds(parsed.collapsedLeafIds, tree.ids),
    inertLeafIds: tree.inert,
    dropped: tree.dropped,
  };
}
