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
  IncidentTransitionRequest,
  IngestEvidenceInput,
  ManualPurgeRequest,
  PrivilegedTransitionRequest,
  TimelineActor,
  UpdateIncidentInput,
  UpdateRetentionPolicyInput,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";

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
  } else if (/^https:\/\/lens\.app(:\d+)?(\/.*)?$/i.test(frameUrl)) {
    // Production packaged OpenLens internal loopback server (SEC-H8-03)
    isOriginAuthorized = true;
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

  for (const prop of FORBIDDEN_PROPERTIES) {
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
      throw new Error(`SecurityError: Forbidden prototype property detected in input: ${prop}`);
    }
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
export function validateIncidentTransitionPayload(input: unknown): IncidentTransitionRequest {
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

export interface ValidatedPrepareConsentInput {
  incidentId: string;
  profileId: string;
}

export function validatePrepareConsentInput(raw: unknown): ValidatedPrepareConsentInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ValidationError: input must be a non-null object.");
  }
  const obj = raw as Record<string, unknown>;
  const incidentId = validateId(obj.incidentId, "incidentId");
  const profileId = validateId(obj.profileId, "profileId");

  return { incidentId, profileId };
}

export interface ValidatedExecuteDiagnosisInput {
  incidentId: string;
  profileId: string;
  consentToken: string;
  timeoutMs?: number;
}

export function validateExecuteDiagnosisInput(raw: unknown): ValidatedExecuteDiagnosisInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ValidationError: input must be a non-null object.");
  }
  const obj = raw as Record<string, unknown>;
  const incidentId = validateId(obj.incidentId, "incidentId");
  const profileId = validateId(obj.profileId, "profileId");

  if (typeof obj.consentToken !== "string" || obj.consentToken.trim().length < 16) {
    throw new Error("ValidationError: 'consentToken' must be a valid hex string of at least 16 characters.");
  }

  let timeoutMs: number | undefined;
  if (obj.timeoutMs !== undefined) {
    if (typeof obj.timeoutMs !== "number" || obj.timeoutMs < 1000 || obj.timeoutMs > 120000) {
      throw new Error("ValidationError: 'timeoutMs' must be a number between 1000 and 120000.");
    }
    timeoutMs = obj.timeoutMs;
  }

  return {
    incidentId,
    profileId,
    consentToken: obj.consentToken.trim(),
    timeoutMs,
  };
}

export interface ValidatedVerifyRemediationInput {
  incidentId: string;
  humanOperator: string;
  baselineEvidenceId?: string;
  currentEvidenceId?: string;
}

export function validateVerifyRemediationInput(raw: unknown): ValidatedVerifyRemediationInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ValidationError: input must be a non-null object.");
  }
  const obj = raw as Record<string, unknown>;
  const incidentId = validateId(obj.incidentId, "incidentId");

  if (typeof obj.humanOperator !== "string" || obj.humanOperator.trim().length === 0) {
    throw new Error("ValidationError: 'humanOperator' is required and must not be empty.");
  }

  const baselineEvidenceId = obj.baselineEvidenceId ? validateId(obj.baselineEvidenceId, "baselineEvidenceId") : undefined;
  const currentEvidenceId = obj.currentEvidenceId ? validateId(obj.currentEvidenceId, "currentEvidenceId") : undefined;

  return {
    incidentId,
    humanOperator: obj.humanOperator.trim(),
    baselineEvidenceId,
    currentEvidenceId,
  };
}

