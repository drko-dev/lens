# OpenLens DevOps Revival — R7-04 Validación final

**Hito:** R7-04 — Almacenamiento Moderno: VolumeSnapshots CSI y Expansión de PVCs
**Fecha:** 2026-10-23
**Rama / base:** `feat/r7-devops-capabilities` / `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` (R7-03)
**Estado:** **Las validaciones específicas de R7-04 y la regresión dirigida pasan, tras aplicar las correcciones del review gate R7-04 (hallazgos 1–7) y los 4 residuales de la segunda auditoría (§8). El gate global no está aprobado:** la suite global de core y el ESLint global de core mantienen el estado documentado en R7-03 y **no se etiqueta ningún fallo global como regresión de este hito**. Sin commit, sin push: se requiere autorización final del usuario.

## 1. TypeScript

| Paquete | Comando | Resultado |
|---|---|---|
| `packages/core` | `npx tsc --noEmit -p tsconfig.json` | PASS |
| `packages/kube-object` | `npx tsc --noEmit -p tsconfig.json` | PASS |

## 2. ESLint

- ESLint con `--max-warnings=0` sobre **los archivos R7-04 modificados** (rutas de snapshot, APIs `volume-snapshot*`, componentes `storage-volume-{snapshots,snapshot-classes,snapshot-contents}`, `storage-volume-claims/{create-snapshot,expand-pvc}`, `volume-claim-menu`, `pvc-expansion-capability.injectable.ts`, `events/store.ts`): **PASS, 0 errores / 0 warnings**. Log: `docs/revival/logs/R7_04_CORRECTIONS_DIRECTED_LINT_20261023.log`.
- `npm run lint --workspace @openlens/kube-object -- --max-warnings=0`: **PASS**. Log: `docs/revival/logs/R7_04_CORRECTIONS_KUBE_OBJECT_LINT_20261023.log`.
- `npm run lint --workspace @openlens/core -- --max-warnings=0`: **FAIL** con **298 errores y 14 warnings**, idéntico al baseline R7-03 (`R7_03_VALIDATION.md` §2). Correspondencia ejecutada: el inventario de hallazgos de R7-03 no incluye paths de R7-04; el log completo es `docs/revival/logs/R7_04_FINAL_CORE_LINT_20261023.log` (ejecutado con la implementación pre-corrección; el conteo se re-verificará en el cierre si el usuario autoriza).

## 3. Jest — alcance R7-04

```bash
cd packages/core
npx jest --testPathPattern "storage-volume-claims|volume-snapshot" --no-coverage
```

**PASS — 5 suites, 58 tests** (tras las correcciones del review gate y los 4 residuales de la segunda auditoría): `expand-pvc.test.ts` (aritmética BigInt exacta: binarias/decimales SI, notación exponente, techo int64, fracciones no exactas, límites de longitud/magnitud del exponente; patch con precondiciones y fail-safe; fases de expansión), `expand-pvc/dialog.test.tsx` (invalidación de dry-run al cambiar el tamaño; PATCH real solo si el `resourceVersion` coincide con el aprobado en el dry-run — un cambio de rv invalida la aprobación, vuelve al formulario y exige nuevo dry-run; aborto con cero PATCH reales si el clúster cambia o el contexto PROD cambia durante el GET diferido del StorageClass; aborto si el PVC se elimina o el StorageClass dejó de permitir expansión), `create-snapshot.test.ts` (nombres DNS, manifest con source en mismo namespace, clasificación de fase Pending/Unknown), `create-snapshot/dialog.test.tsx` (dry-run sin create real; invalidación al cambiar el formulario; aborto si cambió el UID del PVC; relectura antes del POST real) y `volume-claim-menu.test.tsx` (acción de snapshot oculta/mostrada por API por clúster; Expand deshabilitado mientras la capacidad no está confirmada, ante `denied`/`forbidden` 403, fase `Pending`, fase `Lost` o fase ausente — desconocido ≠ `Bound` —; clic sin mutación). Logs: `docs/revival/logs/R7_04_RESIDUAL_TARGETED_JEST_20261023.log`.

## 3b. Jest — `packages/kube-object`

```bash
cd packages/kube-object
npx jest --coverage=false --runInBand src/specifics
```

