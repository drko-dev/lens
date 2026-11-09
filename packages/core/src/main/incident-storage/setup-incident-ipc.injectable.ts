/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { ipcMain } from "electron";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { incidentIpcChannels, type IncidentTransitionPayload } from "../../common/incident/incident-ipc";
import incidentRepositoryInjectable from "./incident-repository.injectable";
import evidenceRepositoryInjectable from "./evidence-repository.injectable";
import incidentPurgerInjectable from "./incident-purger.injectable";
import incidentConfirmationManagerInjectable from "./incident-confirmation-manager.injectable";
import aiProfileManagerInjectable from "../ai-diagnostics/ai-profile-manager.injectable";
import aiDiagnosisEngineInjectable from "../ai-diagnostics/ai-diagnosis-engine.injectable";
import remediationVerifierInjectable from "../ai-diagnostics/remediation-verifier.injectable";
import aiDiagnosisRepositoryInjectable from "../ai-diagnostics/ai-diagnosis-repository.injectable";
import ephemeralContextManagerInjectable from "../ai-diagnostics/ephemeral-context-manager.injectable";
import openAiSiwcOAuthManagerInjectable from "../ai-diagnostics/oauth/openai-siwc-oauth-manager.injectable";
import localIncidentScannerInjectable from "../incident-scanner/local-incident-scanner.injectable";
import getClusterByIdInjectable from "../../features/cluster/storage/common/get-by-id.injectable";
import loadProxyKubeconfigInjectable from "../cluster/load-proxy-kubeconfig.injectable";
import incidentScannerConsentManagerInjectable from "../incident-scanner/incident-scanner-consent-manager.injectable";
import type {
  IncidentScannerConsentManager,
  HumanConsentConfirmationProvider,
} from "../incident-scanner/incident-scanner-consent-manager";
import { SnapshotSourceSecurityError } from "../incident-scanner/snapshot-source";
import type { UserIdentity } from "../../common/incident/broker-types";
import type { IncidentRepository } from "./incident-repository";
import type { EvidenceRepository } from "./evidence-repository";
import type { IncidentPurger } from "./incident-purger";
import type { IncidentConfirmationManager } from "./incident-confirmation-manager";
import type { AiProfileManager } from "../ai-diagnostics/ai-profile-manager";
import type { AiDiagnosisEngine } from "../ai-diagnostics/ai-diagnosis-engine";
import type { RemediationVerifier } from "../ai-diagnostics/remediation-verifier";
import type { AiDiagnosisRepository } from "../ai-diagnostics/ai-diagnosis-repository";
import type { EphemeralContextManager } from "../ai-diagnostics/ephemeral-context-manager";
import type { LocalIncidentScanner } from "../incident-scanner/local-incident-scanner";
import type {
  CreateIncidentInput,
  IncidentFilter,
  IngestEvidenceInput,
  ManualPurgeRequest,
  PrivilegedTransitionRequest,
  TimelineActor,
  UpdateIncidentInput,
  UpdateRetentionPolicyInput,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";
import {
  validateCreateAiProfileInput,
  validateCreateIncidentInput,
  validateExecuteDiagnosisInput,
  validateId,
  validateIncidentFilter,
  validateIncidentTransitionPayload,
  validateIngestEvidenceInput,
  validateIpcSender,
  validateManualPurgeRequest,
  validatePrepareConsentInput,
  validatePrivilegedTransitionRequest,
  validateUpdateAiProfileInput,
  validateUpdateIncidentInput,
  validateUpdateRetentionPolicyInput,
  validateUserContextMetadataInput,
  validateVerifyRemediationInput,
  validateAddEphemeralFileInput,
  validateUpdateEphemeralMetadataInput,
  validateScannerStartInput,
  validateScannerRequestConsentInput,
  validateScanFromSourceInput,
  validateScannerAlertActionPayload,
  validateK8sSnapshot,
  validateOpenAiOAuthSignInInput,
} from "./incident-ipc-validator";
import type { OpenAiSiwcOAuthManager } from "../ai-diagnostics/oauth/openai-siwc-oauth-manager";

export interface IpcHandlerRegistrar {
  handle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
}

export function registerIncidentIpcHandlers(
  incidentRepo: IncidentRepository,
  evidenceRepo: EvidenceRepository,
  purger?: IncidentPurger,
  confirmationManager?: IncidentConfirmationManager,
  aiComponentsOrIpc?: {
    profileManager?: AiProfileManager;
    diagnosisEngine?: AiDiagnosisEngine;
    remediationVerifier?: RemediationVerifier;
    diagnosisRepo?: AiDiagnosisRepository;
    ephemeralContextManager?: EphemeralContextManager;
    scanner?: LocalIncidentScanner;
    oauthManager?: OpenAiSiwcOAuthManager;
    getClusterById?: (clusterId: string) => any;
    loadProxyKubeconfig?: (cluster: any) => () => Promise<any>;
    consentManager?: IncidentScannerConsentManager;
    humanConsentConfirmationProvider?: HumanConsentConfirmationProvider;
  } | IpcHandlerRegistrar,
  maybeIpc: IpcHandlerRegistrar = ipcMain,
): () => void {
  let aiComponents: {
    profileManager?: AiProfileManager;
    diagnosisEngine?: AiDiagnosisEngine;
    remediationVerifier?: RemediationVerifier;
    diagnosisRepo?: AiDiagnosisRepository;
    ephemeralContextManager?: EphemeralContextManager;
    scanner?: LocalIncidentScanner;
    oauthManager?: OpenAiSiwcOAuthManager;
    getClusterById?: (clusterId: string) => any;
    loadProxyKubeconfig?: (cluster: any) => () => Promise<any>;
    consentManager?: IncidentScannerConsentManager;
    humanConsentConfirmationProvider?: HumanConsentConfirmationProvider;
  } | undefined;
  let ipc: IpcHandlerRegistrar = maybeIpc;

  if (aiComponentsOrIpc && typeof (aiComponentsOrIpc as any).handle === "function") {
    ipc = aiComponentsOrIpc as IpcHandlerRegistrar;
  } else if (aiComponentsOrIpc) {
    aiComponents = aiComponentsOrIpc as any;
  }
  ipc.handle(incidentIpcChannels.list, async (event, filter?: IncidentFilter) => {
    validateIpcSender(event);
    const validatedFilter = validateIncidentFilter(filter);
    return incidentRepo.listIncidents(validatedFilter);
  });

  ipc.handle(incidentIpcChannels.get, async (event, id: string) => {
    validateIpcSender(event);
    const validatedId = validateId(id, "incidentId");
    return incidentRepo.getIncidentById(validatedId);
  });

  ipc.handle(incidentIpcChannels.create, async (event, input: CreateIncidentInput, _actor?: TimelineActor) => {
    validateIpcSender(event);
    const validatedInput = validateCreateIncidentInput(input);
    return incidentRepo.createIncident(validatedInput);
  });

  ipc.handle(incidentIpcChannels.update, async (event, id: string, patch: UpdateIncidentInput) => {
    validateIpcSender(event);
    const validatedId = validateId(id, "incidentId");
    const validatedPatch = validateUpdateIncidentInput(patch);
    return incidentRepo.updateIncident(validatedId, validatedPatch);
  });

  ipc.handle(incidentIpcChannels.transition, async (event, payload: IncidentTransitionPayload) => {
    validateIpcSender(event);
    const validatedPayload = validateIncidentTransitionPayload(payload);
    return incidentRepo.transitionStatus(validatedPayload);
  });

  ipc.handle(incidentIpcChannels.getTimeline, async (event, incidentId: string) => {
    validateIpcSender(event);
    const validatedId = validateId(incidentId, "incidentId");
    return incidentRepo.getTimeline(validatedId);
  });

  ipc.handle(incidentIpcChannels.getEvidence, async (event, incidentId: string) => {
    validateIpcSender(event);
    const validatedId = validateId(incidentId, "incidentId");
    return evidenceRepo.listEvidenceByIncident(validatedId);
  });

  ipc.handle(incidentIpcChannels.ingestEvidence, async (event, input: IngestEvidenceInput) => {
    validateIpcSender(event);
    const validatedInput = validateIngestEvidenceInput(input);
    return evidenceRepo.ingestEvidence(validatedInput);
  });

  ipc.handle(incidentIpcChannels.ingestUserContext, async (event, input: UserContextMetadataInput) => {
    validateIpcSender(event);
    const validatedInput = validateUserContextMetadataInput(input);
    return evidenceRepo.ingestUserContextMetadata(validatedInput);
  });

  if (purger) {
    ipc.handle(incidentIpcChannels.getRetentionPolicy, async (event) => {
      validateIpcSender(event);
      return purger.getRetentionPolicy();
    });

    ipc.handle(incidentIpcChannels.setRetentionPolicy, async (event, input: UpdateRetentionPolicyInput) => {
      validateIpcSender(event);
      const validated = validateUpdateRetentionPolicyInput(input);
      return purger.setRetentionPolicy(validated);
    });

    ipc.handle(incidentIpcChannels.previewPurge, async (event, override?: UpdateRetentionPolicyInput) => {
      validateIpcSender(event);
      const validated = override ? validateUpdateRetentionPolicyInput(override) : undefined;
      return purger.previewPurge(validated);
    });

    ipc.handle(incidentIpcChannels.executePurge, async (event) => {
      validateIpcSender(event);
      return purger.executeAutomaticPurge();
    });

    ipc.handle(incidentIpcChannels.executeAutomaticPurge, async (event) => {
      validateIpcSender(event);
      return purger.executeAutomaticPurge();
    });

    ipc.handle(incidentIpcChannels.executeManualPurge, async (event, input: ManualPurgeRequest) => {
      validateIpcSender(event);
      const validated = validateManualPurgeRequest(input);
      return purger.executeManualPurge(validated);
    });

    ipc.handle(incidentIpcChannels.getPurgeHistory, async (event, limit?: number) => {
      validateIpcSender(event);
      const safeLimit = typeof limit === "number" && limit > 0 && limit <= 100 ? limit : 20;
      return purger.getPurgeHistory(safeLimit);
    });
  }

  if (confirmationManager) {
    confirmationManager.registerInternalHandlers(ipc as any);

    ipc.handle(incidentIpcChannels.requestPrivilegedTransition, async (event, request: PrivilegedTransitionRequest) => {
      validateIpcSender(event);
      if (confirmationManager.isModalWebContents(event?.sender?.id)) {
        throw new Error("SecurityError: Confirmation modal is forbidden from requesting privileged transitions.");
      }
      const validated = validatePrivilegedTransitionRequest(request);
      return confirmationManager.requestPrivilegedTransition(validated, event);
    });
  }

  if (aiComponents) {
    const { profileManager, diagnosisEngine, remediationVerifier, diagnosisRepo } = aiComponents;

    if (profileManager) {
      ipc.handle(incidentIpcChannels.aiListProfiles, async (event) => {
        validateIpcSender(event);
        return profileManager.listProfiles();
      });

      ipc.handle(incidentIpcChannels.aiCreateProfile, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const validated = validateCreateAiProfileInput(rawPayload);
        return profileManager.createProfile(validated);
      });

      ipc.handle(incidentIpcChannels.aiUpdateProfile, async (event, id: string, rawPayload: unknown) => {
        validateIpcSender(event);
        const validatedId = validateId(id, "profileId");
        const validated = validateUpdateAiProfileInput(rawPayload);
        return profileManager.updateProfile(validatedId, validated);
      });

      ipc.handle(incidentIpcChannels.aiDeleteProfile, async (event, id: string) => {
        validateIpcSender(event);
        const validatedId = validateId(id, "profileId");
        await profileManager.deleteProfile(validatedId);
        return { success: true };
      });

      const resolvedOAuthManager =
        aiComponents.oauthManager ?? diagnosisEngine?.getOAuthManager?.();

      ipc.handle(incidentIpcChannels.aiStartOpenAiOAuthSignIn, async (event, rawInput: unknown) => {
        validateIpcSender(event);
        const validated = validateOpenAiOAuthSignInInput(rawInput);
        if (!resolvedOAuthManager) {
          throw new Error(
            "EXTERNAL_PROVIDER_DISABLED: Conexión con ChatGPT no disponible (gestor OAuth deshabilitado en modo offline).",
          );
        }
        const session = await resolvedOAuthManager.startSignInWithChatGpt({
          profileId: validated.profileId,
          profileName: validated.profileName,
        });

        const sender = event?.sender;
        const onWindowDestroyed = () => {
          session.cancel();
        };
        if (sender && typeof sender.once === "function") {
          sender.once("destroyed", onWindowDestroyed);
        }

        try {
          const profile = await session.waitForCompletion();
          return profile;
        } finally {
          if (sender && typeof sender.removeListener === "function") {
            sender.removeListener("destroyed", onWindowDestroyed);
          }
        }
      });

      ipc.handle(incidentIpcChannels.aiDisconnectOpenAiOAuth, async (event, rawProfileId: string) => {
        validateIpcSender(event);
        const profileId = validateId(rawProfileId, "profileId");
        if (!resolvedOAuthManager) {
          await profileManager.purgeProfileCredential(profileId);
          return profileManager.updateProfile(profileId, {
            status: "revoked",
            oauthSubject: null,
            oauthScopes: null,
            oauthExpiresAt: null,
            availabilityStatus: "disconnected",
          });
        }
        return resolvedOAuthManager.disconnectAndRevoke(profileId);
      });

      ipc.handle(incidentIpcChannels.aiListOpenAiModels, async (event, rawProfileId: string) => {
        validateIpcSender(event);
        const profileId = validateId(rawProfileId, "profileId");
        if (!resolvedOAuthManager) {
          throw new Error(
            "EXTERNAL_PROVIDER_DISABLED: Conexión con ChatGPT no disponible (gestor OAuth deshabilitado en modo offline).",
          );
        }
        return resolvedOAuthManager.fetchAvailableModels(profileId);
      });

      if (resolvedOAuthManager) {
        try {
          const { app } = require("electron");
          if (app && typeof app.on === "function") {
            app.on("will-quit", () => resolvedOAuthManager.dispose());
            app.on("before-quit", () => resolvedOAuthManager.dispose());
          }
        } catch {
          // Outside Electron runtime
        }
      }
    }

    if (diagnosisEngine) {
      incidentRepo.onTransition((incidentId, toStatus) => {
        if (toStatus === "CERRADO" || toStatus === "NO CONFIRMADO") {
          diagnosisEngine.revokeConsentsForIncident(incidentId);
          diagnosisEngine.cancelPendingDiagnoses(incidentId);
        }
      });

      ipc.handle(incidentIpcChannels.aiPrepareConsent, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const { incidentId, profileId } = validatePrepareConsentInput(rawPayload);
        return diagnosisEngine.prepareConsentPreview(incidentId, profileId);
      });

      ipc.handle(incidentIpcChannels.aiExecuteDiagnosis, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const validated = validateExecuteDiagnosisInput(rawPayload);
        return diagnosisEngine.executeDiagnosis(
          validated.incidentId,
          validated.profileId,
          validated.consentToken,
          { timeoutMs: validated.timeoutMs },
        );
      });
    }

    if (diagnosisRepo) {
      ipc.handle(incidentIpcChannels.aiListDiagnoses, async (event, rawIncidentId: string) => {
        validateIpcSender(event);
        const incidentId = validateId(rawIncidentId, "incidentId");
        return diagnosisRepo.listDiagnosesByIncident(incidentId);
      });

      ipc.handle(incidentIpcChannels.aiGetLatestDiagnosis, async (event, rawIncidentId: string) => {
        validateIpcSender(event);
        const incidentId = validateId(rawIncidentId, "incidentId");
        return diagnosisRepo.getLatestDiagnosis(incidentId);
      });
    }

    if (remediationVerifier) {
      ipc.handle(incidentIpcChannels.aiVerifyRemediation, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const validated = validateVerifyRemediationInput(rawPayload);
        return remediationVerifier.evaluateRemediation(validated);
      });
    }

    if (aiComponents?.ephemeralContextManager) {
      const contextManager = aiComponents.ephemeralContextManager;

      ipc.handle(incidentIpcChannels.contextList, async (event, rawIncidentId: string) => {
        validateIpcSender(event);
        const incidentId = validateId(rawIncidentId, "incidentId");
        const incident = incidentRepo.getIncidentById(incidentId);
        if (!incident) {
          throw new Error(`SecurityError: Incident '${incidentId}' not found.`);
        }
        return contextManager.listFiles(incidentId);
      });

      ipc.handle(incidentIpcChannels.contextAdd, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const validated = validateAddEphemeralFileInput(rawPayload);
        const incident = incidentRepo.getIncidentById(validated.incidentId);
        if (!incident) {
          throw new Error(`SecurityError: Incident '${validated.incidentId}' not found.`);
        }
        if (validated.metadata?.clusterId && validated.metadata.clusterId !== incident.clusterId) {
          throw new Error(
            `SecurityError: Cluster mismatch. Incident belongs to '${incident.clusterId}', but metadata declared '${validated.metadata.clusterId}'.`,
          );
        }
        if (validated.metadata?.namespace && validated.metadata.namespace !== incident.namespace) {
          throw new Error(
            `SecurityError: Namespace mismatch. Incident belongs to '${incident.namespace}', but metadata declared '${validated.metadata.namespace}'.`,
          );
        }
        return contextManager.addFile(validated.incidentId, validated);
      });

      ipc.handle(incidentIpcChannels.contextUpdateMetadata, async (event, rawPayload: unknown) => {
        validateIpcSender(event);
        const validated = validateUpdateEphemeralMetadataInput(rawPayload);
        const incident = incidentRepo.getIncidentById(validated.incidentId);
        if (!incident) {
          throw new Error(`SecurityError: Incident '${validated.incidentId}' not found.`);
        }
        if (validated.metadata?.clusterId && validated.metadata.clusterId !== incident.clusterId) {
          throw new Error(
            `SecurityError: Cluster mismatch. Incident belongs to '${incident.clusterId}', but metadata declared '${validated.metadata.clusterId}'.`,
          );
        }
        if (validated.metadata?.namespace && validated.metadata.namespace !== incident.namespace) {
          throw new Error(
            `SecurityError: Namespace mismatch. Incident belongs to '${incident.namespace}', but metadata declared '${validated.metadata.namespace}'.`,
          );
        }
        const files = contextManager.listFiles(validated.incidentId);
        if (!files.some(f => f.id === validated.fileId)) {
          throw new Error(`SecurityError: File '${validated.fileId}' does not belong to incident '${validated.incidentId}'.`);
        }
        return contextManager.updateMetadata(validated);
      });

      ipc.handle(incidentIpcChannels.contextRemove, async (event, rawIncidentId: string, rawFileId: string) => {
        validateIpcSender(event);
        const incidentId = validateId(rawIncidentId, "incidentId");
        const fileId = validateId(rawFileId, "fileId");
        const incident = incidentRepo.getIncidentById(incidentId);
        if (!incident) {
          throw new Error(`SecurityError: Incident '${incidentId}' not found.`);
        }
        const files = contextManager.listFiles(incidentId);
        if (!files.some(f => f.id === fileId)) {
          throw new Error(`SecurityError: File '${fileId}' does not belong to incident '${incidentId}'.`);
        }
        const removed = contextManager.removeFile(incidentId, fileId);
        return { success: removed };
      });

      ipc.handle(incidentIpcChannels.contextClear, async (event, rawIncidentId: string) => {
        validateIpcSender(event);
        const incidentId = validateId(rawIncidentId, "incidentId");
        const incident = incidentRepo.getIncidentById(incidentId);
        if (!incident) {
          throw new Error(`SecurityError: Incident '${incidentId}' not found.`);
        }
        contextManager.clearIncidentContext(incidentId);
        return { success: true };
      });

      // Ephemeral Lifecycle (H8-020): Hook into Electron app lifecycle for zero lingering RAM across exits
      try {
        const { app } = require("electron");
        if (app && typeof app.on === "function") {
          app.on("will-quit", () => contextManager.clearAll());
          app.on("before-quit", () => contextManager.clearAll());
        }
      } catch {
        // Outside Electron runtime
      }
    }

    if (aiComponents.scanner) {
      const scanner = aiComponents.scanner;

      ipc.handle(incidentIpcChannels.scannerGetStatus, async (event) => {
        validateIpcSender(event);
        return scanner.getStatus();
      });

      ipc.handle(incidentIpcChannels.scannerStart, async (event, input: unknown) => {
        validateIpcSender(event);
        const validated = validateScannerStartInput(input);

        // If client requests real cluster mode
        if (validated.sourceMode === "real") {
          const clusterResolver = aiComponents?.getClusterById;
          const cluster = clusterResolver ? clusterResolver(validated.scope.clusterId) : undefined;

          if (clusterResolver && (!cluster || !cluster.accessible?.get() || cluster.disconnected?.get())) {
            scanner.disableRealK8sSnapshotSource();
            throw new SnapshotSourceSecurityError(
              "REAL_K8S_CONNECTIVITY_DISABLED",
              `Cluster '${validated.scope.clusterId}' is not accessible or not found in authenticated context.`,
              403,
            );
          }

          let operatorUsername: string | undefined = cluster?.contextName?.get();
          if (cluster && aiComponents?.loadProxyKubeconfig) {
            try {
              const loadProxyKube = aiComponents.loadProxyKubeconfig(cluster);
              const proxyConfig = await loadProxyKube();
              const ctx = proxyConfig?.getContextObject?.(cluster.contextName?.get());
              if (ctx?.user) {
                operatorUsername = ctx.user;
              }
            } catch {
              // Retain contextName
            }
          }

          // Strictly forbid fabricated or missing operator identity
          if (!operatorUsername || operatorUsername === "local-authorized-operator") {
            scanner.disableRealK8sSnapshotSource();
            throw new SnapshotSourceSecurityError(
              "REAL_K8S_CONNECTIVITY_DISABLED",
              "Authentic operator identity cannot be resolved from Kubernetes cluster context. Fabricated identities are strictly prohibited.",
              403,
            );
          }

          // Verifiable consent check: do not trust explicitConsent: true alone!
          const consentManager = aiComponents?.consentManager;
          if (consentManager) {
            if (!validated.consentToken) {
              scanner.disableRealK8sSnapshotSource();
              throw new SnapshotSourceSecurityError(
                "REAL_K8S_CONNECTIVITY_DISABLED",
                "A verifiable, unexpired consentToken is strictly required to enable live cluster snapshot source.",
                403,
              );
            }

            const isConsentValid = consentManager.verifyAndConsumeConsent({
              token: validated.consentToken,
              operatorUsername,
              clusterId: validated.scope.clusterId,
              namespace: validated.scope.namespace,
            });

            if (!isConsentValid) {
              scanner.disableRealK8sSnapshotSource();
              throw new SnapshotSourceSecurityError(
                "REAL_K8S_CONNECTIVITY_DISABLED",
                "Consent verification failed: provided consent token is invalid, expired, already consumed, or does not match operator/scope.",
                403,
              );
            }
          } else if (!validated.explicitConsent) {
            scanner.disableRealK8sSnapshotSource();
            throw new SnapshotSourceSecurityError(
              "REAL_K8S_CONNECTIVITY_DISABLED",
              "Explicit consent is required to enable real Kubernetes snapshot source.",
              403,
            );
          }

          // Fail-closed RBAC: Never assign system:masters. Permissions are verified strictly via K8s Access Reviews.
          const authenticOperator: UserIdentity = {
            username: operatorUsername,
            isAuthenticated: true,
            groups: ["system:authenticated"],
          };

          scanner.enableRealK8sSnapshotSource({
            clusterId: validated.scope.clusterId,
            namespace: validated.scope.namespace,
            user: authenticOperator,
            hasExplicitConsent: true,
          });
        } else {
          // Default to fake mode (offline-first & fail-closed)
          scanner.disableRealK8sSnapshotSource();
        }

        return scanner.start(validated.scope, validated.options);
      });

      ipc.handle(incidentIpcChannels.scannerRequestConsent, async (event, input: unknown) => {
        validateIpcSender(event);
        const validated = validateScannerRequestConsentInput(input);
        const consentManager = aiComponents?.consentManager;
        if (!consentManager) {
          throw new Error("ConsentManager is not configured.");
        }

        const clusterResolver = aiComponents?.getClusterById;
        const cluster = clusterResolver ? clusterResolver(validated.clusterId) : undefined;

        let operatorUsername = cluster?.contextName?.get();
        if (cluster && aiComponents?.loadProxyKubeconfig) {
          try {
            const loadProxyKube = aiComponents.loadProxyKubeconfig(cluster);
            const proxyConfig = await loadProxyKube();
            const ctx = proxyConfig?.getContextObject?.(cluster.contextName?.get());
            if (ctx?.user) operatorUsername = ctx.user;
          } catch {
            // Keep contextName
          }
        }

        if (!operatorUsername || operatorUsername === "local-authorized-operator") {
          throw new SnapshotSourceSecurityError(
            "REAL_K8S_CONNECTIVITY_DISABLED",
            `Cannot resolve authentic operator for cluster '${validated.clusterId}'. Fabricated identities are strictly prohibited.`,
            403,
          );
        }

        const defaultConfirmationProvider: HumanConsentConfirmationProvider = async (params) => {
          try {
            const { dialog } = require("electron");
            if (dialog && typeof dialog.showMessageBox === "function") {
              const scopeText = params.namespace ? `Namespace: ${params.namespace}` : "Cluster-wide (All authorized namespaces)";
              const result = await dialog.showMessageBox({
                type: "warning",
                buttons: ["Deny / Cancel", "Authorize Read-Only Scan"],
                defaultId: 1,
                cancelId: 0,
                title: "NovaKube — Kubernetes Live Scanner Authorization",
                message: "Authorize Read-Only Cluster Scan",
                detail:
                  `Operator: ${params.operatorUsername}\n` +
                  `Cluster ID: ${params.clusterId}\n` +
                  `${scopeText}\n\n` +
                  "Security Notice: This authorization is strictly single-use and read-only. It will expire after 5 minutes. No modifications or write operations will be performed.",
              });
              return result.response === 1;
            }
          } catch {
            // Outside electron runtime
          }
          return false;
        };

        const confirmationProvider = aiComponents?.humanConsentConfirmationProvider || defaultConfirmationProvider;

        const record = await consentManager.requestHumanConsent(
          {
            operatorUsername,
            clusterId: validated.clusterId,
            namespace: validated.namespace,
          },
          confirmationProvider,
        );

        return {
          consentToken: record.token,
          operatorUsername: record.operatorUsername,
          clusterId: record.clusterId,
          namespace: record.namespace,
          expiresAt: record.expiresAt,
        };
      });

      ipc.handle(incidentIpcChannels.scannerStop, async (event) => {
        validateIpcSender(event);
        return scanner.stop();
      });

      ipc.handle(incidentIpcChannels.scannerScanFromSource, async (event, input: unknown) => {
        validateIpcSender(event);
        const validated = validateScanFromSourceInput(input);
        return scanner.scanFromSource({
          targetClusterId: validated.targetClusterId,
          targetNamespace: validated.targetNamespace,
          scenarioId: validated.scenarioId as any,
          requestedResources: validated.requestedResources,
          requestedVerb: validated.requestedVerb,
        });
      });

      ipc.handle(incidentIpcChannels.scannerProcessSnapshot, async (event, snapshot: unknown) => {
        validateIpcSender(event);
        const validated = validateK8sSnapshot(snapshot);
        return scanner.processSnapshot(validated);
      });

      ipc.handle(incidentIpcChannels.scannerAlertAction, async (event, payload: unknown) => {
        validateIpcSender(event);
        const validated = validateScannerAlertActionPayload(payload);
        return scanner.handleAlertAction(validated);
      });

      // Stop & clean up scanner when app quits
      try {
        const { app } = require("electron");
        if (app && typeof app.on === "function") {
          app.on("will-quit", () => scanner.dispose());
          app.on("before-quit", () => scanner.dispose());
        }
      } catch {
        // Outside Electron runtime
      }
    }
  }

  return () => {
    const channels = Object.values(incidentIpcChannels);

    for (const channel of channels) {
      if ((ipc as any).removeHandler) {
        (ipc as any).removeHandler(channel);
      }
    }
  };
}

