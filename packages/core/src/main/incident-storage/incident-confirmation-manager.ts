/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { IncidentRepository } from "./incident-repository";
import type {
  IncidentStatus,
  IncidentTransitionResult,
  PrivilegedTransitionRequest,
} from "../../common/incident/incident-types";
import { IncidentStateMachine } from "../../common/incident/incident-state-machine";
import { validateId } from "./incident-ipc-validator";

export interface PendingPrivilegedConfirmation {
  id: string; // Token efímero
  incidentId: string;
  incidentTitle: string;
  fromStatus: IncidentStatus;
  toStatus: "APROBACIÓN HUMANA" | "CERRADO";
  justification: string;
  evidenceIds?: string[];
  expiresAt: number;
  modalWindow?: BrowserWindow | null;
  modalWebContentsId?: number | null;
  timeoutId?: NodeJS.Timeout;
  resolve: (result: IncidentTransitionResult) => void;
  reject: (err: any) => void;
}

export type ConfirmationUIMode = "modal-window" | "native-dialog";

export interface ConfirmationDialogProvider {
  showMessageBox(parentWindow: any, options: any): Promise<{ response: number; checkboxChecked?: boolean }>;
}

export interface ConfirmationManagerOptions {
  uiMode?: ConfirmationUIMode;
  dialogProvider?: ConfirmationDialogProvider;
}

/**
 * Resuelve la ruta a los activos estáticos seguros de confirmación (HTML / preload).
 */
export function resolveModalAsset(filename: string, staticDir?: string): string {
  const altFilename = filename.startsWith("confirmation-")
    ? `incident-${filename.replace("confirmation-modal", "confirmation")}`
    : filename;

  let currentAppStatic: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    if (electron.app && typeof electron.app.getAppPath === "function") {
      currentAppStatic = path.join(electron.app.getAppPath(), "static");
    }
  } catch {
    // Non-electron environment
  }

  const possiblePaths = [
    ...(staticDir ? [path.join(staticDir, filename), path.join(staticDir, altFilename)] : []),
    ...(currentAppStatic ? [path.join(currentAppStatic, filename), path.join(currentAppStatic, altFilename)] : []),
    path.join(__dirname, "..", filename),
    path.join(__dirname, "..", altFilename),
    path.join(__dirname, "..", "static", filename),
    path.join(__dirname, "..", "static", altFilename),
    path.join(process.resourcesPath ?? "", "app.asar", "static", filename),
    path.join(process.resourcesPath ?? "", "app.asar", "static", altFilename),
    path.join(process.resourcesPath ?? "", "static", filename),
    path.join(__dirname, "assets", filename),
    path.resolve(__dirname, "../../../../../open-lens/static", filename),
    path.resolve(__dirname, "../../../../../open-lens/static", altFilename),
    path.resolve(process.cwd(), "open-lens/static", filename),
    path.resolve(process.cwd(), "open-lens/static", altFilename),
    path.resolve(process.cwd(), "packages/core/src/main/incident-storage/assets", filename),
  ];
  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return currentAppStatic ? path.join(currentAppStatic, filename) : possiblePaths[0];
}

export class IncidentConfirmationManager {
  private readonly pending = new Map<string, PendingPrivilegedConfirmation>();
  private readonly tokenByWebContentsId = new Map<number, string>();
  private readonly modalWebContentsIds = new Set<number>();
  private isHandlerRegistered = false;
  private readonly uiMode: ConfirmationUIMode;
  private readonly dialogProvider: ConfirmationDialogProvider;

  constructor(
    private readonly incidentRepo: IncidentRepository,
    options: ConfirmationManagerOptions = {},
  ) {
    this.uiMode = options.uiMode ?? "modal-window";
    this.dialogProvider = options.dialogProvider ?? dialog;
  }

  /**
   * Verifica si un WebContents específico corresponde a una ventana modal de confirmación.
   */
  public isModalWebContents(webContentsId: number): boolean {
    return this.modalWebContentsIds.has(webContentsId);
  }

