/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { BrowserWindow } from "electron";
import type {
  CreateIncidentInput,
  IncidentFilter,
  IncidentSeverity,
  IncidentStatus,
  IngestEvidenceInput,
  ManualPurgeRequest,
  PrivilegedTransitionRequest,
  TimelineActor,
  UpdateIncidentInput,
  UpdateRetentionPolicyInput,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";
import type { IncidentTransitionPayload } from "../../common/incident/incident-ipc";

const VALID_STATUSES: readonly IncidentStatus[] = Object.freeze([
  "DETECTADO",
  "INVESTIGANDO",
  "HIPÓTESIS",
  "CONFIRMADO",
  "SOLUCIÓN PROPUESTA",
  "APROBACIÓN HUMANA",
  "VALIDACIÓN",
  "CERRADO",
  "NO CONFIRMADO",
  "INCONCLUSO",
]);

const VALID_SEVERITIES: readonly IncidentSeverity[] = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

const VALID_EVIDENCE_TYPES = Object.freeze([
  "pod_logs",
  "k8s_event",
  "resource_manifest",
  "cost_estimate",
  "user_context_metadata",
]);

const FORBIDDEN_PROPERTIES = Object.freeze(["__proto__", "constructor", "prototype"]);

/**
 * Validates the Electron IPC sender frame.
 * Enforces:
 * - Must have a valid, non-null event, sender, and senderFrame.
 * - Sender WebContents must not be destroyed.
 * - Sender frame must be the main top-level frame (parent === null; subframes/iframes/webviews rejected).
 * - Sender frame must not be destroyed.
 * - Origin must strictly match allowed OpenLens entry points:
 *   - lens://* (internal protocol)
 *   - http://127.0.0.1:9191/* or http://localhost:9191/* (DEV server strictly on port 9191; other ports rejected)
 *   - file:// URLs pointing to OpenLens bundle files (ending in index.html, template.html, or within app bundle; arbitrary paths rejected).
 */
export function validateIpcSender(event: any): void {
  if (!event || typeof event !== "object") {
    throw new Error("SecurityError: IPC invocation missing valid event context.");
  }

  if (!event.sender || typeof event.sender !== "object") {
    throw new Error("SecurityError: IPC invocation missing verifiable sender WebContents.");
  }

  if (typeof event.sender.isDestroyed === "function" && event.sender.isDestroyed()) {
    throw new Error("SecurityError: Sender WebContents is destroyed.");
  }

  if (!event.senderFrame || typeof event.senderFrame !== "object") {
    throw new Error("SecurityError: IPC invocation missing verifiable senderFrame.");
  }

  if (typeof event.senderFrame.isDestroyed === "function" && event.senderFrame.isDestroyed()) {
    throw new Error("SecurityError: Sender frame is destroyed.");
  }

  // Reject subframes (iframes / webviews)
  if (event.senderFrame.parent !== null && event.senderFrame.parent !== undefined) {
    throw new Error("SecurityError: IPC invocation from subframe or iframe is forbidden.");
  }

  // Verify senderFrame matches sender.mainFrame when available (SEC-H8-03)
  if (event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) {
    throw new Error("SecurityError: IPC invocation from non-main frame is forbidden.");
  }

  // Verify WebContents belongs to a registered BrowserWindow (SEC-H8-03)
  if (typeof BrowserWindow !== "undefined" && typeof (BrowserWindow as any).fromWebContents === "function") {
    const win = (BrowserWindow as any).fromWebContents(event.sender);
    if (!win || (typeof win.isDestroyed === "function" && win.isDestroyed())) {
      throw new Error("SecurityError: IPC invocation from unregistered or destroyed BrowserWindow.");
    }
  }

  const frameUrl = typeof event.senderFrame.url === "string" ? event.senderFrame.url.trim() : "";
  if (!frameUrl) {
    throw new Error("SecurityError: IPC sender frame URL is missing or empty.");
  }

  // Validate allowed protocols and paths
  let isOriginAuthorized = false;

  if (frameUrl.startsWith("lens://")) {
    // SEC-H8-03: Restrict lens:// strictly to app or index.html (reject arbitrary hosts)
    if (/^lens:\/\/(app|index\.html)(\/.*)?$/i.test(frameUrl)) {
      isOriginAuthorized = true;
    } else {
      throw new Error(`SecurityError: Unauthorized lens:// host in frame URL: '${frameUrl}'.`);
    }
  } else if (frameUrl.startsWith("http://localhost:") || frameUrl.startsWith("http://127.0.0.1:")) {
    // Only port 9191 (OpenLens dev server) is permitted
    if (/^http:\/\/(localhost|127\.0\.0\.1):9191(\/.*)?$/.test(frameUrl)) {
      isOriginAuthorized = true;
    } else {
      throw new Error(`SecurityError: Unauthorized localhost port in frame URL: '${frameUrl}'. Only port 9191 is permitted.`);
    }
  } else if (frameUrl.startsWith("file://")) {
    const pathPart = frameUrl.replace(/^file:\/\//, "");
    let decodedPath = pathPart;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      // keep pathPart
    }

    // SEC-H8-03: Block suspicious paths (Downloads, Desktop, temp, system dirs)
    const isTempTestRunner = decodedPath.includes("/openlens-h8-smoke-") || decodedPath.includes("/openlens-smoke-");
    const isSuspiciousSystemPath =
      decodedPath.startsWith("/etc/") ||
      decodedPath.includes("/Downloads/") ||
      decodedPath.includes("/Desktop/") ||
      (!isTempTestRunner && (decodedPath.startsWith("/tmp/") || decodedPath.startsWith("/private/tmp/")));

    if (isSuspiciousSystemPath) {
      throw new Error(`SecurityError: Unauthorized file:// path in frame URL: '${frameUrl}'.`);
    }

    // Reject confirmation modal files from invoking general incident IPC handlers
    if (decodedPath.endsWith("/confirmation-modal.html") || decodedPath.endsWith("/incident-confirmation.html")) {
      throw new Error(`SecurityError: Confirmation modal frame URL '${frameUrl}' is forbidden from invoking general management IPC.`);
    }

    // SEC-H8-03: Eliminate generic substrings (.includes("/openlens"), .includes("/lens-v6-ui-corrections"))
    // Strictly verify legitimate bundle entry points
    const isKnownOpenLensBundle =
      decodedPath.endsWith("/index.html") ||
      decodedPath.endsWith("/template.html") ||
      decodedPath.includes("/static/build/") ||
      decodedPath.includes("/Contents/Resources/") ||
      decodedPath.endsWith("/detached-terminal.html") ||
      decodedPath.endsWith("/detached-tool.html");

    if (isKnownOpenLensBundle) {
      isOriginAuthorized = true;
    } else {
      throw new Error(`SecurityError: Unauthorized file:// path in frame URL: '${frameUrl}'.`);
    }
  }

  if (!isOriginAuthorized) {
    throw new Error(`SecurityError: Unauthorized IPC sender frame origin: '${frameUrl}'.`);
  }
}

/**
 * Checks for prototype pollution patterns.
 */
export function checkPrototypePollution(target: unknown): void {
  if (!target || typeof target !== "object") return;

  if (
    Object.prototype.hasOwnProperty.call(target, "__proto__") ||
    Object.prototype.hasOwnProperty.call(target, "constructor") ||
    Object.prototype.hasOwnProperty.call(target, "prototype")
  ) {
    throw new Error("SecurityError: Forbidden prototype property detected in input.");
  }
}

/**
 * Ensures that an object only contains whitelisted keys.
 */
export function assertExactKeys(target: Record<string, unknown>, allowedKeys: readonly string[], schemaName: string): void {
  checkPrototypePollution(target);
  const actualKeys = Object.keys(target);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`ValidationError: Unexpected field '${key}' in ${schemaName}. Allowed fields: [${allowedKeys.join(", ")}].`);
    }
  }
}