const setupIncidentIpcInjectable = getInjectable({
  id: "setup-incident-ipc",

  instantiate: (di) => ({
    run: () => {
      const incidentRepo = di.inject(incidentRepositoryInjectable);
      const evidenceRepo = di.inject(evidenceRepositoryInjectable);
      const purger = di.inject(incidentPurgerInjectable);
      const confirmationManager = di.inject(incidentConfirmationManagerInjectable);

      const profileManager = di.inject(aiProfileManagerInjectable);
      const diagnosisEngine = di.inject(aiDiagnosisEngineInjectable);
      const remediationVerifier = di.inject(remediationVerifierInjectable);
      const diagnosisRepo = di.inject(aiDiagnosisRepositoryInjectable);
      const ephemeralContextManager = di.inject(ephemeralContextManagerInjectable);
      const scanner = di.inject(localIncidentScannerInjectable);
      const oauthManager = di.inject(openAiSiwcOAuthManagerInjectable);
      const getClusterById = di.inject(getClusterByIdInjectable);
      const consentManager = di.inject(incidentScannerConsentManagerInjectable);
      const loadProxyKubeconfig = (cluster: any) => di.inject(loadProxyKubeconfigInjectable, cluster);

      registerIncidentIpcHandlers(
        incidentRepo,
        evidenceRepo,
        purger,
        confirmationManager,
        {
          profileManager,
          diagnosisEngine,
          remediationVerifier,
          diagnosisRepo,
          ephemeralContextManager,
          scanner,
          oauthManager,
          getClusterById,
          loadProxyKubeconfig,
          consentManager,
        },
        ipcMain,
      );
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default setupIncidentIpcInjectable;
