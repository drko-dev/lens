/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type AiProviderType = "openai" | "anthropic" | "gemini" | "mock";
export type AiProfileStatus = "active" | "disabled" | "revoked";

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
}

export interface UpdateAiProfileInput {
  name?: string;
  model?: string;
  endpoint?: string;
  status?: AiProfileStatus;
  maxTokensPerRequest?: number;
  maxRequestsPerIncident?: number;
  estimatedCostPer1kTokens?: number;
}

export const DEFAULT_PROVIDER_ENDPOINTS: Record<AiProviderType, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
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
export function validateAiEndpoint(endpointUrl: string): string {
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

  return url.origin + url.pathname.replace(/\/$/, "");
}
