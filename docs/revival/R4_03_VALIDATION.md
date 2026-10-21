# R4-03 — Validación final de persistencia, restauración e historial

**Fecha:** 2026-10-21
**Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
**Rama:** `feat/r4-workspace-security`
**HEAD:** `22fbe983f5a6b4059eccbee15c906fbc5447c3d4`
**Estado:** ver la sección «Certificación de cierre» (más abajo, la certificación anterior se conserva como historial).

## Certificación de cierre (2026-10-21, sesión con control exclusivo del worktree)

### Traspaso y precheck

- Control exclusivo de `lens-r4` cedido por la sesión R4-04/R4-05 con confirmación expresa. Un build anterior de esta sesión (`R4_03_CLOSURE_BUILD_20261021-082103.log`) falló en `packages/core` mientras otra sesión editaba port-forward; ese paquete `dist-r4-stage/r4-03-closure-20261021-082103` **no se usa como evidencia**.
- Rama `feat/r4-workspace-security`, HEAD `22fbe983f5a6b4059eccbee15c906fbc5447c3d4`; sin procesos de build concurrentes; sin escrituras ajenas recientes.
- Hash del árbol `packages/core/src` usado para tests y build: `7221a0ba6285b14d11ca42ad8fd8d3b30f7aaf50eb628af5a51f42bd16d346fc`.

### Hallazgo del snapshot y corrección

Antes: el tab de un clúster ausente se descartaba en memoria pero permanecía en `lens-workspace-sessions.json` (log anterior `staleReferenceRetainedOnDisk=true`), y `saveNow()` solo reescribía el workspace activo.

Corrección (`workspace-persistence-store.ts`):

- `reconcileSnapshot()` recorre **todos** los workspaces del snapshot validado y conserva solo tabs cuyo `clusterId` resuelve a un clúster con ese mismo `id` (identidad, nunca nombre/alias). Filtra entradas de historial cuyo par `tabId/clusterId` ya no es válido, recalcula `currentIndex`, y recalcula el foco (`activeTabId`) al primer tab válido si el activo desapareció. Workspaces, layouts e historial válidos de workspaces inactivos se conservan intactos.
- Si el resultado difiere del snapshot leído, se reescribe una sola vez con el mismo serializador versionado (`serializeSessionSnapshot`, v1) y el adaptador existente (temporal + rename). Snapshots corruptos o de versión futura siguen fallando cerrados **sin** reescritura; snapshots legacy se migran por la ruta existente.
- `saveNow()` parte del snapshot completo en memoria y solo reemplaza la entrada del workspace activo, por lo que ya no puede borrar otros layouts.
- `createWorkspace()` / `switchWorkspace()` y el selector `workspace-selector` / `workspace-create` del tab bar permiten crear y alternar workspaces; cambiar de workspace restaura sus tabs **inactivos** y navega al catálogo, nunca a un clúster.

No se implementó purga general: solo se eliminan referencias cuyo clúster no existe con identidad exacta.

### Pruebas dirigidas, ESLint y TypeScript

Log: `logs/R4_03_CERT_REGRESSION_20261021.log` (Node 20.20.2).

| Verificación | Resultado |
|---|---:|
| 12 suites dirigidas (workspace/persistencia/historial/identidad/activación diferida/ClusterView/frame isolation/flag/MCP R4-01A) | **12/12 suites, 114/114 tests PASS** |
| ESLint dirigido | **exit 0** |
| `tsc -p tsconfig.json --noEmit` (packages/core completo) | **exit 0** |

Tests añadidos/ampliados en `workspace-persistence-store.test.ts`: independencia de tabs/orden/foco/historial al alternar workspaces; reconciliación en disco de tres workspaces sin perder layouts/historial inactivos ni escribir un homónimo; guardado posterior que no reintroduce la referencia.

### Nuevo `.app` macOS ARM64

Log: `logs/R4_03_CERT_BUILD_20261021-091636.log` (cadena con corte ante error; `core_exit=0`, `openlens_exit=0`, `package_exit=0`, 0 errores webpack).

```sh
(cd packages/core && npm run build)
(cd open-lens && npm --ignore-scripts run build)
(cd open-lens && npm run build:app -- --mac --arm64 --dir --config.directories.output=dist-r4-stage/r4-03-cert-20261021-091636)
```

