/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  CreateIncidentInput,
  EvidenceSnippet,
  Incident,
  IncidentFilter,
  IncidentRetentionPolicy,
  IncidentStatus,
  IngestEvidenceInput,
  IngestEvidenceResult,
  ManualPurgeRequest,
  PrivilegedTransitionRequest,
  PurgeAuditEntry,
  PurgeExecutionResult,
  PurgePreviewResult,
  TimelineActor,
  TimelineEvent,
  UpdateIncidentInput,
  UpdateRetentionPolicyInput,
  UserContextMetadataInput,
} from "./incident-types";

export const incidentIpcChannels = Object.freeze({
  list: "openlens:incident:list",
  get: "openlens:incident:get",
  create: "openlens:incident:create",
  update: "openlens:incident:update",
  transition: "openlens:incident:transition",
  getTimeline: "openlens:incident:get-timeline",
  getEvidence: "openlens:incident:get-evidence",
  ingestEvidence: "openlens:incident:ingest-evidence",
  ingestUserContext: "openlens:incident:ingest-user-context",
  getRetentionPolicy: "openlens:incident:get-retention-policy",
  setRetentionPolicy: "openlens:incident:set-retention-policy",
  previewPurge: "openlens:incident:preview-purge",
  executePurge: "openlens:incident:execute-purge",
  executeManualPurge: "openlens:incident:execute-manual-purge",
  executeAutomaticPurge: "openlens:incident:execute-automatic-purge",
  getPurgeHistory: "openlens:incident:get-purge-history",
  requestPrivilegedTransition: "openlens:incident:request-privileged-transition",
  submitPrivilegedConfirmation: "openlens:incident:submit-privileged-confirmation",
  aiListProfiles: "openlens:incident:ai:list-profiles",
  aiCreateProfile: "openlens:incident:ai:create-profile",
  aiUpdateProfile: "openlens:incident:ai:update-profile",
  aiDeleteProfile: "openlens:incident:ai:delete-profile",
  aiPrepareConsent: "openlens:incident:ai:prepare-consent",
  aiExecuteDiagnosis: "openlens:incident:ai:execute-diagnosis",
  aiListDiagnoses: "openlens:incident:ai:list-diagnoses",
  aiGetLatestDiagnosis: "openlens:incident:ai:get-latest-diagnosis",
  aiVerifyRemediation: "openlens:incident:ai:verify-remediation",
  contextList: "openlens:incident:context:list",
  contextAdd: "openlens:incident:context:add",
  contextUpdateMetadata: "openlens:incident:context:update-metadata",
  contextRemove: "openlens:incident:context:remove",
  contextClear: "openlens:incident:context:clear",
  scannerGetStatus: "openlens:incident:scanner:get-status",
  scannerStart: "openlens:incident:scanner:start",
  scannerStop: "openlens:incident:scanner:stop",
  scannerProcessSnapshot: "openlens:incident:scanner:process-snapshot",
  scannerAlertAction: "openlens:incident:scanner:alert-action",
});

export interface IncidentTransitionPayload {
  incidentId: string;
  toStatus: IncidentStatus;
  actor: TimelineActor;
  reason?: string;
  justification?: string;
  evidenceIds?: string[];
}

export interface IncidentTransitionResult {
  incident: Incident;
  timelineEvent: TimelineEvent;
}

export interface IncidentIpcApi {
  list(filter?: IncidentFilter): Promise<Incident[]>;
  get(id: string): Promise<Incident | null>;
  create(input: CreateIncidentInput, actor?: TimelineActor): Promise<Incident>;
  update(id: string, patch: UpdateIncidentInput): Promise<Incident>;
  transition(payload: IncidentTransitionPayload): Promise<IncidentTransitionResult>;
  getTimeline(incidentId: string): Promise<TimelineEvent[]>;
  getEvidence(incidentId: string): Promise<EvidenceSnippet[]>;
  ingestEvidence(input: IngestEvidenceInput): Promise<IngestEvidenceResult>;
  ingestUserContext(input: UserContextMetadataInput): Promise<IngestEvidenceResult>;
  getRetentionPolicy(): Promise<IncidentRetentionPolicy>;
  setRetentionPolicy(input: UpdateRetentionPolicyInput): Promise<IncidentRetentionPolicy>;
  previewPurge(policyOverride?: UpdateRetentionPolicyInput): Promise<PurgePreviewResult>;
  executePurge(): Promise<PurgeExecutionResult>;
  executeManualPurge(input: ManualPurgeRequest): Promise<PurgeExecutionResult>;
  executeAutomaticPurge(): Promise<PurgeExecutionResult>;
  getPurgeHistory(limit?: number): Promise<PurgeAuditEntry[]>;
  requestPrivilegedTransition(request: PrivilegedTransitionRequest): Promise<IncidentTransitionResult>;
}
