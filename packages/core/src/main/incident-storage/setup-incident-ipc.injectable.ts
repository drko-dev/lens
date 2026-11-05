/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { ipcMain } from "electron";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { incidentIpcChannels, type IncidentTransitionPayload } from "../../common/incident/incident-ipc";
import incidentRepositoryInjectable from "./incident-repository.injectable";
import evidenceRepositoryInjectable from "./evidence-repository.injectable";
import type { IncidentRepository } from "./incident-repository";
import type { EvidenceRepository } from "./evidence-repository";
import type {
  CreateIncidentInput,
  IncidentFilter,
  IngestEvidenceInput,
  TimelineActor,
  UpdateIncidentInput,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";
import {
  validateCreateIncidentInput,
  validateId,
  validateIncidentFilter,
  validateIncidentTransitionPayload,
  validateIngestEvidenceInput,
  validateIpcSender,
  validateUpdateIncidentInput,
  validateUserContextMetadataInput,
} from "./incident-ipc-validator";

export interface IpcHandlerRegistrar {
  handle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
}

export function registerIncidentIpcHandlers(
  incidentRepo: IncidentRepository,
  evidenceRepo: EvidenceRepository,
  ipc: IpcHandlerRegistrar = ipcMain,
): () => void {
  ipc.handle(incidentIpcChannels.list, async (event, filter?: IncidentFilter) => {
    validateIpcSender(event);
    const validatedFilter = validateIncidentFilter(filter);
    return incidentRepo.listIncidents(validatedFilter);
  });

  ipc.handle(incidentIpcChannels.get, async (event, id: string) => {
    validateIpcSender(event);
    const validatedId = validateId(id, "incidentId");
    return incidentRepo.getIncidentById(validatedId);
  });

  ipc.handle(incidentIpcChannels.create, async (event, input: CreateIncidentInput, _actor?: TimelineActor) => {
    validateIpcSender(event);
    const validatedInput = validateCreateIncidentInput(input);
    return incidentRepo.createIncident(validatedInput);
  });

  ipc.handle(incidentIpcChannels.update, async (event, id: string, patch: UpdateIncidentInput) => {
    validateIpcSender(event);
    const validatedId = validateId(id, "incidentId");
    const validatedPatch = validateUpdateIncidentInput(patch);
    return incidentRepo.updateIncident(validatedId, validatedPatch);
  });

  ipc.handle(incidentIpcChannels.transition, async (event, payload: IncidentTransitionPayload) => {
    validateIpcSender(event);
    const validatedPayload = validateIncidentTransitionPayload(payload);
    return incidentRepo.transitionStatus(validatedPayload);
  });

  ipc.handle(incidentIpcChannels.getTimeline, async (event, incidentId: string) => {
    validateIpcSender(event);
    const validatedId = validateId(incidentId, "incidentId");
    return incidentRepo.getTimeline(validatedId);
  });

  ipc.handle(incidentIpcChannels.getEvidence, async (event, incidentId: string) => {
    validateIpcSender(event);
    const validatedId = validateId(incidentId, "incidentId");
    return evidenceRepo.listEvidenceByIncident(validatedId);
  });

  ipc.handle(incidentIpcChannels.ingestEvidence, async (event, input: IngestEvidenceInput) => {
    validateIpcSender(event);
    const validatedInput = validateIngestEvidenceInput(input);
    return evidenceRepo.ingestEvidence(validatedInput);
  });

  ipc.handle(incidentIpcChannels.ingestUserContext, async (event, input: UserContextMetadataInput) => {
    validateIpcSender(event);
    const validatedInput = validateUserContextMetadataInput(input);
    return evidenceRepo.ingestUserContextMetadata(validatedInput);
  });

  return () => {
    const channels = Object.values(incidentIpcChannels);

    for (const channel of channels) {
      if ((ipc as any).removeHandler) {
        (ipc as any).removeHandler(channel);
      }
    }
  };
}

const setupIncidentIpcInjectable = getInjectable({
  id: "setup-incident-ipc",

  instantiate: (di) => ({
    run: () => {
      const incidentRepo = di.inject(incidentRepositoryInjectable);
      const evidenceRepo = di.inject(evidenceRepositoryInjectable);

      registerIncidentIpcHandlers(incidentRepo, evidenceRepo, ipcMain);
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default setupIncidentIpcInjectable;