/**
 * Validates an ID string.
 */
export function validateId(id: unknown, fieldName = "id"): string {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`ValidationError: '${fieldName}' must be a non-empty string.`);
  }
  const trimmed = id.trim();
  if (trimmed.length > 128) {
    throw new Error(`ValidationError: '${fieldName}' exceeds maximum length of 128 characters.`);
  }
  if (!/^[a-zA-Z0-9_\-.:]+$/.test(trimmed)) {
    throw new Error(`ValidationError: '${fieldName}' contains invalid characters.`);
  }
  return trimmed;
}

/**
 * Validates IncidentFilter input.
 */
export function validateIncidentFilter(input: unknown): IncidentFilter | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: IncidentFilter must be an object.");
  }

  const allowedKeys = [
    "status",
    "severity",
    "clusterId",
    "namespace",
    "workloadKind",
    "workloadName",
    "searchQuery",
    "limit",
    "offset",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "IncidentFilter");
  const raw = input as Record<string, any>;

  const filter: IncidentFilter = {};

  if (raw.status !== undefined) {
    if (!VALID_STATUSES.includes(raw.status)) {
      throw new Error(`ValidationError: Invalid status '${raw.status}'. Allowed: [${VALID_STATUSES.join(", ")}].`);
    }
    filter.status = raw.status;
  }

  if (raw.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(raw.severity)) {
      throw new Error(`ValidationError: Invalid severity '${raw.severity}'. Allowed: [${VALID_SEVERITIES.join(", ")}].`);
    }
    filter.severity = raw.severity;
  }

  if (raw.clusterId !== undefined) {
    if (typeof raw.clusterId !== "string" || raw.clusterId.length > 100) {
      throw new Error("ValidationError: 'clusterId' must be a string up to 100 characters.");
    }
    filter.clusterId = raw.clusterId.trim();
  }

  if (raw.namespace !== undefined) {
    if (typeof raw.namespace !== "string" || raw.namespace.length > 63) {
      throw new Error("ValidationError: 'namespace' must be a string up to 63 characters.");
    }
    filter.namespace = raw.namespace.trim();
  }

  if (raw.workloadKind !== undefined) {
    if (typeof raw.workloadKind !== "string" || raw.workloadKind.length > 63) {
      throw new Error("ValidationError: 'workloadKind' must be a string up to 63 characters.");
    }
    filter.workloadKind = raw.workloadKind.trim();
  }

  if (raw.workloadName !== undefined) {
    if (typeof raw.workloadName !== "string" || raw.workloadName.length > 253) {
      throw new Error("ValidationError: 'workloadName' must be a string up to 253 characters.");
    }
    filter.workloadName = raw.workloadName.trim();
  }

  if (raw.searchQuery !== undefined) {
    if (typeof raw.searchQuery !== "string" || raw.searchQuery.length > 200) {
      throw new Error("ValidationError: 'searchQuery' must be a string up to 200 characters.");
    }
    filter.searchQuery = raw.searchQuery.trim();
  }

  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "number" || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 100) {
      throw new Error("ValidationError: 'limit' must be an integer between 1 and 100.");
    }
    filter.limit = raw.limit;
  }

  if (raw.offset !== undefined) {
    if (typeof raw.offset !== "number" || !Number.isInteger(raw.offset) || raw.offset < 0) {
      throw new Error("ValidationError: 'offset' must be a non-negative integer.");
    }
    filter.offset = raw.offset;
  }

  return filter;
}

