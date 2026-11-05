/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type IncidentSeverity = "critical" | "high" | "medium" | "low" | "info";

export type IncidentStatus =
  | "DETECTADO"
  | "INVESTIGANDO"
  | "HIPÓTESIS"
  | "CONFIRMADO"
  | "SOLUCIÓN PROPUESTA"
  | "APROBACIÓN HUMANA"
  | "VALIDACIÓN"
  | "CERRADO"
  | "NO CONFIRMADO"
  | "INCONCLUSO";

export type IncidentActorType = "human" | "system" | "ai";

export interface IncidentActor {
  type: IncidentActorType;
  id: string;
  name: string;
  authorizationContext?: {
    role?: "operator" | "admin" | "viewer";
    tokenVerified?: boolean;
  };
}

export interface Incident {
  id: string;
  clusterId: string;
  namespace: string;
  workloadKind?: string;
  workloadName?: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  authorType: IncidentActorType;
  authorName: string;
  fromStatus?: IncidentStatus;
  toStatus?: IncidentStatus;
  message: string;
  metadata?: Record<string, any>;
}

export type EvidenceType =
  | "pod_logs"
  | "k8s_event"
  | "resource_manifest"
  | "cost_estimate"
  | "user_context_metadata";

export interface EvidenceSnippet {
  id: string;
  incidentId: string;
  type: EvidenceType;
  origin: string;
  clusterId: string;
  namespace: string;
  resourceKind?: string;
  resourceName?: string;
  resourceUid?: string;
  resourceVersion?: string;
  sha256Hash: string;
  fingerprint: string;
  snippetBytes: number;
  capturedAt: string;
  contentSnippet: string;
  metadata?: Record<string, any>;
}

export interface IngestEvidenceInput {
  id?: string;
  incidentId: string;
  type: EvidenceType;
  origin: string;
  clusterId: string;
  namespace: string;
  resourceKind?: string;
  resourceName?: string;
  resourceUid?: string;
  resourceVersion?: string;
  rawContent: string;
  metadata?: Record<string, any>;
}

export interface UserContextMetadataInput {
  id?: string;
  incidentId: string;
  clusterId: string;
  namespace: string;
  filename: string;
  fileType: "dockerfile" | "helm_values" | "k8s_manifest" | "app_config" | "other";
  sha256Hash: string;
  userDeclaredVersion?: string;
  sanitizedFindingsSummary: string;
  metadata?: Record<string, any>;
}

export interface IngestEvidenceResult {
  evidence: EvidenceSnippet;
  isDuplicate: boolean;
}

export interface CreateIncidentInput {
  id?: string;
  clusterId: string;
  namespace: string;
  workloadKind?: string;
  workloadName?: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  isPinned?: boolean;
  creator: IncidentActor;
  initialMessage?: string;
}

export interface UpdateIncidentMetadataInput {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  isPinned?: boolean;
}

export interface IncidentFilter {
  clusterId?: string;
  namespace?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  isPinned?: boolean;
  limit?: number;
  offset?: number;
}

export interface IncidentTransitionRequest {
  incidentId: string;
  toStatus: IncidentStatus;
  actor: IncidentActor;
  justification: string;
  evidenceIds?: string[];
  metadata?: Record<string, any>;
}

export interface NewEvidenceInput {
  id?: string;
  incidentId: string;
  type: EvidenceType;
  origin: string;
  clusterId: string;
  namespace: string;
  resourceKind?: string;
  resourceName?: string;
  resourceUid?: string;
  resourceVersion?: string;
  contentSnippet: string;
  metadata?: Record<string, any>;
}

export type RetentionStrategy = "manual" | "days";

export interface IncidentRetentionPolicy {
  id: "default";
  enabled: boolean;
  strategy: RetentionStrategy;
  retentionDays: number;
  protectPinned: boolean;
  purgeClosedOnly: boolean;
  evidenceRetentionDays?: number | null;
  lastEvaluatedAt?: string | null;
  updatedAt: string;
}

export interface UpdateRetentionPolicyInput {
  enabled?: boolean;
  strategy?: RetentionStrategy;
  retentionDays?: number;
  protectPinned?: boolean;
  purgeClosedOnly?: boolean;
  evidenceRetentionDays?: number | null;
}

export interface PurgePreviewResult {
  policy: IncidentRetentionPolicy;
  candidateIncidentCount: number;
  protectedIncidentCount: number;
  candidateEvidenceCount: number;
  candidateReclaimableBytes: number;
  candidateIncidentIds: string[];
  candidateEvidenceIds: string[];
}

export interface PurgeExecutionResult {
  success: boolean;
  deletedIncidentCount: number;
  deletedTimelineCount: number;
  deletedEvidenceCount: number;
  reclaimedBytes: number;
  executedAt: string;
  error?: string;
}

export interface PurgeAuditEntry {
  id: string;
  executedAt: string;
  policySnapshot: IncidentRetentionPolicy;
  deletedIncidents: number;
  deletedTimelines: number;
  deletedEvidences: number;
  reclaimedBytes: number;
  status: "SUCCESS" | "ERROR";
  errorMessage?: string;
}

export interface PrivilegedTransitionRequest {
  incidentId: string;
  toStatus: "APROBACIÓN HUMANA" | "CERRADO";
  justification: string;
  evidenceIds?: string[];
}

export interface ManualPurgeRequest {
  confirmedCandidateIds: string[];
  purgeEvidenceOnly?: boolean;
}


