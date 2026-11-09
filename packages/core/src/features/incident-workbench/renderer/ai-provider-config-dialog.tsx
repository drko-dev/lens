/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useEffect, useRef, useState } from "react";
import { runInAction } from "mobx";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { Icon } from "../../../renderer/components/icon";
import type { IncidentStore } from "./incident-store";
import type { AiDefaultProviderState } from "../../../common/incident/ai-profile-types";
import styles from "./ai-provider-config-dialog.module.scss";

export const AI_DEFAULT_STATE_LABELS: Record<AiDefaultProviderState, string> = {
  not_configured: "No configurado",
  configuration_required: "Configuración requerida",
  demo_offline: "Demo offline",
  disconnected: "Desconectado",
  blocked: "Conexión bloqueada",
  available: "Disponible",
};

export interface AiProviderConfigDialogProps {
  store: IncidentStore;
  onClose: () => void;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";

export const AiProviderConfigDialog = observer(({ store, onClose }: AiProviderConfigDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;
  // Element that opened the dialog; captured on first render, before focus moves into the dialog.
  const triggerRef = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deepseekModel, setDeepseekModel] = useState<"deepseek-flash" | "deepseek-v4-pro">("deepseek-flash");
  const [deepseekApiKeyInput, setDeepseekApiKeyInput] = useState("");
  const [deepseekProfileName, setDeepseekProfileName] = useState("DeepSeek — API key");
  const [selectedDefaultId, setSelectedDefaultId] = useState(store.aiDefaultStatus.profile?.id ?? "");
  const activeProfiles = store.aiProfiles.filter(p => p.status === "active" && p.provider !== "anthropic" && p.provider !== "gemini");

  // Follow the backend default whenever it changes (demo created, saved, removed, loaded).
  // Keyed on the id so unrelated re-renders never clobber an unsaved user pick.
  const backendDefaultId = store.aiDefaultStatus.profile?.id ?? "";
  useEffect(() => {
    setSelectedDefaultId(backendDefaultId);
  }, [backendDefaultId]);

  useEffect(() => {
    const trigger = triggerRef.current;

    // Runs on every close path (Escape, Close button, backdrop, parent unmount).
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
    store.loadAiProfiles().catch(() => {});
    store.loadAiDefaultStatus().then(s => setSelectedDefaultId(s.profile?.id ?? "")).catch(() => {});
  }, [store]);

  // Store operations report failures through store.error instead of throwing.
  // Reset it before the call so a stale error never looks like a new failure (or hides a success),
  // then mirror the outcome inside the dialog. Returns true only when the operation succeeded.
  const runOperation = async (operation: () => Promise<unknown>): Promise<boolean> => {
    runInAction(() => { store.error = null; });
    setDialogError(null);
    await operation();
    const failure = store.error;

    setDialogError(failure);

    return !failure;
  };

  const saveDefault = (id: string | null) => runOperation(async () => {
    const s = await store.setAiDefaultProfile(id);
    setSelectedDefaultId(s.profile?.id ?? "");
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const outside = !dialogRef.current?.contains(active) || active === dialogRef.current;

    if (e.shiftKey && (active === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  };

  // Document-level so Escape/Tab work even when the focused element unmounted and focus fell to BODY.
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  // Re-entering focus after an operation removed the focused element (e.g. the clear button).
  useEffect(() => {
    const active = document.activeElement;

    if (!dialogRef.current?.contains(active)) dialogRef.current?.focus();
  });

  // Portal to body so no ancestor transform/overflow can turn the fixed overlay into an inline block.
  return createPortal(
    <div
      className={styles.modalBackdrop}
      data-testid="ai-provider-config-modal"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className={styles.modalContent}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-config-dialog-title"
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle} id="ai-config-dialog-title">
            <Icon material="hub" style={{ fontSize: 18, color: "#38bdf8", marginRight: 6 }} />
            Configuración IA
          </h3>
          <button
            type="button"
            aria-label="Cerrar configuración IA"
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
            onClick={() => onClose()}
          >
            <Icon material="close" />
          </button>
        </div>

        {dialogError && (
          <div className={styles.errorAlert} role="alert" data-testid="ai-config-dialog-error">
            {dialogError}
          </div>
        )}

        <div
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #334155", borderRadius: 6, padding: 12, marginBottom: 12 }}
        data-testid="ai-default-provider-section"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ color: "#f8fafc", fontSize: 13 }}>Proveedor predeterminado</strong>
          <span data-testid="ai-default-status-badge" style={{ fontSize: 11, color: "#fbbf24" }}>
            {AI_DEFAULT_STATE_LABELS[store.aiDefaultStatus.state]}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            aria-label="Proveedor predeterminado"
            value={selectedDefaultId}
            onChange={e => setSelectedDefaultId(e.target.value)}
            data-testid="ai-default-provider-select"
          >
            <option value="">— Sin proveedor predeterminado —</option>
            {activeProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.provider}/{p.model})</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.transitionBtn}
            onClick={() => { saveDefault(selectedDefaultId || null).catch(() => {}); }}
            data-testid="save-default-provider-btn"
          >
            Guardar
          </button>
          <button
            type="button"
            className={`${styles.transitionBtn} ${styles.secondary}`}
            onClick={() => { runOperation(() => store.ensureDemoAiProfile()).catch(() => {}); }}
            data-testid="create-demo-profile-btn"
          >
            Crear perfil Demo offline
          </button>
        </div>
        {store.aiDefaultStatus.reason && (
          <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>Motivo: {store.aiDefaultStatus.reason}</div>
        )}
        {store.aiDefaultStatus.state !== "not_configured" && (
          <button
            type="button"
            className={`${styles.transitionBtn} ${styles.secondary}`}
            style={{ marginTop: 8, padding: "3px 8px", fontSize: 11 }}
            onClick={() => { saveDefault(null).catch(() => {}); }}
            data-testid="clear-default-provider-btn"
          >
            Quitar proveedor predeterminado
          </button>
        )}
      </div>

