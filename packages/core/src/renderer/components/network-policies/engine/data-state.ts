/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DataEvaluationState } from "./types";

/**
 * Minimal shape of a Kubernetes object store required to derive the evaluation state.
 * Mirrors the observable flags exposed by ItemStore / KubeObjectStore.
 */
export interface StoreStateProbe {
  items?: unknown[];
  isLoading?: boolean;
  isLoaded?: boolean;
  failedLoading?: boolean;
  lastError?: { statusCode?: number; status?: number } | unknown;
}

/**
 * Minimal shape of the authentic cluster connection state.
 *
 * The values are taken from the Cluster model (common/cluster/cluster.ts) which is kept in sync
 * with the main process through the cluster state sync channel. There is no "clusterDisconnected"
 * property on stores: connectivity is a property of the cluster, not of a resource store.
 */
export interface ClusterConnectionState {
  id?: string;
  /** True when the cluster is known to be disconnected (user disabled the connection). */
  disconnected?: boolean;
  /** True when the cluster is detected as online. */
  online?: boolean;
  /** True when the user is able to access cluster resources. */
  accessible?: boolean;
  /** True when the cluster instance reached a usable state. */
  ready?: boolean;
}

/**
 * Structural shape of a cluster connection source. Accepts both plain booleans (tests, plain
 * objects) and MobX observable boxes (the real Cluster model exposes observable.box fields).
 */
export interface ClusterObservableLike {
  id?: string;
  disconnected?: boolean | { get(): boolean };
  online?: boolean | { get(): boolean };
  accessible?: boolean | { get(): boolean };
  ready?: boolean | { get(): boolean };
}

function readClusterFlag(value: boolean | { get(): boolean } | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return value.get();
}

/**
 * Normalizes a cluster connection source into plain values. Reading the observable box happens
 * during render, so MobX tracks the dependency and the view reacts to connectivity changes.
 */
export function toClusterConnectionState(cluster?: ClusterObservableLike): ClusterConnectionState | undefined {
  if (!cluster) {
    return undefined;
  }

  return {
    id: cluster.id,
    disconnected: readClusterFlag(cluster.disconnected),
    online: readClusterFlag(cluster.online),
    accessible: readClusterFlag(cluster.accessible),
    ready: readClusterFlag(cluster.ready),
  };
}

export type StoreLoadState =
  /** The store is not available at all (not injected / not in a cluster frame). */
  | "absent"
  /** The store is currently loading. */
  | "loading"
  /** The store failed to load (RBAC or transport error). */
  | "failed"
  /** The store exists but never completed a load (not initialized). */
  | "not-loaded"
  /** The store completed at least one load. */
  | "loaded";

export interface StoreStateDetail {
  state: StoreLoadState;
  /** True when the failure is an explicit RBAC denial (HTTP 403). */
  isPermissionDenied: boolean;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const status = (error as { status?: unknown }).status;

  if (typeof statusCode === "number") {
    return statusCode;
  }

  if (typeof status === "number") {
    return status;
  }

  return undefined;
}

/**
 * Derives the load state of a Kubernetes object store.
 *
 * A store that was never loaded ("not-loaded") or that is not available ("absent") must never be
 * interpreted as "there is no data" (which would produce a false Default Allow): both mean the
 * data set is unknown.
 */
export function getStoreLoadState(store?: StoreStateProbe): StoreStateDetail {
  if (!store) {
    return { state: "absent", isPermissionDenied: false };
  }

  const statusCode = getErrorStatusCode(store.lastError);
  const isPermissionDenied = statusCode === 403;

  if (store.failedLoading) {
    return { state: "failed", isPermissionDenied };
  }

  if (isPermissionDenied) {
    return { state: "failed", isPermissionDenied: true };
  }

  if (store.isLoading) {
    return { state: "loading", isPermissionDenied: false };
  }

  if (store.isLoaded) {
    return { state: "loaded", isPermissionDenied: false };
  }

  return { state: "not-loaded", isPermissionDenied: false };
}

export interface EvaluationStateInput {
  cluster?: ClusterConnectionState;
  /**
   * Stores required for this evaluation. Only the listed stores are considered: a store that is
   * out of scope for a view is not a source of uncertainty for that view. A listed store that is
   * absent or never loaded IS a source of uncertainty (unknown state).
   */
  stores: { name: string; probe?: StoreStateProbe }[];
}

export type EvaluationStateCause =
  | "cluster-disconnected"
  | "cluster-connecting"
  | "cluster-inaccessible"
  | "store-permission-denied"
  | "store-partial"
  | "store-loading"
  | "store-unavailable";

