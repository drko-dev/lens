# R7-07 — Helm Intelligence: implementación

| Campo | Valor |
|---|---|
| Rama / base | `feat/r7-07-helm-intelligence` / `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` |
| Estado | Implementado; gates dirigidos documentados; checkpoint local d199c38, sin push |

## Cambios

- **Valores por revisión:** `GetHelmReleaseValuesData.revision`, cliente API y `helm get values --revision`. Query inválida explícita → HTTP 400; argumentos continúan separados y nunca pasan por shell.
- **Historial y diff:** componentes `revision-history` y `values-diff`, modelos MobX con aislamiento de contexto/request token, selección A/B, distinción `user-supplied`/`--all`, manejo vacío/403/error y cleanup al desmontar.
- **Privacidad:** eliminado el enmascarado heurístico por clave. Todo el diff queda oculto hasta acción explícita; cambios de contexto, modo, selección y cierre limpian o re-ocultan datos.
- **Schema de chart:** ruta `GET /v2/charts/schema`; descarga empaquetada con `helm pull --destination` (sin `--untar`) e inspección streaming tar en memoria sin materializar archivos a disco; estados `present/absent/unavailable/invalid`; límites estrictos de descarga (15 MiB), descompresión (30 MiB), entradas (1.000), profundidad (16), archivo (5 MiB), schema (2 MiB), rechazo de symlinks/hardlinks, rutas absolutas y path traversal; semáforo de concurrencia y timeout de 30s.
- **Validación:** Ajv 8, declarado en `packages/core` (peer) y `open-lens` (runtime), lockfile actualizado offline; schemas no compilables se marcan incompletos, nunca como pass; mitigación de ReDoS limitando patrones regex a 256 caracteres y Values a 1 MiB.
- **Wrapper Helm:** `execHelm` con `maxBuffer` corregido a 32 MiB (eliminando los 32 GiB erróneos), timeout real de 60s con terminación forzosa `SIGKILL` y soporte de `AbortSignal`.
- **UI:** integración de la tabla/diff/badge en detalle de release y validación dentro del upgrade existente.

## Evidencia actual

- Jest: `cd packages/core && ../../node_modules/.bin/jest --runInBand ...` — 11 suites / 113 tests PASS.
- TypeScript: `cd packages/core && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json` — PASS.
- ESLint: `--max-warnings 0` en main Helm/rutas/utils, endpoints comunes y componentes implicados — PASS.
- Playwright: `node docs/revival/scripts/verify-r7-07-playwright.cjs` — PASS en harness sintético; no es E2E de la app empaquetada.

## Riesgos y mitigaciones

El riesgo bloqueante previo de extracción sin límites y `maxBuffer` excesivo ha sido **resuelto y probado exhaustivamente** mediante 17 casos de prueba adversariales. Quedan diferidos a R7-09 los gates de empaquetado Electron, pruebas en runtime real y mitigaciones heredadas de R4-09.
