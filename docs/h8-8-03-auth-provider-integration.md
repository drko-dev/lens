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

## 2. State 1 — Audited Offline Implementation (Completed, Including H8.8-03-R1 Hardening)

- **OpenAI Official SIWC OAuth (`packages/core/src/main/ai-diagnostics/oauth/openai-siwc-oauth-manager.ts` — R1-01, R1-02, R1-04):**
  - Authorization Code + PKCE (`S256`), cryptographic `state`, OpenID Connect `nonce`, and `resource=https://api.openai.com/v1` against official OpenAI endpoints:
    - Authorization endpoint: `https://auth.openai.com/api/accounts/authorize`.
    - Token endpoint: `https://auth.openai.com/api/accounts/oauth/token` (including `resource=https://api.openai.com/v1` in authorization code exchange and refresh requests).
    - OIDC Discovery endpoint: `https://auth.openai.com/.well-known/openid-configuration` used to resolve `revocation_endpoint` dynamically.
  - Official open-source dynamic client registration (`client_id=dynamic_agent_client`, `agent_name_hint=NovaKube`) with a stable per-installation `ext_agent_host_id` (`urn:uuid:<uuid-v4>`) persisted in SQLite (`ai_oauth_installations`).
  - Strict `oaiapp_*` client identity enforcement: initial dynamic registration requires an issued `oaiapp_[A-Za-z0-9_-]{8,128}` client ID (never persisting `dynamic_agent_client`), reauthorization callbacks strictly validate `client_id` against the profile's existing `oaiapp_*` client ID, and each account preserves its specific `oaiapp_*` client ID across refresh and sign-out.
  - Pre-vault identity and account-isolation checks: `id_token` (`RS256` / `ES256` against `https://auth.openai.com/.well-known/jwks.json`, `iss`, `aud`, `exp`, `nonce`, `sub`), `client_id`, and account overwrite protection (`sub` match unless explicit `allowAccountOverwrite: true` is passed) are verified **before** writing or replacing credentials in `SecureCredentialVault`.
  - Server-authoritative scope enforcement: granted scopes are extracted exclusively from the token server's `scope` field (`rawTokenJson.scope`), never widened via permissive union with JWT claims. Both `resource.invoke` and `chatgpt.tokens.use.direct` are required; missing permissions set `availabilityStatus = "sin_permiso"` (`unavailable`) and fail closed (`OPENAI_OAUTH_PERMISSION_DENIED`).
  - Bounded loopback callback session (`R1-04`): temporary HTTP listener on `127.0.0.1:0` at `/oauth/callback` with an explicit session expiration timer (`setTimeout`), rejecting `waitForCompletion()` on timeout (`OPENAI_OAUTH_SESSION_TIMEOUT`), closing the listener and destroying active sockets, releasing completion callbacks and `AbortSignal` listeners (`removeEventListener`), and cleaning up all pending sessions on cancellation, error, or `dispose()`.
  - Official model catalog discovery (`R1-02`): parses `models[]` from `GET https://api.openai.com/v1/models`, uses `slug` as the model identifier for inference and `display_name` (`displayName`) for UI presentation, filters strictly by `visibility === "list"`, preserves server order, rejects malformed catalogs, and never selects `gpt-4o` or any hardcoded model unless validated against the discovered `models[]` catalog (marking `no_models_available` when empty).
- **Production DI & Fail-Closed Network Guard (`R1-03`):**
  - `openAiSiwcOAuthManagerInjectable` (`packages/core/src/main/ai-diagnostics/oauth/openai-siwc-oauth-manager.injectable.ts`) wires a single shared `OpenAiSiwcOAuthManager` instance into both `aiDiagnosisEngineInjectable` and `setupIncidentIpcInjectable`.
  - While `DisabledRealNetworkEngine` remains active (`transport.isExternalNetworkEnabled() === false`), `startSignInFlow()` fails closed immediately with `EXTERNAL_NETWORK_DISABLED` before opening a loopback server or launching the system browser, and the UI surfaces the connection-unavailable state.
