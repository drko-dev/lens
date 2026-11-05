/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Incident, EvidenceSnippet } from "../../../common/incident/incident-types";
import type { AiProviderType, AiProfile } from "../../../common/incident/ai-profile-types";
import type { EphemeralSanitizedContext } from "../../../common/incident/ephemeral-context-types";

export interface DiagnosisPromptContext {
  incident: Incident;
  evidences: EvidenceSnippet[];
  manualContexts?: EphemeralSanitizedContext[];
}

export interface DiagnosisExecutionOptions {
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface RawDiagnosisFact {
  text: string;
  citation?: {
    evidenceId: string;
    excerpt: string;
    resourceKind?: string;
    resourceName?: string;
  };
}

export interface RawDiagnosisHypothesis {
  id: string;
  title: string;
  confidence: number;
  rationale: string;
  citationIds: string[];
}

export interface RawRemediationProposal {
  id: string;
  title: string;
  problemSummary: string;
  suggestedYamlDiff?: string;
  suggestedConfigDescription?: string;
  preconditions: string[];
  risksAndImpact: string;
  validationSteps: string[];
  rollbackProcedure: string;
}

export interface RawDiagnosisResult {
  status: "CONCLUSIVE" | "INCONCLUSO";
  inconclusiveReason?: string;
  facts: RawDiagnosisFact[];
  hypotheses: RawDiagnosisHypothesis[];
  contradictions: string[];
  missingInformation: string[];
  recommendedNextSteps: string[];
  remediationProposal?: RawRemediationProposal;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiProviderAdapter {
  readonly provider: AiProviderType;
  generateDiagnosis(
    context: DiagnosisPromptContext,
    options: DiagnosisExecutionOptions,
  ): Promise<RawDiagnosisResult>;
}

export type MockBehavior =
  | "conclusive"
  | "inconclusive"
  | "hallucinated_citation"
  | "timeout"
  | "excessive_tokens"
  | "custom";

export class MockAiProviderAdapter implements AiProviderAdapter {
  public readonly provider: AiProviderType = "mock";
  private behavior: MockBehavior = "conclusive";
  private customResult?: RawDiagnosisResult;
  private delayMs = 10;

  constructor(behavior: MockBehavior = "conclusive", customResult?: RawDiagnosisResult) {
    this.behavior = behavior;
    this.customResult = customResult;
  }

  public setBehavior(behavior: MockBehavior, customResult?: RawDiagnosisResult, delayMs: number = 10): void {
    this.behavior = behavior;
    this.customResult = customResult;
    this.delayMs = delayMs;
  }