- `.app`: `open-lens/dist-r4-stage/r4-03-cert-20261021-091636/mac-arm64/OpenLens DevOps.app` (649 MB, Mach-O arm64, app `6.5.3-dev`, Electron `22.3.3`).
- `app.asar` SHA-256: `119e5086b3045d12c7f9630227392e0adc104b91c6471fff599e987bdddaa957`.
- Ejecutable SHA-256: `3eaa515762b6bf3739a16de3b244088d4197bc24f278812a79e2941b4f8f86ba`.
- El `lens.js` dentro del asar contiene el código de reconciliación y el selector de workspace. Firmado localmente; no notarizado.

### Certificación multiworkspace en el `.app` real

Harness: `scripts/verify-r4-03-final.cjs`; log `logs/R4_03_CERT_GUI_FINAL_20261021.log`; evidencia JSON `logs/R4_03_CERT_GUI_FINAL_20261021.evidence.json`; resultado **PASS** (exit 0). Cinco fixtures loopback sintéticas, perfiles temporales, sin Kubernetes real.

| Paso | Resultado |
|---|---|
| A `default`: PROD A + PROD B, reordenado a [PROD B, PROD A], foco PROD A | creado y persistido |
| B `workspace-2`: STG A + STG B, foco STG A, historial STG A→STG B→STG A | creado y persistido |
| C `workspace-3`: DEV A | creado y persistido |
| Cierre total 1 | exit 0; **0 procesos sobrevivientes** del árbol propio |
| Reapertura: los 3 workspaces, orden y foco de cada uno | **PASS** |
| Tabs restaurados con `data-restored-inactive=true` y sin iframe de clúster en los 3 workspaces | **PASS** |
| Solicitudes a fixtures durante restauración y cambio de workspace | **0 / 0 / 0 / 0 / 0** |
| Back/Forward en B tras reinicio | Back → STG B, Forward → STG A; solicitudes solo a STG A/STG B (20/20); PROD A/B y DEV A **0** |
| Cierre total 2 | exit 0 |
| Eliminar STG B del store + kubeconfig y añadir otra identidad con el mismo alias visible «Synthetic STG B» | — |
| Reapertura: snapshot en disco | sin el id eliminado; sin el id homónimo; 3 workspaces; layout + historial de A idénticos byte a byte; layout de C idéntico; B = [STG A] con foco STG A; historial de B 3→2 entradas, `currentIndex` 2→1 |
| UI tras limpieza | A [PROD B, PROD A] foco PROD A; C [DEV A]; B [STG A]; **ningún tab del homónimo**; 0 solicitudes |
| Cierre total 3 | exit 0 |

Capturas: `screenshots/r4-03-final-2026-10-21T12-19-32-366Z-{01-before-close,02-restored-inactive,03-explicit-activation-stg,04-cleaned-missing-cluster}.png`.

Además, el harness de persistencia original (`scripts/verify-r4-03-persistence.cjs`) volvió a ejecutarse completo contra el nuevo `.app`: **ALL GATES PASSED**, ahora con `staleReferenceRetainedOnDisk=false` y `staleHistoryRetainedOnDisk=false`, incluyendo corrupción, allowlist, identidad reemplazada, activación explícita y fallback clásico (flag OFF). Log `logs/R4_03_CERT_GUI_PERSISTENCE_20261021.log`; capturas `screenshots/r4-03-persistence-2026-10-21T12-20-53-899Z-*.png`.

### Verificación OS-level de procesos y PTYs

Método: árbol de descendientes del PID Electron lanzado (`ps -axo pid,ppid,tty,command`), muestreado cada 250 ms durante ventanas de 1,5–3 s, más `lsof -nP -p <pids>` buscando `/dev/ptmx`, `/dev/ttys*`, `/dev/pty*`. Clasificación: **A** Electron/helpers y env-sync `shell -l` sin TTY; **B** herramienta (cualquier proceso con TTY, `kubectl`, `port-forward`, `helm`, `lens-k8s-proxy`); **C** procesos no descendientes: solo se excluyen, nunca se tocan.

| Momento | Procesos propios observados | Clase B | PTY |
|---|---|---|---|
| Restauración de 3 workspaces | 4: `OpenLens DevOps`, Helper, Helper (GPU), Helper (Renderer) | **0** | **0** |
| Tras alternar los 3 workspaces | mismos 4 | **0** | **0** |
| Tras activación explícita (Back/Forward STG) | 6: los 4 + 2 `lens-k8s-proxy` (STG A y STG B) | solo `lens-k8s-proxy`, esperado por la activación explícita; sin shell, kubectl, port-forward | **0** |
| Reinicio con clúster eliminado | mismos 4 | **0** | **0** |
| Tras cada cierre | 0 sobrevivientes | — | — |

