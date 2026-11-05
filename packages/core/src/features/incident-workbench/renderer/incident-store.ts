/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { makeAutoObservable, runInAction } from "mobx";
import { incidentIpcChannels, type IncidentTransitionPayload, type IncidentTransitionResult } from "../../../common/incident/incident-ipc";
import type {
  CreateIncidentInput,
  EvidenceSnippet,
  Incident,
  IncidentFilter,
  IncidentSeverity,
  IncidentStatus,
  IngestEvidenceInput,
  IngestEvidenceResult,
  TimelineActor,
  TimelineEvent,
  UpdateIncidentInput,
  UserContextMetadataInput,
} from "../../../common/incident/incident-types";

export interface IpcInvoker {
  invoke(channel: string, ...args: any[]): Promise<any>;
}

export class IncidentStore {
  public incidents: Incident[] = [];
  public activeIncidentId: string | null = null;
  public activeIncidentTimeline: TimelineEvent[] = [];
  public activeIncidentEvidence: EvidenceSnippet[] = [];
  public isLoading = false;
  public isActionLoading = false;
  public error: string | null = null;

  public searchQuery = "";
  public selectedStatus: IncidentStatus | "ALL" = "ALL";
  public selectedSeverity: IncidentSeverity | "ALL" = "ALL";
  public selectedNamespace: string | "ALL" = "ALL";

  constructor(private readonly ipc: IpcInvoker) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  public get activeIncident(): Incident | null {
    if (!this.activeIncidentId) return null;

    return this.incidents.find(inc => inc.id === this.activeIncidentId) ?? null;
  }

  public get filteredIncidents(): Incident[] {
    return this.incidents.filter(incident => {
      if (this.selectedStatus !== "ALL" && incident.status !== this.selectedStatus) {
        return false;
      }

      if (this.selectedSeverity !== "ALL" && incident.severity !== this.selectedSeverity) {
        return false;
      }

      if (this.selectedNamespace !== "ALL" && incident.namespace !== this.selectedNamespace) {
        return false;
      }

      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase().trim();
        const matchesTitle = incident.title.toLowerCase().includes(query);
        const matchesDesc = (incident.description ?? "").toLowerCase().includes(query);
        const matchesWorkload = (incident.workloadName ?? "").toLowerCase().includes(query);
        const matchesKind = (incident.workloadKind ?? "").toLowerCase().includes(query);
        const matchesId = incident.id.toLowerCase().includes(query);

        if (!matchesTitle && !matchesDesc && !matchesWorkload && !matchesKind && !matchesId) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public get stats() {
    const total = this.incidents.length;
    const active = this.incidents.filter(i => !["CERRADO", "NO CONFIRMADO", "INCONCLUSO"].includes(i.status)).length;
    const critical = this.incidents.filter(i => i.severity === "critical").length;
    const investigating = this.incidents.filter(i => ["INVESTIGANDO", "HIPÓTESIS"].includes(i.status)).length;
    const confirmed = this.incidents.filter(i => ["CONFIRMADO", "SOLUCIÓN PROPUESTA", "APROBACIÓN HUMANA", "VALIDACIÓN"].includes(i.status)).length;

    return { total, active, critical, investigating, confirmed };
  }

  public get availableNamespaces(): string[] {
    const namespaces = new Set<string>();

    for (const incident of this.incidents) {
      if (incident.namespace) {
        namespaces.add(incident.namespace);
      }
    }

    return Array.from(namespaces).sort();
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  public setStatusFilter(status: IncidentStatus | "ALL"): void {
    this.selectedStatus = status;
  }

  public setSeverityFilter(severity: IncidentSeverity | "ALL"): void {
    this.selectedSeverity = severity;
  }

  public setNamespaceFilter(namespace: string | "ALL"): void {
    this.selectedNamespace = namespace;
  }

  public async loadIncidents(filter?: IncidentFilter): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const data: Incident[] = await this.ipc.invoke(incidentIpcChannels.list, filter);

      runInAction(() => {
        this.incidents = data;
        this.isLoading = false;

        // Si hay un incidente activo pero ya no existe, limpiarlo
        if (this.activeIncidentId && !this.incidents.some(i => i.id === this.activeIncidentId)) {
          this.activeIncidentId = null;
          this.activeIncidentTimeline = [];
          this.activeIncidentEvidence = [];
        }
      });
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar la lista de incidentes";
        this.isLoading = false;
      });
    }
  }