export interface EvaluationStateResult {
  state: DataEvaluationState;
  /** Human readable explanation of the derived state, surfaced in the UI. */
  reason?: string;
  /** Origin of the state, so the UI can describe the precise cause. */
  cause?: EvaluationStateCause;
}

/**
 * Derives the evaluation state used by the engine, from the authentic store and cluster state.
 *
 * Precedence (fail-closed, most decisive first):
 * 1. Cluster disconnected -> "disconnected".
 * 2. Any store failed with an RBAC 403 -> "permission-denied".
 * 3. Any store failed with another error -> "partial-data" (incomplete listing).
 * 4. Any store still loading -> "loading".
 * 5. Any store absent or never loaded -> "unknown" (never Default Allow).
 * 6. Otherwise -> "ready".
 */
export function deriveEvaluationState(input: EvaluationStateInput): EvaluationStateResult {
  const { cluster, stores } = input;

  if (cluster?.disconnected) {
    return {
      state: "disconnected",
      cause: "cluster-disconnected",
      reason: "El clúster está desconectado: no hay comunicación activa con la API de Kubernetes.",
    };
  }

  // Connection in progress: the cluster has not been detected as online yet. Nothing can be
  // asserted about connectivity or permissions while the handshake is still running.
  if (cluster?.online === false) {
    return {
      state: "loading",
      cause: "cluster-connecting",
      reason: "La conexión con el clúster todavía no está establecida.",
    };
  }

  // Reachable but not accessible: the cluster answered, but access was not granted.
  // `disconnected === false` alone does NOT mean the cluster is usable.
  if (cluster?.accessible === false) {
    return {
      state: "permission-denied",
      cause: "cluster-inaccessible",
      reason: "El clúster responde pero el acceso no fue concedido: no se puede afirmar ningún permiso.",
    };
  }

  for (const { name, probe } of stores) {
    const detail = getStoreLoadState(probe);

    if (detail.isPermissionDenied) {
      return {
        state: "permission-denied",
        cause: "store-permission-denied",
        reason: `Permisos RBAC insuficientes para listar ${name} (HTTP 403).`,
      };
    }
  }

  for (const { name, probe } of stores) {
    const detail = getStoreLoadState(probe);

    if (detail.state === "failed") {
      return {
        state: "partial-data",
        cause: "store-partial",
        reason: `No se pudo listar ${name}: el listado está incompleto.`,
      };
    }
  }

  for (const { name, probe } of stores) {
    const detail = getStoreLoadState(probe);

    if (detail.state === "loading") {
      return {
        state: "loading",
        cause: "store-loading",
        reason: `Cargando ${name} desde el clúster.`,
      };
    }
  }

  for (const { name, probe } of stores) {
    const detail = getStoreLoadState(probe);

    if (detail.state === "absent" || detail.state === "not-loaded") {
      return {
        state: "unknown",
        cause: "store-unavailable",
        reason: detail.state === "absent"
          ? `El store de ${name} no está disponible: no se puede afirmar el estado de la conectividad.`
          : `El store de ${name} todavía no se inicializó: no se puede afirmar el estado de la conectividad.`,
      };
    }
  }

  return { state: "ready" };
}

/**
 * Instance tokens: Kubernetes objects are plain (non observable) instances, so MobX can only
 * track the membership of a store collection. A token per instance lets a signature detect that
 * the store re-delivered the same logical resources with fresh instances (a reload) even when
 * identifiers and resource versions did not change.
 */
const instanceTokens = new WeakMap<object, number>();
let nextInstanceToken = 1;

function getInstanceToken(instance: object): number {
  const existing = instanceTokens.get(instance);

  if (existing !== undefined) {
    return existing;
  }

  const token = nextInstanceToken++;

  instanceTokens.set(instance, token);

  return token;
}

interface SignatureItem {
  getId?(): string;
  getResourceVersion?(): string;
  getNs?(): string;
  metadata?: { labels?: Record<string, string> };
  status?: { podIP?: string };
  spec?: unknown;
}

function digestItem(item: SignatureItem, withSpec: boolean): string {
  const id = item.getId?.() ?? "";
  const resourceVersion = item.getResourceVersion?.() ?? "";
  const labels = item.metadata?.labels ?? {};
  const labelKeys = Object.keys(labels).sort();

  const token = getInstanceToken(item as unknown as object);
  const labelDigest = labelKeys.map(key => `${key}=${labels[key]}`).join(",");

  if (!withSpec) {
    return `${id}@${resourceVersion}#${token}:${labelDigest}`;
  }

  let spec = "";

  try {
    spec = JSON.stringify(item.spec ?? null);
  } catch {
    spec = "unserializable";
  }

  return `${id}@${resourceVersion}#${token}:${labelDigest}:${spec}`;
}