Conclusión: la restauración no inicia PTYs, terminales, shells interactivos, `kubectl`, port-forwards ni proxies de clúster; el primer proceso de herramienta (`lens-k8s-proxy`) aparece solo después de la acción explícita y únicamente para los clústeres elegidos. El env-sync `zsh -l` documentado antes no se observó en las ventanas de muestreo; si aparece, es clase A (sin TTY, transitorio) y no es una sesión restaurada. Ningún proceso ajeno fue finalizado.

### `illegal access`

Reproductor: `scripts/repro-r4-03-illegal-access.cjs` (una fixture loopback, perfil temporal; `idle` = sin activar clúster, `activate` = abre un clúster y cierra).

| Binario | Modo | Resultado |
|---|---|---|
| Pre-R4 (`lens/open-lens/dist`, asar `e64ceac2…6c62a`, build 2026-10-19 12:27) | idle | no aparece |
| Pre-R4 | activate (2 corridas) | **aparece en ambas**: consola del renderer raíz en teardown + 3 `pageerror` `illegal access` sin stack; exit 0 |
| R4 certificado anterior | workspace-tabs ON, idle | no aparece |
| R4 certificado anterior | workspace-tabs **OFF**, activate | aparece; exit 0 |
| R4 nuevo (`r4-03-cert-20261021-091636`) | harness final / persistencia | aparece en consola (2 y 3 veces), 0 `pageerror` |

Secuencia en todos los casos: `[ROOT-FRAME]: Unload app` → `[LENS-VIEW]: refreshing iframe views, visible cluster id=null` → `illegal access`, solo si antes se activó un iframe de clúster. El texto no está en `lens.js` ni en el binario Electron como literal; sí en `v8_context_snapshot.arm64.bin` (runtime Chromium/V8 de Electron 22). El proceso emisor es el renderer raíz; el exit code es 0.

Clasificación: **defecto de teardown del renderer al descargar iframes de clúster, reproducido en un binario anterior a R4 y con workspace-tabs OFF; no introducido por R4-03.** No se afirma verificación sobre R3 HEAD exacto (el binario pre-R4 se compiló antes del commit `22fbe98`). No afecta persistencia, aislamiento ni restauración: ocurre con la ventana raíz ya descargándose y sin solicitudes posteriores. Logs: `logs/R4_03_ILLEGAL_ACCESS_REPRO_20261021.log`, `logs/R4_03_ILLEGAL_ACCESS_PRER4_ACTIVATE_20261021.log`, `logs/R4_03_ILLEGAL_ACCESS_PRER4_PROVENANCE_20261021.txt`.

### Suite global

`packages/core` completo con Node 20.20.2 sobre el mismo árbol fuente del build (`7221a0…46fc`); log `logs/R4_03_CERT_GLOBAL_20261021.log`, JSON `logs/R4_03_CERT_GLOBAL_20261021.json`. Una primera corrida se interrumpió a las 196 suites por fin de sesión y se repitió completa.

| Métrica | Resultado |
|---|---:|
| Suites | 275: 246 PASS, **29 FAIL** |
| Tests | 2770: 2608 PASS, 153 FAIL, 9 skipped |
| Snapshots | 390: 139 fallidos |

Triage por nombre de suite contra las 27 suites fallidas de R3 (`R4_02_REGRESSION_TRIAGE.md`):

| Grupo | Suites | Dictamen |
|---|---:|---|
| Heredadas de R3 | 27/27 | deuda preexistente (drift de snapshots y 3 suites P1 documentadas en R4-02); ninguna pasó a verde |
| `src/features/command-pallet/keyboard-shortcuts.test.tsx` (6 tests) | 1 | **regresión nueva de R4**, asociada provisionalmente a R4-04: `clear-log-tab-data.injectable.ts` inyecta `LogStore → callForLogs → podApi`, que falla su assert en el frame raíz al abrir la paleta. R3: 16/16 PASS. No se actualizaron snapshots |
| `src/features/cluster/refresh-accessibility-technical.test.ts` (2 tests) | 1 | **flaky de entorno**: falla solo en la corrida global con `@async-fn` «…not yet»; aislada pasa 112/112 tres veces en R4 y 112/112 en R3; sin cambios R4 en esa zona |
| Suites R4-03 / workspace / MCP | 0 | ninguna falla |