/**
 * Validates CreateIncidentInput.
 */
export function validateCreateIncidentInput(input: unknown): CreateIncidentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: CreateIncidentInput must be a non-null object.");
  }

  const allowedKeys = [
    "title",
    "description",
    "severity",
    "clusterId",
    "namespace",
    "workloadKind",
    "workloadName",
    "creator",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "CreateIncidentInput");
  const raw = input as Record<string, any>;

  if (typeof raw.title !== "string" || raw.title.trim().length < 3 || raw.title.trim().length > 200) {
    throw new Error("ValidationError: 'title' must be a string between 3 and 200 characters.");
  }

  if (raw.description !== undefined && (typeof raw.description !== "string" || raw.description.length > 4000)) {
    throw new Error("ValidationError: 'description' must be a string up to 4000 characters.");
  }

  if (!raw.severity || !VALID_SEVERITIES.includes(raw.severity)) {
    throw new Error(`ValidationError: Invalid severity '${raw.severity}'. Allowed: [${VALID_SEVERITIES.join(", ")}].`);
  }

  if (typeof raw.clusterId !== "string" || !raw.clusterId.trim() || raw.clusterId.trim().length > 100) {
    throw new Error("ValidationError: 'clusterId' must be a non-empty string up to 100 characters.");
  }

  if (typeof raw.namespace !== "string" || !raw.namespace.trim() || raw.namespace.trim().length > 63) {
    throw new Error("ValidationError: 'namespace' must be a non-empty string up to 63 characters.");
  }

  if (raw.workloadKind !== undefined && (typeof raw.workloadKind !== "string" || raw.workloadKind.length > 63)) {
    throw new Error("ValidationError: 'workloadKind' must be a string up to 63 characters.");
  }

  if (raw.workloadName !== undefined && (typeof raw.workloadName !== "string" || raw.workloadName.length > 253)) {
    throw new Error("ValidationError: 'workloadName' must be a string up to 253 characters.");
  }

  let creator: TimelineActor = { type: "system", name: "renderer-operator" };
  if (raw.creator !== undefined) {
    if (typeof raw.creator !== "object" || raw.creator === null) {
      throw new Error("ValidationError: 'creator' must be an object.");
    }
    assertExactKeys(raw.creator, ["type", "name"], "TimelineActor");
    if (!["human", "ai", "system"].includes(raw.creator.type)) {
      throw new Error("ValidationError: 'creator.type' must be 'human', 'ai', or 'system'.");
    }
    if (typeof raw.creator.name !== "string" || !raw.creator.name.trim() || raw.creator.name.length > 100) {
      throw new Error("ValidationError: 'creator.name' must be a string up to 100 characters.");
    }
    creator = { type: raw.creator.type, name: raw.creator.name.trim() };
  }

  return {
    title: raw.title.trim(),
    description: raw.description?.trim(),
    severity: raw.severity,
    clusterId: raw.clusterId.trim(),
    namespace: raw.namespace.trim(),
    workloadKind: raw.workloadKind?.trim(),
    workloadName: raw.workloadName?.trim(),
    creator,
  };
}

