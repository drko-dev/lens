/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../icon";
import styles from "./incident-retention-preference.module.scss";
import type { IncidentStore } from "../../../features/incident-workbench/renderer/incident-store";
import incidentStoreInjectable from "../../../features/incident-workbench/renderer/incident-store.injectable";
import type { RetentionStrategy, UpdateRetentionPolicyInput } from "../../../common/incident/incident-types";

export interface IncidentRetentionPreferenceProps {
  store?: IncidentStore;
}

interface Dependencies {
  store: IncidentStore;
}

export const NonInjectedIncidentRetentionPreference = observer(({ store }: { store: IncidentStore }) => {
  const [strategy, setStrategy] = useState<RetentionStrategy>("manual");
  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [protectPinned, setProtectPinned] = useState(true);
  const [purgeClosedOnly, setPurgeClosedOnly] = useState(true);
  const [enableEvidenceRetention, setEnableEvidenceRetention] = useState(false);
  const [evidenceRetentionDays, setEvidenceRetentionDays] = useState(30);

  const [isConfirmPurgeOpen, setIsConfirmPurgeOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const policy = store.retentionPolicy;
  const preview = store.purgePreview;

  useEffect(() => {
    store.loadRetentionPolicy().then(p => {
      if (p) {
        setEnabled(p.enabled);
        setStrategy(p.strategy);
        setRetentionDays(p.retentionDays);
        setProtectPinned(p.protectPinned);
        setPurgeClosedOnly(p.purgeClosedOnly);
        if (p.evidenceRetentionDays) {
          setEnableEvidenceRetention(true);
          setEvidenceRetentionDays(p.evidenceRetentionDays);
        } else {
          setEnableEvidenceRetention(false);
        }

        const standardDays = [30, 60, 90, 180, 365];
        setIsCustomDays(!standardDays.includes(p.retentionDays));
      }
    });

    store.previewPurge();
  }, [store]);

  const handleSelectDays = (days: number) => {
    setIsCustomDays(false);
    setRetentionDays(days);
    setStrategy("days");
  };

  const handleSelectManual = () => {
    setIsCustomDays(false);
    setStrategy("manual");
    setEnabled(false);
  };

  const handleSelectCustom = () => {
    setIsCustomDays(true);
    setStrategy("days");
  };

  const handleSavePolicy = async () => {
    const patch: UpdateRetentionPolicyInput = {
      enabled: strategy === "manual" ? false : enabled,
      strategy,
      retentionDays: isCustomDays ? Math.max(1, retentionDays) : retentionDays,
      protectPinned,
      purgeClosedOnly,
      evidenceRetentionDays: enableEvidenceRetention ? Math.max(1, evidenceRetentionDays) : null,
    };

    const saved = await store.saveRetentionPolicy(patch);
    if (saved) {
      await store.previewPurge();
      setSaveSuccessMessage("Política de retención guardada correctamente.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    }
  };

  const handleExecutePurgeConfirmed = async () => {
    const candidateIds = store.purgePreview?.candidateIncidentIds ?? [];
    await store.executeManualPurge(candidateIds);
    setIsConfirmPurgeOpen(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  };

  return (
    <div className={styles.container} data-testid="incident-retention-preference">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          <Icon material="auto_delete" className={styles.titleIcon} />
          <span>Conservación y Purga de Incidentes Locales (H8-009)</span>
        </div>
        <p className={styles.subtitle}>
          Configurá la política de retención para gestionar el ciclo de vida del almacenamiento local SQLite.
          Por diseño de seguridad, ninguna purga automática se ejecutará hasta que actives expresamente una política.
        </p>
      </div>

      {/* Warning Banner */}
      <div className={styles.warningBanner}>
        <Icon material="warning" className={styles.warningIcon} />
        <div>
          <strong>Integridad y Cascada de Datos:</strong> La eliminación de un incidente purga irreversiblemente su ficha,
          su historial completo de timeline y todas las evidencias Kubernetes asociadas respetando las claves foráneas (<code>ON DELETE CASCADE</code>).
          Los incidentes protegidos con pin permanecerán a salvo.
        </div>
      </div>

      {/* Retention Period Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>Plazo de Conservación</span>
          <span className={`${styles.statusPill} ${enabled && strategy !== "manual" ? styles.statusPillActive : styles.statusPillDisabled}`}>
            {strategy === "manual" || !enabled ? "Purga Automática Deshabilitada" : `Activa (${retentionDays} días)`}
          </span>
        </div>

        <div className={styles.optionsGrid}>
          <div
            className={`${styles.optionCard} ${strategy === "manual" ? styles.optionCardActive : ""}`}
            onClick={handleSelectManual}
            data-testid="retention-opt-manual"
          >
            <span className={styles.optionLabel}>Manual / Indefinida</span>
            <span className={styles.optionDescription}>No purgar automáticamente. Conservar todos los incidentes.</span>
          </div>

          {[30, 60, 90, 180, 365].map(days => (
            <div
              key={days}
              className={`${styles.optionCard} ${strategy === "days" && !isCustomDays && retentionDays === days ? styles.optionCardActive : ""}`}
              onClick={() => handleSelectDays(days)}
              data-testid={`retention-opt-${days}`}
            >
              <span className={styles.optionLabel}>{days} Días</span>
              <span className={styles.optionDescription}>Purgar casos con más de {days} días de antigüedad.</span>
            </div>
          ))}

          <div
            className={`${styles.optionCard} ${strategy === "days" && isCustomDays ? styles.optionCardActive : ""}`}
            onClick={handleSelectCustom}
            data-testid="retention-opt-custom"
          >
            <span className={styles.optionLabel}>Personalizado</span>
            <span className={styles.optionDescription}>Definir un período en días específico.</span>
          </div>
        </div>

        {isCustomDays && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: "#94a3b8" }}>Días de retención:</label>
            <input
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={e => {
                setRetentionDays(Math.max(1, parseInt(e.target.value, 10) || 1));
                setStrategy("days");
              }}
              style={{
                background: "#0e131b",
                border: "1px solid #243142",
                color: "#fff",
                padding: "6px 10px",
                borderRadius: 4,
                width: 100,
              }}
              data-testid="custom-retention-input"
            />
          </div>
        )}
      </div>

      {/* Rules & Protections Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>Reglas de Protección y Alcance</span>
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleTitle}>Habilitar purga automática</span>
            <span className={styles.toggleDesc}>
              Si está desactivado, ninguna eliminación periódica se ejecutará aunque se haya seleccionado un plazo.
            </span>
          </div>
          <input
            type="checkbox"
            checked={enabled && strategy !== "manual"}
            disabled={strategy === "manual"}
            onChange={e => setEnabled(e.target.checked)}
            data-testid="enable-purge-toggle"
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleTitle}>Proteger incidentes fijados (Recomendado)</span>
            <span className={styles.toggleDesc}>
              Los casos marcados con pin nunca serán eliminados por la purga automática ni manual por lote.
            </span>
          </div>
          <input
            type="checkbox"
            checked={protectPinned}
            onChange={e => setProtectPinned(e.target.checked)}
            data-testid="protect-pinned-toggle"
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleTitle}>Purgar únicamente incidentes cerrados (Recomendado)</span>
            <span className={styles.toggleDesc}>
              Incidentes abiertos, en investigación o confirmados no serán purgados aunque hayan superado el plazo.
            </span>
          </div>
          <input
            type="checkbox"
            checked={purgeClosedOnly}
            onChange={e => setPurgeClosedOnly(e.target.checked)}
            data-testid="purge-closed-only-toggle"
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleTitle}>Política independiente para evidencias voluminosas</span>
            <span className={styles.toggleDesc}>
              Purgar fragmentos de logs o eventos pesados más antiguos conservando la ficha y el timeline de auditoría.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {enableEvidenceRetention && (
              <input
                type="number"
                min={1}
                max={3650}
                value={evidenceRetentionDays}
                onChange={e => setEvidenceRetentionDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  background: "#0e131b",
                  border: "1px solid #243142",
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: 4,
                  width: 80,
                  fontSize: 12,
                }}
                data-testid="evidence-retention-input"
              />
            )}
            <input
              type="checkbox"
              checked={enableEvidenceRetention}
              onChange={e => setEnableEvidenceRetention(e.target.checked)}
              data-testid="evidence-retention-toggle"
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
          </div>
        </div>
      </div>

      {/* Metrics & Preview Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>Diagnóstico de Almacenamiento y Previsualización</span>
          <button
            className={styles.btnSecondary}
            onClick={() => store.previewPurge()}
            style={{ padding: "4px 10px", fontSize: 12 }}
            data-testid="preview-purge-btn"
          >
            <Icon material="refresh" style={{ fontSize: 14 }} />
            <span>Actualizar Previsualización</span>
          </button>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue} data-testid="stat-candidate-incidents">
              {preview?.candidateIncidentCount ?? 0}
            </span>
            <span className={styles.statLabel}>Incidentes Vencidos</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} data-testid="stat-protected-incidents">
              {preview?.protectedIncidentCount ?? 0}
            </span>
            <span className={styles.statLabel}>Incidentes Protegidos (Pin)</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} data-testid="stat-candidate-evidences">
              {preview?.candidateEvidenceCount ?? 0}
            </span>
            <span className={styles.statLabel}>Evidencias a Purgar</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} data-testid="stat-reclaimable-bytes">
              {formatBytes(preview?.candidateReclaimableBytes ?? 0)}
            </span>
            <span className={styles.statLabel}>Espacio Recuperable</span>
          </div>
        </div>

        {policy?.lastEvaluatedAt && (
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Última purga ejecutada: {new Date(policy.lastEvaluatedAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Actions Bar */}
      <div className={styles.actionsBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className={styles.btnPrimary}
            onClick={handleSavePolicy}
            disabled={store.isActionLoading}
            data-testid="save-retention-policy-btn"
          >
            <Icon material="save" style={{ fontSize: 16 }} />
            <span>Guardar Configuración</span>
          </button>
          {saveSuccessMessage && (
            <span style={{ fontSize: 13, color: "#34d399", fontWeight: 500 }} data-testid="save-success-msg">
              {saveSuccessMessage}
            </span>
          )}
        </div>

        <button
          className={styles.btnDanger}
          onClick={() => setIsConfirmPurgeOpen(true)}
          disabled={store.isPurging || (preview?.candidateIncidentCount === 0 && preview?.candidateEvidenceCount === 0)}
          data-testid="execute-purge-btn"
        >
          <Icon material="delete_forever" style={{ fontSize: 16 }} />
          <span>Ejecutar Purga Manual Ahora</span>
        </button>
      </div>

      {/* Confirm Purge Modal */}
      {isConfirmPurgeOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          data-testid="confirm-purge-modal"
        >
          <div
            style={{
              background: "#161e2a",
              border: "1px solid #ef4444",
              borderRadius: 8,
              padding: 24,
              maxWidth: 500,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f87171" }}>
              <Icon material="warning" style={{ fontSize: 24 }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>¿Confirmar eliminación permanente?</h3>
            </div>
            <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>
              Se eliminarán permanentemente <strong>{preview?.candidateIncidentCount ?? 0} incidentes</strong> y{" "}
              <strong>{preview?.candidateEvidenceCount ?? 0} evidencias</strong>, liberando aproximadamente{" "}
              <strong>{formatBytes(preview?.candidateReclaimableBytes ?? 0)}</strong>.
              Esta operación es irreversible y no afectará bases de datos en cuarentena.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button
                className={styles.btnSecondary}
                onClick={() => setIsConfirmPurgeOpen(false)}
                data-testid="cancel-purge-btn"
              >
                Cancelar
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleExecutePurgeConfirmed}
                data-testid="confirm-execute-purge-btn"
              >
                Sí, Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export const IncidentRetentionPreference = withInjectables<Dependencies>(
  NonInjectedIncidentRetentionPreference,
  {
    getProps: (di) => ({
      store: di.inject(incidentStoreInjectable),
    }),
  },
);