No se usaron skips nuevos ni `-u`. Pruebas de otros paquetes del monorepo no ejecutadas.

### Criterios de cierre

| # | Criterio | Estado |
|---|---|---|
| 1 | La restauración existente sigue funcionando | PASS: harness original completo en el nuevo `.app` |
| 2 | Purga de referencias inválidas segura | PASS: solo identidades inexistentes; A y C idénticos byte a byte |
| 3 | Snapshots sin clústeres descartados | PASS: id eliminado ausente en disco tras reinicio |
| 4 | No se pierden layouts de otros workspaces | PASS |
| 5 | Restauración multiworkspace | PASS: 3 workspaces |
| 6 | Orden y foco | PASS por workspace |
| 7 | Atrás/Adelante conserva identidad | PASS: solo STG, 0 solicitudes a PROD/DEV |
| 8 | Tabs restaurados inactivos | PASS: `data-restored-inactive`, sin iframes, 0 solicitudes |
| 9 | Sin reanudación automática de herramientas | PASS: 0 procesos clase B y 0 PTY en restore/switch/limpieza |
| 10 | Comprobación OS-level | PASS: muestreo `ps` + `lsof` del árbol propio |
| 11 | `illegal access` investigado y clasificado | PASS: reproducido en binario pre-R4 y con flag OFF; no introducido por R4-03 |
| 12 | Tests dirigidos | PASS: 12/114 |
| 13 | TypeScript y ESLint | PASS: exit 0 |
| 14 | Suite global con triage | PASS: resultado rojo documentado; 0 fallos atribuibles a R4-03 |
| 15 | Nuevo `.app` desde source final | PASS: `r4-03-cert-20261021-091636` |
| 16 | Reapertura real del nuevo `.app` | PASS: 3 ciclos cierre/reapertura |
| 17 | Logs y capturas verificables | PASS: rutas arriba |
| 18 | Checklist refleja el estado | actualizado |

**Dictamen: R4-03 COMPLETADO** con los límites siguientes, que quedan fuera de su alcance y no se reclaman:

- Historial limitado a rutas raíz de clúster; sin deep routes de iframes ni restauración de sesiones de herramientas/buffers (por diseño: no se restauran).
- No se midieron permisos efectivos del archivo de sesión ni recuperación ante crash durante el rename.
- La suite global de `packages/core` sigue roja por deuda heredada R3 más la regresión de teclado (R4-04) y un flaky de entorno.
- `illegal access` no verificado contra R3 HEAD exacto; el binario pre-R4 se compiló antes de `22fbe98`.
- Binario firmado localmente, no notarizado.
- Los errores de discovery de CRD en los logs GUI provienen de las fixtures sintéticas, que no implementan esa API.

R4-01 y R4-02 permanecen **PARCIALES**. Sin commit: pendiente de revisión del alcance por el responsable.

---

## Certificación anterior (historial, 2026-10-21 06:04–06:35)

**Estado entonces:** **PARCIAL** — el `.app` recién empaquetado pasó la secuencia GUI principal y las pruebas dirigidas; quedaban gaps críticos descritos abajo.

## Preflight y preservación

- Root confirmado en `/Users/gustavomarcon/Documents/lens/lens-r4`; branch `feat/r4-workspace-security`; HEAD registrado arriba.
- Se revisaron arquitectura, validación, checklist, auditoría R4-02, scripts y tests. Se conservaron los cambios preexistentes R4-01/R4-02/R4-04 y todos los artefactos existentes.
- No se modificó el checkout estable ni R1–R3; no se accedió a Kubernetes real, no se modificaron kubeconfigs reales ni se iniciaron/detuvieron servicios locales.
- No se hicieron commits, push, release o deploy.
- `git diff --check`: **PASS**. El árbol sigue incluyendo cambios previos ajenos a R4-03; no se limpió ni restableció nada.

## Build y paquete evaluado

Node `v20.20.2`, npm `10.8.2`.

Desde `open-lens/`:

```sh
npm --ignore-scripts run build
npm run build:app -- --mac --arm64 --dir --config.directories.output=dist-r4-stage/r4-03-certification-20261021-060415
```

