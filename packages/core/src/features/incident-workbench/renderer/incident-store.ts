/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { makeAutoObservable, runInAction } from "mobx";
import { incidentIpcChannels, type IncidentTransitionPayload, type IncidentTransitionResult } from "../../../common/incident/incident-ipc";
import type {
  AiDefaultProviderStatus,
  AiProviderProfile,
  CreateAiProfileInput,
  OpenAiModelDescriptor,
} from "../../../common/incident/ai-profile-types";
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
  public aiDefaultStatus: AiDefaultProviderStatus = { state: "not_configured" };
  public openAiModels: OpenAiModelDescriptor[] = [];
  public oauthConnectionError: string | null = null;
  public openAiNetworkAuthorized = false;
  public activeDiagnosis: AiDiagnosisReport | null = null;
  public diagnosisHistory: AiDiagnosisReport[] = [];
  public consentPreview: DiagnosisConsentPreview | null = null;
  public isAnalyzingAi = false;
  public activeIncidentContextFiles: EphemeralFileDescriptor[] = [];

  // Active Cluster Isolation & Security Context (H8.8-05-R3/R4)
  public activeClusterId: string | null = null;
  public activeNamespace: string | null = null;
  public scopeGeneration = 0;
  private readonly disposers: Array<() => void> = [];

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

  constructor(private readonly ipc: IpcInvoker, initialClusterId?: string) {
    if (initialClusterId) {
      this.activeClusterId = initialClusterId;
    }
    makeAutoObservable(this, {}, { autoBind: true });
  }

  public registerDisposer(disposer: () => void): void {
    this.disposers.push(disposer);
  }

  public dispose(): void {
    for (const d of this.disposers) {
      try {
        d();
      } catch {
        // ignore errors during dispose
      }
    }
    this.disposers.length = 0;
    this.purgeState();
  }

  public purgeState(): void {
    this.incidents = [];
    this.activeIncidentId = null;
    this.activeIncidentTimeline = [];
    this.activeIncidentEvidence = [];
    this.activeIncidentContextFiles = [];
    this.activeDiagnosis = null;
    this.diagnosisHistory = [];
    this.consentPreview = null;
    this.error = null;
    this.isLoading = false;
    this.isActionLoading = false;
    this.isAnalyzingAi = false;
    this.isPurging = false;
    this.isScannerToggling = false;
  }

  public setActiveClusterContext(clusterId: string | null, namespace?: string | null): void {
    const clusterChanged = this.activeClusterId !== clusterId;
    const namespaceChanged = this.activeNamespace !== (namespace ?? null);

    if (clusterChanged || namespaceChanged) {
      // H8.8-05-R4 (P0-B): Invalidate in-flight async operations by advancing scopeGeneration and purging cached state
      this.scopeGeneration++;
      this.purgeState();
    }
    this.activeClusterId = clusterId;
    this.activeNamespace = namespace ?? null;
  }

  public assertClusterContext(claimedClusterId?: string, actionName = "operation"): void {
    if (!this.activeClusterId) {
      throw new Error(`SecurityError: No authorized cluster context found for this window. Operation '${actionName}' denied fail-closed.`);
    }
    if (claimedClusterId && claimedClusterId !== this.activeClusterId) {
      throw new Error(`SecurityError: Claimed clusterId '${claimedClusterId}' does not match active window cluster '${this.activeClusterId}'. Cross-cluster spoofing detected.`);
    }
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
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isLoading = true;
    this.error = null;

    try {
      this.assertClusterContext(filter?.clusterId, "loadIncidents");

      const scopedFilter: IncidentFilter = {
        ...filter,
        clusterId: this.activeClusterId!,
        ...(this.activeNamespace && !filter?.namespace ? { namespace: this.activeNamespace } : {}),
      };

      const data: Incident[] = await this.ipc.invoke(incidentIpcChannels.list, scopedFilter);

      // Verify scopeGeneration and activeClusterId before committing state
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }

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
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }
      runInAction(() => {
        this.error = err.message || "Error al cargar la lista de incidentes";
        this.isLoading = false;
      });
      throw err;
    }
  }

  public async selectIncident(id: string | null): Promise<void> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
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
      this.assertClusterContext(undefined, "selectIncident");

      const existingIncident = this.incidents.find(i => i.id === id);
      if (existingIncident && existingIncident.clusterId && existingIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${id}' does not belong to active cluster '${this.activeClusterId}'. Cross-cluster access denied.`);
      }

      const [timeline, evidence, latestDiagnosis, contextFiles] = await Promise.all([
        this.ipc.invoke(incidentIpcChannels.getTimeline, id) as Promise<TimelineEvent[]>,
        this.ipc.invoke(incidentIpcChannels.getEvidence, id) as Promise<EvidenceSnippet[]>,
        this.ipc.invoke(incidentIpcChannels.aiGetLatestDiagnosis, id).catch(() => null) as Promise<AiDiagnosisReport | null>,
        this.ipc.invoke(incidentIpcChannels.contextList, id).catch(() => []) as Promise<EphemeralFileDescriptor[]>,
      ]);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }

      runInAction(() => {
        this.activeIncidentTimeline = timeline;
        this.activeIncidentEvidence = evidence;
        this.activeIncidentContextFiles = contextFiles ?? [];
        this.activeDiagnosis = latestDiagnosis ?? null;
        this.isActionLoading = false;
      });
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }
      runInAction(() => {
        this.activeIncidentId = null;
        this.activeIncidentTimeline = [];
        this.activeIncidentEvidence = [];
        this.error = err.message || "Error al cargar los detalles del incidente";
        this.isActionLoading = false;
      });
      throw err;
    }
  }

  public async createIncident(input: CreateIncidentInput, actor?: TimelineActor): Promise<Incident | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;

    try {
      this.assertClusterContext(input.clusterId, "createIncident");

      const newIncident: Incident = await this.ipc.invoke(incidentIpcChannels.create, input, actor);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      runInAction(() => {
        this.incidents = [newIncident, ...this.incidents];
        this.activeIncidentId = newIncident.id;
        this.isActionLoading = false;
      });

      await this.selectIncident(newIncident.id);

      return newIncident;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al crear el incidente";
        this.isActionLoading = false;
      });

      throw err;
    }
  }

  public async transitionStatus(payload: {
    toStatus: IncidentStatus;
    reason: string;
    actor: TimelineActor;
    evidenceIds?: string[];
  }): Promise<boolean> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    if (!this.activeIncidentId) return false;

    this.isActionLoading = true;
    this.error = null;

    try {
      this.assertClusterContext(undefined, "transitionStatus");

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

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
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
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
      }
      runInAction(() => {
        this.error = err.message || "Error en la transición de estado";
        this.isActionLoading = false;
      });

      return false;
    }
  }

  public async ingestEvidence(input: IngestEvidenceInput): Promise<IngestEvidenceResult | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;

    try {
      this.assertClusterContext(input.clusterId, "ingestEvidence");

      const result: IngestEvidenceResult = await this.ipc.invoke(
        incidentIpcChannels.ingestEvidence,
        input,
      );

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      if (this.activeIncidentId === input.incidentId) {
        const updatedEvidence: EvidenceSnippet[] = await this.ipc.invoke(
          incidentIpcChannels.getEvidence,
          input.incidentId,
        );

        if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
          return null;
        }

        runInAction(() => {
          this.activeIncidentEvidence = updatedEvidence;
        });
      }

      runInAction(() => {
        this.isActionLoading = false;
      });

      return result;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al incorporar la evidencia";
        this.isActionLoading = false;
      });

      throw err;
    }
  }

  public async ingestUserContext(input: UserContextMetadataInput): Promise<IngestEvidenceResult | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;

    try {
      this.assertClusterContext(input.clusterId, "ingestUserContext");

      const scopedInput: UserContextMetadataInput = {
        ...input,
        clusterId: this.activeClusterId!,
        ...(this.activeNamespace && !input.namespace ? { namespace: this.activeNamespace } : {}),
      };

      const result: IngestEvidenceResult = await this.ipc.invoke(
        incidentIpcChannels.ingestUserContext,
        scopedInput,
      );

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      if (this.activeIncidentId === input.incidentId) {
        const updatedEvidence: EvidenceSnippet[] = await this.ipc.invoke(
          incidentIpcChannels.getEvidence,
          input.incidentId,
        );

        if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
          return null;
        }

        runInAction(() => {
          this.activeIncidentEvidence = updatedEvidence;
        });
      }

      runInAction(() => {
        this.isActionLoading = false;
      });

      return result;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al adjuntar metadatos de contexto de usuario";
        this.isActionLoading = false;
      });

      return null;
    }
  }

  public async togglePin(id: string): Promise<void> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    const incident = this.incidents.find(i => i.id === id);

    if (!incident) return;

    const newPinned = !incident.isPinned;

    try {
      this.assertClusterContext(incident.clusterId, "togglePin");
      const patch: UpdateIncidentInput = { isPinned: newPinned };
      const updated: Incident = await this.ipc.invoke(incidentIpcChannels.update, id, patch);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }

      runInAction(() => {
        const index = this.incidents.findIndex(i => i.id === id);

        if (index >= 0) {
          this.incidents[index] = updated;
        }
      });
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return;
      }
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

  public async loadAiDefaultStatus(): Promise<AiDefaultProviderStatus> {
    try {
      const status: AiDefaultProviderStatus = await this.ipc.invoke(incidentIpcChannels.aiGetDefaultProvider);
      if (!status || typeof status.state !== "string") {
        return this.aiDefaultStatus;
      }
      runInAction(() => {
        this.aiDefaultStatus = status;
      });
      return status;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al cargar proveedor IA predeterminado";
      });
      return this.aiDefaultStatus;
    }
  }

  public async setAiDefaultProfile(profileId: string | null): Promise<AiDefaultProviderStatus> {
    try {
      const status: AiDefaultProviderStatus = await this.ipc.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId });
      runInAction(() => {
        this.aiDefaultStatus = status;
        this.consentPreview = null;
      });
      return status;
    } catch (err: any) {
      return this.recoverAiDefaultStatus(err?.message || "Error al guardar proveedor predeterminado");
    }
  }

  public async ensureDemoAiProfile(): Promise<AiDefaultProviderStatus> {
    try {
      const status: AiDefaultProviderStatus = await this.ipc.invoke(incidentIpcChannels.aiEnsureDemoProfile);
      runInAction(() => {
        this.aiDefaultStatus = status;
      });
      await this.loadAiProfiles();
      return status;
    } catch (err: any) {
      return this.recoverAiDefaultStatus(err?.message || "Error al crear perfil Demo offline");
    }
  }

  /** On a failed default-provider write, re-read the backend truth, then surface the error. */
  private async recoverAiDefaultStatus(message: string): Promise<AiDefaultProviderStatus> {
    const status = await this.loadAiDefaultStatus();
    runInAction(() => {
      this.error = message;
    });
    return status;
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

  public async loadOpenAiNetworkStatus(): Promise<boolean> {
    try {
      const enabled = await this.ipc.invoke(incidentIpcChannels.aiGetOpenAiNetworkStatus);
      runInAction(() => { this.openAiNetworkAuthorized = enabled === true; });
      return enabled === true;
    } catch {
      runInAction(() => { this.openAiNetworkAuthorized = false; });
      return false;
    }
  }

  public async connectChatGptWithAuthorization(options?: {
    profileId?: string;
    profileName?: string;
  }): Promise<AiProviderProfile | null> {
    runInAction(() => {
      this.isActionLoading = true;
      this.oauthConnectionError = null;
      this.error = null;
    });
    try {
      const approved = await this.ipc.invoke(incidentIpcChannels.aiAuthorizeOpenAiNetwork);
      if (approved !== true) {
        runInAction(() => { this.isActionLoading = false; });
        return null; // User cancelled or native permission denied.
      }
      runInAction(() => { this.openAiNetworkAuthorized = true; });
      await this.loadAiDefaultStatus(); // Refresh "Conexión bloqueada" after permission.
      return this.signInWithChatGpt(options);
    } catch (error: any) {
      const message = error?.message || "No se pudo autorizar la red externa de OpenAI.";
      runInAction(() => {
        this.oauthConnectionError = message;
        this.error = message;
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async signInWithChatGpt(options?: {
    profileId?: string;
    profileName?: string;
  }): Promise<AiProviderProfile | null> {
    this.isActionLoading = true;
    this.error = null;
    this.oauthConnectionError = null;
    try {
      const profile: AiProviderProfile = await this.ipc.invoke(
        incidentIpcChannels.aiStartOpenAiOAuthSignIn,
        options ?? {},
      );
      await this.loadAiProfiles();
      runInAction(() => {
        this.isActionLoading = false;
      });
      return profile;
    } catch (err: any) {
      const msg =
        err?.message ||
        "Conexión con ChatGPT no disponible hasta autorizar la red externa.";
      runInAction(() => {
        this.oauthConnectionError = msg;
        this.error = msg;
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async disconnectOpenAiOAuth(profileId: string): Promise<AiProviderProfile | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const profile: AiProviderProfile = await this.ipc.invoke(
        incidentIpcChannels.aiDisconnectOpenAiOAuth,
        profileId,
      );
      await this.loadAiProfiles();
      runInAction(() => {
        this.openAiModels = [];
        if (profile.remoteRevocationConfirmed === false) {
          this.oauthConnectionError =
            profile.unavailableReason ||
            "Cuenta de ChatGPT desconectada y credenciales locales eliminadas de forma segura. Advertencia: la revocación remota no pudo confirmarse.";
        } else {
          this.oauthConnectionError = null;
        }
        this.isActionLoading = false;
      });
      return profile;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al desconectar la cuenta de ChatGPT";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async fetchOpenAiModels(profileId: string): Promise<OpenAiModelDescriptor[]> {
    try {
      const models: OpenAiModelDescriptor[] = await this.ipc.invoke(
        incidentIpcChannels.aiListOpenAiModels,
        profileId,
      );
      runInAction(() => {
        this.openAiModels = models;
      });
      await this.loadAiProfiles();
      return models;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al consultar modelos disponibles de OpenAI";
      });
      return [];
    }
  }

  public async createAiProfile(input: CreateAiProfileInput): Promise<AiProviderProfile | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const profile: AiProviderProfile = await this.ipc.invoke(
        incidentIpcChannels.aiCreateProfile,
        input,
      );
      await this.loadAiProfiles();
      runInAction(() => {
        this.isActionLoading = false;
      });
      return profile;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al crear perfil de proveedor IA";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async updateAiProfile(
    id: string,
    input: { name?: string; model?: string; status?: "active" | "disabled" },
  ): Promise<AiProviderProfile | null> {
    this.isActionLoading = true;
    this.error = null;
    try {
      const profile: AiProviderProfile = await this.ipc.invoke(
        incidentIpcChannels.aiUpdateProfile,
        id,
        input,
      );
      await this.loadAiProfiles();
      await this.loadAiDefaultStatus();
      runInAction(() => {
        this.isActionLoading = false;
      });
      return profile;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al actualizar perfil de proveedor IA";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async deleteAiProfile(id: string): Promise<boolean> {
    this.isActionLoading = true;
    this.error = null;
    try {
      await this.ipc.invoke(incidentIpcChannels.aiDeleteProfile, id);
      await this.loadAiProfiles();
      await this.loadAiDefaultStatus();
      runInAction(() => {
        this.isActionLoading = false;
      });
      return true;
    } catch (err: any) {
      runInAction(() => {
        this.error = err.message || "Error al eliminar perfil de proveedor IA";
        this.isActionLoading = false;
      });
      return false;
    }
  }

  public async loadDiagnosisHistory(incidentId: string): Promise<AiDiagnosisReport[]> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      this.assertClusterContext(undefined, "loadDiagnosisHistory");
      const history: AiDiagnosisReport[] = await this.ipc.invoke(incidentIpcChannels.aiListDiagnoses, incidentId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }

      runInAction(() => {
        this.diagnosisHistory = history;
        if (history.length > 0) {
          this.activeDiagnosis = history[0];
        }
      });
      return history;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }
      runInAction(() => {
        this.error = err.message || "Error al cargar diagnósticos de IA";
      });
      return [];
    }
  }

  public async prepareConsentPreview(
    incidentId: string,
  ): Promise<DiagnosisConsentPreview | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(undefined, "prepareConsentPreview");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster AI consent preparation denied.`);
      }
      const preview: DiagnosisConsentPreview = await this.ipc.invoke(incidentIpcChannels.aiPrepareConsent, {
        incidentId,
      });

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      runInAction(() => {
        this.consentPreview = preview;
        this.isActionLoading = false;
      });
      return preview;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al preparar vista previa de consentimiento";
        this.isActionLoading = false;
      });
      throw err;
    }
  }

  public async executeDiagnosis(
    incidentId: string,
    consentToken: string,
    timeoutMs?: number,
  ): Promise<AiDiagnosisReport | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isAnalyzingAi = true;
    this.error = null;
    try {
      this.assertClusterContext(undefined, "executeDiagnosis");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster AI diagnosis execution denied.`);
      }
      const report: AiDiagnosisReport = await this.ipc.invoke(incidentIpcChannels.aiExecuteDiagnosis, {
        incidentId,
        consentToken,
        timeoutMs,
      });

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      await this.selectIncident(incidentId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      runInAction(() => {
        this.activeDiagnosis = report;
        this.consentPreview = null;
        this.isAnalyzingAi = false;
      });
      return report;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al ejecutar diagnóstico IA";
        this.isAnalyzingAi = false;
      });
      throw err;
    }
  }

  public async verifyRemediation(
    incidentId: string,
    humanOperator: string,
    currentEvidenceId?: string,
  ): Promise<any> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(undefined, "verifyRemediation");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster remediation verification denied.`);
      }

      const result = await this.ipc.invoke(incidentIpcChannels.aiVerifyRemediation, {
        incidentId,
        humanOperator,
        currentEvidenceId,
      });

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      await this.selectIncident(incidentId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

      runInAction(() => {
        this.isActionLoading = false;
      });
      return result;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al verificar remediación";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async loadContextFiles(incidentId: string): Promise<EphemeralFileDescriptor[]> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      this.assertClusterContext(undefined, "loadContextFiles");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster context access denied.`);
      }

      const files: EphemeralFileDescriptor[] = await this.ipc.invoke(incidentIpcChannels.contextList, incidentId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }

      runInAction(() => {
        this.activeIncidentContextFiles = files || [];
      });
      return files;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }
      runInAction(() => {
        this.error = err.message || "Error al cargar archivos de contexto";
      });
      return [];
    }
  }

  public async addContextFile(input: AddEphemeralFileInput): Promise<EphemeralFileDescriptor | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(input.metadata?.clusterId, "addContextFile");
      const targetIncident = this.incidents.find(i => i.id === input.incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${input.incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster context file addition denied.`);
      }

      const descriptor: EphemeralFileDescriptor = await this.ipc.invoke(incidentIpcChannels.contextAdd, input);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

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
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al adjuntar archivo de contexto";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async updateContextMetadata(input: UpdateEphemeralMetadataInput): Promise<EphemeralFileDescriptor | null> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(input.metadata?.clusterId, "updateContextMetadata");
      const targetIncident = this.incidents.find(i => i.id === input.incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${input.incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster context metadata update denied.`);
      }

      const updated: EphemeralFileDescriptor = await this.ipc.invoke(incidentIpcChannels.contextUpdateMetadata, input);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }

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
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return null;
      }
      runInAction(() => {
        this.error = err.message || "Error al actualizar metadatos del archivo";
        this.isActionLoading = false;
      });
      return null;
    }
  }

  public async removeContextFile(incidentId: string, fileId: string): Promise<boolean> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(undefined, "removeContextFile");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster context file removal denied.`);
      }

      const res = await this.ipc.invoke(incidentIpcChannels.contextRemove, incidentId, fileId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
      }

      runInAction(() => {
        this.activeIncidentContextFiles = this.activeIncidentContextFiles.filter(f => f.id !== fileId);
        // Invalidate current consent preview when files change (Anti-Tamper)
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return Boolean(res?.success);
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
      }
      runInAction(() => {
        this.error = err.message || "Error al eliminar archivo de contexto";
        this.isActionLoading = false;
      });
      return false;
    }
  }

  public async clearContextFiles(incidentId: string): Promise<boolean> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isActionLoading = true;
    this.error = null;
    try {
      this.assertClusterContext(undefined, "clearContextFiles");
      const targetIncident = this.incidents.find(i => i.id === incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster context clearing denied.`);
      }

      const res = await this.ipc.invoke(incidentIpcChannels.contextClear, incidentId);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
      }

      runInAction(() => {
        this.activeIncidentContextFiles = [];
        this.consentPreview = null;
        this.isActionLoading = false;
      });
      return Boolean(res?.success);
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return false;
      }
      runInAction(() => {
        this.error = err.message || "Error al purgar contexto manual";
        this.isActionLoading = false;
      });
      return false;
    }
  }

  // Local Incident Scanner methods (H8.5)
  public async loadScannerStatus(): Promise<LocalScannerStatus> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      const status = await this.ipc.invoke(incidentIpcChannels.scannerGetStatus);
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }

      if (status && typeof status === "object") {
        runInAction(() => {
          this.scannerStatus = status;
        });
      }
      return this.scannerStatus;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      return this.scannerStatus;
    }
  }

  public async startScanner(scope: LocalScannerScope, options?: LocalScannerOptions): Promise<LocalScannerStatus> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isScannerToggling = true;
    this.error = null;
    try {
      this.assertClusterContext(scope.clusterId, "startScanner");
      const status = await this.ipc.invoke(incidentIpcChannels.scannerStart, { scope, options });

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }

      runInAction(() => {
        if (status && typeof status === "object") {
          this.scannerStatus = status;
        }
        this.isScannerToggling = false;
      });
      return this.scannerStatus;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }
      runInAction(() => {
        this.error = err?.message || String(err);
        this.isScannerToggling = false;
      });
      throw err;
    }
  }

  public async stopScanner(): Promise<LocalScannerStatus> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    this.isScannerToggling = true;
    this.error = null;
    try {
      const status = await this.ipc.invoke(incidentIpcChannels.scannerStop);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }

      runInAction(() => {
        if (status && typeof status === "object") {
          this.scannerStatus = status;
        }
        this.isScannerToggling = false;
      });
      return this.scannerStatus;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return this.scannerStatus;
      }
      runInAction(() => {
        this.error = err?.message || String(err);
        this.isScannerToggling = false;
      });
      throw err;
    }
  }

  public async processScannerSnapshot(snapshot: K8sSnapshot): Promise<LocalScannerSignal[]> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      this.assertClusterContext(undefined, "processScannerSnapshot");
      const signals = await this.ipc.invoke(incidentIpcChannels.scannerProcessSnapshot, snapshot);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }

      await this.loadIncidents();
      await this.loadScannerStatus();
      return signals;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      throw err;
    }
  }

  public async loadTimeline(id: string): Promise<TimelineEvent[]> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      this.assertClusterContext(undefined, "loadTimeline");
      const timeline = await (this.ipc.invoke(incidentIpcChannels.getTimeline, id) as Promise<TimelineEvent[]>);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }

      runInAction(() => {
        if (this.activeIncidentId === id) {
          this.activeIncidentTimeline = timeline;
        }
      });

      return timeline;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return [];
      }
      runInAction(() => {
        this.error = err?.message || "Error al cargar la línea de tiempo del incidente";
      });
      throw err;
    }
  }

  public async executeScannerAlertAction(payload: ScannerAlertActionPayload): Promise<ScannerAlertActionResult> {
    const currentScope = this.scopeGeneration;
    const currentCluster = this.activeClusterId;
    try {
      this.assertClusterContext(undefined, "executeScannerAlertAction");
      const targetIncident = this.incidents.find(i => i.id === payload.incidentId) ?? this.activeIncident;
      if (targetIncident && targetIncident.clusterId && targetIncident.clusterId !== this.activeClusterId) {
        throw new Error(`SecurityError: Incident '${payload.incidentId}' belongs to cluster '${targetIncident.clusterId}' which mismatches active cluster '${this.activeClusterId}'. Cross-cluster alert action denied.`);
      }

      const result = await this.ipc.invoke(incidentIpcChannels.scannerAlertAction, payload);

      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        return result;
      }

      await this.loadIncidents();
      await this.loadScannerStatus();
      if (this.activeIncidentId === payload.incidentId) {
        await this.loadTimeline(payload.incidentId);
      }
      return result;
    } catch (err: any) {
      if (this.scopeGeneration !== currentScope || this.activeClusterId !== currentCluster) {
        throw err;
      }
      runInAction(() => {
        this.error = err?.message || String(err);
      });
      throw err;
    }
  }
}
