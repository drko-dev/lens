# OpenLens DevOps / NovaKube — H8.8-03: OpenAI Official OAuth (SIWC) & DeepSeek Responses API

## 1. Architectural Decision & Provider Separation

Two explicit, isolated connection mechanisms are implemented for AI-assisted Kubernetes incident diagnostics:

1. **Primary Mechanism (`H8.8-03a`):** **OpenAI via Sign in with ChatGPT (Official Browser OAuth / SIWC)**.
   - Direct OpenAI API key authentication is **not** used as the primary mechanism and remains blocked (`EXTERNAL_PROVIDER_DISABLED`).
   - Browser cookies, private ChatGPT web endpoints, and tokens extracted from third-party CLI tools are strictly prohibited.
2. **Alternative Mechanism (`H8.8-03b`):** **DeepSeek via API Key (`https://api.deepseek.com/responses`)**.
   - Configured with `deepseek-flash` (initial default) and `deepseek-v4-pro` (advanced reasoning model).
   - Encrypted Bearer credential storage via `SecureCredentialVault`.
3. **Offline Deterministic Harness:** **Mock (`mock`)**.
4. **Out-of-Scope Providers:** **Anthropic** and **Gemini** remain disabled (`EXTERNAL_PROVIDER_DISABLED`).
5. **Zero Automatic Provider Failover:** NovaKube **never** switches automatically from OpenAI to DeepSeek on OAuth failure, token expiration, or ChatGPT plan quota exhaustion (`CHATGPT_QUOTA_EXHAUSTED`). Changing the recipient of cluster evidence requires explicit human profile selection and a fresh single-use consent token.

---

## 2. State 1 — Audited Offline Implementation (Completed)

- **OpenAI Official SIWC OAuth (`packages/core/src/main/ai-diagnostics/oauth/openai-siwc-oauth-manager.ts`):**
  - Authorization Code + PKCE (`S256`), cryptographic `state`, and OpenID Connect `nonce` against `https://auth.openai.com`.
  - Official open-source dynamic client registration (`client_id=dynamic_agent_client`, `agent_name_hint=NovaKube`) with a stable per-installation `ext_agent_host_id` (`urn:uuid:<uuid-v4>`) persisted in SQLite (`ai_oauth_installations`).
  - Temporary loopback HTTP callback listener bound exclusively to `127.0.0.1:0` at `/oauth/callback`, enforcing HTTP `GET`, parameter allowlist, anti-HPP duplicate checks, timing-safe `state` validation, and immediate socket/server closure (`Connection: close`).
  - Asymmetric JWT signature verification (`RS256` / `ES256`) of `id_token` against `https://auth.openai.com/.well-known/jwks.json`, verifying `iss`, `aud`, `exp`, `nonce`, and `sub`.
  - Mandatory permission gate requiring both `resource.invoke` and `chatgpt.tokens.use.direct`. Missing permissions set `availabilityStatus = "sin_permiso"` (`unavailable`) and fail closed (`OPENAI_OAUTH_PERMISSION_DENIED`).
  - Encrypted persistence of `access_token`, `refresh_token`, and `id_token` inside `SecureCredentialVault`. Zero plaintext secrets in SQLite, renderer, IPC, URLs, or logs.
  - Per-profile mutex serializing token refresh (`grant_type=refresh_token`), safe `refresh_token` rotation, and account-change detection (`sub` mismatch invalidates active consent tokens and revokes the session).
  - Account disconnection and remote revocation (`POST https://auth.openai.com/oauth/revoke`) coupled with unconditional local vault purge.
  - Official model discovery via `GET https://api.openai.com/v1/models` filtering `visibility === "list"`; marks `no_models_available` if no eligible models are returned.
- **OpenAI Responses Streaming Adapter (`packages/core/src/main/ai-diagnostics/providers/openai-oauth-provider-adapter.ts`):**
  - Targets `POST https://api.openai.com/v1/responses` exclusively with `store: false`, `stream: true`, `tool_choice: "none"`, `maxRetries: 0`, and $\le 192\text{ KiB}$ request payload cap.
  - Full SSE parser accumulating output text deltas until terminal `response.completed`, detecting `response.incomplete`, `response.failed`, `CHATGPT_QUOTA_EXHAUSTED`, and `AbortSignal`.
- **DeepSeek Responses Adapter (`packages/core/src/main/ai-diagnostics/providers/deepseek-ai-provider-adapter.ts`):**
  - Enforces exclusive endpoint `https://api.deepseek.com/responses` and allowed models `deepseek-flash` / `deepseek-v4-pro`.
  - Extracts input, cache-hit, cache-miss, output, and reasoning token metrics, and computes USD cost across standard and off-peak UTC bands.
  - Enforces `maxRetries: 0` on `POST`, schema validation, citation verification, and reflected-secret rejection.
- **Provider Configuration UI & IPC (`incident-workbench-panel.tsx`, `incident-store.ts`, `setup-incident-ipc.injectable.ts`):**
  - Exposes **"Continuar con ChatGPT"** button, OpenAI OAuth status/disconnect controls, and DeepSeek API key / model configuration while keeping Anthropic and Gemini disabled.

---

## 3. State 2 — Real External Activation Pending User Authorization

- **Default Network Posture:** `DisabledRealNetworkEngine` remains the active default in `DefaultSecureAiTransport`, guaranteeing zero outbound external traffic during automated tests and default startup.
- **Browser Launch Guard:** `OpenAiSiwcOAuthManager` validates that any authorization URL strictly matches `https://auth.openai.com/oauth/authorize` and suppresses OS browser execution under test environments (`JEST_WORKER_ID` / `NODE_ENV=test`).
- **Pending Controlled Activation Steps (Requires Explicit User Approval):**
  1. Replace `DisabledRealNetworkEngine` with a production HTTPS engine enforcing pre-connect DNS resolution (`validateResolvedIpAddress`), TLS 1.2+, and custom socket pinning to prevent DNS rebinding.
  2. Authorize live browser execution of **"Continuar con ChatGPT"** (`shell.openExternal`) to verify whether the target ChatGPT account/workspace is granted `resource.invoke` and `chatgpt.tokens.use.direct` by OpenAI's SIWC preview program, or activate a live DeepSeek API key in `SecureCredentialVault`.
