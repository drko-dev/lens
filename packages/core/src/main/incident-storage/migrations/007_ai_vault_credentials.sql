-- Migration 007: Persistent OS-Encrypted Vault Credentials
CREATE TABLE IF NOT EXISTS ai_vault_credentials (
    credential_ref TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_vault_created ON ai_vault_credentials(created_at);
