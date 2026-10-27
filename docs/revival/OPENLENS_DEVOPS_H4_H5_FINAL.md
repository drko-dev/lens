# OpenLens DevOps — Hitos 4 y 5, cierre final

Date: 2026-10-26 · Worktree: `/Users/gustavomarcon/Documents/lens/lens-r7-09-consolidation`
Consolida y verifica `OPENLENS_DEVOPS_TECHNICAL_CLOSURE_FINAL.md` (la auditoría más reciente
en `docs/revival/`, 2026-10-26 20:43, sin candidatos ni evidencia posteriores). No se compiló
de nuevo ni se corrió un nuevo soak de 30 minutos en esta tarea.

## Hito 4 — Estabilidad: **BLOCKED**

No existe una corrida formal de ≥1.800.000 ms contra Kubernetes real ni contra el Demo Cluster
sobre el binario final (v5). Evidencia inventariada en `docs/revival/` y `docs/revival/evidence/`:

| Evidencia | Candidato | Entorno | Resultado |
|---|---|---|---|
| `evidence/demo-fix2-soak-30min-20261026.json` | DemoFix2 (código distinto a v5) | Demo Cluster (CDP) | PASS, 1.800.002 ms, 359 muestras, 0 supervivientes |
| `DEMO_FIX2_STABILITY_30MIN_FINAL.md` | DemoFix2 | Kubernetes real (`openlens-r8r9-qemu`) | SOAK_BLOCKED, 0 ms (supervisor rechazó matriz fallida) |
| `R8_R9_STABILITY_30MIN_REPORT.md` (2026-10-25) | `open-lens/dist` (otros binarios) | mixto | narrativa histórica; sin registro estructurado ≥30 min |

El único soak de 30 minutos completado y verificado es sobre DemoFix2, no sobre v5 (que cambió
el ciclo de vida del proxy, el handler de unload y 37 archivos de lint). No corresponde
atribuirlo al candidato final — **prohibido declarar equivalencia**, tal como pide la misión.

Verificación rápida ejecutada sobre v5 (no sustituye la corrida formal): 139 ciclos abrir/cerrar
Demo Cluster en 4 minutos, 0 errores de ciclo, 0 excepciones no capturadas, RSS en plateau
~700 MB (pico 737 MB), ≤5 procesos, CPU pico 21%, 0 supervivientes al salir.
Evidencia: `evidence/final-quick-stability-v5.json`.

### Defectos resueltos (ambos, con causa raíz y fix mínimo)

| Defecto | Causa raíz | Fix | Evidencia |
|---|---|---|---|
| `lens-k8s-proxy` huérfano | Carrera en `create-kube-auth-proxy.injectable.ts`: `run()` solo chequeaba `if (proxyProcess)`, asignado después de dos `await`. Dos `run()` concurrentes generaban dos proxies; `exit()` mataba solo uno. | `run()` coalesce arranques concurrentes en una sola promesa; `exit()` incrementa un contador de generación que cancela un arranque en vuelo antes de spawnear. Idempotente. | 2 tests nuevos en `kube-auth-proxy.test.ts` (RED en HEAD, GREEN con el fix, 13/13). Empaquetado v2–v5: exactamente 1 proxy, 0 supervivientes (SIGTERM, CDP `Browser.close`, y desde el DMG montado). |
| 3 excepciones `illegal access` por corrida | Lanzada por el motor (string literal solo en `v8_context_snapshot` de Electron) desde una operación DOM dentro del commit de React, llamada por `listen-unload.injectable.ts` → `unmountComponentAtNode` en `beforeunload`. Solo ocurre en unload de frame. | Se removió el unmount del handler de unload (ambos frames se descartan igual al cerrar; el frame raíz sale por `app.exit()`). | Variante causal: 0 excepciones / 116 ciclos. v5 final: 139 ciclos, 0 excepciones, 0 errores de consola. Limitación: no hay test unitario de este handler; la causa exacta a nivel motor no se identificó. |

Matriz Hito 3 sobre v5: **17/17 PASS**, cleanup completo, token temporal revocado, hashes
coinciden (`hotfix3-matrix-20261026232218-07dea78970dc.json`). Lint 0/0, `tsc` exit 0, 68/68
tests de runner. No corregir más allá de estos dos defectos (según lo pedido).

## Hito 5 — Binario definitivo QA: **PASS** · Distribución pública: **BLOCKED**

No se compiló de nuevo en esta tarea: el candidato v5 ya existente cumple los criterios y se
reutilizó.

- Ruta DMG: `/Users/gustavomarcon/Documents/lens/lens-r7-09-consolidation/dist-qa-final-v5-arm64/OpenLens-DevOps-Final-v5-QA-arm64.dmg`
- SHA-256 DMG: `bb875b06381d02eac356383afe28ca1b24edee9feb1d46c981e955a16ffb9770`
- SHA-256 ejecutable: `a5a53b28e777888432c8b7ede62ca3c787aaa360ff8e4c5fc393ce3a47678b21`
- SHA-256 `app.asar`: `6ce244b9b6867dc06897fee357180914bcc1ac608bf745667490493df995b637`
- Arquitectura: arm64 confirmada (ejecutable, `kubectl` y `lens-k8s-proxy` incluidos).
- `codesign --verify --deep --strict`: OK. `hdiutil verify`: VALID.
- DMG montado de solo lectura: hashes idénticos; app lanzada desde el volumen montado, abrió
  Demo Cluster y cerró con 0 procesos supervivientes; volumen desmontado sin errores, 0 montajes
  restantes.
