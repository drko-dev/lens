# R7-07 — Helm Intelligence: implementación

| Campo | Valor |
|---|---|
| Rama / base | `feat/r7-07-helm-intelligence` / `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` |
| Estado | Implementado; gates dirigidos documentados; checkpoint local d199c38, sin push |

## Cambios

- **Valores por revisión:** `GetHelmReleaseValuesData.revision`, cliente API y `helm get values --revision`. Query inválida explícita → HTTP 400; argumentos continúan separados y nunca pasan por shell.
- **Historial y diff:** componentes `revision-history` y `values-diff`, modelos MobX con aislamiento de contexto/request token, selección A/B, distinción `user-supplied`/`--all`, manejo vacío/403/error y cleanup al desmontar.
- **Privacidad:** eliminado el enmascarado heurístico por clave. Todo el diff queda oculto hasta acción explícita; cambios de contexto, modo, selección y cierre limpian o re-ocultan datos.
- **Schema de chart:** ruta `GET /v2/charts/schema`; descarga temporal por `helm pull`; estados `present/absent/unavailable/invalid`; argumentos inválidos, symlinks, schema mayor a 2 MiB, recorrido >5.000 entradas o profundidad >64 protegidos.
- **Validación:** Ajv 8, declarado en `packages/core` (peer) y `open-lens` (runtime), lockfile actualizado offline; schemas no compilables se marcan incompletos, nunca como pass.
- **UI:** integración de la tabla/diff/badge en detalle de release y validación dentro del upgrade existente.

## Evidencia actual

- Jest: `cd packages/core && ../../node_modules/.bin/jest --runInBand ...` — 10 suites / 97 tests PASS.
- TypeScript: `cd packages/core && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json` — PASS.
- ESLint: `--max-warnings 0` en main Helm/rutas/utils, endpoints comunes y componentes implicados — PASS.
- Playwright: `node docs/revival/scripts/verify-r7-07-playwright.cjs` — PASS en harness sintético; no es E2E de la app empaquetada.

## Riesgo retenido

`helm pull --untar` no limita el tamaño total de descarga/extracción ni tiene timeout. El límite actual aplica al archivo `values.schema.json` y al recorrido posterior, no a bytes ya escritos al temporal. Revisar `R7_07_SECURITY_REVIEW.md`; esto sigue abierto para certificación global.