Resultado comprobable:

- La compilación webpack de main y renderer terminó con `compiled successfully`; log completo: `docs/revival/logs/R4_03_BUILD_20261021-060415.log`.
- `electron-builder 23.6.0`; app `6.5.3-dev`; Electron `22.3.3`; salida Darwin ARM64.
- App nueva: `open-lens/dist-r4-stage/r4-03-certification-20261021-060415/mac-arm64/OpenLens DevOps.app`.
- `file` y `lipo` confirmaron `Mach-O arm64`; tamaño del bundle 637 MB.
- `app.asar` SHA-256: `5801cdea755a4eb8085154e9f376ebfbf2864650f1fe5ec3bd4e889f95c1fcca`.
- Ejecutable principal SHA-256: `44235b4560f14d27ea2507454b61cbf34d02b98c99bb628a83b03c9fa9a4a4a4`.
- Build/package: `docs/revival/logs/R4_03_PACKAGING_20261021-060415.log`.

La salida del package quedó en el filesystem y fue abierta por el E2E. El tee del comando de packaging apuntó inicialmente a un directorio inexistente, por lo que no se conserva el stdout íntegro ni el exit code de ese pipeline. No se presenta ese log como capturado. La app se firmó localmente, no se notarizó por falta de credenciales Apple. El backup del build previo se conservó en `open-lens/dist-r4-stage/r4-03-static-build-backup-20261021-060415`.

## Automatización GUI en el `.app` real

Comando ejecutado desde el root del repositorio:

```sh
OPENLENS_R4_03_OUTPUT="$PWD/open-lens/dist-r4-stage/r4-03-certification-20261021-060415" \
  node docs/revival/scripts/verify-r4-03-persistence.cjs
```

Node 20.20.2; Playwright `_electron` inició el ejecutable del `.app` arriba indicado. Se usaron perfiles aislados temporales, kubeconfigs sintéticos y tres API servers en loopback (`127.0.0.1`) con identidades DEV/STG/PROD. No fue un test de renderer dev-server.

| Caso en la app empaquetada | Resultado | Evidencia |
|---|---|---|
| Abrir 3 tabs, reordenar STG/PROD/DEV, foco PROD | **PASS** | `...phase1-active-tabs.png` |
| Cerrar Electron, esperar salida, reabrir el mismo `.app` | **PASS** | `R4_03_GUI_20261021-063550.log` |
| Restaurar orden, workspace `default` y foco lógico PROD | **PASS** | `...phase2-restored-no-autostart.png` |
| Mantener tabs inactivos sin frames ni solicitudes durante restore | **PASS**; 0 solicitudes a los 3 fixtures | log + captura de restore |
| Atrás y adelante después del reinicio | **PASS**; Back seleccionó STG y consultó STG, Forward seleccionó PROD y consultó PROD; DEV no recibió solicitudes cruzadas | `...phase2-history-back-stg.png`, `...phase2-history-forward-prod.png` |
| Activación explícita | **PASS**; clic en DEV inició solicitudes solo contra fixture DEV | `...phase2-explicit-activation.png` |
| Flag clásica apagada | **PASS** | `...phase3-classic-fallback.png` |
| Eliminar PROD del catálogo/fixture | **PARCIAL**; PROD no se restauró y hubo 0 solicitudes, pero snapshot bruto aún retiene tab/historial obsoletos | `...missing-cluster.png`; log reporta `staleReferenceRetainedOnDisk=true` y `staleHistoryRetainedOnDisk=true` |
| Misma etiqueta visible con identidad de clúster distinta | **PASS**; tab viejo descartado, no se redirigió y hubo 0 solicitudes | `...identity-replacement.png` |
| JSON inválido, versión desconocida, IDs duplicados, token/campo sensible | **PASS**; app estable, sin tabs, sin solicitudes ni `pageerror` | `...corrupt-invalid-json.png`, `...corrupt-unknown-version.png`, `...corrupt-duplicate-tabs.png`, `...corrupt-sensitive-field.png` |
| Ruta `javascript:` y campos inesperados (`command`) | **PASS**; no se reprodujo ruta insegura; 0 solicitudes hasta acción explícita; luego solo DEV | `...allowlist-unsafe-path-and-fields.png`, `...allowlist-explicit-activation.png` |
| Escrituras a fixture | **PASS**; cero solicitudes no-GET registradas | JSON final del log GUI |

