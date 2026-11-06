/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { MigrationDefinition } from "../sqlite-client";

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    workload_kind TEXT,
    workload_name TEXT,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    status TEXT NOT NULL CHECK (status IN (
        'DETECTADO',
        'INVESTIGANDO',
        'HIPÓTESIS',
        'CONFIRMADO',
        'SOLUCIÓN PROPUESTA',
        'APROBACIÓN HUMANA',
        'VALIDACIÓN',
        'CERRADO',
        'NO CONFIRMADO',
        'INCONCLUSO'
    )),
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS incident_timeline (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('human', 'system', 'ai')),
    author_name TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    message TEXT NOT NULL,
    metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS incident_evidence (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'pod_logs',
        'k8s_event',
        'resource_manifest',
        'cost_estimate',
        'user_context_metadata'
    )),
    origin TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    resource_uid TEXT,
    captured_at TEXT NOT NULL,
    content_snippet TEXT NOT NULL,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_cluster_ns ON incidents(cluster_id, namespace);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON incident_timeline(incident_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON incident_evidence(incident_id);
`;

export const MIGRATION_002_SQL = `
ALTER TABLE incident_evidence ADD COLUMN sha256_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN resource_kind TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_name TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_version TEXT;
ALTER TABLE incident_evidence ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN snippet_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_evidence_fingerprint ON incident_evidence(incident_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_evidence_resource ON incident_evidence(cluster_id, namespace, resource_kind, resource_name);
`;

export const MIGRATION_003_SQL = `
CREATE TABLE IF NOT EXISTS incident_retention_policy (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled INTEGER NOT NULL DEFAULT 0,
    strategy TEXT NOT NULL DEFAULT 'manual' CHECK (strategy IN ('manual', 'days')),
    retention_days INTEGER NOT NULL DEFAULT 90,
    protect_pinned INTEGER NOT NULL DEFAULT 1,
    purge_closed_only INTEGER NOT NULL DEFAULT 1,
    evidence_retention_days INTEGER,
    last_evaluated_at TEXT,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO incident_retention_policy (
    id, enabled, strategy, retention_days, protect_pinned, purge_closed_only, updated_at
) VALUES ('default', 0, 'manual', 90, 1, 1, datetime('now'));

CREATE TABLE IF NOT EXISTS incident_purge_audit (
    id TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL,
    policy_snapshot_json TEXT NOT NULL,
    deleted_incidents INTEGER NOT NULL,
    deleted_timelines INTEGER NOT NULL,
    deleted_evidences INTEGER NOT NULL,
    reclaimed_bytes INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR')),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_purge_audit_executed ON incident_purge_audit(executed_at);
`;

export const MIGRATION_004_SQL = `
CREATE TABLE IF NOT EXISTS broker_audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    verb TEXT NOT NULL,
    decision_code TEXT NOT NULL,
    decision_allowed INTEGER NOT NULL,
    reason TEXT,
    execution_duration_ms INTEGER,
    success INTEGER NOT NULL,
    error_message TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broker_audit_incident ON broker_audit_log(incident_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_broker_audit_cluster ON broker_audit_log(cluster_id, timestamp);
`;

export const MIGRATION_005_SQL = `
CREATE TABLE IF NOT EXISTS ai_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'mock')),
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    credential_ref TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'revoked')),
    max_tokens_per_request INTEGER NOT NULL DEFAULT 4096,
    max_requests_per_incident INTEGER NOT NULL DEFAULT 10,
    estimated_cost_per_1k_tokens REAL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_profiles_provider ON ai_profiles(provider);
CREATE INDEX IF NOT EXISTS idx_ai_profiles_status ON ai_profiles(status);
`;

export const MIGRATION_006_SQL = `
CREATE TABLE IF NOT EXISTS ai_diagnoses (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES ai_profiles(id),
    status TEXT NOT NULL CHECK (status IN ('CONCLUSIVE', 'INCONCLUSO')),
    report_json TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    executed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_diagnoses_incident ON ai_diagnoses(incident_id, executed_at);
`;

export const MIGRATION_007_SQL = `
CREATE TABLE IF NOT EXISTS ai_vault_credentials (
    credential_ref TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_vault_created ON ai_vault_credentials(created_at);
`;

export const MIGRATION_008_SQL = `
ALTER TABLE incidents ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE incidents ADD COLUMN resource_uid TEXT;
ALTER TABLE incidents ADD COLUMN signal_type TEXT;

CREATE INDEX IF NOT EXISTS idx_incidents_fingerprint ON incidents(fingerprint);
CREATE INDEX IF NOT EXISTS idx_incidents_resource_uid ON incidents(cluster_id, namespace, resource_uid);
`;

export const ALL_MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: "001_initial_incident_schema",
    sql: INITIAL_SCHEMA_SQL,
  },
  {
    version: 2,
    name: "002_evidence_deduplication_and_versioning",
    sql: MIGRATION_002_SQL,
  },
  {
    version: 3,
    name: "003_retention_policy_and_purge_audit",
    sql: MIGRATION_003_SQL,
  },
  {
    version: 4,
    name: "004_broker_audit_log",
    sql: MIGRATION_004_SQL,
  },
  {
    version: 5,
    name: "005_ai_profiles",
    sql: MIGRATION_005_SQL,
  },
  {
    version: 6,
    name: "006_ai_diagnoses",
    sql: MIGRATION_006_SQL,
  },
  {
    version: 7,
    name: "007_ai_vault_credentials",
    sql: MIGRATION_007_SQL,
  },
  {
    version: 8,
    name: "008_incident_fingerprint_and_resource_uid",
    sql: MIGRATION_008_SQL,
  },
];
