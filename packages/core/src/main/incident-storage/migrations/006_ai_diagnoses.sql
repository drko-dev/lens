-- Migration 006: AI Diagnosis Reports and Audit Tracking
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