export function validateCreateAiProfileInput(raw: unknown): {
  name: string;
  provider: "openai" | "anthropic" | "gemini" | "mock";
  model: string;
  endpoint?: string;
  apiKey: string;
  maxTokensPerRequest?: number;
  maxRequestsPerIncident?: number;
  estimatedCostPer1kTokens?: number;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ValidationError: input must be a non-null object.");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length < 2 || obj.name.trim().length > 100) {
    throw new Error("ValidationError: 'name' is required and must be between 2 and 100 characters.");
  }

  const validProviders = ["openai", "anthropic", "gemini", "mock"];
  if (typeof obj.provider !== "string" || !validProviders.includes(obj.provider)) {
    throw new Error(`ValidationError: 'provider' must be one of: ${validProviders.join(", ")}.`);
  }

  if (typeof obj.model !== "string" || obj.model.trim().length < 1 || obj.model.trim().length > 100) {
    throw new Error("ValidationError: 'model' is required and must be between 1 and 100 characters.");
  }

  let endpoint: string | undefined;
  if (obj.endpoint !== undefined && obj.endpoint !== null) {
    if (typeof obj.endpoint !== "string" || !obj.endpoint.startsWith("https://")) {
      throw new Error("ValidationError: 'endpoint' must be a valid https URL.");
    }
    endpoint = obj.endpoint.trim();
  }

  if (typeof obj.apiKey !== "string" || obj.apiKey.trim().length < 1) {
    throw new Error("ValidationError: 'apiKey' is required and must not be empty.");
  }

  let maxTokensPerRequest: number | undefined;
  if (obj.maxTokensPerRequest !== undefined) {
    if (typeof obj.maxTokensPerRequest !== "number" || obj.maxTokensPerRequest < 100 || obj.maxTokensPerRequest > 65536) {
      throw new Error("ValidationError: 'maxTokensPerRequest' must be a number between 100 and 65536.");
    }
    maxTokensPerRequest = obj.maxTokensPerRequest;
  }

  let maxRequestsPerIncident: number | undefined;
  if (obj.maxRequestsPerIncident !== undefined) {
    if (typeof obj.maxRequestsPerIncident !== "number" || obj.maxRequestsPerIncident < 1 || obj.maxRequestsPerIncident > 200) {
      throw new Error("ValidationError: 'maxRequestsPerIncident' must be a number between 1 and 200.");
    }
    maxRequestsPerIncident = obj.maxRequestsPerIncident;
  }

  let estimatedCostPer1kTokens: number | undefined;
  if (obj.estimatedCostPer1kTokens !== undefined) {
    if (typeof obj.estimatedCostPer1kTokens !== "number" || obj.estimatedCostPer1kTokens < 0) {
      throw new Error("ValidationError: 'estimatedCostPer1kTokens' must be a positive number.");
    }
    estimatedCostPer1kTokens = obj.estimatedCostPer1kTokens;
  }

  return {
    name: obj.name.trim(),
    provider: obj.provider as any,
    model: obj.model.trim(),
    endpoint,
    apiKey: obj.apiKey.trim(),
    maxTokensPerRequest,
    maxRequestsPerIncident,
    estimatedCostPer1kTokens,
  };
}

export function validateUpdateAiProfileInput(raw: unknown): {
  name?: string;
  model?: string;
  endpoint?: string;
  status?: "active" | "disabled" | "revoked";
  maxTokensPerRequest?: number;
  maxRequestsPerIncident?: number;
  estimatedCostPer1kTokens?: number;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ValidationError: input must be a non-null object.");
  }
  const obj = raw as Record<string, unknown>;

  let name: string | undefined;
  if (obj.name !== undefined) {
    if (typeof obj.name !== "string" || obj.name.trim().length < 2 || obj.name.trim().length > 100) {
      throw new Error("ValidationError: 'name' must be between 2 and 100 characters.");
    }
    name = obj.name.trim();
  }

  let model: string | undefined;
  if (obj.model !== undefined) {
    if (typeof obj.model !== "string" || obj.model.trim().length < 1 || obj.model.trim().length > 100) {
      throw new Error("ValidationError: 'model' must be between 1 and 100 characters.");
    }
    model = obj.model.trim();
  }

  let endpoint: string | undefined;
  if (obj.endpoint !== undefined) {
    if (typeof obj.endpoint !== "string" || !obj.endpoint.startsWith("https://")) {
      throw new Error("ValidationError: 'endpoint' must be a valid https URL.");
    }
    endpoint = obj.endpoint.trim();
  }

  let status: "active" | "disabled" | "revoked" | undefined;
  if (obj.status !== undefined) {
    const validStatuses = ["active", "disabled", "revoked"];
    if (typeof obj.status !== "string" || !validStatuses.includes(obj.status)) {
      throw new Error(`ValidationError: 'status' must be one of: ${validStatuses.join(", ")}.`);
    }
    status = obj.status as any;
  }

  let maxTokensPerRequest: number | undefined;
  if (obj.maxTokensPerRequest !== undefined) {
    if (typeof obj.maxTokensPerRequest !== "number" || obj.maxTokensPerRequest < 100 || obj.maxTokensPerRequest > 65536) {
      throw new Error("ValidationError: 'maxTokensPerRequest' must be a number between 100 and 65536.");
    }
    maxTokensPerRequest = obj.maxTokensPerRequest;
  }

  let maxRequestsPerIncident: number | undefined;
  if (obj.maxRequestsPerIncident !== undefined) {
    if (typeof obj.maxRequestsPerIncident !== "number" || obj.maxRequestsPerIncident < 1 || obj.maxRequestsPerIncident > 200) {
      throw new Error("ValidationError: 'maxRequestsPerIncident' must be a number between 1 and 200.");
    }
    maxRequestsPerIncident = obj.maxRequestsPerIncident;
  }

  let estimatedCostPer1kTokens: number | undefined;
  if (obj.estimatedCostPer1kTokens !== undefined) {
    if (typeof obj.estimatedCostPer1kTokens !== "number" || obj.estimatedCostPer1kTokens < 0) {
      throw new Error("ValidationError: 'estimatedCostPer1kTokens' must be a positive number.");
    }
    estimatedCostPer1kTokens = obj.estimatedCostPer1kTokens;
  }

  return {
    name,
    model,
    endpoint,
    status,
    maxTokensPerRequest,
    maxRequestsPerIncident,
    estimatedCostPer1kTokens,
  };
}