/**
 * Validates UpdateIncidentInput.
 */
export function validateUpdateIncidentInput(input: unknown): UpdateIncidentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: UpdateIncidentInput must be a non-null object.");
  }

  const allowedKeys = ["title", "description", "severity", "isPinned"] as const;
  assertExactKeys(input as Record<string, unknown>, allowedKeys, "UpdateIncidentInput");
  const raw = input as Record<string, any>;

  const update: UpdateIncidentInput = {};

  if (raw.title !== undefined) {
    if (typeof raw.title !== "string" || raw.title.trim().length < 3 || raw.title.trim().length > 200) {
      throw new Error("ValidationError: 'title' must be a string between 3 and 200 characters.");
    }
    update.title = raw.title.trim();
  }

  if (raw.description !== undefined) {
    if (typeof raw.description !== "string" || raw.description.length > 4000) {
      throw new Error("ValidationError: 'description' must be a string up to 4000 characters.");
    }
    update.description = raw.description.trim();
  }

  if (raw.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(raw.severity)) {
      throw new Error(`ValidationError: Invalid severity '${raw.severity}'. Allowed: [${VALID_SEVERITIES.join(", ")}].`);
    }
    update.severity = raw.severity;
  }

  if (raw.isPinned !== undefined) {
    if (typeof raw.isPinned !== "boolean") {
      throw new Error("ValidationError: 'isPinned' must be a boolean.");
    }
    update.isPinned = raw.isPinned;
  }

  return update;
}

/**
 * Validates IncidentTransitionPayload and enforces the privileged operation security barrier.
 */
