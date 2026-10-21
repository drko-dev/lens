# R4-02 — Informe de validación

**Fecha:** 2026-10-20/21  
**Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4` (`feat/r4-workspace-security`)  
**Estado:** **PARCIAL**. La experiencia multipestaña se verificó en la aplicación ARM64 empaquetada con fixtures sintéticos. La suite completa de `packages/core` registró fallos, y no se cierra el hito.

## Alcance y archivos

Se añadieron los módulos `packages/core/src/features/workspace-tabs/{common,renderer}/` (tipos, feature flag, store DI, sincronización con ruta, barra y estilos) y sus pruebas bajo `renderer/__tests__/`. Se integraron `ClusterManager` y su layout; `ClusterFrameHandler` solo incorpora semántica accesible al iframe existente. También se agregó `docs/revival/scripts/verify-r4-02-workspace-tabs.cjs` y capturas bajo `docs/revival/screenshots/`. R4-01 se conserva abierto/parcial.

## Verificaciones con resultado positivo

| Verificación | Resultado |
|---|---|
| R4-02 dirigido: 6 suites / 38 tests (incluye soporte y test CLI-only `--enable-workspace-tabs`) | **PASS** |
| R4-01 MCP, preload piloto y contratos dirigidos: 5 suites / 55 tests | **PASS**; no cierra los gates pendientes de R4-01 |
| TypeScript: `cd packages/core && npx tsc -p tsconfig.json --noEmit` | **PASS**, exit 0 |
| ESLint dirigido: workspace tabs, contratos workspace, `ClusterManager` y `ClusterFrameHandler`, `--max-warnings=0` | **PASS**, exit 0 |
| Build monorepo: `npm run build` | **PASS**, 40 proyectos; aviso no fatal de expresión dinámica de Keyv |
| Empaquetado Electron macOS ARM64 | **PASS**, `.app` contiene binario Mach-O arm64 |
| E2E Playwright con la aplicación empaquetada | **PASS**, `isPackaged=true`, `arch=arm64`; script `node docs/revival/scripts/verify-r4-02-workspace-tabs.cjs` |

La compilación y el empaquetado se realizaron en rutas de salida nuevas y exclusivas de `lens-r4`; no se limpió ni sobrescribió el output anterior. No se accedió al checkout estable ni se tocaron sus binarios R1–R3. La integración se hizo únicamente en el worktree R4, con el shell clásico protegido por el flag apagado por defecto. No se realizaron commits.

No se creó un respaldo fuera de `lens-r4`, para respetar el límite explícito de trabajar exclusivamente en este worktree. Se conservaron los artefactos y cambios existentes; no se ejecutaron operaciones destructivas de Git.

## Aplicación real y fixtures sintéticos

El E2E lanzó el `.app` empaquetado con perfiles temporales. Diez contextos Kubernetes **sintéticos** servidos únicamente en `127.0.0.1` comparten `namespace=default` y `Pod=api`, con UIDs/imágenes diferentes. El kubeconfig temporal apunta solo a esos servidores. Se permitió tráfico GET y SelfSubjectAccess/RulesReview; el fixture responde 405 a otros métodos. No se observaron intentos de escritura. No se configuró clúster real, credencial real o endpoint productivo.

Se comprobó:

- Shell clásico al dejar el flag apagado: sin barra ni offset del área de frames.
- Navegación desde catálogo y hotbar, apertura/enfoque de diez tabs, diez frames asociados a `clusterId` distintos y un renderer de shell.
- Al seleccionar una tab, solo el frame del `clusterId` correspondiente queda visible; el nombre de frame corresponde al contextName del fixture.
- Badges DEV/STG/PROD, advertencia textual/ARIA y tratamiento rojo de PROD.
- Selección por `ArrowRight`, scroll horizontal de tabs y layout a viewport de 900×650; cerrar una tab no elimina el iframe/frame del clúster.
- Las pruebas Jest de aislamiento multi-clúster simulan recursos homónimos; no son por sí mismas un E2E de operaciones Kubernetes reales.

Capturas de esta ejecución:

- [Fallback clásico](screenshots/r4-02-workspace-tabs-2026-10-21T00-07-21-490Z-classic-fallback.png)
- [DEV desde catálogo](screenshots/r4-02-workspace-tabs-2026-10-21T00-07-21-490Z-dev.png)
- [STG desde hotbar](screenshots/r4-02-workspace-tabs-2026-10-21T00-07-21-490Z-stg-hotbar.png)
- [Advertencia PROD](screenshots/r4-02-workspace-tabs-2026-10-21T00-07-21-490Z-prod-warning.png)

La prueba de historial tuvo que volver al catálogo mediante su navegación lateral en un ciclo; por ello, no se certifica aquí back/forward arbitrario entre una serie larga de rutas de clúster. La sincronización de rutas y store tiene cobertura dirigida, pero ese recorrido empaquetado requiere una corrección/validación específica.

## Binario validado

```text
open-lens/dist-r4-stage/r4-02-validation-20261020-workspace-tabs-final/mac-arm64/OpenLens DevOps.app
```

`file` y `lipo -archs` reportaron `Mach-O 64-bit executable arm64` y `arm64`. SHA-256 de `Contents/Resources/app.asar`:

```text
aba8252a845dcec6ff0d2f7d347e4052f0203737f6ec1a4c05cbca69fd79f0ed
```

Es un empaquetado local `electron-builder --dir`; no es una firma/notarización para distribución ni un instalador de release. La suma R3 de documentos anteriores no se volvió a calcular desde el checkout estable en esta actividad.

## Rendimiento: muestras observadas, no benchmark certificado

Se tomaron snapshots únicos del proceso empaquetado 1,25 s después de activación. CPU de procesos renderer individuales no estuvo disponible en `app.getAppMetrics()` y se consigna como no medido. No hay umbrales previos que estas mediciones certifiquen.

| Tabs | Frames | Renderer(s) del shell | App working set | Heap renderer usado | RSS main | CPU main | Cambio tab p50 / p95 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 1 | 771.16 MB | 146.11 MB | 309.73 MB | 10.61% | No medido en este escenario |
| 5 | 5 | 1 | 906.33 MB | 286.01 MB | 238.33 MB | 4.22% | 54 ms / 66 ms (30 muestras) |
| 10 | 10 | 1 | 1299.78 MB | 518.55 MB | 312.69 MB | 1.21% | 99 ms / 461 ms (30 muestras) |

Las muestras fluctúan y no fueron tomadas bajo carga/warmup controlados; el mayor p95 observado con 10 tabs necesita investigación antes de adoptar un presupuesto de rendimiento. El contador de watch de los fixtures fue **0**: no se registraron watch streams, por tanto esta ejecución no mide el número de watchers reales ni demuestra que ocultar/cerrar tabs los detenga. Solicitudes HTTP vistas por fixture (1–10): `246, 230, 228, 227, 221, 213, 213, 208, 208, 205`; endpoints solo loopback; no se observó ninguna escritura aceptada ni intento de escritura.

## Regresión de `packages/core` y cierre

Con Node `v20.20.2`, la reejecución R4 `npm run test:unit -- --runInBand --no-cache --ci --silent --watch=false` terminó **exit 1**: **270 suites** (243 pasaron, 27 fallaron), **2711 tests** (2557 pasaron, 145 fallaron, 9 skipped), **390 snapshots** (255 pasaron, 135 fallaron en 26 suites). Dentro de esa ejecución pasaron los 6 suites/36 tests de `features/workspace-tabs` y el suite de contratos workspace (11 tests).

Se ejecutaron en R3 los mismos 27 paths de suites fallidas, con Node `v20.20.2` y `--no-cache --ci`; el estado Git de R3 antes/después fue idéntico. En los 27 paths, los **145 tests fallidos**, los 135 snapshots y sus resultados `actual`/`expected`/mensajes coinciden con R4 tras normalizar la raíz absoluta del checkout. Se clasifican como heredados; no hubo fallos exclusivos de R4 y no se actualizaron snapshots. El análisis reproducible y la lista exacta de paths está en [`R4_02_REGRESSION_TRIAGE.md`](R4_02_REGRESSION_TRIAGE.md).

El reporte anterior registró 269 suites/2702 tests; la corrida actual `--no-cache` recolectó además una suite aprobada de 9 tests (`features/workspace-tabs/common/__tests__/workspace-history.test.ts`). El JSON anterior no se conservó, por lo que no se puede determinar si la diferencia es por incorporación posterior o recolección previa. Las suites de otros paquetes del monorepo no se ejecutaron.

Gates pendientes:

1. Resolver/priorizar los fallos heredados y obtener `packages/core` verde; ejecutar además las suites relevantes de otros paquetes. El diferencial R3/R4 de los 27 paths está completado, pero no es una regresión global verde.
2. Certificar back/forward profundo y deeplinks en el `.app` empaquetado.
3. Medir lifecycle/teardown de watchers y herramientas con fixtures que generen esos flujos; no inferirlos de frames ocultos.
4. Ejecutar una comparación estable de rendimiento 1/5/10 con warmup, múltiples muestras, CPU por renderer y límites acordados.
5. No implementar ni declarar multi-workspace, persistencia o restauración en R4-02; quedan fuera de esta entrega.

Por estos pendientes, **R4-02 permanece PARCIAL**. R4-01 también continúa **PARCIAL** según su checklist; no se marcaron sus verificaciones restantes como resueltas.