/**
 * Validates AddEphemeralFileInput schema (H8.4 / H8-019).
 */
export function validateAddEphemeralFileInput(input: unknown): import("../../common/incident/ephemeral-context-types").AddEphemeralFileInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: AddEphemeralFileInput must be a non-null object.");
  }
  const obj = input as Record<string, unknown>;

  const incidentId = validateId(obj.incidentId, "incidentId");

  if (typeof obj.filename !== "string" || !obj.filename.trim()) {
    throw new Error("ValidationError: 'filename' is required and must be a non-empty string.");
  }
  const filename = obj.filename.trim();

  if (typeof obj.rawContent !== "string" || !obj.rawContent) {
    throw new Error("ValidationError: 'rawContent' is required and must be a non-empty string.");
  }
  const rawContent = obj.rawContent;

  const validTypes: import("../../common/incident/ephemeral-context-types").EphemeralFileType[] = [
    "dockerfile",
    "helm_values",
    "k8s_manifest",
    "config_map",
    "config_file",
    "text_doc",
  ];

  let fileType: import("../../common/incident/ephemeral-context-types").EphemeralFileType | undefined;
  if (obj.fileType !== undefined) {
    if (typeof obj.fileType !== "string" || !validTypes.includes(obj.fileType as any)) {
      throw new Error(`ValidationError: 'fileType' must be one of: [${validTypes.join(", ")}].`);
    }
    fileType = obj.fileType as any;
  }

  let metadata: import("../../common/incident/ephemeral-context-types").AddEphemeralFileInput["metadata"] | undefined;
  if (obj.metadata !== undefined) {
    if (typeof obj.metadata !== "object" || obj.metadata === null || Array.isArray(obj.metadata)) {
      throw new Error("ValidationError: 'metadata' must be a non-null object.");
    }
    const meta = obj.metadata as Record<string, unknown>;
    const validEnvs: import("../../common/incident/ephemeral-context-types").DeclaredEnvironment[] = [
      "development",
      "staging",
      "production",
      "test",
      "unspecified",
    ];

    let environment: import("../../common/incident/ephemeral-context-types").DeclaredEnvironment = "unspecified";
    if (meta.environment !== undefined) {
      if (typeof meta.environment !== "string" || !validEnvs.includes(meta.environment as any)) {
        throw new Error(`ValidationError: 'metadata.environment' must be one of: [${validEnvs.join(", ")}].`);
      }
      environment = meta.environment as any;
    }

    metadata = {
      environment,
      clusterId: typeof meta.clusterId === "string" ? meta.clusterId.trim() : undefined,
      namespace: typeof meta.namespace === "string" ? meta.namespace.trim() : undefined,
      resourceKind: typeof meta.resourceKind === "string" ? meta.resourceKind.trim() : undefined,
      resourceName: typeof meta.resourceName === "string" ? meta.resourceName.trim() : undefined,
      version: typeof meta.version === "string" ? meta.version.trim() : undefined,
      provenance: typeof meta.provenance === "string" ? meta.provenance.trim() : "operator-manual",
      notes: typeof meta.notes === "string" ? meta.notes.trim() : undefined,
    };
  }

  return {
    incidentId,
    filename,
    fileType,
    rawContent,
    metadata,
  };
}

