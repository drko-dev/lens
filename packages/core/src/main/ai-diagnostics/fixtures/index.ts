/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { RawDiagnosisResult } from "../providers/ai-provider-adapter";

export const FIXTURE_CONCLUSIVE_RESULT: RawDiagnosisResult = {
  status: "CONCLUSIVE",
  facts: [
    {
      text: "Container payment-gateway in pod payment-gateway-7f89d terminated with OOMKilled",
      citation: {
        evidenceId: "evd-pod-logs-001",
        excerpt: "Container terminated with exit code 137 OOMKilled",
        resourceKind: "Pod",
        resourceName: "payment-gateway-7f89d",
      },
    },
    {
      text: "Memory limit was set to 256Mi which was exceeded during traffic peak",
      citation: {
        evidenceId: "evd-pod-describe-002",
        excerpt: "Limits: memory: 256Mi",
        resourceKind: "Pod",
        resourceName: "payment-gateway-7f89d",
      },
    },
  ],
  hypotheses: [
    {
      id: "hyp-oom-exhaustion",
      title: "Container terminated due to memory limit exhaustion (OOMKilled)",
      confidence: 0.95,
      rationale: "Exit code 137 combined with memory limit of 256Mi in describe output proves memory starvation.",
      citationIds: ["evd-pod-logs-001", "evd-pod-describe-002"],
    },
  ],
  contradictions: [],
  missingInformation: [],
  recommendedNextSteps: [
    "Increase memory limit in deployment manifest from 256Mi to 512Mi",
    "Profile application heap to verify baseline memory footprint",
  ],
  remediationProposal: {
    id: "rem-raise-memory-limit",
    title: "Increase deployment memory limit to 512Mi",
    problemSummary: "The payment-gateway container exceeded its 256Mi memory limit and was killed by Linux OOM killer.",
    suggestedYamlDiff: "--- a/deployment.yaml\n+++ b/deployment.yaml\n@@ -25,2 +25,2 @@\n-          memory: 256Mi\n+          memory: 512Mi",
    suggestedConfigDescription: "Update resource limits to prevent OOM termination during normal operation.",
    preconditions: [
      "Verify node allocatable memory capacity in cluster",
      "Ensure namespace quota allows 512Mi limit",
    ],
    risksAndImpact: "Rolling update of pods; zero downtime if replicas >= 2.",
    validationSteps: [
      "Check pod status after rollout: kubectl get pods -l app=payment-gateway",
      "Verify no restarts after 15 minutes of synthetic load",
    ],
    rollbackProcedure: "Revert deployment limit back to previous revision using kubectl rollout undo.",
  },
  tokenUsage: {
    promptTokens: 450,
    completionTokens: 380,
    totalTokens: 830,
  },
};

export const FIXTURE_INCONCLUSIVE_RESULT: RawDiagnosisResult = {
  status: "INCONCLUSO",
  inconclusiveReason: "Insufficient or conflicting evidence to determine root cause with certainty.",
  facts: [
    {
      text: "Preliminary event shows pod restart warning",
      citation: {
        evidenceId: "evd-pod-event-001",
        excerpt: "Warning Unhealthy Readiness probe failed",
        resourceKind: "Pod",
        resourceName: "payment-gateway-7f89d",
      },
    },
  ],
  hypotheses: [],
  contradictions: [
    "Readiness probe failed but application process was reported healthy by liveness probe",
  ],
  missingInformation: [
    "Container stdout logs during failure window",
    "JVM heap metrics and GC logs",
  ],
  recommendedNextSteps: [
    "Collect logs with kubectl logs --previous",
    "Inspect readiness probe HTTP response code and latency",
  ],
  tokenUsage: {
    promptTokens: 280,
    completionTokens: 140,
    totalTokens: 420,
  },
};

export const FIXTURE_HALLUCINATED_CITATION_RESULT: RawDiagnosisResult = {
  status: "CONCLUSIVE",
  facts: [
    {
      text: "Pod failed due to phantom kernel panic reported in unrecorded log",
      citation: {
        evidenceId: "EVD-NON-EXISTENT-HALLUCINATED-9999",
        excerpt: "kernel: Out of memory: Kill process 1234 (node) score 950",
        resourceKind: "Pod",
        resourceName: "phantom-worker-pod",
      },
    },
  ],
  hypotheses: [
    {
      id: "hyp-kernel-oom-phantom",
      title: "Kernel OOM Killer invoked against pod process",
      confidence: 0.88,
      rationale: "Evidence cites unrecorded kernel log buffer entry.",
      citationIds: ["EVD-NON-EXISTENT-HALLUCINATED-9999"],
    },
  ],
  contradictions: [],
  missingInformation: [],
  recommendedNextSteps: ["Verify node kernel dmesg logs"],
  tokenUsage: {
    promptTokens: 320,
    completionTokens: 210,
    totalTokens: 530,
  },
};

