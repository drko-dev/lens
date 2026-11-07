/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { validateRawDiagnosisResult } from "../diagnosis-payload-validator";
import { TransportPayloadValidationError } from "../../transport/ai-transport-errors";
import {
  FIXTURE_CONCLUSIVE_RESULT,
  FIXTURE_INCONCLUSIVE_RESULT,
  FIXTURE_HALLUCINATED_CITATION_RESULT,
  FIXTURE_LOW_CONFIDENCE_RESULT,
  FIXTURE_MISSING_FIELDS_RESULT,
  FIXTURE_UNEXPECTED_TYPES_RESULT,
  FIXTURE_CONFIDENCE_OUT_OF_BOUNDS_RESULT,
} from "../../fixtures";

describe("diagnosis-payload-validator", () => {
  it("validates and normalizes valid conclusive diagnosis result", () => {
    const result = validateRawDiagnosisResult(FIXTURE_CONCLUSIVE_RESULT);
    expect(result.status).toBe("CONCLUSIVE");
    expect(result.facts.length).toBe(2);
    expect(result.facts[0].citation?.evidenceId).toBe("evd-pod-logs-001");
    expect(result.hypotheses[0].confidence).toBe(0.95);
    expect(result.remediationProposal?.title).toBe("Increase deployment memory limit to 512Mi");
    expect(result.tokenUsage.totalTokens).toBe(830);
  });

  it("validates valid inconclusive diagnosis result", () => {
    const result = validateRawDiagnosisResult(FIXTURE_INCONCLUSIVE_RESULT);
    expect(result.status).toBe("INCONCLUSO");
    expect(result.inconclusiveReason).toContain("Insufficient or conflicting evidence");
    expect(result.hypotheses.length).toBe(0);
    expect(result.missingInformation.length).toBe(2);
  });

  it("validates result with hallucinated citation structure (semantic grounding checked upstream)", () => {
    const result = validateRawDiagnosisResult(FIXTURE_HALLUCINATED_CITATION_RESULT);
    expect(result.status).toBe("CONCLUSIVE");
    expect(result.facts[0].citation?.evidenceId).toBe("EVD-NON-EXISTENT-HALLUCINATED-9999");
  });

  it("validates low confidence hypotheses within 0.0..1.0 bounds", () => {
    const result = validateRawDiagnosisResult(FIXTURE_LOW_CONFIDENCE_RESULT);
    expect(result.hypotheses[0].confidence).toBe(0.35);
  });

  it("rejects non-object payloads (arrays, primitives, null)", () => {
    expect(() => validateRawDiagnosisResult(null)).toThrow(TransportPayloadValidationError);
    expect(() => validateRawDiagnosisResult("string")).toThrow(TransportPayloadValidationError);
    expect(() => validateRawDiagnosisResult(12345)).toThrow(TransportPayloadValidationError);
    expect(() => validateRawDiagnosisResult([])).toThrow(TransportPayloadValidationError);
  });

  it("rejects invalid status values", () => {
    expect(() =>
      validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        status: "UNKNOWN_STATUS",
      }),
    ).toThrow(TransportPayloadValidationError);
  });

  it("rejects missing mandatory fields (missing facts, hypotheses)", () => {
    expect(() => validateRawDiagnosisResult(FIXTURE_MISSING_FIELDS_RESULT)).toThrow(
      TransportPayloadValidationError,
    );
  });

  it("rejects unexpected types for fields", () => {
    expect(() => validateRawDiagnosisResult(FIXTURE_UNEXPECTED_TYPES_RESULT)).toThrow(
      TransportPayloadValidationError,
    );
  });

  it("rejects confidence values outside 0.0 to 1.0 interval", () => {
    expect(() => validateRawDiagnosisResult(FIXTURE_CONFIDENCE_OUT_OF_BOUNDS_RESULT)).toThrow(
      TransportPayloadValidationError,
    );
    expect(() =>
      validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        hypotheses: [
          {
            ...FIXTURE_CONCLUSIVE_RESULT.hypotheses[0],
            confidence: -0.1,
          },
        ],
      }),
    ).toThrow(TransportPayloadValidationError);
  });

  it("rejects negative token usage", () => {
    expect(() =>
      validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        tokenUsage: {
          promptTokens: -10,
          completionTokens: 50,
          totalTokens: 40,
        },
      }),
    ).toThrow(TransportPayloadValidationError);
  });

  it("rejects facts with empty or whitespace-only text", () => {
    expect(() =>
      validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        facts: [{ text: "   " }],
      }),
    ).toThrow(TransportPayloadValidationError);
  });

  it("rejects citations with empty or whitespace-only evidenceId", () => {
    expect(() =>
      validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        facts: [
          {
            text: "Valid fact text",
            citation: {
              evidenceId: "   ",
              excerpt: "some excerpt",
            },
          },
        ],
      }),
    ).toThrow(TransportPayloadValidationError);
  });

  describe("H8.8-01b-R1: Strict Token Usage & Data Leak Prevention", () => {
    it("rejects inconsistent token totals (prompt 10000 + completion 2000 != total 0)", () => {
      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: 10000,
            completionTokens: 2000,
            totalTokens: 0,
          },
        }),
      ).toThrow(/totalTokens' must exactly equal the sum/);
    });

    it("rejects underreported token totals (prompt 1000 + completion 500 != total 100)", () => {
      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 100,
          },
        }),
      ).toThrow(TransportPayloadValidationError);
    });

    it("accepts valid and mathematically exact token usage", () => {
      const result = validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });
      expect(result.tokenUsage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it("accepts exact zero token usage (0 + 0 = 0)", () => {
      const result = validateRawDiagnosisResult({
        ...FIXTURE_CONCLUSIVE_RESULT,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });
      expect(result.tokenUsage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    it("rejects non-integer / decimal token usage without silent normalization", () => {
      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: 10.5,
            completionTokens: 20,
            totalTokens: 30.5,
          },
        }),
      ).toThrow(/non-negative safe integers/);
    });

    it("rejects NaN, Infinity, negative numbers and string token usage", () => {
      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: NaN,
            completionTokens: 10,
            totalTokens: 10,
          },
        }),
      ).toThrow(TransportPayloadValidationError);

      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: 10,
            completionTokens: Infinity,
            totalTokens: Infinity,
          },
        }),
      ).toThrow(TransportPayloadValidationError);

      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: "100" as unknown as number,
            completionTokens: 50,
            totalTokens: 150,
          },
        }),
      ).toThrow(TransportPayloadValidationError);
    });

    it("rejects token usage exceeding safe integers", () => {
      expect(() =>
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          tokenUsage: {
            promptTokens: Number.MAX_SAFE_INTEGER,
            completionTokens: 1,
            totalTokens: Number.MAX_SAFE_INTEGER + 1,
          },
        }),
      ).toThrow(TransportPayloadValidationError);
    });

    it("prevents untrusted status strings from leaking into error messages (R1-03)", () => {
      const canary = "SENSITIVE_CANARY_STATUS_DO_NOT_LOG_83921";
      try {
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          status: canary as any,
        });
        fail("Should have thrown TransportPayloadValidationError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TransportPayloadValidationError);
        const msg = (err as Error).message;
        expect(msg).not.toContain(canary);
        expect(msg).toContain("Invalid diagnostic status. Must be 'CONCLUSIVE' or 'INCONCLUSO'");
      }
    });

    it("prevents untrusted confidence values from leaking into error messages (R1-03)", () => {
      const canaryConfidence = 99999.88888;
      try {
        validateRawDiagnosisResult({
          ...FIXTURE_CONCLUSIVE_RESULT,
          hypotheses: [
            {
              ...FIXTURE_CONCLUSIVE_RESULT.hypotheses[0],
              confidence: canaryConfidence,
            },
          ],
        });
        fail("Should have thrown TransportPayloadValidationError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(TransportPayloadValidationError);
        const msg = (err as Error).message;
        expect(msg).not.toContain(String(canaryConfidence));
        expect(msg).toContain("Hypothesis at index 0 has invalid confidence. Must be a number between 0.0 and 1.0");
      }
    });
  });
});