/**
 * Validates UpdateEphemeralMetadataInput schema (H8.4 / H8-019).
 */
export function validateUpdateEphemeralMetadataInput(input: unknown): import("../../common/incident/ephemeral-context-types").UpdateEphemeralMetadataInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ValidationError: UpdateEphemeralMetadataInput must be a non-null object.");
  }
  const obj = input as Record<string, unknown>;

  const incidentId = validateId(obj.incidentId, "incidentId");
  const fileId = validateId(obj.fileId, "fileId");

  if (typeof obj.metadata !== "object" || obj.metadata === null || Array.isArray(obj.metadata)) {
    throw new Error("ValidationError: 'metadata' must be a non-null object.");
  }
  const meta = obj.metadata as Record<string, unknown>;
  const validEnvs: import("../../common/incident/ephemeral-context-types").DeclaredEnvironment[] = [
    "development",
    "staging",
    "production",
    "test",
    "unspecified",
  ];

  const metadata: import("../../common/incident/ephemeral-context-types").UpdateEphemeralMetadataInput["metadata"] = {};

  if (meta.environment !== undefined) {
    if (typeof meta.environment !== "string" || !validEnvs.includes(meta.environment as any)) {
      throw new Error(`ValidationError: 'metadata.environment' must be one of: [${validEnvs.join(", ")}].`);
    }
    metadata.environment = meta.environment as any;
  }

  if (meta.clusterId !== undefined) {
    metadata.clusterId = typeof meta.clusterId === "string" ? meta.clusterId.trim() : undefined;
  }
  if (meta.namespace !== undefined) {
    metadata.namespace = typeof meta.namespace === "string" ? meta.namespace.trim() : undefined;
  }
  if (meta.resourceKind !== undefined) {
    metadata.resourceKind = typeof meta.resourceKind === "string" ? meta.resourceKind.trim() : undefined;
  }
  if (meta.resourceName !== undefined) {
    metadata.resourceName = typeof meta.resourceName === "string" ? meta.resourceName.trim() : undefined;
  }
  if (meta.version !== undefined) {
    metadata.version = typeof meta.version === "string" ? meta.version.trim() : undefined;
  }
  if (meta.provenance !== undefined) {
    metadata.provenance = typeof meta.provenance === "string" ? meta.provenance.trim() : "operator-manual";
  }
  if (meta.notes !== undefined) {
    metadata.notes = typeof meta.notes === "string" ? meta.notes.trim() : undefined;
  }

  return {
    incidentId,
    fileId,
    metadata,
  };
}

