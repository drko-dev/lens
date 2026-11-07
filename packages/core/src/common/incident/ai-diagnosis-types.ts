/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AiProviderType } from "./ai-profile-types";

export interface AiEvidenceCitation {
  evidenceId: string;
  excerpt?: string;
  resourceKind?: string;
  resourceName?: string;
  verified: boolean;
}

export interface AiDiagnosisFact {
  text: string;
  citation?: AiEvidenceCitation;
}

export interface AiDiagnosisHypothesis {
  id: string;
  title: string;
  confidence: number; // 0.0 to 1.0
  rationale: string;
  citationIds: string[];
}

export interface AiRemediationProposal {
  id: string;
  title: string;
  problemSummary: string;
  suggestedYamlDiff?: string;
  suggestedConfigDescription?: string;
  preconditions: string[];
  risksAndImpact: string;
  validationSteps: string[];
  rollbackProcedure: string;
  requiresHumanApproval: true; // Strict invariant: AI never executes
  isApplied: false; // Invariant: AI never applies
}

export interface AiDiagnosisReport {
  id: string;
  incidentId: string;
  profileId: string;
  provider: AiProviderType;
  model: string;
  status: "CONCLUSIVE" | "INCONCLUSO";
  inconclusiveReason?: string;
  facts: AiDiagnosisFact[];
  hypotheses: AiDiagnosisHypothesis[];
  contradictions: string[];
  missingInformation: string[];
  recommendedNextSteps: string[];
  remediationProposal?: AiRemediationProposal;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number;
  executedAt: string;
}

import type { EphemeralContextPreviewItem } from "./ephemeral-context-types";

export interface DiagnosisConsentPreview {
  incidentId: string;
  title: string;
  targetProvider: AiProviderType;
  model: string;
  evidencesCount: number;
  totalBytes: number;
  evidenceItems: Array<{
    id: string;
    type: string;
    resourceKind?: string;
    resourceName?: string;
    byteLength: number;
    isSanitized: boolean;
    redactionsCount: number;
  }>;
  manualContextCount?: number;
  manualContextBytes?: number;
  manualContextItems?: EphemeralContextPreviewItem[];
  consentToken: string; // Ephemeral token required to authorize inference
  expiresAt: number;
}
