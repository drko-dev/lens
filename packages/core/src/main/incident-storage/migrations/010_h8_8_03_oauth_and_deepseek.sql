-- Migration 010 (H8.8-03): OpenAI Official SIWC OAuth Metadata, Installation Host ID & DeepSeek Support
ALTER TABLE ai_profiles ADD COLUMN auth_mode TEXT DEFAULT 'api_key';
ALTER TABLE ai_profiles ADD COLUMN oauth_subject TEXT;
ALTER TABLE ai_profiles ADD COLUMN oauth_client_id TEXT;
ALTER TABLE ai_profiles ADD COLUMN oauth_scopes TEXT;
ALTER TABLE ai_profiles ADD COLUMN oauth_expires_at INTEGER;
ALTER TABLE ai_profiles ADD COLUMN availability_status TEXT DEFAULT 'available';
ALTER TABLE ai_profiles ADD COLUMN unavailable_reason TEXT;

CREATE TABLE IF NOT EXISTS ai_oauth_installations (
    installation_key TEXT PRIMARY KEY,
    ext_agent_host_id TEXT NOT NULL,
    dynamic_client_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