/**
 * Content signature of a store collection.
 *
 * The signature changes whenever the collection membership changes, whenever a resource is
 * re-delivered with a fresh instance, or whenever the labels / spec of a resource change. It is
 * used as a memoization key so expensive evaluations are recomputed when the data really changed
 * and not on every render.
 */
export function computeItemsSignature(items: readonly unknown[] | undefined, withSpec = false): string {
  if (!items?.length) {
    return "empty";
  }

  const parts: string[] = [];

  for (const item of items) {
    parts.push(digestItem(item as SignatureItem, withSpec));
  }

  return `${items.length}#${parts.join("|")}`;
}

export interface StoreFreshnessInput {
  /** Content signature of the collection held by the store. */
  signature: string;
  /** Current loading flag of the store: the transition true -> false is a confirmed load. */
  isLoading: boolean;
  /**
   * True when the last load attempt of the store failed or was aborted. A failed or aborted load
   * never certifies fresh data. Both `failedLoading` and `lastError` are cleared by the store
   * when a load succeeds.
   */
  loadFailed?: boolean;
  /** Identity of the cluster the data belongs to. */
  clusterId?: string;
  /** True while the cluster connection is unusable (disconnected or still connecting). */
  connectionLost: boolean;
}

interface StoreFreshnessState {
  signature: string;
  isLoading?: boolean;
  clusterId?: string;
  stale: boolean;
  /** Set when the cluster changed: the store must confirm a reload before it is trusted again. */
  awaitingReload: boolean;
}

/**
 * Tracks, per store, whether the data it holds can still be trusted.
 *
 * Each store is tracked independently: a store is only certified as fresh by a delivery of ITS
 * OWN resources (content change) or by a confirmed load cycle of ITS OWN store
 * (isLoading true -> false). A change exclusive to another store (for example new Pods) can
 * never certify the freshness of the NetworkPolicies.
 *
 * The cluster identity is part of the tracking: when the cluster changes, the resources still
 * held by the stores belong to the previous cluster and every store becomes stale until it
 * confirms a reload.
 */
export class DataFreshnessTracker {
  private readonly stores = new Map<string, StoreFreshnessState>();

  /**
   * @param key Identifier of the store (each store is tracked independently).
   * @param input Verifiable load and update signals of that store.
   * @returns True when the data of that store must be considered stale.
   */
  updateStore(key: string, input: StoreFreshnessInput): boolean {
    let state = this.stores.get(key);

    if (!state) {
      state = { signature: "", stale: false, awaitingReload: false };
      this.stores.set(key, state);
    }

    const loadCompleted = state.isLoading === true && !input.isLoading;
    const clusterChanged = state.clusterId !== undefined && state.clusterId !== input.clusterId;
    const contentChanged = state.signature !== input.signature;
    const loadFailed = Boolean(input.loadFailed);

    if (clusterChanged) {
      // The resources held by the store belong to the previous cluster: only a confirmed reload
      // of THIS store can certify them again.
      state.awaitingReload = true;
      state.stale = true;
    }

    if (input.connectionLost) {
      // A lost connection ALWAYS keeps the data stale. Neither a content change nor a load that
      // finished during the outage can certify it: the completion signal is discarded, so the
      // store must start a new load once the connection is restored.
      state.stale = true;
    } else if (loadFailed) {
      // A failed or aborted load never certifies fresh data.
      state.stale = true;
    } else if (loadCompleted) {
      // Verified successful reload: the load finished while connected and did not fail.
      state.stale = false;
      state.awaitingReload = false;
    } else if (contentChanged && !state.awaitingReload) {
      // A valid update delivered by this store while the connection is healthy.
      state.stale = false;
    }

    state.signature = input.signature;
    state.isLoading = input.isLoading;
    state.clusterId = input.clusterId;

    return state.stale;
  }

  /**
   * @param key Identifier of the store.
   * @returns True when the data of that store must be considered stale.
   */
  isStale(key: string): boolean {
    return this.stores.get(key)?.stale ?? false;
  }

  /**
   * @returns True when at least one of the tracked stores holds stale data.
   */
  isAnyStale(): boolean {
    for (const state of this.stores.values()) {
      if (state.stale) {
        return true;
      }
    }

    return false;
  }

  reset(): void {
    this.stores.clear();
  }
}