  public async selectIncident(id: string | null): Promise<void> {
    this.activeIncidentId = id;
    this.error = null;

    if (!id) {
      this.activeIncidentTimeline = [];
      this.activeIncidentEvidence = [];

      return;
    }

    this.isActionLoading = true;

    try {
      const [timeline, evidence] = await Promise.all([
        this.ipc.invoke(incidentIpcChannels.getTimeline, id) as Promise<TimelineEvent[]>,
        this.ipc.invoke(incidentIpcChannels.getEvidence, id) as Promise<EvidenceSnippet[]>,
      ]);

      runInAction(() => {
        this.activeIncidentTimeline = timeline;
        this.activeIncidentEvidence = evidence;
        this.isActionLoading = false;
      });
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar los detalles del incidente";
        this.isActionLoading = false;
      });
    }
  }

  public async createIncident(input: CreateIncidentInput, actor?: TimelineActor): Promise<Incident | null> {
    this.isActionLoading = true;
    this.error = null;

    try {
      const newIncident: Incident = await this.ipc.invoke(incidentIpcChannels.create, input, actor);

      runInAction(() => {
        this.incidents = [newIncident, ...this.incidents];
        this.activeIncidentId = newIncident.id;
        this.isActionLoading = false;
      });

      await this.selectIncident(newIncident.id);

      return newIncident;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al crear el incidente";
        this.isActionLoading = false;
      });

      return null;
    }
  }

  public async transitionStatus(payload: {
    toStatus: IncidentStatus;
    reason: string;
    actor: TimelineActor;
    evidenceIds?: string[];
  }): Promise<boolean> {
    if (!this.activeIncidentId) return false;

    this.isActionLoading = true;
    this.error = null;

    try {
      const transitionPayload: IncidentTransitionPayload = {
        incidentId: this.activeIncidentId,
        toStatus: payload.toStatus,
        actor: payload.actor,
        reason: payload.reason,
        evidenceIds: payload.evidenceIds,
      };

      const result: IncidentTransitionResult = await this.ipc.invoke(
        incidentIpcChannels.transition,
        transitionPayload,
      );

      runInAction(() => {
        const index = this.incidents.findIndex(i => i.id === result.incident.id);

        if (index >= 0) {
          this.incidents[index] = result.incident;
        }

        this.activeIncidentTimeline = [...this.activeIncidentTimeline, result.timelineEvent];
        this.isActionLoading = false;
      });

      return true;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error en la transición de estado";
        this.isActionLoading = false;
      });

      return false;
    }
  }

  public async ingestEvidence(input: IngestEvidenceInput): Promise<IngestEvidenceResult | null> {
    this.isActionLoading = true;
    this.error = null;

    try {
      const result: IngestEvidenceResult = await this.ipc.invoke(
        incidentIpcChannels.ingestEvidence,
        input,
      );

      if (this.activeIncidentId === input.incidentId) {
        const updatedEvidence: EvidenceSnippet[] = await this.ipc.invoke(
          incidentIpcChannels.getEvidence,
          input.incidentId,
        );

        runInAction(() => {
          this.activeIncidentEvidence = updatedEvidence;
        });
      }

      runInAction(() => {
        this.isActionLoading = false;
      });

      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al incorporar la evidencia";
        this.isActionLoading = false;
      });

      return null;
    }
  }

  public async ingestUserContext(input: UserContextMetadataInput): Promise<IngestEvidenceResult | null> {
    this.isActionLoading = true;
    this.error = null;

    try {
      const result: IngestEvidenceResult = await this.ipc.invoke(
        incidentIpcChannels.ingestUserContext,
        input,
      );

      if (this.activeIncidentId === input.incidentId) {
        const updatedEvidence: EvidenceSnippet[] = await this.ipc.invoke(
          incidentIpcChannels.getEvidence,
          input.incidentId,
        );

        runInAction(() => {
          this.activeIncidentEvidence = updatedEvidence;
        });
      }

      runInAction(() => {
        this.isActionLoading = false;
      });

      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al adjuntar metadatos de contexto de usuario";
        this.isActionLoading = false;
      });

      return null;
    }
  }

  public async togglePin(id: string): Promise<void> {
    const incident = this.incidents.find(i => i.id === id);

    if (!incident) return;

    const newPinned = !incident.isPinned;

    try {
      const patch: UpdateIncidentInput = { isPinned: newPinned };
      const updated: Incident = await this.ipc.invoke(incidentIpcChannels.update, id, patch);

      runInAction(() => {
        const index = this.incidents.findIndex(i => i.id === id);

        if (index >= 0) {
          this.incidents[index] = updated;
        }
      });
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al actualizar estado fijado";
      });
    }
  }
}
