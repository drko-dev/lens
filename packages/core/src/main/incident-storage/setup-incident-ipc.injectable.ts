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

export interface IpcHandlerRegistrar {
  handle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
}

export function registerIncidentIpcHandlers(
  incidentRepo: IncidentRepository,
  evidenceRepo: EvidenceRepository,
  ipc: IpcHandlerRegistrar = ipcMain,
): () => void {
  ipc.handle(incidentIpcChannels.list, (_event, filter?: IncidentFilter) => {
    return incidentRepo.listIncidents(filter);
  });

  ipc.handle(incidentIpcChannels.get, (_event, id: string) => {
    return incidentRepo.getIncidentById(id);
  });

  ipc.handle(incidentIpcChannels.create, (_event, input: CreateIncidentInput, actor?: TimelineActor) => {
    const creator = input.creator ?? actor ?? { type: "human", name: "operator" };

    return incidentRepo.createIncident({ ...input, creator });
  });

  ipc.handle(incidentIpcChannels.update, (_event, id: string, patch: UpdateIncidentInput) => {
    return incidentRepo.updateIncident(id, patch);
  });

  ipc.handle(incidentIpcChannels.transition, (_event, payload: IncidentTransitionPayload) => {
    const justification = payload.justification ?? payload.reason ?? "";

    return incidentRepo.transitionStatus({
      ...payload,
      justification,
    });
  });

  ipc.handle(incidentIpcChannels.getTimeline, (_event, incidentId: string) => {
    return incidentRepo.getTimeline(incidentId);
  });

  ipc.handle(incidentIpcChannels.getEvidence, (_event, incidentId: string) => {
    return evidenceRepo.listEvidenceByIncident(incidentId);
  });

  ipc.handle(incidentIpcChannels.ingestEvidence, (_event, input: IngestEvidenceInput) => {
    return evidenceRepo.ingestEvidence(input);
  });

  ipc.handle(incidentIpcChannels.ingestUserContext, (_event, input: UserContextMetadataInput) => {
    return evidenceRepo.ingestUserContextMetadata(input);
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