  /**
   * Registra los manejadores IPC internos para la confirmación en contexto aislado.
   */
  public registerInternalHandlers(ipc: typeof ipcMain = ipcMain): void {
    if (this.isHandlerRegistered) return;
    this.isHandlerRegistered = true;

    ipc.handle("openlens:incident:confirmation:get-details", (event, tokenParam?: string) => {
      const token = this.resolveTokenFromEvent(event, tokenParam);
      this.validateModalCaller(event, token);

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

    ipc.handle(
      "openlens:incident:confirmation:respond",
      async (event, firstArg: string, secondArg?: string) => {
        let token: string | undefined;
        let decision: string;

        if (secondArg !== undefined) {
          token = firstArg;
          decision = secondArg;
        } else {
          decision = firstArg;
          token = this.resolveTokenFromEvent(event);
        }

        if (!token) {
          throw new Error("SecurityError: Missing confirmation token context.");
        }

        this.validateModalCaller(event, token);
        return this.processConfirmationResponse(token, decision);
      },
    );
  }

  /**
   * Solicita una transición privilegiada (APROBACIÓN HUMANA o CERRADO).
   * Despliega la pasarela de confirmación controlada en Main (modal aislada o diálogo nativo).
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

    // Validación estricta contra la máquina de estados
    IncidentStateMachine.validateTransition(incident, {
      incidentId,
      toStatus,
      justification,
      actor: { type: "human", name: "pending-confirmation" },
      evidenceIds: request.evidenceIds,
    });

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60_000; // TTL de 60 segundos

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

      // Temporizador activo de caducidad (garantía de no promesas colgadas por TTL)
      pendingItem.timeoutId = setTimeout(() => {
        const current = this.pending.get(token);
        if (current) {
          this.cleanupPendingItem(token, current);
          current.reject(new Error("TimeoutError: Confirmation expired after 60 seconds without operator response."));
        }
      }, 60_000);

      this.pending.set(token, pendingItem);

      const parentWindow =
        event?.sender && typeof BrowserWindow !== "undefined" && typeof BrowserWindow.fromWebContents === "function"
          ? BrowserWindow.fromWebContents(event.sender) ?? undefined
          : undefined;

      // Modal nativo dialog.showMessageBox cuando se selecciona ese modo
      if (this.uiMode === "native-dialog") {
        this.openNativeDialog(token, pendingItem, parentWindow).catch((err) => {
          this.cleanupPendingItem(token, pendingItem);
          reject(err);
        });
        return;
      }

      // Entornos de prueba unitaria sin BrowserWindow completo
      if (typeof BrowserWindow === "undefined" || typeof BrowserWindow.fromWebContents !== "function") {
        return;
      }

      // Modo ventana modal aislada con recurso estático confiable
      try {
        const preloadPath = resolveModalAsset("confirmation-preload.js");
        const htmlPath = resolveModalAsset("confirmation-modal.html");

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
            preload: preloadPath,
          },
        });

        pendingItem.modalWindow = modal;
        pendingItem.modalWebContentsId = modal.webContents.id;
        this.modalWebContentsIds.add(modal.webContents.id);
        this.tokenByWebContentsId.set(modal.webContents.id, token);

        modal.loadFile(htmlPath).catch((err) => {
          this.cleanupPendingItem(token, pendingItem);
          pendingItem.reject(err);
        });

        modal.on("closed", () => {
          this.cleanupPendingItem(token, pendingItem);
          pendingItem.reject(new Error("Acción cancelada por el operador (ventana cerrada)."));
        });
      } catch (err) {
        this.cleanupPendingItem(token, pendingItem);
        reject(err);
      }
    });
  }

  /**
   * Resolución programática para arneses de pruebas y tests unitarios.
   */
  public async submitConfirmationForTesting(
    token: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<IncidentTransitionResult> {
    return this.processConfirmationResponse(token, decision);
  }

  private async openNativeDialog(
    token: string,
    item: PendingPrivilegedConfirmation,
    parentWindow?: BrowserWindow,
  ): Promise<void> {
    const actionLabel =
      item.toStatus === "APROBACIÓN HUMANA" ? "Aprobar Solución Propuesta" : "Cierre Definitivo del Incidente";

    const result = await this.dialogProvider.showMessageBox(parentWindow as any, {
      type: "warning",
      buttons: ["Cancelar", "Autorizar Transición"],
      defaultId: 1,
      cancelId: 0,
      title: "Confirmación de Operador Humano — OpenLens DevOps",
      message: `${actionLabel}: ${item.incidentTitle}`,
      detail:
        `ID: ${item.incidentId}\n` +
        `Transición: ${item.fromStatus} ➔ ${item.toStatus}\n` +
        `Justificación: "${item.justification}"\n\n` +
        `Contexto de Seguridad: Esta acción atómica se registra en SQLite con trazabilidad de auditoría.`,
    });

    const decision: "APPROVED" | "REJECTED" = result.response === 1 ? "APPROVED" : "REJECTED";
    await this.processConfirmationResponse(token, decision);
  }

  private async processConfirmationResponse(
    token: string,
    decision: any,
  ): Promise<IncidentTransitionResult> {
    // SEC-H8-04: Validación estricta en runtime de decision
    if (typeof decision !== "string" || (decision !== "APPROVED" && decision !== "REJECTED")) {
      throw new Error(`SecurityError: Decision must be strictly 'APPROVED' or 'REJECTED'. Received '${decision}'.`);
    }

    const item = this.pending.get(token);
    if (!item) {
      throw new Error("SecurityError: Confirmation token not found or already consumed.");
    }

    if (Date.now() > item.expiresAt) {
      this.cleanupPendingItem(token, item);
      const expiredErr = new Error("SecurityError: Confirmation token has expired (60s limit).");
      item.reject(expiredErr);
      throw expiredErr;
    }

    // Consumo único de token: remoción inmediata antes de la ejecución transaccional
    this.cleanupPendingItem(token, item);

    if (decision === "REJECTED") {
      const rejectedErr = new Error("Transición cancelada: el operador rechazó la confirmación.");
      item.reject(rejectedErr);
      throw rejectedErr;
    }

    // SEC-H8-05: Ejecución transaccional atómica con garantía de resolución o rechazo de promesa
    try {
      const auditReference = `audit-conf-${crypto.randomUUID()}`;

      const result = this.incidentRepo.transitionStatus({
        incidentId: item.incidentId,
        toStatus: item.toStatus,
        justification: item.justification,
        evidenceIds: item.evidenceIds,
        actor: {
          type: "human",
          name: "verified-operator",
          metadata: {
            verifiedVia: "isolated-modal-interactive-consent",
            auditReference, // No sensible; token efímero NO persistido
            authorizedAt: new Date().toISOString(),
          },
        },
      });

      item.resolve(result);
      return result;
    } catch (err) {
      // Si la transacción SQLite falla (violación de clave, timeout, lock), se rechaza la promesa
      item.reject(err);
      throw err;
    }
  }

  private cleanupPendingItem(token: string, item: PendingPrivilegedConfirmation): void {
    if (item.timeoutId) {
      clearTimeout(item.timeoutId);
      item.timeoutId = undefined;
    }
    if (item.modalWebContentsId) {
      this.modalWebContentsIds.delete(item.modalWebContentsId);
      this.tokenByWebContentsId.delete(item.modalWebContentsId);
    }
    this.pending.delete(token);

    if (item.modalWindow && !item.modalWindow.isDestroyed()) {
      item.modalWindow.close();
      item.modalWindow = null;
    }
  }

  private resolveTokenFromEvent(event: any, tokenParam?: string): string {
    if (tokenParam) return tokenParam;
    if (event?.sender?.id) {
      const boundToken = this.tokenByWebContentsId.get(event.sender.id);
      if (boundToken) return boundToken;
    }
    throw new Error("SecurityError: Missing confirmation token context.");
  }

  private validateModalCaller(event: any, token: string): void {
    if (!event || !event.sender) {
      throw new Error("SecurityError: Missing modal caller WebContents.");
    }
    if (typeof event.sender.isDestroyed === "function" && event.sender.isDestroyed()) {
      throw new Error("SecurityError: Modal WebContents is destroyed.");
    }

    // En entornos reales con ventana registrada, verificar WebContents
    const item = this.pending.get(token);
    if (item?.modalWebContentsId && event.sender.id !== item.modalWebContentsId) {
      throw new Error("SecurityError: IPC call to confirmation handler from unauthorized WebContents rejected.");
    }

    // Verificar frame principal (rechazar subframes / iframes)
    if (event.senderFrame) {
      if (event.senderFrame.parent !== null && event.senderFrame.parent !== undefined) {
        throw new Error("SecurityError: Subframe invocation in confirmation modal rejected.");
      }
      if (event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) {
        throw new Error("SecurityError: Non-main frame invocation in confirmation modal rejected.");
      }
    }
  }
}
