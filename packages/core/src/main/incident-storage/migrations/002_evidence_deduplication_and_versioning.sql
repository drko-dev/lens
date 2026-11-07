-- Migration 002: Evidence Deduplication, Versioning and Sizing Schema
-- Extends incident_evidence with sha256_hash, resource identifiers, resource_version, fingerprint, and snippet_bytes.

ALTER TABLE incident_evidence ADD COLUMN sha256_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN resource_kind TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_name TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_version TEXT;
ALTER TABLE incident_evidence ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN snippet_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_evidence_fingerprint ON incident_evidence(incident_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_evidence_resource ON incident_evidence(cluster_id, namespace, resource_kind, resource_name);