export function validateScannerStartInput(input: unknown): {
  scope: import("../../common/incident/local-scanner-types").LocalScannerScope;
  options?: import("../../common/incident/local-scanner-types").LocalScannerOptions;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("ValidationError: Scanner start input must be a non-null object.");
  }
  checkPrototypePollution(input as Record<string, unknown>);
  const obj = input as Record<string, any>;

  assertExactKeys(obj, ["scope", "options"] as const, "ScannerStartInput");

  if (typeof obj.scope !== "object" || obj.scope === null || Array.isArray(obj.scope)) {
    throw new Error("ValidationError: 'scope' must be a non-null object.");
  }
  checkPrototypePollution(obj.scope);
  assertExactKeys(obj.scope, ["clusterId", "namespace", "resourceKind", "resourceName"] as const, "LocalScannerScope");

  if (typeof obj.scope.clusterId !== "string" || !obj.scope.clusterId.trim() || obj.scope.clusterId.length > 100) {
    throw new Error("ValidationError: 'scope.clusterId' must be a non-empty string up to 100 characters.");
  }

  const scope: import("../../common/incident/local-scanner-types").LocalScannerScope = {
    clusterId: obj.scope.clusterId.trim(),
  };

  if (obj.scope.namespace !== undefined) {
    if (typeof obj.scope.namespace !== "string" || obj.scope.namespace.length > 63) {
      throw new Error("ValidationError: 'scope.namespace' must be a string up to 63 characters.");
    }
    scope.namespace = obj.scope.namespace.trim();
  }

  if (obj.scope.resourceKind !== undefined) {
    if (typeof obj.scope.resourceKind !== "string" || obj.scope.resourceKind.length > 50) {
      throw new Error("ValidationError: 'scope.resourceKind' must be a string up to 50 characters.");
    }
    scope.resourceKind = obj.scope.resourceKind.trim();
  }

  if (obj.scope.resourceName !== undefined) {
    if (typeof obj.scope.resourceName !== "string" || obj.scope.resourceName.length > 100) {
      throw new Error("ValidationError: 'scope.resourceName' must be a string up to 100 characters.");
    }
    scope.resourceName = obj.scope.resourceName.trim();
  }

  let options: import("../../common/incident/local-scanner-types").LocalScannerOptions | undefined;
  if (obj.options !== undefined) {
    if (typeof obj.options !== "object" || obj.options === null || Array.isArray(obj.options)) {
      throw new Error("ValidationError: 'options' must be a non-null object.");
    }
    checkPrototypePollution(obj.options);
    assertExactKeys(obj.options, ["scanIntervalMs", "cooldownPeriodMs", "restartThreshold", "restartWindowMs"] as const, "LocalScannerOptions");

    options = {};
    if (obj.options.scanIntervalMs !== undefined) {
      if (typeof obj.options.scanIntervalMs !== "number" || obj.options.scanIntervalMs < 1000 || obj.options.scanIntervalMs > 60000) {
        throw new Error("ValidationError: 'options.scanIntervalMs' must be a number between 1000 and 60000.");
      }
      options.scanIntervalMs = obj.options.scanIntervalMs;
    }
    if (obj.options.cooldownPeriodMs !== undefined) {
      if (typeof obj.options.cooldownPeriodMs !== "number" || obj.options.cooldownPeriodMs < 1000) {
        throw new Error("ValidationError: 'options.cooldownPeriodMs' must be a number >= 1000.");
      }
      options.cooldownPeriodMs = obj.options.cooldownPeriodMs;
    }
    if (obj.options.restartThreshold !== undefined) {
      if (typeof obj.options.restartThreshold !== "number" || obj.options.restartThreshold < 1) {
        throw new Error("ValidationError: 'options.restartThreshold' must be a number >= 1.");
      }
      options.restartThreshold = obj.options.restartThreshold;
    }
    if (obj.options.restartWindowMs !== undefined) {
      if (typeof obj.options.restartWindowMs !== "number" || obj.options.restartWindowMs < 1000) {
        throw new Error("ValidationError: 'options.restartWindowMs' must be a number >= 1000.");
      }
      options.restartWindowMs = obj.options.restartWindowMs;
    }
  }

  return { scope, options };
}