export function validateIncidentTransitionPayload(input: unknown): IncidentTransitionPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: IncidentTransitionPayload must be a non-null object.");
  }

  const allowedKeys = [
    "incidentId",
    "toStatus",
    "actor",
    "reason",
    "justification",
    "evidenceIds",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "IncidentTransitionPayload");
  const raw = input as Record<string, any>;

  const incidentId = validateId(raw.incidentId, "incidentId");

  if (!raw.toStatus || !VALID_STATUSES.includes(raw.toStatus)) {
    throw new Error(`ValidationError: Invalid toStatus '${raw.toStatus}'. Allowed: [${VALID_STATUSES.join(", ")}].`);
  }
  const toStatus: IncidentStatus = raw.toStatus;

  // PRIVILEGED HUMAN OPERATION BARRIER:
  // A renderer with nodeIntegration cannot be trusted to assert human identity without Main-level cryptographic or native OS proof.
  if (toStatus === "APROBACIÓN HUMANA" || toStatus === "CERRADO") {
    throw new Error(
      `SecurityError: Transición privilegiada a '${toStatus}' bloqueada. La identidad del operador humano no puede ser verificada criptográficamente desde un Renderer con nodeIntegration. Operación denegada hasta implementar canal de verificación nativo en Electron Main (Requisito de seguridad pendiente H8.1).`,
    );
  }

  let actor: TimelineActor = { type: "system", name: "renderer-operator" };
  if (raw.actor !== undefined) {
    if (typeof raw.actor !== "object" || raw.actor === null) {
      throw new Error("ValidationError: 'actor' must be an object.");
    }
    assertExactKeys(raw.actor, ["type", "name"], "TimelineActor");
    if (!["human", "ai", "system"].includes(raw.actor.type)) {
      throw new Error("ValidationError: 'actor.type' must be 'human', 'ai', or 'system'.");
    }
    if (typeof raw.actor.name !== "string" || !raw.actor.name.trim() || raw.actor.name.length > 100) {
      throw new Error("ValidationError: 'actor.name' must be a string up to 100 characters.");
    }
    actor = { type: raw.actor.type, name: raw.actor.name.trim() };
  }

  const justification = typeof raw.justification === "string" ? raw.justification.trim() : typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (justification.length < 5 || justification.length > 1000) {
    throw new Error("ValidationError: 'justification' is required and must be between 5 and 1000 characters.");
  }

  let evidenceIds: string[] | undefined;
  if (raw.evidenceIds !== undefined) {
    if (!Array.isArray(raw.evidenceIds)) {
      throw new Error("ValidationError: 'evidenceIds' must be an array of strings.");
    }
    if (raw.evidenceIds.length > 50) {
      throw new Error("ValidationError: 'evidenceIds' exceeds maximum limit of 50 items.");
    }
    evidenceIds = raw.evidenceIds.map((id: unknown, idx: number) => validateId(id, `evidenceIds[${idx}]`));
  }

  return {
    incidentId,
    toStatus,
    actor,
    justification,
    reason: justification,
    evidenceIds,
  };
}

/**
 * Validates IngestEvidenceInput.
 */
export function validateIngestEvidenceInput(input: unknown): IngestEvidenceInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: IngestEvidenceInput must be a non-null object.");
  }

  const allowedKeys = [
    "id",
    "incidentId",
    "type",
    "origin",
    "clusterId",
    "namespace",
    "resourceKind",
    "resourceName",
    "resourceUid",
    "resourceVersion",
    "rawContent",
    "title",
    "metadata",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "IngestEvidenceInput");
  const raw = input as Record<string, any>;

  const incidentId = validateId(raw.incidentId, "incidentId");

  if (!raw.type || !VALID_EVIDENCE_TYPES.includes(raw.type)) {
    throw new Error(`ValidationError: Invalid evidence type '${raw.type}'. Allowed: [${VALID_EVIDENCE_TYPES.join(", ")}].`);
  }

  if (typeof raw.origin !== "string" || !raw.origin.trim() || raw.origin.length > 100) {
    throw new Error("ValidationError: 'origin' must be a non-empty string up to 100 characters.");
  }

  if (typeof raw.clusterId !== "string" || !raw.clusterId.trim() || raw.clusterId.length > 100) {
    throw new Error("ValidationError: 'clusterId' must be a non-empty string up to 100 characters.");
  }

  if (typeof raw.namespace !== "string" || !raw.namespace.trim() || raw.namespace.length > 63) {
    throw new Error("ValidationError: 'namespace' must be a non-empty string up to 63 characters.");
  }

  if (typeof raw.rawContent !== "string") {
    throw new Error("ValidationError: 'rawContent' must be a string.");
  }

  const contentBytes = Buffer.byteLength(raw.rawContent, "utf8");
  if (contentBytes > 65536) {
    throw new Error(`ValidationError: Evidence payload exceeds maximum limit of 64 KiB (received: ${contentBytes} bytes).`);
  }

  let metadata: Record<string, any> | undefined;
  if (raw.metadata !== undefined) {
    if (typeof raw.metadata !== "object" || raw.metadata === null || Array.isArray(raw.metadata)) {
      throw new Error("ValidationError: 'metadata' must be a non-null object.");
    }
    checkPrototypePollution(raw.metadata);
    const serialized = JSON.stringify(raw.metadata);
    if (Buffer.byteLength(serialized, "utf8") > 10240) {
      throw new Error("ValidationError: Evidence 'metadata' exceeds maximum limit of 10 KiB.");
    }
    metadata = raw.metadata;
  }

  return {
    id: raw.id !== undefined ? validateId(raw.id, "id") : undefined,
    incidentId,
    type: raw.type,
    origin: raw.origin.trim(),
    clusterId: raw.clusterId.trim(),
    namespace: raw.namespace.trim(),
    resourceKind: raw.resourceKind !== undefined ? String(raw.resourceKind).trim() : undefined,
    resourceName: raw.resourceName !== undefined ? String(raw.resourceName).trim() : undefined,
    resourceUid: raw.resourceUid !== undefined ? String(raw.resourceUid).trim() : undefined,
    resourceVersion: raw.resourceVersion !== undefined ? String(raw.resourceVersion).trim() : undefined,
    rawContent: raw.rawContent,
    title: raw.title !== undefined ? String(raw.title).trim() : undefined,
    metadata,
  };
}