**PASS — 350 tests**, incluido el modelo `VolumeSnapshotContent` al esquema real con 5 pruebas propias (`volume-snapshot-content.test.ts`). Logs: `docs/revival/logs/R7_04_CORRECTIONS_KUBE_OBJECT_JEST_20261023.log`.

## 4. Jest — regresión dirigida R7-02/R7-03

```bash
cd packages/core
npx jest --runInBand --coverage=false \
  src/common/k8s-api/kube-api-dry-run.test.ts \
  src/renderer/components/dock/edit-resource \
  src/renderer/components/workloads-deployments \
  src/renderer/components/storage-volume-claims
```

**PASS — 26 suites, 258 tests** (tras las correcciones del review gate). Incluye la infraestructura `dryRun=All` de R7-02, la validación de borradores del editor y todo el control de rollouts de R7-03, más el almacenamiento de R7-04 con sus diálogos corregidos. Logs: `docs/revival/logs/R7_04_REGRESSION_JEST_20261023.log` (pre-corrección) y `docs/revival/logs/R7_04_CORRECTIONS_REGRESSION_JEST_20261023.log` (post-corrección).

Re-ejecutada tras los 4 residuales de la segunda auditoría (workloads-deployments + edit-resource-model + storage-volume-claims): **PASS — 24 suites, 245 tests**. Log: `docs/revival/logs/R7_04_RESIDUAL_REGRESSION_20261023.log`.

## 5. Suite completa de core

**No se re-ejecutó en R7-04.** El último inventario global disponible es el de R7-03 (`R7_03_VALIDATION.md` §4: 54 suites fallidas / 286 pasadas; sin suites de los componentes R7-03 entre las fallidas). Ninguna de las suites fallidas de ese inventario corresponde a paths R7-04. La decisión de ejecutar (o no) una nueva pasada global queda para el gate de certificación (R7-09); aquí no se afirma que los fallos globales estén resueltos ni que sean preexistentes de este hito.

## 6. Build experimental y E2E vigente

Espacio comprobado antes de empaquetar: **9 GiB libres** al iniciar la etapa de correcciones y **~7.9 GiB** al cerrar (stage total de 639 MiB).

- Stage: `open-lens/dist-r7-04-stage/mac-arm64/OpenLens DevOps.app` — **639 MiB**; `app.asar` **~306 MiB**.
- Build Core, Webpack y empaquetado ARM64: PASS **dos veces**: implementación inicial (`R7_04_FINAL_CORE_BUILD_20261023.log`, `R7_04_FINAL_WEBPACK_20261023.log`, `R7_04_FINAL_PACKAGING_20261023.log`) y después de aplicar las correcciones del review gate (`R7_04_CORRECTIONS_CORE_BUILD_20261024.log`, `R7_04_CORRECTIONS_PACKAGING_20261024.log`; la etapa `dist-r7-04-stage` se refrescó in-place, sin crear etapas extra).
- Una sola build experimental **stage** renueva el resultado; el E2E post-correcciones se ejecutó contra la build refrescada.

**Playwright R7-04 (post-correcciones):** PASS, **14/14 checkpoints**, contra esa build, con el fixture `VolumeSnapshotContent` actualizado al esquema real (spec-level `driver`/`deletionPolicy`/`source`/`volumeSnapshotRef`). Reporte y capturas vigentes: `docs/revival/evidence/r7-04/r7-04-verification-report.json` (timestamp 2026-10-24T00:49:52Z) y capturas 01–13; log `docs/revival/logs/R7_04_CORRECTIONS_E2E_20261024.log` (ronda previa: `R7_04_FINAL_E2E_20261023.log`).

Cubre: catálogo, lista de PVCs en DEV, expansión de PVC con dry-run + PATCH real, creación de VolumeSnapshot con dry-run + POST real, sidebar y listas de snapshots/classes/contents con CSI, drawer de snapshot, PROD con guardia previa y PATCH real solo tras confirmación con exactamente un dry-run, y ocultamiento completo de snapshots en un clúster Legacy sin `snapshot.storage.k8s.io/v1`. Se usaron únicamente fixtures HTTP sintéticos en `127.0.0.1`; no se operó ningún clúster real ni se instaló CRD/driver CSI. Mutaciones observadas en el reporte: 1 dry-run PATCH precede al PATCH real de expansión en DEV, 1 dry-run POST precede al POST real de snapshot en DEV y 1 dry-run PATCH precede al único PATCH real de PROD (3 `dryRun:true` en total); el resto son llamadas GET de discovery/autorización.

