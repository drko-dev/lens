/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { makeAutoObservable, runInAction } from "mobx";
import { incidentIpcChannels, type IncidentTransitionPayload, type IncidentTransitionResult } from "../../../common/incident/incident-ipc";
import type { AiProviderProfile } from "../../../common/incident/ai-profile-types";
import type {
  AiDiagnosisReport,
  DiagnosisConsentPreview,
} from "../../../common/incident/ai-diagnosis-types";
import type {
  AddEphemeralFileInput,
  EphemeralFileDescriptor,
  UpdateEphemeralMetadataInput,
} from "../../../common/incident/ephemeral-context-types";
import type {
  LocalScannerScope,
  LocalScannerOptions,
  LocalScannerStatus,
  LocalScannerSignal,
  ScannerAlertActionPayload,
  ScannerAlertActionResult,
  K8sSnapshot,
} from "../../../common/incident/local-scanner-types";
import type {
  CreateIncidentInput,
  EvidenceSnippet,
  Incident,
  IncidentFilter,
  IncidentRetentionPolicy,
  IncidentSeverity,
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

  public retentionPolicy: IncidentRetentionPolicy | null = null;
  public purgePreview: PurgePreviewResult | null = null;
  public purgeHistory: PurgeAuditEntry[] = [];
  public isPurging = false;

  public aiProfiles: AiProviderProfile[] = [];
  public activeDiagnosis: AiDiagnosisReport | null = null;
  public diagnosisHistory: AiDiagnosisReport[] = [];
  public consentPreview: DiagnosisConsentPreview | null = null;
  public isAnalyzingAi = false;
  public activeIncidentContextFiles: EphemeralFileDescriptor[] = [];

  // Local Incident Scanner state (H8.5)
  public scannerStatus: LocalScannerStatus = {
    isEnabled: false,
    scanCount: 0,
    activeWatchersCount: 0,
    signalsDetectedCount: 0,
    deduplicatedCount: 0,
    incidentsCreatedCount: 0,
    dismissedCount: 0,
    snoozedCount: 0,
  };
  public isScannerToggling = false;

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
    const previousIncidentId = this.activeIncidentId;
    this.activeIncidentId = id;
    this.error = null;

    // H84-SEC-03: When deselecting or switching incident, clear previous incident's ephemeral context in Main
    if (previousIncidentId && previousIncidentId !== id) {
      this.ipc.invoke(incidentIpcChannels.contextClear, previousIncidentId).catch(() => {});
    }

    if (!id) {
      this.activeIncidentTimeline = [];
      this.activeIncidentEvidence = [];
      this.activeIncidentContextFiles = [];
      this.activeDiagnosis = null;
      this.diagnosisHistory = [];
      this.consentPreview = null;

      return;
    }

    this.isActionLoading = true;

    try {
      const [timeline, evidence, latestDiagnosis, contextFiles] = await Promise.all([
        this.ipc.invoke(incidentIpcChannels.getTimeline, id) as Promise<TimelineEvent[]>,
        this.ipc.invoke(incidentIpcChannels.getEvidence, id) as Promise<EvidenceSnippet[]>,
        this.ipc.invoke(incidentIpcChannels.aiGetLatestDiagnosis, id).catch(() => null) as Promise<AiDiagnosisReport | null>,
        this.ipc.invoke(incidentIpcChannels.contextList, id).catch(() => []) as Promise<EphemeralFileDescriptor[]>,
      ]);

      runInAction(() => {
        this.activeIncidentTimeline = timeline;
        this.activeIncidentEvidence = evidence;
        this.activeIncidentContextFiles = contextFiles ?? [];
        this.activeDiagnosis = latestDiagnosis ?? null;
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
      let result: IncidentTransitionResult;

      if (payload.toStatus === "APROBACIÓN HUMANA" || payload.toStatus === "CERRADO") {
        result = await this.ipc.invoke(incidentIpcChannels.requestPrivilegedTransition, {
          incidentId: this.activeIncidentId,
          toStatus: payload.toStatus,
          justification: payload.reason,
          evidenceIds: payload.evidenceIds,
        });
      } else {
        const transitionPayload: IncidentTransitionPayload = {
          incidentId: this.activeIncidentId,
          toStatus: payload.toStatus,
          actor: payload.actor,
          reason: payload.reason,
          evidenceIds: payload.evidenceIds,
        };

        result = await this.ipc.invoke(
          incidentIpcChannels.transition,
          transitionPayload,
        );
      }

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

  public async loadRetentionPolicy(): Promise<IncidentRetentionPolicy | null> {
    try {
      const policy: IncidentRetentionPolicy = await this.ipc.invoke(incidentIpcChannels.getRetentionPolicy);
      runInAction(() => {
        this.retentionPolicy = policy;
      });
      return policy;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar la política de retención";
      });
      return null;
    }
  }

  public async saveRetentionPolicy(patch: UpdateRetentionPolicyInput): Promise<IncidentRetentionPolicy | null> {
    this.isActionLoading = true;
    try {
      const updated: IncidentRetentionPolicy = await this.ipc.invoke(incidentIpcChannels.setRetentionPolicy, patch);
      runInAction(() => {
        this.retentionPolicy = updated;
        this.isActionLoading = false;
      });
      return updated;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al actualizar la política de retención";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async previewPurge(override?: UpdateRetentionPolicyInput): Promise<PurgePreviewResult | null> {
    try {
      const preview: PurgePreviewResult = await this.ipc.invoke(incidentIpcChannels.previewPurge, override);
      runInAction(() => {
        this.purgePreview = preview;
      });
      return preview;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al calcular previsualización de purga";
      });
      return null;
    }
  }

  public async executePurge(candidateIncidentIds?: string[]): Promise<PurgeExecutionResult | null> {
    const ids = candidateIncidentIds ?? (this.purgePreview?.candidateIncidentIds ?? []);
    return this.executeManualPurge(ids);
  }

  public async executeManualPurge(candidateIncidentIds: string[]): Promise<PurgeExecutionResult | null> {
    this.isPurging = true;
    try {
      const result: PurgeExecutionResult = await this.ipc.invoke(incidentIpcChannels.executeManualPurge, {
        confirmedCandidateIds: candidateIncidentIds,
      });
      await this.loadIncidents();
      await this.loadRetentionPolicy();
      await this.previewPurge();
      await this.loadPurgeHistory();
      runInAction(() => {
        this.isPurging = false;
      });
      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al ejecutar purga manual de incidentes";
        this.isPurging = false;
      });
      return null;
    }
  }

  public async executeAutomaticPurge(): Promise<PurgeExecutionResult | null> {
    this.isPurging = true;
    try {
      const result: PurgeExecutionResult = await this.ipc.invoke(incidentIpcChannels.executeAutomaticPurge);
      await this.loadIncidents();
      await this.loadRetentionPolicy();
      await this.previewPurge();
      await this.loadPurgeHistory();
      runInAction(() => {
        this.isPurging = false;
      });
      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al ejecutar purga automática de incidentes";
        this.isPurging = false;
      });
      return null;
    }
  }

  public async loadPurgeHistory(limit = 10): Promise<PurgeAuditEntry[]> {
    try {
      const history: PurgeAuditEntry[] = await this.ipc.invoke(incidentIpcChannels.getPurgeHistory, limit);
      runInAction(() => {
        this.purgeHistory = history;
      });
      return history;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar historial de purgas";
      });
      return [];
    }
  }

  public async loadAiProfiles(): Promise<AiProviderProfile[]> {
    try {
      const profiles: AiProviderProfile[] = await this.ipc.invoke(incidentIpcChannels.aiListProfiles);
      runInAction(() => {
        this.aiProfiles = profiles;
      });
      return profiles;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar perfiles de IA";
      });
      return [];
    }
  }

  public async loadDiagnosisHistory(incidentId: string): Promise<AiDiagnosisReport[]> {
    try {
      const history: AiDiagnosisReport[] = await this.ipc.invoke(incidentIpcChannels.aiListDiagnoses, incidentId);
      runInAction(() => {
        this.diagnosisHistory = history;
        if (history.length > 0) {
          this.activeDiagnosis = history[0];
        }
      });
      return history;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar diagnósticos de IA";
      });
      return [];
    }
  }

  public async prepareConsentPreview(
    incidentId: string,
    profileId: string,
  ): Promise<DiagnosisConsentPreview | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const preview: DiagnosisConsentPreview = await this.ipc.invoke(incidentIpcChannels.aiPrepareConsent, {
        incidentId,
        profileId,
      });
      runInAction(() => {
        this.consentPreview = preview;
        this.isActionLoading = false;
      });
      return preview;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al preparar vista previa de consentimiento";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async executeDiagnosis(
    incidentId: string,
    profileId: string,
    consentToken: string,
    timeoutMs?: number,
  ): Promise<AiDiagnosisReport | null> {
    this.isAnalyzingAi = true;
    this.error = null;
    try {
      const report: AiDiagnosisReport = await this.ipc.invoke(incidentIpcChannels.aiExecuteDiagnosis, {
        incidentId,
        profileId,
        consentToken,
        timeoutMs,
      });

      await this.selectIncident(incidentId);

      runInAction(() => {
        this.activeDiagnosis = report;
        this.consentPreview = null;
        this.isAnalyzingAi = false;
      });
      return report;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al ejecutar diagnóstico IA";
        this.isAnalyzingAi = false;
      });
      return null;
    }
  }

  public async verifyRemediation(
    incidentId: string,
    humanOperator: string,
    currentEvidenceId?: string,
  ): Promise<any> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const result = await this.ipc.invoke(incidentIpcChannels.aiVerifyRemediation, {
        incidentId,
        humanOperator,
        currentEvidenceId,
      });

      await this.selectIncident(incidentId);

      runInAction(() => {
        this.isActionLoading = false;
      });
      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al verificar remediación";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async loadContextFiles(incidentId: string): Promise<EphemeralFileDescriptor[]> {
    try {
      const files: EphemeralFileDescriptor[] = await this.ipc.invoke(incidentIpcChannels.contextList, incidentId);
      runInAction(() => {
        this.activeIncidentContextFiles = files || [];
      });
      return files;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar archivos de contexto";
      });
      return [];
    }
  }

  public async addContextFile(input: AddEphemeralFileInput): Promise<EphemeralFileDescriptor | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const descriptor: EphemeralFileDescriptor = await this.ipc.invoke(incidentIpcChannels.contextAdd, input);
      runInAction(() => {
        const existingIdx = this.activeIncidentContextFiles.findIndex(f => f.filename.toLowerCase() === descriptor.filename.toLowerCase());
        if (existingIdx >= 0) {
          this.activeIncidentContextFiles[existingIdx] = descriptor;
        } else {
          this.activeIncidentContextFiles = [...this.activeIncidentContextFiles, descriptor];
        }
        // Invalidate current consent preview when files change (Anti-Tamper)
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return descriptor;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al adjuntar archivo de contexto";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async updateContextMetadata(input: UpdateEphemeralMetadataInput): Promise<EphemeralFileDescriptor | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const updated: EphemeralFileDescriptor = await this.ipc.invoke(incidentIpcChannels.contextUpdateMetadata, input);
      runInAction(() => {
        const idx = this.activeIncidentContextFiles.findIndex(f => f.id === updated.id);
        if (idx >= 0) {
          this.activeIncidentContextFiles[idx] = updated;
        }
        // Invalidate current consent preview when metadata changes (Anti-Tamper)
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return updated;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al actualizar metadatos del archivo";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async removeContextFile(incidentId: string, fileId: string): Promise<boolean> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const res = await this.ipc.invoke(incidentIpcChannels.contextRemove, incidentId, fileId);
      runInAction(() => {
        this.activeIncidentContextFiles = this.activeIncidentContextFiles.filter(f => f.id !== fileId);
        // Invalidate current consent preview when files change (Anti-Tamper)
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return Boolean(res?.success);
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al eliminar archivo de contexto";
        this.isActionLoading = false;
      });
      return false;
    }
  }

  public async clearContextFiles(incidentId: string): Promise<boolean> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const res = await this.ipc.invoke(incidentIpcChannels.contextClear, incidentId);
      runInAction(() => {
        this.activeIncidentContextFiles = [];
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return Boolean(res?.success);
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al purgar contexto manual";
        this.isActionLoading = false;
      });
      return false;
    }
  }

  // Local Incident Scanner methods (H8.5)
  public async loadScannerStatus(): Promise<LocalScannerStatus> {
    try {
      const status = await this.ipc.invoke(incidentIpcChannels.scannerGetStatus);
      if (status && typeof status === "object") {
        runInAction(() => {
          this.scannerStatus = status;
        });
      }
      return this.scannerStatus;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      return this.scannerStatus;
    }
  }

  public async startScanner(scope: LocalScannerScope, options?: LocalScannerOptions): Promise<LocalScannerStatus> {
    this.isScannerToggling = true;
    this.error = null;
    try {
      const status = await this.ipc.invoke(incidentIpcChannels.scannerStart, { scope, options });
      runInAction(() => {
        if (status && typeof status === "object") {
          this.scannerStatus = status;
        }
        this.isScannerToggling = false;
      });
      return this.scannerStatus;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || String(err);
        this.isScannerToggling = false;
      });
      throw err;
    }
  }

  public async stopScanner(): Promise<LocalScannerStatus> {
    this.isScannerToggling = true;
    this.error = null;
    try {
      const status = await this.ipc.invoke(incidentIpcChannels.scannerStop);
      runInAction(() => {
        if (status && typeof status === "object") {
          this.scannerStatus = status;
        }
        this.isScannerToggling = false;
      });
      return this.scannerStatus;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || String(err);
        this.isScannerToggling = false;
      });
      throw err;
    }
  }

  public async processScannerSnapshot(snapshot: K8sSnapshot): Promise<LocalScannerSignal[]> {
    try {
      const signals = await this.ipc.invoke(incidentIpcChannels.scannerProcessSnapshot, snapshot);
      await this.loadIncidents();
      await this.loadScannerStatus();
      return signals;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      throw err;
    }
  }

  public async loadTimeline(id: string): Promise<TimelineEvent[]> {
    try {
      const timeline = await (this.ipc.invoke(incidentIpcChannels.getTimeline, id) as Promise<TimelineEvent[]>);

      runInAction(() => {
        if (this.activeIncidentId === id) {
          this.activeIncidentTimeline = timeline;
        }
      });

      return timeline;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || "Error al cargar la línea de tiempo del incidente";
      });
      throw err;
    }
  }

  public async executeScannerAlertAction(payload: ScannerAlertActionPayload): Promise<ScannerAlertActionResult> {
    try {
      const result = await this.ipc.invoke(incidentIpcChannels.scannerAlertAction, payload);
      await this.loadIncidents();
      await this.loadScannerStatus();
      if (this.activeIncidentId === payload.incidentId) {
        await this.loadTimeline(payload.incidentId);
      }
      return result;
    } catch (err: any) {
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      throw err;
    }
  }
}
