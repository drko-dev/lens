/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  CreateIncidentInput,
  EvidenceSnippet,
  Incident,
  IncidentFilter,
  IncidentStatus,
  IngestEvidenceInput,
  IngestEvidenceResult,
  TimelineActor,
  TimelineEvent,
  UpdateIncidentInput,
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
}
