# H10 — QA NovaKube RC1: dos clústeres, ventanas y restauración

**Inicio:** 2026-11-07. **Rama:** `feature/h10-packaged-multicluster-qa`. **Base:** `develop@836a9ae1`. **Estado:** IMPLEMENTADO; QA FOCALIZADO PASS (pendiente revisión independiente y autorización de integración).

## Propósito

Completar las pruebas E2E faltantes de H9 sobre el **binario macOS ARM64 real**, sin dev server ni nuevo build. Cubrir dos clústeres simultáneos, distinto color y entorno, detach/redock real, aislamiento de watchers y restauración inerte. No cambiar producción para lograr PASS.

**Binario y rollback:** `open-lens/dist/h9-novakube-rc1/mac-arm64/OpenLens DevOps.app`, DMG y ZIP H9 preservados (SHA256SUMS verificado). RC2 anterior NO disponible como instalador; el riesgo fue aceptado para integrar localmente H9, no para distribución general.

## Hitos y gates

### H10-00 — Preflight y seguridad
Verificar Git limpio en rastreados, checkpoint `checkpoint/develop-pre-h10-2026-11-07`, hashes RC1 y margen de disco. Usar únicamente copia temporal de `~/Documents/lens/qa-profiles/h7-dev`, nunca su original. El kubeconfig QA debe contener solo APIs sintéticas `127.0.0.1:18443` y `127.0.0.1:18444` con token ficticio. No usar Keychain real, kubeconfig personal, IA externa ni clúster externo. Gate: PASS de preflight.

### H10-01 — Dos clústeres sobre la app empaquetada
Ejecutar el harness existente `open-lens/integration/h7-docking-e2e.mjs` con `H7_PACKAGED_APP`, `H7_QA_PROFILE`, `H7_ONLY` y `H7_QA_ARTIFACTS`. Escenarios `D16`, `V01`, `V10`: abrir dos clústeres sintéticos por GUI, comprobar IDs, contextos, watches, indicadores de 2 px y entorno Production sintético sin confundirlo con el color NovaKube. Gate: E2E PASS.

### H10-02 — Ventanas desacopladas reales
Escenarios `P01`, `P04`, `P05`, `P06`, `P09`, `P15`: nueva BrowserWindow real, descriptor clusterId correcto, colores y banda 2 px, botón Redock real, dos ventanas independientes y bloqueo de IPC entre clústeres. Verificar también tema NovaKube en root con un smoke focalizado complementario, no sustituyendo tests de interacción real. Gate: ventanas y aislamiento PASS, capturas genuinas y reportes.

### H10-03 — Restauración inerte y persistencia
Ejecutar `PS16` o prueba focalizada equivalente: ventana detach abierta al salir, reiniciar app sin autocrear ventanas ni streams, no duplicar paneles; persistir selección de tema NovaKube. Gate: PASS documentado o PARTIAL con causa explícita.

### H10-04 — Regresión y aceptación
Regresión Jest focalizada relevante, revisar capturas y logs Playwright. Registrar exit codes, hashes y pruebas que realmente se ejecutaron en `docs/h10/H10_PACKAGED_MULTICLUSTER_QA_DELIVERY.md`. Estado final PASS/PARTIAL/BLOCKED según evidencias. Mantener RC1 intacto, no nuevos builds, sin push, merge, rebase ni borrado de archivos sin seguimiento.

## Condiciones y secuencia

Preflight → dos clústeres → detach/redock → reinicio → auditoría. Detenerse si una prueba causa escrituras fuera de APIs sintéticas, falla el aislamiento, cambia el hash de RC1 o el disco cae bruscamente. No fabricar DOM o declarar E2E por pruebas unitarias. Evidencias técnicas en subcarpeta temporal aislada; no sobrescribir `docs/evidence`.

**Preflight inicial confirmado:** `develop@836a9ae1`; rama H10 creada; app RC1 y checksum válidos; ~36 GiB libres. Ningún merge ni push realizado para iniciar H10.


## Resultado verificado 07/11/2026

- H10-00: PASS, kubeconfigs únicamente 127.0.0.1, Keychain simulado y perfil temporal independiente.
- H10-01/H10-02: PASS, 12 verificaciones sin fallos en el H9 RC1 ARM64 (dos clústeres, Production, 2 px, dos detached y rechazo cross-cluster).
- H10-03: PASS, 5 verificaciones sin fallos, incluida PS16 de reinicio en frío con cero ventanas detached autocreadas.
- H10-04: PASS, 26 suites y 291 tests Jest sin fallos, seis screenshots auténticas y hashes únicos.
- Evidencia detallada: H10_PACKAGED_MULTICLUSTER_QA_DELIVERY.md y docs/evidence/h10/.
- No hubo build nuevo ni merge/push. Instalador RC1 queda preservado. RC2 instalable permanece ausente, riesgo documentado.