      <div className={styles.calloutWarning} style={{ fontSize: 11, marginBottom: 14 }}>
          <Icon material="security" style={{ fontSize: 14, marginRight: 6 }} />
          <strong>Política de aislamiento estricto:</strong> NovaKube nunca cambia automáticamente de OpenAI a DeepSeek cuando falla OAuth, se agota la cuota o vence la sesión. Cambiar el destinatario de sus evidencias requiere selección explícita del perfil y nuevo consentimiento.
        </div>

        {/* 1. Principal: OpenAI — Sign in with ChatGPT (OAuth) */}
        <div
          style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
          }}
          data-testid="provider-card-openai-oauth"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong style={{ color: "#f8fafc", fontSize: 13 }}>
              1. Principal: OpenAI — ChatGPT OAuth (Sign in with ChatGPT)
            </strong>
            <button
              type="button"
              className={styles.aiActionBtn}
              onClick={() => {
                runOperation(() => store.signInWithChatGpt({
                  profileName: "OpenAI — ChatGPT OAuth",
                })).catch(() => {});
              }}
              data-testid="modal-continue-with-chatgpt-btn"
            >
              <Icon material="login" style={{ fontSize: 14 }} />
              <span>Continuar con ChatGPT</span>
            </button>
          </div>
          <p style={{ fontSize: 11, color: "#cbd5e1", margin: "0 0 8px" }}>
            Autenticación OAuth 2.0 + PKCE S256 oficial por navegador (`https://auth.openai.com/api/accounts/authorize`), `resource=https://api.openai.com/v1`, validación criptográfica JWKS y permisos `resource.invoke` + `chatgpt.tokens.use.direct`. Inferencia mediante `https://api.openai.com/v1/responses` (`store: false`, `stream: true`).
          </p>

          <div
            style={{
              fontSize: 11,
              color: "#fbbf24",
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 4,
              padding: "4px 8px",
              marginBottom: 8,
            }}
            data-testid="modal-oauth-network-status"
          >
            {store.oauthConnectionError
              ? `Estado: Conexión no disponible (${store.oauthConnectionError})`
              : "Estado por defecto: Conexión externa no disponible hasta autorizar la red (DisabledRealNetworkEngine activo)."}
          </div>

          {store.openAiModels.length > 0 && (
            <div style={{ marginBottom: 8, fontSize: 11 }}>
              <label style={{ color: "#cbd5e1", marginRight: 6 }}>
                Modelos del catálogo oficial (`visibility === "list"`):
              </label>
              <select
                data-testid="openai-catalog-model-select"
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#e2e8f0",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 11,
                }}
              >
                {store.openAiModels.map(m => (
                  <option key={m.slug} value={m.slug}>
                    {m.displayName} ({m.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {store.aiProfiles
            .filter(p => p.provider === "openai")
            .map(p => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(0,0,0,0.3)",
                  padding: "6px 10px",
                  borderRadius: 4,
                  marginTop: 6,
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: "#f8fafc", fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: "#94a3b8", marginLeft: 8 }}>
                    Estado: {p.availabilityStatus || p.status}
                  </span>
                  {p.unavailableReason && (
                    <div style={{ color: "#f87171", marginTop: 2 }}>{p.unavailableReason}</div>
                  )}
                </div>
                <button
                  type="button"
                  className={`${styles.transitionBtn} ${styles.danger}`}
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => { runOperation(() => store.disconnectOpenAiOAuth(p.id)).catch(() => {}); }}
                  data-testid={`disconnect-chatgpt-btn-${p.id}`}
                >
                  Desconectar cuenta
                </button>
              </div>
            ))}
        </div>

        {/* 2. Alternativo: DeepSeek — API key */}
        <div
          style={{
            background: "rgba(56, 189, 248, 0.06)",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
          }}
          data-testid="provider-card-deepseek"
        >
          <strong style={{ color: "#f8fafc", fontSize: 13, display: "block", marginBottom: 6 }}>
            2. Alternativo: DeepSeek — API key (`https://api.deepseek.com/responses`)
          </strong>
          <div className={styles.twoColumns}>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Nombre del Perfil:</label>
              <input
                type="text"
                value={deepseekProfileName}
                onChange={e => setDeepseekProfileName(e.target.value)}
                data-testid="deepseek-profile-name-input"
              />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label>Modelo DeepSeek:</label>
              <select
                value={deepseekModel}
                onChange={e => setDeepseekModel(e.target.value as "deepseek-flash" | "deepseek-v4-pro")}
                data-testid="deepseek-model-select"
              >
                <option value="deepseek-flash">deepseek-flash (Inicial recomendado)</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro (Avanzado)</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div className={styles.formGroup} style={{ flex: 1, marginBottom: 0 }}>
              <label>API Key (almacenada cifrada en SecureCredentialVault):</label>
              <input
                type="password"
                value={deepseekApiKeyInput}
                onChange={e => setDeepseekApiKeyInput(e.target.value)}
                placeholder="sk-..."
                data-testid="deepseek-api-key-input"
              />
            </div>
            <button
              type="button"
              className={styles.transitionBtn}
              disabled={!deepseekApiKeyInput.trim()}
              onClick={async () => {
                const ok = await runOperation(() => store.createAiProfile({
                  name: deepseekProfileName.trim() || "DeepSeek — API key",
                  provider: "deepseek",
                  model: deepseekModel,
                  endpoint: "https://api.deepseek.com/responses",
                  apiKey: deepseekApiKeyInput.trim(),
                }));

                // Keep the typed key after a failure so the user can retry.
                if (ok) setDeepseekApiKeyInput("");
              }}
              data-testid="save-deepseek-profile-btn"
            >
              Guardar DeepSeek
            </button>
          </div>
        </div>

        {/* 3. Mock & Proveedores Deshabilitados */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            color: "#94a3b8",
            marginBottom: 14,
          }}
          data-testid="provider-card-status-summary"
        >
          <div>✓ <strong>Mock — pruebas offline:</strong> Habilitado para validación determinística sin red.</div>
          <div style={{ marginTop: 4 }}>⊘ <strong>Anthropic:</strong> Deshabilitado por política de alcance H8.8-03.</div>
          <div style={{ marginTop: 4 }}>⊘ <strong>Gemini:</strong> Deshabilitado por política de alcance H8.8-03.</div>
        </div>

        <div className={styles.modalFooter}>
          <button
            className={`${styles.transitionBtn} ${styles.secondary}`}
            onClick={() => onClose()}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
