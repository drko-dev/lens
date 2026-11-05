/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "node:crypto";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { IncidentRepository } from "./incident-repository";
import type {
  IncidentStatus,
  IncidentTransitionResult,
  PrivilegedTransitionRequest,
} from "../../common/incident/incident-types";
import { IncidentStateMachine } from "../../common/incident/incident-state-machine";
import { validateId } from "./incident-ipc-validator";

export interface PendingPrivilegedConfirmation {
  id: string;
  incidentId: string;
  incidentTitle: string;
  fromStatus: IncidentStatus;
  toStatus: "APROBACIÓN HUMANA" | "CERRADO";
  justification: string;
  evidenceIds?: string[];
  expiresAt: number;
  modalWindow?: BrowserWindow | null;
  resolve: (result: IncidentTransitionResult) => void;
  reject: (err: any) => void;
}

export class IncidentConfirmationManager {
  private readonly pending = new Map<string, PendingPrivilegedConfirmation>();
  private readonly modalWebContentsIds = new Set<number>();
  private isHandlerRegistered = false;

  constructor(private readonly incidentRepo: IncidentRepository) {}

  /**
   * Registers the internal IPC handlers for the isolated confirmation modal.
   */
  public registerInternalHandlers(ipc: typeof ipcMain = ipcMain): void {
    if (this.isHandlerRegistered) return;
    this.isHandlerRegistered = true;

    ipc.handle("openlens:incident:confirmation:get-details", (event, token: string) => {
      this.validateModalCaller(event);
      const conf = this.pending.get(token);
      if (!conf || Date.now() > conf.expiresAt) {
        throw new Error("SecurityError: Confirmation token is invalid or has expired.");
      }
      return {
        id: conf.id,
        incidentId: conf.incidentId,
        incidentTitle: conf.incidentTitle,
        fromStatus: conf.fromStatus,
        toStatus: conf.toStatus,
        justification: conf.justification,
      };
    });

    ipc.handle("openlens:incident:confirmation:respond", async (event, token: string, decision: "APPROVED" | "REJECTED") => {
      this.validateModalCaller(event);
      return this.processConfirmationResponse(token, decision);
    });
  }

