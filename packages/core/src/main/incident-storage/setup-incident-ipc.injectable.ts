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
import incidentPurgerInjectable from "./incident-purger.injectable";
import incidentConfirmationManagerInjectable from "./incident-confirmation-manager.injectable";
import type { IncidentRepository } from "./incident-repository";
import type { EvidenceRepository } from "./evidence-repository";
import type { IncidentPurger } from "./incident-purger";
import type { IncidentConfirmationManager } from "./incident-confirmation-manager";
import type {
  CreateIncidentInput,
  IncidentFilter,
  IngestEvidenceInput,
  ManualPurgeRequest,
  PrivilegedTransitionRequest,
  TimelineActor,
  UpdateIncidentInput,
  UpdateRetentionPolicyInput,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";
import {
  validateCreateIncidentInput,
  validateId,
  validateIncidentFilter,
  validateIncidentTransitionPayload,
  validateIngestEvidenceInput,
  validateIpcSender,
  validateManualPurgeRequest,
  validatePrivilegedTransitionRequest,
  validateUpdateIncidentInput,
  validateUpdateRetentionPolicyInput,
  validateUserContextMetadataInput,
} from "./incident-ipc-validator";

export interface IpcHandlerRegistrar {
  handle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
}

export function registerIncidentIpcHandlers(
  incidentRepo: IncidentRepository,
  evidenceRepo: EvidenceRepository,
  purger?: IncidentPurger,
  confirmationManager?: IncidentConfirmationManager,
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

  if (purger) {
    ipc.handle(incidentIpcChannels.getRetentionPolicy, async (event) => {
      validateIpcSender(event);
      return purger.getRetentionPolicy();
    });

    ipc.handle(incidentIpcChannels.setRetentionPolicy, async (event, input: UpdateRetentionPolicyInput) => {
      validateIpcSender(event);
      const validated = validateUpdateRetentionPolicyInput(input);
      return purger.setRetentionPolicy(validated);
    });

    ipc.handle(incidentIpcChannels.previewPurge, async (event, override?: UpdateRetentionPolicyInput) => {
      validateIpcSender(event);
      const validated = override ? validateUpdateRetentionPolicyInput(override) : undefined;
      return purger.previewPurge(validated);
    });

    ipc.handle(incidentIpcChannels.executePurge, async (event) => {
      validateIpcSender(event);
      return purger.executeAutomaticPurge();
    });

    ipc.handle(incidentIpcChannels.executeAutomaticPurge, async (event) => {
      validateIpcSender(event);
      return purger.executeAutomaticPurge();
    });

    ipc.handle(incidentIpcChannels.executeManualPurge, async (event, input: ManualPurgeRequest) => {
      validateIpcSender(event);
      const validated = validateManualPurgeRequest(input);
      return purger.executeManualPurge(validated);
    });

    ipc.handle(incidentIpcChannels.getPurgeHistory, async (event, limit?: number) => {
      validateIpcSender(event);
      const safeLimit = typeof limit === "number" && limit > 0 && limit <= 100 ? limit : 20;
      return purger.getPurgeHistory(safeLimit);
    });
  }

  if (confirmationManager) {
    confirmationManager.registerInternalHandlers(ipc as any);

    ipc.handle(incidentIpcChannels.requestPrivilegedTransition, async (event, request: PrivilegedTransitionRequest) => {
      validateIpcSender(event);
      if (confirmationManager.isModalWebContents(event?.sender?.id)) {
        throw new Error("SecurityError: Confirmation modal is forbidden from requesting privileged transitions.");
      }
      const validated = validatePrivilegedTransitionRequest(request);
      return confirmationManager.requestPrivilegedTransition(validated, event);
    });
  }

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
      const purger = di.inject(incidentPurgerInjectable);
      const confirmationManager = di.inject(incidentConfirmationManagerInjectable);

      registerIncidentIpcHandlers(incidentRepo, evidenceRepo, purger, confirmationManager, ipcMain);
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default setupIncidentIpcInjectable;