- Dependencias runtime: verificador de artefactos 9/9 PASS, 13 módulos runtime revisados, 0
  ausentes.
- Firma y notarización: solo identidad *Apple Development* en el keychain, sin *Developer ID
  Application*. No se intentó firmar para distribución ni notarizar — limitación de
  credenciales, no defecto funcional. `spctl` rechaza el binario (esperado sin Developer ID).
  No se aplicó bypass de Gatekeeper ni se falsificó certificación.
- Kubernetes real (lab `openlens-r8r9-qemu`, solo lectura): smoke y matriz PASS sobre v5 (Nodes/
  Pods reales, gateway de solo lectura, identidad RBAC temporal creada y revocada, kubeconfig de
  la app removido). No se aprovisionó clúster ni se modificaron workloads.

## Confirmación R9-RC

`releases/R9-RC` (pid 97512) verificado activo e intacto antes y después de esta auditoría
— mismo PID, sin reinicios, sin cambios de proceso.

## Pendientes reales

1. Corrida formal de 30 minutos sobre v5 (Demo Cluster y Kubernetes real) — explícitamente
   fuera de alcance de esta misión; el owner debe ejecutar
   `docs/revival/scripts/hotfix3-e2e-orchestrator.cjs soak` cuando lo autorice.
2. Suite unitaria completa de `@openlens/core`: 395 suites, 4039 tests — 322/73 suites y
   3682/348/9 (pass/fail/skip) a nivel test. 319 son diffs de snapshot (markup obsoleto de
   trabajo previo sin commitear) y 8 son `toHaveBeenCalledWith`; ambos preexistentes a esta
   sesión, no causados por los dos fixes. 3 fallas de `rbac-inspector`/`kubeconfig-manager-rotation`
   no confirmadas de forma aislada. Requiere revisión humana antes de regenerar snapshots.
3. Causa raíz a nivel de motor (V8/Electron) de por qué el DOM lanzaba en unload — mitigada,
   no identificada.
4. Firma Developer ID Application y notarización Apple (credenciales externas).
5. ~~Fixes sin commit~~ — resuelto: los tres archivos de producto del fix están en `e56cc99`.
   PR, merge y publicación siguen sin autorizar.

## Veredictos

- `HITO_4 = BLOCKED` (gate formal de 30 minutos no satisfecho para v5; evidencia histórica
  pertenece a otro binario/entorno y no es equivalente).
- `HITO_5_QA = PASS` (artefacto QA ARM64 verificado end-to-end).
- `DISTRIBUCION_PUBLICA = BLOCKED` (sin certificado Developer ID; limitación externa de
  credenciales, no de código).
- `R9_RC = INTACTO`.
- `PR = NO` · `MERGE = NO` · `RELEASE = NO`.

## Commit de cierre

- Hash: `e56cc99` (rama `feat/r7-09-consolidation`).
- Contenido exacto: los dos archivos de fix de producto, su test, y los dos documentos
  finales de cierre. Ningún archivo ajeno de los 557 restantes con cambios en el worktree
  fue incluido — el repositorio NO queda limpio tras este commit.
- Verificación cruzada: el identificador único del fix (`startGeneration`) aparece en el
  `app.asar` empaquetado de v5 (3 ocurrencias), y los dos archivos fuente fueron modificados
  por última vez antes del build de v5 (19:41 y 20:18 vs. build a las 20:19:44) — el código
  commiteado corresponde al código compilado en v5.
- DMG re-verificado post-commit: SHA-256 `bb875b06381d02eac356383afe28ca1b24edee9feb1d46c981e955a16ffb9770`
  sin cambios; `codesign --verify --deep --strict` OK.
- R9-RC re-verificado post-commit: mismo pid 97512, uptime 1 día 55 min, sin interrupción.

## Veredicto definitivo (misión de cierre, 2026-10-27)

Re-verificado sin reconstruir ni relanzar pruebas: SHA-256 del DMG, del ejecutable y de
`app.asar` idénticos a los registrados arriba; arquitectura arm64; `codesign --verify --deep
--strict` OK; 0 montajes residuales; 0 procesos del candidato v5; R9-RC (pid 97512) activo,
uptime 1 d 12 h 18 min, sin reinicios. HEAD = `e56cc99`.

Credenciales: el keychain solo contiene *Apple Development* (sin *Developer ID Application*) y
`notarytool` responde "Must provide credentials" (sin perfil ni variables `APPLE_ID`/`NOTARY`/`CSC_*`).
No se firmó ni notarizó nada.

| Hito | Estado |
|---|---|
| 1 | PASS (evidencia previa) |
| 2 | PASS (evidencia previa) |
| 3 | PASS — 17/17 sobre v5 |
| 4 | BLOCKED — falta soak formal de 30 min sobre v5 |
| 5 (QA) | PASS |
| Distribución pública | BLOCKED — sin Developer ID ni credenciales de notarización |

- **CANDIDATO QA TERMINADO: SÍ**
- **CERTIFICACIÓN FORMAL COMPLETA: NO** (Hito 4)
- **DISTRIBUCIÓN PÚBLICA LISTA: NO**

Único paso para cerrar Hito 4: `node docs/revival/scripts/hotfix3-e2e-orchestrator.cjs soak`
(30 min, requiere autorización del owner).
Único paso para distribución: instalar certificado *Developer ID Application*, ejecutar
`xcrun notarytool store-credentials` y firmar/notarizar una copia diferenciada del DMG QA.