export function validateScannerAlertActionPayload(input: unknown): import("../../common/incident/local-scanner-types").ScannerAlertActionPayload {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("ValidationError: Scanner alert action payload must be a non-null object.");
  }
  checkPrototypePollution(input as Record<string, unknown>);
  const obj = input as Record<string, any>;

  assertExactKeys(obj, ["incidentId", "action", "snoozeDurationMs", "dismissReason", "operatorName"] as const, "ScannerAlertActionPayload");

  const incidentId = validateId(obj.incidentId, "incidentId");
  const validActions = ["analyze_now", "snooze", "dismiss"];
  if (typeof obj.action !== "string" || !validActions.includes(obj.action)) {
    throw new Error(`ValidationError: 'action' must be one of: [${validActions.join(", ")}].`);
  }

  let snoozeDurationMs: number | undefined;
  if (obj.snoozeDurationMs !== undefined) {
    if (typeof obj.snoozeDurationMs !== "number" || obj.snoozeDurationMs <= 0) {
      throw new Error("ValidationError: 'snoozeDurationMs' must be a positive number.");
    }
    snoozeDurationMs = obj.snoozeDurationMs;
  }

  let dismissReason: string | undefined;
  if (obj.dismissReason !== undefined) {
    if (typeof obj.dismissReason !== "string" || obj.dismissReason.length > 500) {
      throw new Error("ValidationError: 'dismissReason' must be a string up to 500 characters.");
    }
    dismissReason = obj.dismissReason.trim();
  }

  let operatorName: string | undefined;
  if (obj.operatorName !== undefined) {
    if (typeof obj.operatorName !== "string" || obj.operatorName.length > 100) {
      throw new Error("ValidationError: 'operatorName' must be a string up to 100 characters.");
    }
    operatorName = obj.operatorName.trim();
  }

  return {
    incidentId,
    action: obj.action as import("../../common/incident/local-scanner-types").ScannerAlertActionType,
    snoozeDurationMs,
    dismissReason,
    operatorName,
  };
}

export function validateK8sSnapshot(input: unknown): import("../../common/incident/local-scanner-types").K8sSnapshot {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("ValidationError: Snapshot must be a non-null object.");
  }
  checkPrototypePollution(input as Record<string, unknown>);

  // H86-GATE-02: Bound payload size to prevent DoS or storm injection
  const serialized = JSON.stringify(input);
  if (serialized.length > 256 * 1024) {
    throw new Error("ValidationError: Snapshot payload exceeds maximum allowed size of 256 KiB.");
  }

  const obj = input as Record<string, any>;
  assertExactKeys(obj, ["pods", "nodes", "workloads", "events"] as const, "K8sSnapshot");

  const MAX_ITEMS = 50;

  if (obj.pods !== undefined) {
    if (!Array.isArray(obj.pods)) {
      throw new Error("ValidationError: 'pods' must be an array.");
    }
    if (obj.pods.length > MAX_ITEMS) {
      throw new Error(`ValidationError: 'pods' array exceeds maximum allowed elements (${MAX_ITEMS}).`);
    }
    for (const pod of obj.pods) {
      if (!pod || typeof pod !== "object") {
        throw new Error("ValidationError: Each item in 'pods' must be an object.");
      }
      checkPrototypePollution(pod);
    }
  }

  if (obj.nodes !== undefined) {
    if (!Array.isArray(obj.nodes)) {
      throw new Error("ValidationError: 'nodes' must be an array.");
    }
    if (obj.nodes.length > MAX_ITEMS) {
      throw new Error(`ValidationError: 'nodes' array exceeds maximum allowed elements (${MAX_ITEMS}).`);
    }
    for (const node of obj.nodes) {
      if (!node || typeof node !== "object") {
        throw new Error("ValidationError: Each item in 'nodes' must be an object.");
      }
      checkPrototypePollution(node);
    }
  }

  if (obj.workloads !== undefined) {
    if (!Array.isArray(obj.workloads)) {
      throw new Error("ValidationError: 'workloads' must be an array.");
    }
    if (obj.workloads.length > MAX_ITEMS) {
      throw new Error(`ValidationError: 'workloads' array exceeds maximum allowed elements (${MAX_ITEMS}).`);
    }
    for (const wl of obj.workloads) {
      if (!wl || typeof wl !== "object") {
        throw new Error("ValidationError: Each item in 'workloads' must be an object.");
      }
      checkPrototypePollution(wl);
    }
  }

  if (obj.events !== undefined) {
    if (!Array.isArray(obj.events)) {
      throw new Error("ValidationError: 'events' must be an array.");
    }
    if (obj.events.length > MAX_ITEMS) {
      throw new Error(`ValidationError: 'events' array exceeds maximum allowed elements (${MAX_ITEMS}).`);
    }
    for (const ev of obj.events) {
      if (!ev || typeof ev !== "object") {
        throw new Error("ValidationError: Each item in 'events' must be an object.");
      }
      checkPrototypePollution(ev);
    }
  }

  return obj as import("../../common/incident/local-scanner-types").K8sSnapshot;
}
