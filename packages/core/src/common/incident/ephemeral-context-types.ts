/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type EphemeralFileType =
  | "dockerfile"
  | "helm_values"
  | "k8s_manifest"
  | "config_map"
  | "config_file"
  | "text_doc";

export type DeclaredEnvironment =
  | "development"
  | "staging"
  | "production"
  | "test"
  | "unspecified";

export interface EphemeralDeclaredMetadata {
  environment: DeclaredEnvironment;
  clusterId?: string;
  namespace?: string;
  resourceKind?: string;
  resourceName?: string;
  version?: string;
  provenance: string; // e.g. "repo-local", "operator-manual", "ci-build"
  notes?: string;
}

export interface EphemeralFileDescriptor {
  id: string;
  incidentId: string;
  filename: string;
  fileType: EphemeralFileType;
  byteLength: number;
  sha256Hash: string;
  redactedFindingsCount: number;
  metadata: EphemeralDeclaredMetadata;
  addedAt: string;
  expiresAt: number; // Timestamp ms
  isPurged: boolean;
}

export interface AddEphemeralFileInput {
  incidentId: string;
  filename: string;
  fileType?: EphemeralFileType;
  rawContent: string;
  metadata?: Partial<EphemeralDeclaredMetadata>;
}

export interface UpdateEphemeralMetadataInput {
  incidentId: string;
  fileId: string;
  metadata: Partial<EphemeralDeclaredMetadata>;
}

export interface EphemeralSanitizedContext {
  id: string;
  filename: string;
  fileType: EphemeralFileType;
  sha256Hash: string;
  sanitizedContent: string;
  metadata: EphemeralDeclaredMetadata;
}

export interface EphemeralContextPreviewItem {
  id: string;
  filename: string;
  fileType: EphemeralFileType;
  byteLength: number;
  sha256Hash: string;
  redactedFindingsCount: number;
  declaredEnvironment: DeclaredEnvironment;
  declaredResourceName?: string;
}

export const ALLOWED_FILE_EXTENSIONS = Object.freeze([
  ".yaml",
  ".yml",
  ".json",
  ".dockerfile",
  ".conf",
  ".properties",
  ".toml",
  ".ini",
  ".txt",
]);

export const FORBIDDEN_FILE_EXTENSIONS = Object.freeze([
  ".key",
  ".pem",
  ".crt",
  ".cer",
  ".p12",
  ".pfx",
  ".env",
  ".sh",
  ".bash",
  ".zsh",
  ".exe",
  ".bin",
  ".so",
  ".dylib",
  ".dll",
  ".class",
  ".py",
  ".rb",
  ".tar",
  ".gz",
  ".zip",
]);

export const EPHEMERAL_CONTEXT_LIMITS = Object.freeze({
  maxFilesPerIncident: 5,
  maxBytesPerFile: 64 * 1024, // 64 KiB
  maxTotalBytesPerIncident: 192 * 1024, // 192 KiB
  ttlMs: 15 * 60 * 1000, // 15 minutes TTL in RAM
});
