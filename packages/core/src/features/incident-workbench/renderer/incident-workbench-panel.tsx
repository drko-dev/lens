/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./incident-workbench-panel.module.scss";
import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import { IncidentStateMachine } from "../../../common/incident/incident-state-machine";
import type { IncidentStatus, TimelineActor } from "../../../common/incident/incident-types";
import type {
  DeclaredEnvironment,
  EphemeralFileDescriptor,
  EphemeralFileType,
} from "../../../common/incident/ephemeral-context-types";
import type { IncidentStore } from "./incident-store";
import incidentStoreInjectable from "./incident-store.injectable";

export interface IncidentWorkbenchPanelProps {
  incidentId?: string;
  onClose?: () => void;
}

interface Dependencies {
  store: IncidentStore;
}

export const NonInjectedIncidentWorkbenchPanel = observer(({ incidentId, onClose, store }: IncidentWorkbenchPanelProps & Dependencies) => {
  const [activeTab, setActiveTab] = useState<"diagnostic" | "evidence" | "timeline">("diagnostic");
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<IncidentStatus | null>(null);
  const [justification, setJustification] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [isAddEvidenceModalOpen, setIsAddEvidenceModalOpen] = useState(false);
  const [evidenceType, setEvidenceType] = useState<"pod_logs" | "k8s_event" | "resource_manifest">("pod_logs");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceContent, setEvidenceContent] = useState("");

  // AI Diagnostic States (H8.3)
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [humanOperator, setHumanOperator] = useState("Gustavo Marcon (SRE)");

  // Ephemeral Manual Context States (H8.4 / H8-019 & H8-020)
  const [isAddContextModalOpen, setIsAddContextModalOpen] = useState(false);
  const [isEditContextModalOpen, setIsEditContextModalOpen] = useState(false);
  const [contextFilename, setContextFilename] = useState("");
  const [contextContent, setContextContent] = useState("");
  const [contextFileType, setContextFileType] = useState<EphemeralFileType>("dockerfile");
  const [contextEnv, setContextEnv] = useState<DeclaredEnvironment>("development");
  const [contextResource, setContextResource] = useState("");
  const [contextNamespace, setContextNamespace] = useState("");
  const [contextVersion, setContextVersion] = useState("");
  const [contextProvenance, setContextProvenance] = useState("operator-manual");
  const [contextNotes, setContextNotes] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);

  const incident = store.activeIncident;

  const resetContextForm = () => {
    setContextFilename("");
    setContextContent("");
    setContextNotes("");
    setContextResource("");
    setContextNamespace("");
    setContextVersion("");
    setContextProvenance("operator-manual");
    setContextEnv("development");
    setContextFileType("dockerfile");
  };

  useEffect(() => {
    return () => {
      resetContextForm();
    };
  }, []);

  useEffect(() => {
    if (incidentId && incidentId !== store.activeIncidentId) {
      store.selectIncident(incidentId);
    }
  }, [incidentId, store]);

  useEffect(() => {
    store.loadAiProfiles().then(profiles => {
      if (profiles && Array.isArray(profiles) && profiles.length > 0 && !selectedProfileId) {
        setSelectedProfileId(profiles[0].id);
      }
    }).catch(() => {});
  }, [store, selectedProfileId]);

  if (!incident) {
    return (
      <div className={styles.workbench} data-testid="incident-workbench-empty">
        <div className={styles.topBar}>
          <span className={styles.incidentTitle}>Incident Workbench</span>
        </div>
        <div className={styles.contentArea} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Icon material="report_problem" style={{ fontSize: 48, color: "#64748b", marginBottom: 16 }} />
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Ningún incidente seleccionado para diagnóstico.</p>
        </div>
      </div>
    );
  }

  const allowedTransitions = IncidentStateMachine.getAllowedNextStates(incident.status);

  const handleOpenTransition = (status: IncidentStatus) => {
    setTargetStatus(status);
    setJustification("");
    setSelectedEvidenceIds([]);
    setIsTransitionModalOpen(true);
  };

  const handleExecuteTransition = async () => {
    if (!targetStatus || justification.trim().length < 5) return;

    const actor: TimelineActor = {
      type: "human",
      name: "operator",
    };

    await store.transitionStatus({
      toStatus: targetStatus,
      reason: justification.trim(),
      actor,
      evidenceIds: selectedEvidenceIds,
    });

    setIsTransitionModalOpen(false);
  };

  const handleAddEvidence = async () => {
    if (!evidenceContent.trim()) return;

    await store.ingestEvidence({
      incidentId: incident.id,
      type: evidenceType,
      origin: "Incident Workbench",
      title: evidenceTitle.trim() || `Evidencia manual (${evidenceType})`,
      rawContent: evidenceContent,
      clusterId: incident.clusterId,
      namespace: incident.namespace,
      resourceKind: incident.workloadKind,
      resourceName: incident.workloadName,
    });

    setIsAddEvidenceModalOpen(false);
    setEvidenceContent("");
    setEvidenceTitle("");
  };

  const handleCloseAddContext = () => {
    setIsAddContextModalOpen(false);
    resetContextForm();
  };

  const handleOpenAddContext = () => {
    resetContextForm();
    setContextResource(incident?.workloadName || "");
    setContextNamespace(incident?.namespace || "");
    setIsAddContextModalOpen(true);
  };

  const handleSaveContextFile = async () => {
    if (!incident || !contextFilename.trim() || !contextContent.trim()) return;

    await store.addContextFile({
      incidentId: incident.id,
      filename: contextFilename.trim(),
      fileType: contextFileType,
      rawContent: contextContent,
      metadata: {
        environment: contextEnv,
        resourceName: contextResource.trim() || undefined,
        namespace: contextNamespace.trim() || undefined,
        version: contextVersion.trim() || undefined,
        provenance: contextProvenance.trim() || "operator-manual",
        notes: contextNotes.trim() || undefined,
      },
    });

    handleCloseAddContext();
  };

  const handleOpenEditContext = (file: EphemeralFileDescriptor) => {
    setEditingFileId(file.id);
    setContextFilename(file.filename);
    setContextFileType(file.fileType);
    setContextEnv(file.metadata.environment);
    setContextResource(file.metadata.resourceName || "");
    setContextNamespace(file.metadata.namespace || "");
    setContextVersion(file.metadata.version || "");
    setContextProvenance(file.metadata.provenance || "operator-manual");
    setContextNotes(file.metadata.notes || "");
    setIsEditContextModalOpen(true);
  };

  const handleSaveEditContext = async () => {
    if (!incident || !editingFileId) return;

    await store.updateContextMetadata({
      incidentId: incident.id,
      fileId: editingFileId,
      metadata: {
        environment: contextEnv,
        resourceName: contextResource.trim() || undefined,
        namespace: contextNamespace.trim() || undefined,
        version: contextVersion.trim() || undefined,
        provenance: contextProvenance.trim() || "operator-manual",
        notes: contextNotes.trim() || undefined,
      },
    });

    setIsEditContextModalOpen(false);
    setEditingFileId(null);
  };

  const handleRemoveContextFile = async (fileId: string) => {
    if (!incident) return;
    await store.removeContextFile(incident.id, fileId);
  };

  const handleOpenAiConsent = async () => {
    let profileId = selectedProfileId;
    if (!profileId && store.aiProfiles.length > 0) {
      const preferredMock = store.aiProfiles.find(p => p.provider === "mock") || store.aiProfiles[0];
      profileId = preferredMock.id;
      setSelectedProfileId(profileId);
    }
    if (!profileId) {
      const profiles = await store.loadAiProfiles();
      if (profiles && profiles.length > 0) {
        const preferredMock = profiles.find(p => p.provider === "mock") || profiles[0];
        profileId = preferredMock.id;
        setSelectedProfileId(profileId);
      }
    }
    if (!profileId) {
      return;
    }
    await store.prepareConsentPreview(incident.id, profileId);
    setIsConsentModalOpen(true);
  };

  const handleConfirmAiDiagnosis = async () => {
    if (!store.consentPreview) return;
    const profileId = selectedProfileId || store.aiProfiles[0]?.id;
    if (!profileId) return;

    await store.executeDiagnosis(
      incident.id,
      profileId,
      store.consentPreview.consentToken,
    );
    setIsConsentModalOpen(false);
  };

  const handleExecuteVerification = async () => {
    if (!humanOperator.trim()) return;
    await store.verifyRemediation(incident.id, humanOperator.trim());
    setIsVerifyModalOpen(false);
  };

  const activeDiagnosis = store.activeDiagnosis;

  return (
    <div className={styles.workbench} data-testid="incident-workbench-panel">
      {/* Top Bar with Incident Meta and Allowed Transitions */}
      <div className={styles.topBar}>
        <div className={styles.incidentMeta}>
          <span className={styles.incidentId}>{incident.id}</span>
          <h2 className={styles.incidentTitle}>{incident.title}</h2>
          <span className={styles.workflowBadge}>
            <Icon material="timeline" style={{ fontSize: 16 }} />
            {incident.status}
          </span>
        </div>

        <div className={styles.stateActions}>
          {allowedTransitions.map(status => (
            <button
              key={status}
              className={`${styles.transitionBtn} ${status === "CERRADO" ? styles.danger : ""}`}
              onClick={() => handleOpenTransition(status)}
              data-testid={`transition-to-${status}`}
            >
              <span>{status}</span>
            </button>
          ))}
          {onClose && (
            <button className={`${styles.transitionBtn} ${styles.secondary}`} onClick={onClose}>
              <Icon material="close" style={{ fontSize: 16 }} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === "diagnostic" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("diagnostic")}
          data-testid="tab-diagnostic"
        >
          Diagnóstico e Hipótesis
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "evidence" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("evidence")}
          data-testid="tab-evidence"
        >
          Evidencias Auditadas ({store.activeIncidentEvidence.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "timeline" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("timeline")}
          data-testid="tab-timeline"
        >
          Timeline y Auditoría ({store.activeIncidentTimeline.length})
        </button>
      </div>

      {/* Content Area */}
      <div className={styles.contentArea}>
        {activeTab === "diagnostic" && (
          <div>
            {/* AI Diagnosis Header Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  className={styles.aiActionBtn}
                  onClick={handleOpenAiConsent}
                  disabled={
                    store.isAnalyzingAi ||
                    (store.activeIncidentEvidence.length === 0 && store.activeIncidentContextFiles.length === 0)
                  }
                  data-testid="analyze-ai-btn"
                >
                  <Icon material="psychology" style={{ fontSize: 18 }} />
                  <span>{store.isAnalyzingAi ? "Analizando..." : "Analizar incidente con IA"}</span>
                </button>

                {store.activeIncidentEvidence.length === 0 && store.activeIncidentContextFiles.length === 0 && (
                  <span style={{ fontSize: 12, color: "#f59e0b" }}>
                    (Incorpore evidencias o contexto manual antes de analizar)
                  </span>
                )}

                <button
                  type="button"
                  style={{ background: "transparent", border: "1px solid #3e4451", color: "#94a3b8", borderRadius: 4, padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}
                  onClick={() => {
                    try {
                      const di = (window as any).__LENS_RENDERER_DI__;
                      if (di) {
                        di.injectById("navigate-to-documentation")({ articleId: "diagnostico-ia" });
                      }
                    } catch {}
                  }}
                  data-testid="workbench-help-button"
                  title="Ver documentación sobre diagnóstico con IA y contexto efímero"
                >
                  <Icon material="help_outline" style={{ fontSize: 14 }} />
                  <span>Ayuda</span>
                </button>
              </div>

              {activeDiagnosis && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className={`${styles.aiStatusBadge} ${
                      activeDiagnosis.status === "CONCLUSIVE" ? styles.conclusive : styles.inconcluso
                    }`}
                  >
                    <Icon
                      material={activeDiagnosis.status === "CONCLUSIVE" ? "check_circle" : "help"}
                      style={{ fontSize: 14 }}
                    />
                    {activeDiagnosis.status}
                  </span>
                  <div className={styles.tokenMetrics}>
                    <span>{activeDiagnosis.model}</span>
                    <span>{activeDiagnosis.tokenUsage.totalTokens} tokens</span>
                    <span>${activeDiagnosis.estimatedCost.toFixed(5)} USD</span>
                  </div>
                </div>
              )}
            </div>

            {/* Inconclusive Warning if status is INCONCLUSO */}
            {activeDiagnosis && activeDiagnosis.status === "INCONCLUSO" && (
              <div className={styles.calloutWarning} style={{ marginBottom: 16 }}>
                <Icon material="warning" style={{ fontSize: 18, marginRight: 6, color: "#f59e0b" }} />
                <div>
                  <strong>Diagnóstico Inconcluso: </strong>
                  {activeDiagnosis.inconclusiveReason || "Las evidencias disponibles son insuficientes."}
                  {activeDiagnosis.missingInformation.length > 0 && (
                    <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                      {activeDiagnosis.missingInformation.map((info, idx) => (
                        <li key={idx}>{info}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  <Icon material="description" style={{ fontSize: 18 }} />
                  Descripción del Incidente
                </h3>
              </div>
              <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                {incident.description || "Sin descripción proporcionada."}
              </p>
            </div>

            {/* Verified Facts & Citations (H8-015) */}
            {activeDiagnosis && activeDiagnosis.facts.length > 0 && (
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>
                    <Icon material="fact_check" style={{ fontSize: 18, color: "#38bdf8" }} />
                    Hechos y Evidencias Vinculadas
                  </h3>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>
                  {activeDiagnosis.facts.map((fact, idx) => (
                    <li key={idx} style={{ marginBottom: 6 }}>
                      <span>{fact.text}</span>
                      {fact.citation && (
                        <span
                          className={`${styles.citationTag} ${
                            fact.citation.verified ? styles.verified : styles.unverified
                          }`}
                          title={
                            fact.citation.excerpt
                              ? `Extracto: ${fact.citation.excerpt}`
                              : `Cita verificada: ${fact.citation.resourceName || fact.citation.evidenceId}`
                          }
                        >
                          <Icon
                            material={fact.citation.verified ? "verified" : "warning"}
                            style={{ fontSize: 12 }}
                          />
                          {fact.citation.evidenceId} ({fact.citation.verified ? "Verificada" : "No verificada"})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Diagnostic Hypotheses (H8-015) */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  <Icon material="lightbulb" style={{ fontSize: 18, color: "#eab308" }} />
                  Hipótesis y Causa Raíz
                </h3>
              </div>
              {activeDiagnosis && activeDiagnosis.hypotheses.length > 0 ? (
                <div>
                  {activeDiagnosis.hypotheses.map(hyp => (
                    <div key={hyp.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ color: "#f8fafc", fontSize: 13 }}>{hyp.title}</strong>
                        <span style={{ fontSize: 12, color: "#38bdf8", fontWeight: 600 }}>
                          Confianza: {Math.round(hyp.confidence * 100)}%
                        </span>
                      </div>
                      <div className={styles.confidenceBarContainer}>
                        <div className={styles.confidenceBarTrack}>
                          <div
                            className={styles.confidenceBarFill}
                            style={{ width: `${Math.round(hyp.confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                      <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0" }}>
                        {hyp.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  {incident.status === "DETECTADO"
                    ? "Caso en fase de detección. Ejecute 'Analizar incidente con IA' para formalizar hipótesis técnicas con evidencias auditadas."
                    : "No se han emitido hipótesis aún para este caso."}
                </p>
              )}
            </div>

            {/* Reversible Remediation Proposal (H8-016 & H8-017) */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  <Icon material="build" style={{ fontSize: 18, color: "#3b82f6" }} />
                  Propuesta de Remediación Reversible
                </h3>

                {activeDiagnosis?.remediationProposal && (
                  <button
                    className={`${styles.transitionBtn} ${styles.secondary}`}
                    onClick={() => setIsVerifyModalOpen(true)}
                    data-testid="verify-remediation-btn"
                  >
                    <Icon material="verified_user" style={{ fontSize: 14 }} />
                    <span>Verificar Remediación (Post-Check)</span>
                  </button>
                )}
              </div>

              <div className={styles.calloutWarning}>
                <Icon material="security" style={{ fontSize: 16, marginRight: 6 }} />
                Aviso estricto: Esta remediación requiere aprobación y aplicación manual por un operador humano. La IA carece de capacidades de ejecución sobre el clúster.
              </div>

              {activeDiagnosis?.remediationProposal ? (
                <div>
                  <h4 style={{ color: "#f1f5f9", margin: "10px 0 4px", fontSize: 13 }}>
                    {activeDiagnosis.remediationProposal.title}
                  </h4>
                  <p style={{ color: "#cbd5e1", fontSize: 13, margin: "0 0 8px" }}>
                    {activeDiagnosis.remediationProposal.problemSummary}
                  </p>

                  {activeDiagnosis.remediationProposal.suggestedYamlDiff && (
                    <div>
                      <strong style={{ fontSize: 12, color: "#94a3b8" }}>Diff YAML Sugerido:</strong>
                      <pre className={styles.diffContainer}>
                        {activeDiagnosis.remediationProposal.suggestedYamlDiff}
                      </pre>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10, fontSize: 12 }}>
                    <div>
                      <strong style={{ color: "#94a3b8" }}>Riesgos e Impacto:</strong>
                      <p style={{ color: "#cbd5e1", margin: "4px 0 0" }}>
                        {activeDiagnosis.remediationProposal.risksAndImpact}
                      </p>
                    </div>
                    <div>
                      <strong style={{ color: "#94a3b8" }}>Procedimiento de Rollback:</strong>
                      <p style={{ color: "#cbd5e1", margin: "4px 0 0" }}>
                        {activeDiagnosis.remediationProposal.rollbackProcedure}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  Sin propuesta generada. Presione 'Analizar incidente con IA' para obtener sugerencias reversibles basadas en evidencias.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "evidence" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>
                Fragmentos de telemetría y observaciones sanitizadas bajo H8-008.
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`${styles.transitionBtn} ${styles.secondary}`}
                  onClick={handleOpenAddContext}
                  data-testid="add-context-file-btn"
                >
                  <Icon material="attach_file" style={{ fontSize: 16 }} />
                  <span>Adjuntar Contexto Manual</span>
                </button>
                <button
                  className={styles.transitionBtn}
                  onClick={() => setIsAddEvidenceModalOpen(true)}
                  data-testid="add-evidence-btn"
                >
                  <Icon material="add" style={{ fontSize: 16 }} />
                  <span>Agregar Evidencia</span>
                </button>
              </div>
            </div>

            {/* Ephemeral Manual Context Section (H8-019 & H8-020) */}
            <div className={styles.sectionCard} style={{ marginBottom: 18, borderLeft: "3px solid #a855f7" }}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle} style={{ color: "#c084fc" }}>
                  <Icon material="folder_open" style={{ fontSize: 18, color: "#a855f7" }} />
                  Contexto Manual Efímero ({store.activeIncidentContextFiles.length}/5)
                </h3>
                <span style={{ fontSize: 11, color: "#a855f7" }}>
                  (Estrictamente en memoria RAM • No persistido en SQLite)
                </span>
              </div>

              {store.activeIncidentContextFiles.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0 0" }}>
                  No hay archivos manuales adjuntos. Puede incorporar Dockerfile, values.yaml o manifiestos para complementar el diagnóstico.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {store.activeIncidentContextFiles.map(file => (
                    <div
                      key={file.id}
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      data-testid={`context-file-item-${file.id}`}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ color: "#f8fafc", fontSize: 13 }}>{file.filename}</strong>
                          <span style={{ fontSize: 11, color: "#cbd5e1", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>
                            {file.fileType}
                          </span>
                          <span style={{ fontSize: 11, color: "#34d399", background: "rgba(16,185,129,0.15)", padding: "1px 6px", borderRadius: 4 }}>
                            ✓ Sanitizado ({file.byteLength} B)
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                          <span>Entorno: <strong>{file.metadata.environment}</strong></span>
                          {file.metadata.resourceName && <span> • Recurso: <strong>{file.metadata.resourceName}</strong></span>}
                          {file.metadata.version && <span> • Versión: <strong>{file.metadata.version}</strong></span>}
                          <span> • Procedencia: <em>{file.metadata.provenance}</em></span>
                        </div>
                        <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 2 }}>
                          ⚠ Metadatos declarados por el operador. No contrastados con el despliegue activo.
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className={`${styles.transitionBtn} ${styles.secondary}`}
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          onClick={() => handleOpenEditContext(file)}
                          data-testid={`edit-context-meta-${file.id}`}
                        >
                          <Icon material="edit" style={{ fontSize: 12 }} />
                          <span>Metadatos</span>
                        </button>
                        <button
                          className={`${styles.transitionBtn} ${styles.danger}`}
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          onClick={() => handleRemoveContextFile(file.id)}
                          data-testid={`remove-context-file-${file.id}`}
                        >
                          <Icon material="delete" style={{ fontSize: 12 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h4 style={{ color: "#cbd5e1", fontSize: 13, marginBottom: 10 }}>Evidencias del Clúster Kubernetes</h4>

            {store.activeIncidentEvidence.length === 0 ? (
              <p style={{ color: "#64748b", textAlign: "center", marginTop: 32 }}>
                No hay evidencias ingestadas para este caso.
              </p>
            ) : (
              store.activeIncidentEvidence.map(ev => (
                <div key={ev.id} className={styles.evidenceItem} data-testid={`evidence-item-${ev.id}`}>
                  <div className={styles.evidenceHeader}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#f8fafc" }}>
                      {ev.origin} ({ev.type})
                    </span>
                    <div className={styles.evidenceMeta}>
                      <span>{ev.snippetBytes} bytes</span>
                      <span>SHA: {ev.sha256Hash?.substring(0, 10)}...</span>
                      <span>{new Date(ev.capturedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <pre className={styles.evidenceSnippet}>{ev.contentSnippet}</pre>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className={styles.timelineList}>
            {store.activeIncidentTimeline.map(event => (
              <div key={event.id} className={styles.timelineItem} data-testid={`timeline-event-${event.id}`}>
                <div className={`${styles.timelineDot} ${styles[event.authorType] || styles.system}`} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <span className={styles.timelineAuthor}>
                      {event.authorName} ({event.authorType})
                    </span>
                    <span className={styles.timelineTime}>
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {event.toStatus && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#93c5fd", fontWeight: 600 }}>
                        {event.fromStatus ? `${event.fromStatus} → ` : ""}{event.toStatus}
                      </span>
                    </div>
                  )}
                  <p className={styles.timelineMessage}>{event.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transition Modal */}
      {isTransitionModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ width: 480 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Transición a {targetStatus}</h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsTransitionModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label>Justificación obligatoria (mínimo 5 caracteres):</label>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder="Explique el motivo o hallazgo técnico que respalda esta transición..."
                data-testid="transition-justification-input"
              />
            </div>

            {targetStatus === "CONFIRMADO" && (
              <div className={styles.formGroup}>
                <label>Vincular evidencias que confirman el diagnóstico:</label>
                {store.activeIncidentEvidence.length === 0 ? (
                  <p style={{ color: "#ef4444", fontSize: 12 }}>
                    Atención: La transición a CONFIRMADO exige adjuntar al menos una evidencia verificable.
                  </p>
                ) : (
                  store.activeIncidentEvidence.map(ev => (
                    <label key={ev.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedEvidenceIds.includes(ev.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedEvidenceIds([...selectedEvidenceIds, ev.id]);
                          } else {
                            setSelectedEvidenceIds(selectedEvidenceIds.filter(id => id !== ev.id));
                          }
                        }}
                      />
                      <span>{ev.origin} ({ev.type}) - {ev.sha256Hash.substring(0, 8)}...</span>
                    </label>
                  ))
                )}
              </div>
            )}

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={() => setIsTransitionModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.transitionBtn}
                onClick={handleExecuteTransition}
                disabled={justification.trim().length < 5 || (targetStatus === "CONFIRMADO" && selectedEvidenceIds.length === 0)}
                data-testid="confirm-transition-btn"
              >
                Confirmar Cambio de Estado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Evidence Modal */}
      {isAddEvidenceModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ width: 500 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Incorporar Evidencia de Diagnóstico</h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsAddEvidenceModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label>Tipo de Evidencia:</label>
              <select
                value={evidenceType}
                onChange={e => setEvidenceType(e.target.value as any)}
              >
                <option value="pod_logs">Logs de Pod</option>
                <option value="k8s_event">Evento de Kubernetes</option>
                <option value="resource_manifest">Manifiesto de Recurso</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Título / Origen:</label>
              <input
                type="text"
                value={evidenceTitle}
                onChange={e => setEvidenceTitle(e.target.value)}
                placeholder="ej. Crash logs contenedor api"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Contenido del fragmento (Será sanitizado según H8-008):</label>
              <textarea
                value={evidenceContent}
                onChange={e => setEvidenceContent(e.target.value)}
                placeholder="Pegue aquí el texto o logs para sanitizar y persistir..."
                rows={6}
                data-testid="evidence-content-input"
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={() => setIsAddEvidenceModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.transitionBtn}
                onClick={handleAddEvidence}
                disabled={!evidenceContent.trim()}
                data-testid="save-evidence-btn"
              >
                Sanitizar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Consent Preview Modal (H8-015) */}
      {isConsentModalOpen && store.consentPreview && (
        <div className={styles.modalBackdrop} data-testid="ai-consent-modal">
          <div className={styles.modalContent} style={{ width: 560 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Icon material="policy" style={{ fontSize: 18, color: "#a855f7", marginRight: 6 }} />
                Autorización de Inferencia y Envío de Evidencias
              </h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsConsentModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
              El diagnóstico por IA enviará las observaciones sanitizadas del incidente al modelo seleccionado.
              Revise el inventario y confirme la autorización explícita.
            </p>

            <div style={{ marginTop: -4, marginBottom: 12 }}>
              <a
                href="#/documentation/contexto-efimero"
                onClick={(e) => {
                  e.preventDefault();
                  try {
                    const di = (window as any).__LENS_RENDERER_DI__;
                    if (di) {
                      di.injectById("navigate-to-documentation")({ articleId: "contexto-efimero" });
                    }
                  } catch {}
                }}
                style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                data-testid="consent-help-link"
              >
                <Icon material="help_outline" style={{ fontSize: 13 }} />
                <span>Ver políticas de consentimiento, privacidad y contexto efímero</span>
              </a>
            </div>

            <div className={styles.formGroup}>
              <label>Perfil y Proveedor de IA:</label>
              <select
                value={selectedProfileId}
                onChange={e => setSelectedProfileId(e.target.value)}
              >
                {store.aiProfiles.map(p => (
                  <option key={p.id} value={p.id} disabled={p.provider !== "mock"}>
                    {p.name} ({p.provider} - {p.model}){p.provider !== "mock" ? " [Deshabilitado hasta H8.4]" : " [Local/Offline]"}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                <span>Evidencias a transmitir: <strong>{store.consentPreview.evidencesCount}</strong></span>
                <span>Tamaño total: <strong>{store.consentPreview.totalBytes} bytes</strong></span>
              </div>

              <div style={{ maxHeight: 150, overflowY: "auto", fontSize: 12 }}>
                {store.consentPreview.evidenceItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span style={{ color: "#f8fafc" }}>
                      {item.type} {item.resourceName ? `(${item.resourceName})` : ""}
                    </span>
                    <span style={{ color: "#10b981", fontSize: 11 }}>
                      ✓ Sanitizado ({item.byteLength} B)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ephemeral Manual Context Inventory in Consent Preview (H8-019 & H8-020) */}
            {((store.consentPreview.manualContextItems && store.consentPreview.manualContextItems.length > 0) || store.activeIncidentContextFiles.length > 0) && (
              <div style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#c084fc", marginBottom: 6 }}>
                  <span>Archivos de contexto manual: <strong>{store.consentPreview.manualContextCount ?? store.activeIncidentContextFiles.length}</strong></span>
                  <span>Bytes manuales: <strong>{store.consentPreview.manualContextBytes ?? store.activeIncidentContextFiles.reduce((acc, f) => acc + f.byteLength, 0)} B</strong></span>
                </div>

                <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 12 }}>
                  {(store.consentPreview.manualContextItems || store.activeIncidentContextFiles).map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "3px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <span style={{ color: "#f8fafc" }}>
                        {item.filename} ({item.fileType})
                      </span>
                      <span style={{ color: "#a855f7", fontSize: 11 }}>
                        ✓ Efímero en RAM ({item.byteLength} B)
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 4 }}>
                  ⚠ Metadatos declarados por el operador. La modificación o eliminación de archivos invalidará esta autorización.
                </div>
              </div>
            )}

            <div className={styles.calloutWarning} style={{ fontSize: 11, marginBottom: 14 }}>
              <Icon material="lock" style={{ fontSize: 14, marginRight: 6 }} />
              El token efímero de consentimiento vence en 5 minutos y es de uso único intransferible.
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={() => setIsConsentModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.aiActionBtn}
                onClick={handleConfirmAiDiagnosis}
                data-testid="confirm-ai-diagnosis-btn"
              >
                <Icon material="check" style={{ fontSize: 16 }} />
                <span>Autorizar y Diagnosticar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Ephemeral Manual Context Modal (H8-019 & H8-020) */}
      {isAddContextModalOpen && (
        <div className={styles.modalBackdrop} data-testid="add-context-modal">
          <div className={styles.modalContent} style={{ width: 560 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Icon material="attach_file" style={{ fontSize: 18, color: "#a855f7", marginRight: 6 }} />
                Adjuntar Contexto Manual (Estrictamente Efímero)
              </h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={handleCloseAddContext}
              >
                <Icon material="close" />
              </button>
            </div>

            <div className={styles.calloutWarning} style={{ fontSize: 11, marginBottom: 12 }}>
              <Icon material="security" style={{ fontSize: 14, marginRight: 6 }} />
              El archivo se procesa de forma transitoria en memoria (Renderer/IPC) y se gestiona como Buffer en RAM de Electron Main sin persistencia en SQLite ni disco. Las referencias de texto se eliminan de inmediato al cerrar o enviar. Nunca se ejecutan Dockerfile, Helm o comandos contenidos.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className={styles.formGroup}>
                <label>Nombre de Archivo (ej. Dockerfile, values.yaml):</label>
                <input
                  type="text"
                  value={contextFilename}
                  onChange={e => setContextFilename(e.target.value)}
                  placeholder="Dockerfile o values.yaml"
                  data-testid="context-file-name-input"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Tipo de Archivo:</label>
                <select
                  value={contextFileType}
                  onChange={e => setContextFileType(e.target.value as any)}
                  data-testid="context-file-type-select"
                >
                  <option value="dockerfile">Dockerfile</option>
                  <option value="helm_values">Helm Values (values.yaml)</option>
                  <option value="k8s_manifest">Manifiesto Kubernetes</option>
                  <option value="config_map">ConfigMap YAML/JSON</option>
                  <option value="config_file">Archivo Config (.properties/.conf/.toml)</option>
                  <option value="text_doc">Texto Plano / Documentación</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Contenido del Archivo (Sanitizado automáticamente, max 64 KiB):</label>
              <textarea
                value={contextContent}
                onChange={e => setContextContent(e.target.value)}
                placeholder="Pegue aquí el contenido de configuración o Dockerfile..."
                rows={7}
                data-testid="context-file-content-input"
              />
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 8 }}>
                Metadatos Declarados por el Operador
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className={styles.formGroup}>
                  <label>Entorno Declarado:</label>
                  <select
                    value={contextEnv}
                    onChange={e => setContextEnv(e.target.value as any)}
                  >
                    <option value="development">Desarrollo (development)</option>
                    <option value="staging">Staging</option>
                    <option value="production">Producción (production)</option>
                    <option value="test">Test</option>
                    <option value="unspecified">No especificado</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Recurso / Workload Asociado:</label>
                  <input
                    type="text"
                    value={contextResource}
                    onChange={e => setContextResource(e.target.value)}
                    placeholder="ej. payment-service"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className={styles.formGroup}>
                  <label>Versión del Software / Chart:</label>
                  <input
                    type="text"
                    value={contextVersion}
                    onChange={e => setContextVersion(e.target.value)}
                    placeholder="ej. v1.2.3 o sha-abc123"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Procedencia:</label>
                  <input
                    type="text"
                    value={contextProvenance}
                    onChange={e => setContextProvenance(e.target.value)}
                    placeholder="ej. repo-local o git-branch-main"
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={handleCloseAddContext}
              >
                Cancelar
              </button>
              <button
                className={styles.transitionBtn}
                onClick={handleSaveContextFile}
                disabled={!contextFilename.trim() || !contextContent.trim()}
                data-testid="save-context-file-btn"
              >
                Sanitizar y Adjuntar en RAM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ephemeral Metadata Modal (H8-019) */}
      {isEditContextModalOpen && (
        <div className={styles.modalBackdrop} data-testid="edit-context-modal">
          <div className={styles.modalContent} style={{ width: 480 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Corregir Metadatos Declarados ({contextFilename})</h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsEditContextModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <div className={styles.calloutWarning} style={{ fontSize: 11, marginBottom: 12 }}>
              ⚠ La corrección de metadatos invalidará automáticamente cualquier consentimiento de inferencia previo.
            </div>

            <div className={styles.formGroup}>
              <label>Entorno Declarado:</label>
              <select
                value={contextEnv}
                onChange={e => setContextEnv(e.target.value as any)}
                data-testid="edit-context-env-select"
              >
                <option value="development">Desarrollo (development)</option>
                <option value="staging">Staging</option>
                <option value="production">Producción (production)</option>
                <option value="test">Test</option>
                <option value="unspecified">No especificado</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Recurso Asociado:</label>
              <input
                type="text"
                value={contextResource}
                onChange={e => setContextResource(e.target.value)}
                placeholder="ej. payment-service"
                data-testid="edit-context-resource-input"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Versión Declarada:</label>
              <input
                type="text"
                value={contextVersion}
                onChange={e => setContextVersion(e.target.value)}
                placeholder="ej. v1.2.4"
                data-testid="edit-context-version-input"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Procedencia Declarada:</label>
              <input
                type="text"
                value={contextProvenance}
                onChange={e => setContextProvenance(e.target.value)}
                placeholder="ej. git-tag-release"
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={() => setIsEditContextModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.transitionBtn}
                onClick={handleSaveEditContext}
                data-testid="save-edit-context-btn"
              >
                Actualizar Metadatos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Remediation Verification Modal (H8-017) */}
      {isVerifyModalOpen && (
        <div className={styles.modalBackdrop} data-testid="remediation-verify-modal">
          <div className={styles.modalContent} style={{ width: 480 }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Icon material="verified_user" style={{ fontSize: 18, color: "#38bdf8", marginRight: 6 }} />
                Verificación Posterior a Remediación
              </h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsVerifyModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
              Inspecciona las observaciones del clúster en modo sólo lectura para comprobar si la remediación manual
              aplicada estabilizó el workload.
            </p>

            <div className={styles.formGroup}>
              <label>Operador Humano que ejecutó la remediación:</label>
              <input
                type="text"
                value={humanOperator}
                onChange={e => setHumanOperator(e.target.value)}
                placeholder="Nombre del operador / SRE"
              />
            </div>

            <div className={styles.calloutWarning} style={{ fontSize: 11, marginBottom: 14 }}>
              <Icon material="info" style={{ fontSize: 14, marginRight: 6 }} />
              Invariante estricto: Esta verificación nunca cierra el incidente de manera automática.
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.transitionBtn} ${styles.secondary}`}
                onClick={() => setIsVerifyModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.transitionBtn}
                onClick={handleExecuteVerification}
                disabled={!humanOperator.trim()}
                data-testid="confirm-verify-btn"
              >
                Ejecutar Verificación (Read-Only)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const IncidentWorkbenchPanel = withInjectables<Dependencies, IncidentWorkbenchPanelProps>(
  NonInjectedIncidentWorkbenchPanel,
  {
    getProps: (di) => ({
      store: di.inject(incidentStoreInjectable),
    }),
  },
);