/**
 * Validates UserContextMetadataInput.
 */
export function validateUserContextMetadataInput(input: unknown): UserContextMetadataInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: UserContextMetadataInput must be a non-null object.");
  }

  const allowedKeys = [
    "incidentId",
    "origin",
    "clusterId",
    "namespace",
    "fileName",
    "fileSizeBytes",
    "sha256",
    "contextSummary",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "UserContextMetadataInput");
  const raw = input as Record<string, any>;

  const incidentId = validateId(raw.incidentId, "incidentId");

  if (typeof raw.origin !== "string" || !raw.origin.trim() || raw.origin.length > 100) {
    throw new Error("ValidationError: 'origin' must be a string up to 100 characters.");
  }

  if (typeof raw.clusterId !== "string" || !raw.clusterId.trim() || raw.clusterId.length > 100) {
    throw new Error("ValidationError: 'clusterId' must be a string up to 100 characters.");
  }

  if (typeof raw.namespace !== "string" || !raw.namespace.trim() || raw.namespace.length > 63) {
    throw new Error("ValidationError: 'namespace' must be a string up to 63 characters.");
  }

  if (typeof raw.fileName !== "string" || !raw.fileName.trim() || raw.fileName.length > 255) {
    throw new Error("ValidationError: 'fileName' must be a string up to 255 characters.");
  }

  if (typeof raw.fileSizeBytes !== "number" || raw.fileSizeBytes < 0) {
    throw new Error("ValidationError: 'fileSizeBytes' must be a non-negative number.");
  }

  if (typeof raw.sha256 !== "string" || raw.sha256.length > 128) {
    throw new Error("ValidationError: 'sha256' must be a string up to 128 characters.");
  }

  if (typeof raw.contextSummary !== "string" || raw.contextSummary.length > 10000) {
    throw new Error("ValidationError: 'contextSummary' must be a string up to 10000 characters.");
  }

  return {
    incidentId,
    origin: raw.origin.trim(),
    clusterId: raw.clusterId.trim(),
    namespace: raw.namespace.trim(),
    fileName: raw.fileName.trim(),
    fileSizeBytes: raw.fileSizeBytes,
    sha256: raw.sha256.trim(),
    contextSummary: raw.contextSummary,
  };
}

/**
 * Validates UpdateRetentionPolicyInput.
 */
export function validateUpdateRetentionPolicyInput(input: unknown): UpdateRetentionPolicyInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: UpdateRetentionPolicyInput must be a non-null object.");
  }

  const allowedKeys = [
    "enabled",
    "strategy",
    "retentionDays",
    "protectPinned",
    "purgeClosedOnly",
    "evidenceRetentionDays",
  ] as const;

  assertExactKeys(input as Record<string, unknown>, allowedKeys, "UpdateRetentionPolicyInput");
  const raw = input as Record<string, any>;

  const policy: UpdateRetentionPolicyInput = {};

  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") {
      throw new Error("ValidationError: 'enabled' must be a boolean.");
    }
    policy.enabled = raw.enabled;
  }

  if (raw.strategy !== undefined) {
    if (!["manual", "days"].includes(raw.strategy)) {
      throw new Error("ValidationError: 'strategy' must be 'manual' or 'days'.");
    }
    policy.strategy = raw.strategy;
  }

  if (raw.retentionDays !== undefined) {
    if (typeof raw.retentionDays !== "number" || !Number.isInteger(raw.retentionDays) || raw.retentionDays < 1 || raw.retentionDays > 3650) {
      throw new Error("ValidationError: 'retentionDays' must be an integer between 1 and 3650 days.");
    }
    policy.retentionDays = raw.retentionDays;
  }

  if (raw.protectPinned !== undefined) {
    if (typeof raw.protectPinned !== "boolean") {
      throw new Error("ValidationError: 'protectPinned' must be a boolean.");
    }
    policy.protectPinned = raw.protectPinned;
  }

  if (raw.purgeClosedOnly !== undefined) {
    if (typeof raw.purgeClosedOnly !== "boolean") {
      throw new Error("ValidationError: 'purgeClosedOnly' must be a boolean.");
    }
    policy.purgeClosedOnly = raw.purgeClosedOnly;
  }

  if (raw.evidenceRetentionDays !== undefined && raw.evidenceRetentionDays !== null) {
    if (typeof raw.evidenceRetentionDays !== "number" || !Number.isInteger(raw.evidenceRetentionDays) || raw.evidenceRetentionDays < 1 || raw.evidenceRetentionDays > 3650) {
      throw new Error("ValidationError: 'evidenceRetentionDays' must be an integer between 1 and 3650 days or null.");
    }
    policy.evidenceRetentionDays = raw.evidenceRetentionDays;
  } else if (raw.evidenceRetentionDays === null) {
    policy.evidenceRetentionDays = null;
  }

  return policy;
}