- Los gates globales (Jest completo y ESLint completo de core) **siguen fallidos con el inventario de R7-03**; no se afirma resolución.
- R7-04 **no está globalmente certificado**; `R7_04_VERIFICATION.json` marca `localCheckpointAuthorized: false`: queda pendiente de la autorización final del usuario, sin commit ni push.
- Los fixtures E2E y las capturas no contienen datos reales de clústeres ni credenciales.

## 8. Segunda auditoría — residuales (2026-10-24)

Cierre de los 4 puntos residuales; todos los veredictos con validación real de esta sesión y sin commit.

1. **Contexto entre el GET del StorageClass y el PATCH real** (`expand-pvc/dialog.tsx`): después de `await storageClassApi.get(...)` se re-verifica generación de operación, cluster identificador, solicitud vigente, paso `executing`, puerta de aprobación y contexto PROD (`canExecute()`); cualquier cambio → aborto sin PATCH. Tests nuevos: GET diferido + cambio de clúster durante la espera (0 PATCH) y GET diferido + contexto PROD activado durante la espera (0 PATCH, error visible). Prueba: `R7_04_RESIDUAL_TARGETED_JEST_20261023.log`.
2. **Huella ligada al `resourceVersion`**: la huella aprobada ahora es `{operation:"expand-pvc", uid, resourceVersion, size, storageClassName}` del PVC observado en el dry-run; si el PVC cambia entre dry-run y ejecución (`resourceVersion` distinto), la aprobación se invalida, se vuelve al formulario con error visible y se exige un nuevo dry-run (el PATCH real nunca se construye con una versión nueva bajo una autorización anterior). Test reescrito: el caso que aceptaba dry-run en rv 10 y PATCH real en rv 120 ahora exige invalidación + nuevo dry-run con rv 120; caso positivo: el PATCH real viaja con el mismo rv 10 aprobado. Prueba: mismos logs; `expand-pvc.test.ts` mantiene las precondiciones obligatorias de uid/rv en el patch.
3. **Bound estricto en el menú** (`volume-claim-menu.tsx`): Expand PVC solo con `status.phase === "Bound"` exacto (una fase ausente/Pending/Lost/Terminating queda deshabilitada); se conserva la consulta por clúster del StorageClass y la separación denied/unknown/forbidden/unreachable. Tests nuevos: fase ausente y fase `Lost` con StorageClass `allowed` → deshabilitado. Prueba: 10/10 en `volume-claim-menu.test.tsx`.
4. **Límites del parser** (`expand-pvc/expand-pvc.ts`): longitud máxima 64 caracteres y magnitud de exponente `|exp| ≤ 32` (lo que ya excede el techo int64 es imposible representarlo); entradas como `1e999999999999` se rechazan suavemente sin excepciones; las cantidades normales siguen válidas (`1e3`, `1.5Gi`, sufijos binarios y decimales). Tests nuevos cubren exponente bomba, exponente fuera de rango, cadena de 65+ caracteres y una cadena de 64 caracteres válida.

**Validación de los residuales:** jest `storage-volume-claims` 5 suites/58 tests PASS; regresión 24 suites/245 tests PASS; `tsc --noEmit` core **y** kube-object 0 errores (`R7_04_RESIDUAL_TSC_CORE_20261023.log`); ESLint dirigido `--max-warnings=0` 0/0 (`R7_04_RESIDUAL_DIRECTED_LINT_20261023.log`); `git diff --check` limpio. **No se generó otra build** (sin cambios de interfaz; el flujo E2E vigente es compatible: el fixture no muta el PVC en el PATCH de dry-run, así que la huella con resourceVersion sigue aprobando el flujo 14/14 documentado en §6).

## 9. Historia y disposición


- Los gates globales (Jest completo y ESLint completo de core) **siguen fallidos con el inventario de R7-03**; no se afirma resolución.
- R7-04 **no está globalmente certificado**; `R7_04_VERIFICATION.json` marca `localCheckpointAuthorized: false`: queda pendiente de la autorización final del usuario, sin commit ni push.
- Los fixtures E2E y las capturas no contienen datos reales de clústeres ni credenciales.