export const FIXTURE_LOW_CONFIDENCE_RESULT: RawDiagnosisResult = {
  status: "CONCLUSIVE",
  facts: [
    {
      text: "DNS query latency elevated in coredns pods",
      citation: {
        evidenceId: "evd-dns-event-001",
        excerpt: "DNS query timeout after 2000ms",
        resourceKind: "Service",
        resourceName: "kube-dns",
      },
    },
  ],
  hypotheses: [
    {
      id: "hyp-dns-flapping",
      title: "Possible upstream DNS packet drop or rate limiting",
      confidence: 0.35,
      rationale: "Sparse log hints show intermittent DNS resolution delays without full packet traces.",
      citationIds: ["evd-dns-event-001"],
    },
  ],
  contradictions: [],
  missingInformation: ["CoreDNS metrics /metrics endpoint data"],
  recommendedNextSteps: ["Check CoreDNS response duration histograms"],
  tokenUsage: {
    promptTokens: 310,
    completionTokens: 160,
    totalTokens: 470,
  },
};

export const FIXTURE_EXCESSIVE_TOKEN_RESULT = {
  status: "CONCLUSIVE",
  facts: [{ text: "Massive diagnostic trace analyzed" }],
  hypotheses: [
    {
      id: "hyp-large-trace",
      title: "Application crashed after processing massive trace payload",
      confidence: 0.85,
      rationale: "High token usage simulated.",
      citationIds: [],
    },
  ],
  contradictions: [],
  missingInformation: [],
  recommendedNextSteps: [],
  tokenUsage: {
    promptTokens: 14000,
    completionTokens: 2000,
    totalTokens: 16000,
  },
};

export const FIXTURE_MISSING_FIELDS_RESULT = {
  status: "CONCLUSIVE",
  tokenUsage: {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  },
};

export const FIXTURE_UNEXPECTED_TYPES_RESULT = {
  status: 200,
  facts: "not-an-array-string",
  hypotheses: [
    {
      id: 1234,
      title: true,
      confidence: "high",
      rationale: 999,
      citationIds: "single-id-not-array",
    },
  ],
  tokenUsage: "invalid-token-usage-type",
};

export const FIXTURE_CONFIDENCE_OUT_OF_BOUNDS_RESULT = {
  status: "CONCLUSIVE",
  facts: [],
  hypotheses: [
    {
      id: "hyp-super-confident",
      title: "Confidence value exceeds allowed 0..1 interval",
      confidence: 1.75,
      rationale: "Invalid probability score.",
      citationIds: [],
    },
  ],
  contradictions: [],
  missingInformation: [],
  recommendedNextSteps: [],
  tokenUsage: {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  },
};

// Raw JSON serialized strings for mock transport responses
export const FIXTURE_CONCLUSIVE_JSON = JSON.stringify(FIXTURE_CONCLUSIVE_RESULT);
export const FIXTURE_INCONCLUSIVE_JSON = JSON.stringify(FIXTURE_INCONCLUSIVE_RESULT);
export const FIXTURE_HALLUCINATED_CITATION_JSON = JSON.stringify(FIXTURE_HALLUCINATED_CITATION_RESULT);
export const FIXTURE_LOW_CONFIDENCE_JSON = JSON.stringify(FIXTURE_LOW_CONFIDENCE_RESULT);
export const FIXTURE_EXCESSIVE_TOKEN_JSON = JSON.stringify(FIXTURE_EXCESSIVE_TOKEN_RESULT);
export const FIXTURE_MISSING_FIELDS_JSON = JSON.stringify(FIXTURE_MISSING_FIELDS_RESULT);
export const FIXTURE_UNEXPECTED_TYPES_JSON = JSON.stringify(FIXTURE_UNEXPECTED_TYPES_RESULT);
export const FIXTURE_CONFIDENCE_OUT_OF_BOUNDS_JSON = JSON.stringify(FIXTURE_CONFIDENCE_OUT_OF_BOUNDS_RESULT);
export const FIXTURE_MALFORMED_JSON = '{ "status": "CONCLUSIVE", "facts": [ { "text": "Unclosed json...';