  /**
   * Requests a privileged transition (APROBACIÓN HUMANA or CERRADO).
   * Spawns an isolated modal window with contextIsolation=true, sandbox=true, nodeIntegration=false.
   */
  public async requestPrivilegedTransition(
    request: PrivilegedTransitionRequest,
    event?: IpcMainInvokeEvent,
  ): Promise<IncidentTransitionResult> {
    const incidentId = validateId(request.incidentId, "incidentId");
    const toStatus = request.toStatus;

    if (toStatus !== "APROBACIÓN HUMANA" && toStatus !== "CERRADO") {
      throw new Error(`ValidationError: Target status '${toStatus}' is not a recognized privileged transition.`);
    }

    const justification = (request.justification || "").trim();
    if (justification.length < 5 || justification.length > 1000) {
      throw new Error("ValidationError: 'justification' is required and must be between 5 and 1000 characters.");
    }

    const incident = this.incidentRepo.getIncidentById(incidentId);
    if (!incident) {
      throw new Error(`NotFoundError: Incident with ID '${incidentId}' does not exist.`);
    }

    // Pre-validate via state machine
    IncidentStateMachine.validateTransition(incident, {
      incidentId,
      toStatus,
      justification,
      actor: { type: "human", name: "pending-confirmation" },
      evidenceIds: request.evidenceIds,
    });

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60_000; // 60s TTL

    return new Promise<IncidentTransitionResult>((resolve, reject) => {
      const pendingItem: PendingPrivilegedConfirmation = {
        id: token,
        incidentId,
        incidentTitle: incident.title,
        fromStatus: incident.status,
        toStatus,
        justification,
        evidenceIds: request.evidenceIds,
        expiresAt,
        resolve,
        reject,
      };

      this.pending.set(token, pendingItem);

      // In testing environments or when BrowserWindow is mocked/absent, keep token pending
      if (typeof BrowserWindow === "undefined" || !BrowserWindow.fromWebContents) {
        return;
      }

      const parentWindow = event?.sender ? BrowserWindow.fromWebContents(event.sender) ?? undefined : undefined;

      try {
        const modal = new BrowserWindow({
          width: 520,
          height: 480,
          title: "Confirmación Privilegiada — OpenLens DevOps",
          modal: true,
          parent: parentWindow,
          resizable: false,
          minimizable: false,
          maximizable: false,
          backgroundColor: "#0e131b",
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        pendingItem.modalWindow = modal;
        this.modalWebContentsIds.add(modal.webContents.id);

        const html = this.generateModalHtml(pendingItem);
        modal.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        modal.on("closed", () => {
          this.modalWebContentsIds.delete(modal.webContents.id);
          const current = this.pending.get(token);
          if (current) {
            this.pending.delete(token);
            current.reject(new Error("Acción cancelada por el operador (ventana cerrada)."));
          }
        });
      } catch (err) {
        this.pending.delete(token);
        reject(err);
      }
    });
  }

  /**
   * Programmatic confirmation resolution for automated tests and headless harnesses.
   */
  public async submitConfirmationForTesting(token: string, decision: "APPROVED" | "REJECTED"): Promise<IncidentTransitionResult> {
    return this.processConfirmationResponse(token, decision);
  }

  private async processConfirmationResponse(token: string, decision: "APPROVED" | "REJECTED"): Promise<IncidentTransitionResult> {
    const item = this.pending.get(token);
    if (!item) {
      throw new Error("SecurityError: Confirmation token not found or already consumed.");
    }

    if (Date.now() > item.expiresAt) {
      this.pending.delete(token);
      if (item.modalWindow && !item.modalWindow.isDestroyed()) {
        item.modalWindow.close();
      }
      throw new Error("SecurityError: Confirmation token has expired (60s limit).");
    }

    // Single-use: remove immediately before execution
    this.pending.delete(token);

    if (item.modalWindow && !item.modalWindow.isDestroyed()) {
      item.modalWindow.close();
    }

    if (decision === "REJECTED") {
      item.reject(new Error("Transición cancelada: el operador rechazó la confirmación."));
      throw new Error("Transición cancelada: el operador rechazó la confirmación.");
    }

    // Execute atomic transition with human-verified actor
    const result = this.incidentRepo.transitionStatus({
      incidentId: item.incidentId,
      toStatus: item.toStatus,
      justification: item.justification,
      evidenceIds: item.evidenceIds,
      actor: {
        type: "human",
        name: "verified-operator",
        metadata: {
          verifiedVia: "isolated-confirmation-modal",
          confirmationToken: token,
          authorizedAt: new Date().toISOString(),
        },
      },
    });

    item.resolve(result);
    return result;
  }

  private validateModalCaller(event: any): void {
    if (!event || !event.sender) {
      throw new Error("SecurityError: Missing modal caller WebContents.");
    }
    if (!this.modalWebContentsIds.has(event.sender.id)) {
      throw new Error("SecurityError: IPC call to confirmation handler from non-modal WebContents rejected.");
    }
  }

  private generateModalHtml(item: PendingPrivilegedConfirmation): string {
    const actionLabel =
      item.toStatus === "APROBACIÓN HUMANA" ? "Aprobar Solución Propuesta" : "Cierre Definitivo del Incidente";

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Confirmación Privilegiada</title>
  <style>
    body {
      background-color: #0e131b;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      user-select: none;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.4);
      margin-bottom: 12px;
    }
    h2 { font-size: 16px; margin: 0 0 16px 0; color: #fff; }
    .card {
      background: #161e2a;
      border: 1px solid #243142;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .field { margin-bottom: 10px; }
    .label { color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
    .val { font-weight: 500; }
    .notice {
      font-size: 11px;
      color: #94a3b8;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    .actions { display: flex; justify-content: flex-end; gap: 10px; }
    button {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
    }
    .btn-cancel { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
    .btn-confirm { background: #3b82f6; color: #fff; }
    .btn-confirm:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="badge">Acción de Operador Humano</div>
  <h2>${actionLabel}</h2>
  <div class="card">
    <div class="field">
      <div class="label">Incidente</div>
      <div class="val">${item.incidentTitle} (${item.incidentId})</div>
    </div>
    <div class="field">
      <div class="label">Transición de Estado</div>
      <div class="val">${item.fromStatus} ➔ <strong>${item.toStatus}</strong></div>
    </div>
    <div class="field">
      <div class="label">Justificación Registrada</div>
      <div class="val" style="font-style: italic;">"${item.justification}"</div>
    </div>
  </div>
  <div class="notice">
    <strong>Contexto de Seguridad Aislado:</strong> Esta ventana se ejecuta en modo estricto (contextIsolation, sandbox y sin acceso a nodeIntegration). Tu autorización interactiva ejecuta una transición atómica registrada en la base de auditoría SQLite.
  </div>
  <div class="actions">
    <button class="btn-cancel" onclick="respond('REJECTED')">Cancelar</button>
    <button class="btn-confirm" onclick="respond('APPROVED')">Autorizar Transición</button>
  </div>
  <script>
    function respond(decision) {
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.invoke('openlens:incident:confirmation:respond', '${item.id}', decision);
      }
    }
  </script>
</body>
</html>`;
  }
}