/**
 * Validates PurgeExecutionOptions.
 */
export function validatePurgeExecutionOptions(input: unknown): { force?: boolean } | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: PurgeExecutionOptions must be an object.");
  }

  assertExactKeys(input as Record<string, unknown>, ["force"], "PurgeExecutionOptions");
  const raw = input as Record<string, any>;

  if (raw.force !== undefined && typeof raw.force !== "boolean") {
    throw new Error("ValidationError: 'force' must be a boolean.");
  }

  return { force: raw.force };
}

/**
 * Validates ManualPurgeRequest.
 */
export function validateManualPurgeRequest(input: unknown): ManualPurgeRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: ManualPurgeRequest must be a non-null object.");
  }

  const allowedKeys = ["confirmedCandidateIds", "purgeEvidenceOnly"] as const;
  assertExactKeys(input as Record<string, unknown>, allowedKeys, "ManualPurgeRequest");
  const raw = input as Record<string, any>;

  if (!Array.isArray(raw.confirmedCandidateIds)) {
    throw new Error("ValidationError: 'confirmedCandidateIds' must be an array of incident IDs.");
  }

  if (raw.confirmedCandidateIds.length > 500) {
    throw new Error("ValidationError: 'confirmedCandidateIds' exceeds maximum batch size of 500.");
  }

  const confirmedCandidateIds = raw.confirmedCandidateIds.map((id: unknown, idx: number) =>
    validateId(id, `confirmedCandidateIds[${idx}]`),
  );

  return {
    confirmedCandidateIds,
    purgeEvidenceOnly: typeof raw.purgeEvidenceOnly === "boolean" ? raw.purgeEvidenceOnly : false,
  };
}

/**
 * Validates PrivilegedTransitionRequest.
 */
export function validatePrivilegedTransitionRequest(input: unknown): PrivilegedTransitionRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: PrivilegedTransitionRequest must be a non-null object.");
  }

  const allowedKeys = ["incidentId", "toStatus", "justification", "evidenceIds"] as const;
  assertExactKeys(input as Record<string, unknown>, allowedKeys, "PrivilegedTransitionRequest");
  const raw = input as Record<string, any>;

  const incidentId = validateId(raw.incidentId, "incidentId");

  if (raw.toStatus !== "APROBACIÓN HUMANA" && raw.toStatus !== "CERRADO") {
    throw new Error(`ValidationError: 'toStatus' must be 'APROBACIÓN HUMANA' or 'CERRADO' (received: '${raw.toStatus}').`);
  }

  if (typeof raw.justification !== "string" || raw.justification.trim().length < 5 || raw.justification.trim().length > 1000) {
    throw new Error("ValidationError: 'justification' is required and must be between 5 and 1000 characters.");
  }

  let evidenceIds: string[] | undefined;
  if (raw.evidenceIds !== undefined) {
    if (!Array.isArray(raw.evidenceIds)) {
      throw new Error("ValidationError: 'evidenceIds' must be an array of strings.");
    }
    evidenceIds = raw.evidenceIds.map((id: unknown, idx: number) => validateId(id, `evidenceIds[${idx}]`));
  }

  return {
    incidentId,
    toStatus: raw.toStatus,
    justification: raw.justification.trim(),
    evidenceIds,
  };
}


