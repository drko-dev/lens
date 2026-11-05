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

  const incident = store.activeIncident;

  useEffect(() => {
    if (incidentId && incidentId !== store.activeIncidentId) {
      store.selectIncident(incidentId);
    }
  }, [incidentId, store]);

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

            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  <Icon material="lightbulb" style={{ fontSize: 18, color: "#eab308" }} />
                  Hipótesis y Causa Raíz
                </h3>
              </div>
              <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                {incident.status === "DETECTADO"
                  ? "Caso en fase de detección. Pase a INVESTIGANDO para formalizar hipótesis técnicas con evidencias adjuntas."
                  : "Investigación en curso: Posible saturación de recursos OOMKilled en contenedor o anomalía en probes de liveness."}
              </p>
            </div>

            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  <Icon material="build" style={{ fontSize: 18, color: "#3b82f6" }} />
                  Propuesta de Remediación
                </h3>
              </div>
              <div className={styles.calloutWarning}>
                <Icon material="info" style={{ fontSize: 16, marginRight: 6 }} />
                Aviso: Toda propuesta es una sugerencia de diagnóstico y NO aplica cambios automáticos en el clúster.
              </div>
              <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                Incrementar los límites de memoria en el spec del Deployment (ej. de 512Mi a 1Gi) y revisar posibles fugas de memoria en la aplicación.
              </p>
            </div>
          </div>
        )}

        {activeTab === "evidence" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>
                Fragmentos de telemetría y observaciones sanitizadas bajo H8-008.
              </span>
              <button
                className={styles.transitionBtn}
                onClick={() => setIsAddEvidenceModalOpen(true)}
                data-testid="add-evidence-btn"
              >
                <Icon material="add" style={{ fontSize: 16 }} />
                <span>Agregar Evidencia</span>
              </button>
            </div>

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
