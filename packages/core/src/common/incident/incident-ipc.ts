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
  getPurgeHistory: "openlens:incident:get-purge-history",
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
  executePurge(options?: { force?: boolean }): Promise<PurgeExecutionResult>;
  getPurgeHistory(limit?: number): Promise<PurgeAuditEntry[]>;
}