- **OpenAI Responses Streaming Adapter (`packages/core/src/main/ai-diagnostics/providers/openai-oauth-provider-adapter.ts`):**
  - Targets `POST https://api.openai.com/v1/responses` exclusively with `store: false`, `stream: true`, `tool_choice: "none"`, `maxRetries: 0`, and $\le 192\text{ KiB}$ request payload cap.
  - Validates that the requested model `slug` belongs to the profile's discovered `availableModels` (`visibility === "list"`).
  - Full SSE parser accumulating output text deltas until terminal `response.completed`, detecting `response.incomplete`, `response.failed`, `CHATGPT_QUOTA_EXHAUSTED`, and `AbortSignal`.
- **DeepSeek Responses Adapter & Official Tariffs (`packages/core/src/main/ai-diagnostics/providers/deepseek-ai-provider-adapter.ts` — R1-05):**
  - Enforces exclusive endpoint `https://api.deepseek.com/responses` and allowed models `deepseek-flash` and `deepseek-v4-pro`.
  - Applies official DeepSeek API per-1M-token tariffs (`https://api-docs.deepseek.com/quick_start/pricing/`):
    - `deepseek-flash`: Cache Hit `$0.006` (Peak `standard`) / `$0.003` (Off-Peak `valle`), Cache Miss `$0.30` (Peak) / `$0.15` (Off-Peak), Output `$1.20` (Peak) / `$0.60` (Off-Peak).
    - `deepseek-v4-pro`: Cache Hit `$0.044` (Peak `standard`) / `$0.022` (Off-Peak `valle`), Cache Miss `$1.32` (Peak) / `$0.66` (Off-Peak), Output `$3.96` (Peak) / `$1.98` (Off-Peak).
  - Evaluates Peak (`standard`) UTC windows strictly as Monday–Friday `01:00–04:00` UTC and `06:00–10:00` UTC (excluding verified Chinese public holidays), and Off-Peak (`valle`) for all other weekday hours and full weekends.
  - Uses conservative Peak (`standard`) + `deepseek-v4-pro` estimation whenever holiday/tariff verification is unavailable (`unverifiedTariff: true`) or during pre-dispatch budget reservation (`estimateMaxBudgetReservationUsd`), ensuring expenditure is never underestimated. All calculated costs are explicitly labeled as referential estimates rather than definitive billing.
- **Provider Configuration UI & IPC (`incident-workbench-panel.tsx`, `incident-store.ts`, `setup-incident-ipc.injectable.ts`):**
  - Exposes **"Continuar con ChatGPT"** button, OpenAI OAuth status/disconnect controls, discovered model `display_name` (`slug`) selector, and DeepSeek API key / model configuration with referential cost notices while keeping Anthropic and Gemini disabled.

---

## 3. State 2 — Real External Activation Pending User Authorization

- **Default Network Posture:** `DisabledRealNetworkEngine` remains the active default in `DefaultSecureAiTransport`, guaranteeing zero outbound external traffic during automated tests and default startup.
- **Browser Launch Guard:** `OpenAiSiwcOAuthManager` validates that any authorization URL strictly matches `https://auth.openai.com/api/accounts/authorize` and fails closed when external network transport is disabled or running under test environments (`JEST_WORKER_ID` / `NODE_ENV=test`).
- **Pending Controlled Activation Steps (Requires Explicit User Approval):**
  1. Replace `DisabledRealNetworkEngine` with a production HTTPS engine enforcing pre-connect DNS resolution (`validateResolvedIpAddress`), TLS 1.2+, and custom socket pinning to prevent DNS rebinding.
  2. Authorize live browser execution of **"Continuar con ChatGPT"** (`shell.openExternal`) to verify whether the target ChatGPT account/workspace is granted `resource.invoke` and `chatgpt.tokens.use.direct` by OpenAI's SIWC preview program, or activate a live DeepSeek API key in `SecureCredentialVault`.
