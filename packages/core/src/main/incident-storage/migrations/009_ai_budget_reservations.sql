-- Migration 009: AI Budget Reservations and Atomic Concurrency Control
CREATE TABLE IF NOT EXISTS ai_budget_reservations (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES ai_profiles(id),
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'RESERVED',
        'DISPATCHED',
        'COMPLETED',
        'FAILED_DISPATCHED',
        'CANCELLED_BEFORE_DISPATCH'
    )),
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    diagnosis_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_reservations_incident ON ai_budget_reservations(incident_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_reservations_op ON ai_budget_reservations(operation_id);
