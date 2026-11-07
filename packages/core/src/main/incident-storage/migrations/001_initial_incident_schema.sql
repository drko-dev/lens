-- Migration 001: Initial Incident Schema for OpenLens DevOps H8.1
-- Creates core tables: incidents, incident_timeline, incident_evidence, and indexes.

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
