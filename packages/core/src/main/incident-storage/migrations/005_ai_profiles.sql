-- Migration 005: AI Provider Profiles with Opaque Credential References
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
