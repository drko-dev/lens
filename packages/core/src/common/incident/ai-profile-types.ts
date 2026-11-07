/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type AiProviderType = "openai" | "anthropic" | "gemini" | "deepseek" | "mock";
export type AiProfileStatus = "active" | "disabled" | "revoked";

export type AiAuthMode = "oauth_siwc" | "api_key" | "synthetic";

export type AiProfileAvailabilityStatus =
  | "available"
  | "sin_permiso"
  | "no_models_available"
  | "expired"
  | "disconnected"
  | "disabled";

export type DeepSeekModelId = "deepseek-flash" | "deepseek-v4-pro";

export const DEEPSEEK_EXCLUSIVE_ENDPOINT = "https://api.deepseek.com/responses";
export const OPENAI_SIWC_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const OPENAI_SIWC_MODELS_ENDPOINT = "https://api.openai.com/v1/models";
export const OPENAI_SIWC_ISSUER = "https://auth.openai.com";
export const OPENAI_SIWC_RESOURCE_URI = "https://api.openai.com/v1";
export const OPENAI_SIWC_DISCOVERY_ENDPOINT = "https://auth.openai.com/.well-known/openid-configuration";

export const REQUIRED_OPENAI_SIWC_SCOPES = [
  "resource.invoke",
  "chatgpt.tokens.use.direct",
] as const;

export interface OpenAiModelDescriptor {
  /** Model identifier used for inference (equals official `slug`). */
  id: string;
  /** Official Sign in with ChatGPT model slug used for `/v1/responses` inference. */
  slug: string;
  /** Human-readable model name (`display_name`) from the official SIWC catalog. */
  displayName: string;
  /** Catalog visibility; strictly filtered to `"list"`. */
  visibility: "list";
  supportedEndpoints?: string[];
}

export interface DeepSeekPricingBand {
  inputCacheHitPer1M: number;
  inputCacheMissPer1M: number;
  outputPer1M: number;
  reasoningOutputPer1M?: number;
}

/**
 * Referential tariff configuration for DeepSeek cost estimation.
 * Calculated figures are local estimates for operational visibility and budget guardrails,
 * and never constitute definitive provider billing.
 */
export interface DeepSeekPricingConfig {
  currency: "USD";
  /** Peak (standard) UTC band rates: Mon–Fri 01:00–04:00 and 06:00–10:00 UTC (excluding verified Chinese public holidays). */
  standard: DeepSeekPricingBand;
  /** Off-peak (valle) UTC band rates: all other hours, weekends, and verified Chinese public holidays. */
  offPeakDiscount?: DeepSeekPricingBand;
  enableOffPeakBand?: boolean;
  /** When true, forces conservative Peak (`standard`) estimation because tariff/holiday data is unverified. */
  unverifiedTariff?: boolean;
}

export interface DeepSeekTokenUsageDetails {
  promptTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  pricingBandUsed: "standard" | "off_peak";
}

export interface AiProviderProfile {
  id: string;
  name: string;
  provider: AiProviderType;
  model: string;
  endpoint: string;
  credentialRef: string; // Opaque reference, never raw API key
  status: AiProfileStatus;
  maxTokensPerRequest: number;
  maxRequestsPerIncident: number;
  estimatedCostPer1kTokens?: number;
  authMode?: AiAuthMode;
  oauthSubject?: string;
  oauthClientId?: string;
  oauthScopes?: string[];
  oauthExpiresAt?: number;
  availabilityStatus?: AiProfileAvailabilityStatus;
  unavailableReason?: string;
  /** Set on OAuth disconnect to indicate whether remote token revocation was confirmed by the provider. */
  remoteRevocationConfirmed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AiProfile = AiProviderProfile;

export interface CreateAiProfileInput {
  name: string;
  provider: AiProviderType;
  model: string;
  endpoint?: string;
  apiKey: string;
  maxTokensPerRequest?: number;
  maxRequestsPerIncident?: number;
  estimatedCostPer1kTokens?: number;
  authMode?: AiAuthMode;
  oauthSubject?: string;
  oauthClientId?: string;
  oauthScopes?: string[];
  oauthExpiresAt?: number;
  availabilityStatus?: AiProfileAvailabilityStatus;
  unavailableReason?: string;
}

export interface UpdateAiProfileInput {
  name?: string;
  model?: string;
  endpoint?: string;
  status?: AiProfileStatus;
  maxTokensPerRequest?: number;
  maxRequestsPerIncident?: number;
  estimatedCostPer1kTokens?: number;
  authMode?: AiAuthMode;
  oauthSubject?: string | null;
  oauthClientId?: string | null;
  oauthScopes?: string[] | null;
  oauthExpiresAt?: number | null;
  availabilityStatus?: AiProfileAvailabilityStatus;
  unavailableReason?: string | null;
}

export const DEFAULT_PROVIDER_ENDPOINTS: Record<AiProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com/responses",
  mock: "https://synthetic-ai.local/v1",
};

export const FORBIDDEN_SSRF_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS/GCP/Azure instance metadata service
  "metadata.google.internal",
]);

export class SsrfSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfSecurityError";
  }
}

/**
 * Validates endpoint against SSRF (Server-Side Request Forgery) attacks.
 * Rejects non-HTTPS schemes, private RFC 1918 IPs, link-local IPs, and metadata services.
 */
export function validateAiEndpoint(endpointUrl: string, provider?: AiProviderType): string {
  if (!endpointUrl || typeof endpointUrl !== "string") {
    throw new SsrfSecurityError("Endpoint URL must be a non-empty string.");
  }

  let url: URL;

  try {
    url = new URL(endpointUrl);
  } catch {
    throw new SsrfSecurityError(`Malformed endpoint URL: '${endpointUrl}'.`);
  }

  // Strictly enforce HTTPS (only synthetic-ai.local in test mocks is exempted if needed)
  if (url.protocol !== "https:") {
    throw new SsrfSecurityError(`Insecure scheme '${url.protocol}'. Only 'https:' endpoints are authorized.`);
  }

  const rawHostname = url.hostname.toLowerCase();
  const hostname = rawHostname.replace(/^\[|\]$/g, "");

  if (FORBIDDEN_SSRF_HOSTNAMES.has(hostname) || FORBIDDEN_SSRF_HOSTNAMES.has(rawHostname)) {
    throw new SsrfSecurityError(`Prohibited loopback/metadata endpoint '${rawHostname}'. Access blocked by SSRF defense.`);
  }

  // Reject RFC 1918 and link-local IP patterns
  const isPrivateIp =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") && hostname !== "synthetic-ai.local";

  if (isPrivateIp) {
    throw new SsrfSecurityError(`Targeting internal network address '${hostname}' is strictly prohibited.`);
  }

  const normalized = url.origin + url.pathname.replace(/\/$/, "");

  if (provider === "deepseek" && normalized !== DEEPSEEK_EXCLUSIVE_ENDPOINT) {
    throw new SsrfSecurityError(
      `DeepSeek provider strictly requires exclusive endpoint '${DEEPSEEK_EXCLUSIVE_ENDPOINT}'. Received '${normalized}'.`,
    );
  }

  return normalized;
}