  public async generateDiagnosis(
    context: DiagnosisPromptContext,
    options: DiagnosisExecutionOptions,
  ): Promise<RawDiagnosisResult> {
    const { signal, timeoutMs } = options;

    if (signal?.aborted) {
      throw new Error("Diagnosis aborted by client");
    }

    if (this.behavior === "timeout") {
      return new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("AI Provider request timed out"));
        }, timeoutMs + 100);

        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Diagnosis aborted by client"));
        });
      });
    }

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (signal?.aborted) {
      throw new Error("Diagnosis aborted by client");
    }

    if (this.behavior === "custom" && this.customResult) {
      return this.customResult;
    }

    if (this.behavior === "excessive_tokens") {
      return {
        status: "CONCLUSIVE",
        facts: [{ text: "Exceeded token budget limit simulation" }],
        hypotheses: [],
        contradictions: [],
        missingInformation: [],
        recommendedNextSteps: [],
        tokenUsage: {
          promptTokens: options.maxTokens,
          completionTokens: 500,
          totalTokens: options.maxTokens + 500,
        },
      };
    }

    const hasManualContext = (context.manualContexts?.length ?? 0) > 0;

    if (this.behavior === "inconclusive" || (context.evidences.length === 0 && !hasManualContext)) {
      return {
        status: "INCONCLUSO",
        inconclusiveReason: "Evidencias insuficientes o conflictivas para determinar la causa raíz con certeza.",
        facts: context.evidences.map(e => ({
          text: `Evidencia preliminar registrada: ${e.type} (${e.origin})`,
          citation: {
            evidenceId: e.id,
            excerpt: e.contentSnippet.slice(0, 100),
            resourceKind: e.resourceKind,
            resourceName: e.resourceName,
          },
        })),
        hypotheses: [],
        contradictions: ["Eventos del clúster desactualizados o incompletos"],
        missingInformation: ["Logs detallados del contenedor en fallo", "Métricas de CPU/Memoria"],
        recommendedNextSteps: ["Recolectar logs con --previous", "Verificar describe del pod"],
        tokenUsage: {
          promptTokens: 250,
          completionTokens: 120,
          totalTokens: 370,
        },
      };
    }

    if (this.behavior === "hallucinated_citation") {
      return {
        status: "CONCLUSIVE",
        facts: [
          {
            text: "El pod terminó con OOMKilled según registro fantasma",
            citation: {
              evidenceId: "EVD-NON-EXISTENT-HALLUCINATED-9999",
              excerpt: "Container terminated with exit code 137 OOMKilled",
              resourceKind: "Pod",
              resourceName: "phantom-pod",
            },
          },
        ],
        hypotheses: [
          {
            id: "hyp-1",
            title: "Memory limit exhaustion (hallucinated)",
            confidence: 0.85,
            rationale: "Fallo detectado por evidencia no almacenada",
            citationIds: ["EVD-NON-EXISTENT-HALLUCINATED-9999"],
          },
        ],
        contradictions: [],
        missingInformation: [],
        recommendedNextSteps: ["Aumentar límites de memoria"],
        tokenUsage: {
          promptTokens: 300,
          completionTokens: 200,
          totalTokens: 500,
        },
      };
    }

    // Default: conclusive diagnosis grounded on available evidence or manual context
    const firstEvidence = context.evidences[0];
    const secondEvidence = context.evidences[1] ?? firstEvidence;
    const manualCtx = context.manualContexts && context.manualContexts.length > 0 ? context.manualContexts[0] : undefined;

    const facts: RawDiagnosisFact[] = [];

    if (firstEvidence) {
      facts.push({
        text: `Pod reporta fallo o advertencia en clúster ${context.incident.clusterId}`,
        citation: {
          evidenceId: firstEvidence.id,
          excerpt: firstEvidence.contentSnippet.slice(0, 120),
          resourceKind: firstEvidence.resourceKind,
          resourceName: firstEvidence.resourceName,
        },
      });
    }

    if (manualCtx) {
      facts.push({
        text: `Contexto manual complementario analizado: ${manualCtx.filename} (${manualCtx.fileType})`,
        citation: {
          evidenceId: manualCtx.id,
          excerpt: manualCtx.sanitizedContent.slice(0, 80),
          resourceKind: manualCtx.fileType,
          resourceName: manualCtx.filename,
        },
      });
    } else if (secondEvidence) {
      facts.push({
        text: `Namespace afectado: ${context.incident.namespace}`,
        citation: {
          evidenceId: secondEvidence.id,
          excerpt: secondEvidence.contentSnippet.slice(0, 100),
          resourceKind: secondEvidence.resourceKind,
          resourceName: secondEvidence.resourceName,
        },
      });
    }

    return {
      status: "CONCLUSIVE",
      facts,
      hypotheses: [
        {
          id: "hyp-crashloop-backoff",
          title: "CrashLoopBackOff debido a configuración errónea o falta de recursos",
          confidence: 0.92,
          rationale: "El contenedor falla de manera repetitiva según los eventos y logs observados.",
          citationIds: firstEvidence ? [firstEvidence.id] : (manualCtx ? [manualCtx.id] : []),
        },
      ],
      contradictions: [],
      missingInformation: [],
      recommendedNextSteps: [
        "Revisar variables de entorno del contenedor",
        "Validar límites de memoria y probes de salud",
      ],
      remediationProposal: {
        id: "rem-tune-resources-probe",
        title: "Ajuste de livenessProbe y límites de memoria",
        problemSummary: `El contenedor en pod ${context.incident.workloadName ?? "target"} se reinicia por probes muy agresivos.`,
        suggestedYamlDiff: `--- a/deployment.yaml\n+++ b/deployment.yaml\n@@ -18,2 +18,4 @@\n-  initialDelaySeconds: 3\n+  initialDelaySeconds: 15\n+  periodSeconds: 10`,
        suggestedConfigDescription: "Incrementar initialDelaySeconds a 15s para permitir arranque inicial del proceso.",
        preconditions: [
          "Verificar que la imagen base no tenga errores fatales de inicio",
          "Asegurar cuota de recursos suficiente en el namespace",
        ],
        risksAndImpact: "Bajo riesgo: reinicio controlado del pod sin afectar persistencia.",
        validationSteps: [
          "Monitorear kubectl get pods durante 60 segundos posteriores",
          "Verificar que el contador de restarts permanezca en 0",
        ],
        rollbackProcedure: "Revertir el deployment a la revisión previa con kubectl rollout undo.",
      },
      tokenUsage: {
        promptTokens: 450,
        completionTokens: 380,
        totalTokens: 830,
      },
    };
  }
}

export class ExternalAiProviderStub implements AiProviderAdapter {
  constructor(public readonly provider: AiProviderType, private readonly model: string) {}

  public async generateDiagnosis(
    _context: DiagnosisPromptContext,
    _options: DiagnosisExecutionOptions,
  ): Promise<RawDiagnosisResult> {
    throw new Error(
      `External provider calls for '${this.provider}' (${this.model}) are disabled in this test/offline harness. Configure MockAiProviderAdapter or enable sandbox credentials.`,
    );
  }
}

export function createAiProviderAdapter(
  profile: AiProfile,
  mockOverride?: MockAiProviderAdapter,
): AiProviderAdapter {
  if (profile.provider === "mock" || mockOverride) {
    return mockOverride ?? new MockAiProviderAdapter();
  }

  return new ExternalAiProviderStub(profile.provider, profile.model);
}
