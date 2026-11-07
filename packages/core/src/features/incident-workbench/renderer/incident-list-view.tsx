/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./incident-list-view.module.scss";
import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { Incident, IncidentSeverity } from "../../../common/incident/incident-types";
import type { IncidentStore } from "./incident-store";
import incidentStoreInjectable from "./incident-store.injectable";
import { NonInjectedIncidentWorkbenchPanel } from "./incident-workbench-panel";
import { NonInjectedIncidentRetentionPreference } from "../../../renderer/components/preferences/incident-retention-preference";

export interface IncidentListViewProps {
  onOpenWorkbenchInDock?: (incidentId: string) => void;
}

interface Dependencies {
  store: IncidentStore;
}

export const NonInjectedIncidentListView = observer(({ onOpenWorkbenchInDock, store }: IncidentListViewProps & Dependencies) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("high");
  const [newClusterId, setNewClusterId] = useState("minikube-dev");
  const [newNamespace, setNewNamespace] = useState("default");
  const [newWorkloadKind, setNewWorkloadKind] = useState("Pod");
  const [newWorkloadName, setNewWorkloadName] = useState("");
  const [selectedIncidentForInlineView, setSelectedIncidentForInlineView] = useState<string | null>(null);
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false);

  useEffect(() => {
    store.loadIncidents();
    store.loadScannerStatus();
  }, [store]);

  const handleToggleScanner = async () => {
    if (store.scannerStatus.isEnabled) {
      await store.stopScanner();
    } else {
      await store.startScanner({
        clusterId: "synthetic-demo-cluster",
        namespace: store.selectedNamespace !== "ALL" ? store.selectedNamespace : undefined,
      });
    }
  };

  const handleSnooze = async (incidentId: string) => {
    await store.executeScannerAlertAction({
      incidentId,
      action: "snooze",
      snoozeDurationMs: 15 * 60 * 1000,
    });
  };

  const handleDismiss = async (incidentId: string) => {
    await store.executeScannerAlertAction({
      incidentId,
      action: "dismiss",
      dismissReason: "Descartado por operador desde el Centro de Incidentes",
    });
  };

  const handleCreateSyntheticOOM = async () => {
    const synthetic = await store.createIncident({
      title: "OOMKilled en pod payment-service",
      description: "El contenedor superó el límite de memoria asignado de 512Mi. Salida de proceso con código 137.",
      severity: "critical",
      clusterId: "minikube-dev",
      namespace: "billing",
      workloadKind: "Pod",
      workloadName: "payment-service-789bc-xyz",
    });

    if (synthetic) {
      await store.ingestEvidence({
        incidentId: synthetic.id,
        type: "pod_logs",
        origin: "kubectl logs",
        title: "Log de terminación de contenedor",
        rawContent: "2026-11-05T10:45:12Z Out of Memory: Kill process 412 (payment-service) score 950 or sacrifice child\nAuthorization: Bearer my-secret-session-token",
        clusterId: "minikube-dev",
        namespace: "billing",
        resourceKind: "Pod",
        resourceName: "payment-service-789bc-xyz",
        resourceVersion: "4501",
      });

      setSelectedIncidentForInlineView(synthetic.id);
      setIsCreateModalOpen(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTitle.trim()) return;

    const created = await store.createIncident({
      title: newTitle.trim(),
      description: newDescription.trim(),
      severity: newSeverity,
      clusterId: newClusterId.trim() || "default-cluster",
      namespace: newNamespace.trim() || "default",
      workloadKind: newWorkloadKind.trim() || "Pod",
      workloadName: newWorkloadName.trim() || "workload-app",
    });

    if (created) {
      setIsCreateModalOpen(false);
      setSelectedIncidentForInlineView(created.id);
      setNewTitle("");
      setNewDescription("");
      setNewWorkloadName("");
    }
  };

  const handleOpenWorkbench = (incident: Incident) => {
    store.selectIncident(incident.id);
    setSelectedIncidentForInlineView(incident.id);

    if (onOpenWorkbenchInDock) {
      onOpenWorkbenchInDock(incident.id);
    }
  };

  return (
    <div className={styles.container} data-testid="incident-list-view">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <Icon material="warning" className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Centro de Incidentes Kubernetes</h1>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Diagnóstico asistido por evidencias, trazabilidad de estados y auditoría local SQLite.
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.btnSecondary}
            onClick={() => setIsRetentionModalOpen(true)}
            data-testid="open-retention-modal-btn"
          >
            <Icon material="auto_delete" style={{ fontSize: 16 }} />
            <span>Retención</span>
          </button>
          <button
            className={styles.btnSecondary}
            onClick={() => {
              try {
                const di = (window as any).__LENS_RENDERER_DI__;
                if (di) {
                  di.injectById("navigate-to-documentation")({ articleId: "incidentes" });
                }
              } catch {}
            }}
            data-testid="incidents-help-button"
            title="Ver documentación sobre el Centro de Incidentes y Escáner"
          >
            <Icon material="help_outline" style={{ fontSize: 16 }} />
            <span>Ayuda</span>
          </button>
          <button
            className={styles.btnSecondary}
            onClick={handleCreateSyntheticOOM}
            data-testid="create-synthetic-btn"
          >
            <Icon material="auto_fix_high" style={{ fontSize: 16 }} />
            <span>Cargar Caso Sintético OOM</span>
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="new-incident-btn"
          >
            <Icon material="add" style={{ fontSize: 16 }} />
            <span>Nuevo Incidente</span>
          </button>
        </div>
      </div>

      {/* Local Incident Scanner Bar (H8.5) */}
      <div className={styles.scannerBar} data-testid="local-scanner-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "#94a3b8" }}>Escáner Local (Demo Sintético):</span>
            <span
              className={`${styles.scannerBadge} ${store.scannerStatus.isEnabled ? styles.scannerOn : styles.scannerOff}`}
              data-testid="scanner-status-badge"
            >
              <Icon material={store.scannerStatus.isEnabled ? "radar" : "power_settings_new"} style={{ fontSize: 13 }} />
              <span>{store.scannerStatus.isEnabled ? "DEMO ACTIVO (0 watchers)" : "OFF"}</span>
            </span>
          </div>

          <div style={{ color: "#94a3b8", fontSize: 12 }}>
            <span>Alcance: </span>
            <strong style={{ color: "#e2e8f0" }}>{store.scannerStatus.scope?.clusterId ?? "synthetic-demo-cluster"}</strong>
            {store.scannerStatus.scope?.namespace && (
              <span> / ns: <strong style={{ color: "#e2e8f0" }}>{store.scannerStatus.scope.namespace}</strong></span>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, color: "#64748b", fontSize: 11, marginLeft: 8 }}>
            <span>Lecturas: <strong style={{ color: "#cbd5e1" }}>{store.scannerStatus.scanCount}</strong></span>
            <span>Señales: <strong style={{ color: "#cbd5e1" }}>{store.scannerStatus.signalsDetectedCount}</strong></span>
            <span>Deduplicadas: <strong style={{ color: "#34d399" }}>{store.scannerStatus.deduplicatedCount}</strong></span>
            <span>Creados: <strong style={{ color: "#60a5fa" }}>{store.scannerStatus.incidentsCreatedCount}</strong></span>
            {store.scannerStatus.snoozedCount > 0 && (
              <span>Pospuestas: <strong style={{ color: "#f59e0b" }}>{store.scannerStatus.snoozedCount}</strong></span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className={store.scannerStatus.isEnabled ? styles.btnSecondary : styles.btnPrimary}
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={handleToggleScanner}
            disabled={store.isScannerToggling}
            data-testid="scanner-toggle-btn"
          >
            <Icon material={store.scannerStatus.isEnabled ? "stop" : "play_arrow"} style={{ fontSize: 14 }} />
            <span>{store.scannerStatus.isEnabled ? "Detener Escáner" : "Activar Escáner"}</span>
          </button>
          {store.scannerStatus.isEnabled && (
            <button
              className={styles.btnSecondary}
              style={{ padding: "4px 8px", fontSize: 12, borderColor: "#ef4444", color: "#f87171" }}
              onClick={() => store.stopScanner()}
              data-testid="scanner-stop-btn"
              title="Detención inmediata de emergencia"
            >
              <Icon material="cancel" style={{ fontSize: 14 }} />
              <span>Detener</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{store.stats.total}</span>
          <span className={styles.statLabel}>Total Incidentes</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "#f87171" }}>
            {store.stats.critical}
          </span>
          <span className={styles.statLabel}>Críticos</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "#60a5fa" }}>
            {store.stats.investigating}
          </span>
          <span className={styles.statLabel}>En Investigación</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "#34d399" }}>
            {store.stats.confirmed}
          </span>
          <span className={styles.statLabel}>Confirmados</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Buscar incidentes por título, workload o ID..."
          value={store.searchQuery}
          onChange={e => store.setSearchQuery(e.target.value)}
          data-testid="incident-search-input"
        />

        <select
          className={styles.filterSelect}
          value={store.selectedStatus}
          onChange={e => store.setStatusFilter(e.target.value as any)}
          data-testid="incident-status-filter"
        >
          <option value="ALL">Todos los Estados</option>
          <option value="DETECTADO">DETECTADO</option>
          <option value="INVESTIGANDO">INVESTIGANDO</option>
          <option value="HIPÓTESIS">HIPÓTESIS</option>
          <option value="CONFIRMADO">CONFIRMADO</option>
          <option value="SOLUCIÓN PROPUESTA">SOLUCIÓN PROPUESTA</option>
          <option value="APROBACIÓN HUMANA">APROBACIÓN HUMANA</option>
          <option value="VALIDACIÓN">VALIDACIÓN</option>
          <option value="CERRADO">CERRADO</option>
        </select>

        <select
          className={styles.filterSelect}
          value={store.selectedSeverity}
          onChange={e => store.setSeverityFilter(e.target.value as any)}
          data-testid="incident-severity-filter"
        >
          <option value="ALL">Todas las Severidades</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>

        <select
          className={styles.filterSelect}
          value={store.selectedNamespace}
          onChange={e => store.setNamespaceFilter(e.target.value)}
          data-testid="incident-namespace-filter"
        >
          <option value="ALL">Todos los Namespaces</option>
          {store.availableNamespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Main Split / Table View */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Table */}
        <div className={styles.tableWrapper} style={{ flex: selectedIncidentForInlineView ? "0 0 55%" : "1 1 100%" }}>
          {store.filteredIncidents.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon material="search_off" className={styles.emptyIcon} />
              <p>No se encontraron incidentes que coincidan con los criterios de búsqueda.</p>
            </div>
          ) : (
            <table className={styles.incidentTable}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>Pin</th>
                  <th style={{ width: 90 }}>Severidad</th>
                  <th>Título & Workload</th>
                  <th>Clúster / NS</th>
                  <th>Estado</th>
                  <th style={{ width: 220 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {store.filteredIncidents.map(inc => (
                  <tr
                    key={inc.id}
                    className={inc.isPinned ? styles.rowPinned : ""}
                    data-testid={`incident-row-${inc.id}`}
                  >
                    <td>
                      <Icon
                        material={inc.isPinned ? "star" : "star_border"}
                        className={`${styles.pinIcon} ${inc.isPinned ? styles.pinned : ""}`}
                        onClick={() => store.togglePin(inc.id)}
                      />
                    </td>
                    <td>
                      <span className={`${styles.severityBadge} ${styles[inc.severity]}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{inc.title}</div>
                      {inc.workloadName && (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {inc.workloadKind}: {inc.workloadName}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{inc.clusterId}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{inc.namespace}</div>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${inc.status === "CONFIRMADO" ? styles.confirmed : inc.status === "CERRADO" ? styles.closed : styles.active}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          className={styles.btnSecondary}
                          style={{ padding: "3px 6px", fontSize: 11 }}
                          onClick={() => handleOpenWorkbench(inc)}
                          data-testid={`open-workbench-btn-${inc.id}`}
                        >
                          <Icon material="analytics" style={{ fontSize: 13 }} />
                          <span>Analizar</span>
                        </button>
                        {inc.status !== "CERRADO" && (
                          <>
                            <button
                              className={styles.btnActionSmall}
                              onClick={() => handleSnooze(inc.id)}
                              data-testid={`scanner-snooze-btn-${inc.id}`}
                              title="Posponer alertas de este incidente por 15 minutos"
                            >
                              <Icon material="snooze" style={{ fontSize: 13, color: "#f59e0b" }} />
                              <span>Posponer</span>
                            </button>
                            <button
                              className={styles.btnActionSmall}
                              onClick={() => handleDismiss(inc.id)}
                              data-testid={`scanner-dismiss-btn-${inc.id}`}
                              title="Descartar y cerrar incidente"
                            >
                              <Icon material="close" style={{ fontSize: 13, color: "#ef4444" }} />
                              <span>Descartar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Inline Workbench Panel if selected */}
        {selectedIncidentForInlineView && (
          <div style={{ flex: "0 0 45%", minWidth: 0, height: "100%", border: "1px solid var(--border-default, #243142)", borderRadius: 8, overflow: "hidden" }}>
            <NonInjectedIncidentWorkbenchPanel
              incidentId={selectedIncidentForInlineView}
              onClose={() => setSelectedIncidentForInlineView(null)}
              store={store}
            />
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Registrar Nuevo Incidente</h3>
              <button
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                onClick={() => setIsCreateModalOpen(false)}
              >
                <Icon material="close" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className={styles.formGroup}>
                <label>Título del Incidente:</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="ej. Degeneración de latencia en Ingress Controller"
                  data-testid="modal-title-input"
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Severidad:</label>
                  <select
                    value={newSeverity}
                    onChange={e => setNewSeverity(e.target.value as any)}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Clúster:</label>
                  <input
                    type="text"
                    value={newClusterId}
                    onChange={e => setNewClusterId(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Namespace:</label>
                  <input
                    type="text"
                    value={newNamespace}
                    onChange={e => setNewNamespace(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Workload (Kind / Nombre):</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ width: "40%" }}
                      type="text"
                      value={newWorkloadKind}
                      onChange={e => setNewWorkloadKind(e.target.value)}
                    />
                    <input
                      style={{ width: "60%" }}
                      type="text"
                      placeholder="nombre"
                      value={newWorkloadName}
                      onChange={e => setNewWorkloadName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Descripción / Observaciones Iniciales:</label>
                <textarea
                  rows={4}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Detalles sobre el síntoma detectado..."
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  data-testid="submit-create-incident-btn"
                >
                  Registrar Caso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Retention Preference Modal */}
      {isRetentionModalOpen && (
        <div className={styles.modalBackdrop} data-testid="retention-modal-backdrop">
          <div className={styles.modalContent} style={{ maxWidth: 900, maxHeight: "90vh", overflowY: "auto" }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Configuración de Retención y Purga de Incidentes</h3>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ padding: "4px 8px" }}
                onClick={() => setIsRetentionModalOpen(false)}
                data-testid="close-retention-modal-btn"
              >
                <Icon material="close" />
              </button>
            </div>
            <NonInjectedIncidentRetentionPreference store={store} />
          </div>
        </div>
      )}
    </div>
  );
});

export const IncidentListView = withInjectables<Dependencies, IncidentListViewProps>(
  NonInjectedIncidentListView,
  {
    getProps: (di) => ({
      store: di.inject(incidentStoreInjectable),
    }),
  },
);
