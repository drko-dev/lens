-- Migration 004: Broker Audit Log for Investigation Accountability
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