Prefijo exacto de capturas: `docs/revival/screenshots/r4-03-persistence-2026-10-21T09-23-37-681Z-`. El helper llama `app.quit()`, espera el evento exit y comprueba que el proceso Electron lanzado haya terminado; además, al finalizar no quedó proceso con la ruta de ese `.app` en `ps`. Esto no reemplaza una auditoría integral de procesos descendientes.

Durante el shutdown, los logs muestran las rutas existentes de cierre de port-forwards y shell sessions. La consola del renderer emitió `illegal access` durante el desmontaje de frames en teardown; Playwright no capturó `pageerror`, el shutdown siguió normalmente y el proceso terminó, pero la causa queda sin triage. El snapshot R4-03 no contiene procesos ni comandos y no se observó sesión de herramienta en la vista inicial restaurada. Sin embargo, el `.app` muestra un dock label `Terminal` después de navegar explícitamente al clúster; no se inspeccionaron el árbol OS-level de procesos, PTYs ni stores externos a R4-03. Por eso no se declara probado que ninguna otra capa de persistencia pueda reanudar una sesión. El arranque normal también ejecuta `zsh -l -i` para sincronizar el entorno de shell; no es una sesión restaurada, pero impide afirmar literalmente que el proceso no ejecuta ningún comando.

## Pruebas y análisis estático

Node `v20.20.2`; log reproducible: `docs/revival/logs/R4_03_REGRESSION_20261021-063200.log`.

| Verificación | Resultado |
|---|---:|
| Suites dirigidas de R4-03, workspace, navegación, aislamiento, persistencia, MCP R4-01A y R4-02 | **12 suites / 112 tests PASS** |
| ESLint dirigido a contratos/persistencia/workspace/ClusterView y MCP | **PASS** |
| TypeScript completo de `packages/core`: `npx tsc -p tsconfig.json --noEmit` | **PASS**, exit 0; no se reprodujeron los errores R4-04 reportados anteriormente |
| Sintaxis harness `node --check docs/revival/scripts/verify-r4-03-persistence.cjs` | **PASS** |
| `git diff --check` | **PASS** |
| Suite unitaria completa del paquete / regresión completa R1–R4 | **NOT RUN** |

Las pruebas dirigidas incluyen serialización allowlisted, migración, corrupción, duplicados, campos sensibles, ruta insegura, 1/5/10 tabs, restauración repetida, clúster eliminado, identidad equivocada, cruce DEV/PROD, historial Back/Forward, feature flag y fallback clásico. No se atribuye al test dirigido cobertura de toda la suite ni del runtime de extensiones.

La corrida completa de TypeScript actual pasó. El error previo referido a `src/renderer/components/dock/__test__/r4-04-tools-context.test.tsx` no apareció en esta ejecución; no se hicieron cambios a ese test para conseguir el resultado.

## Estado de criterios y limitaciones

**Aprobado en evidencia actual:** nuevo `.app` ARM64 abierto, cierre y reinicio completos, pestañas/orden/foco restaurados, historial permitido Back/Forward con identidades correctas, activación diferida observable, flag clásica, rechazo de identidad diferente, entradas corruptas fail-closed y 12 suites dirigidas verdes.

**Pendiente; R4-03 continúa PARCIAL:**

1. El tab ausente se excluye de la sesión en memoria, pero su tab e historial obsoletos continúan en el archivo snapshot. Falta purga persistente y prueba de reinicio que confirme el archivo limpio. No se aplicó un `saveNow()` simple porque actualmente reescribe solo el workspace activo y podría descartar otros layouts; el purge persistente debe preservar el snapshot completo.
2. La implementación actual restaura solamente `default`; no se certificó persistencia/restauración de workspaces múltiples.
3. Falta auditoría OS-level de terminales/PTYS, procesos y port-forwards reanudados, además de confirmar que otras rutas de persistencia no rehidraten herramientas.
4. No se ejecutó la suite completa de `packages/core` ni la regresión global R1–R4.
5. El historial no incluye navegación dentro de iframes; R4-03 no restaura sesiones de herramientas, buffers, comandos o procesos.
6. No se verificaron permisos efectivos del archivo ni recuperación ante interrupción/crash durante rename.

**R4-01 y R4-02 permanecen PARCIALES.** No se hizo commit porque persisten criterios de cierre pendientes. No hubo push, release ni deploy.
