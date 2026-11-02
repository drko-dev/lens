# H7.4 — Identidad visual por clúster en el docking global

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Base:** `74a0a64` · **Estado:** PASS (Electron DEV 45.2.0, suite Playwright H7: 48/48)

## 1. Modelo de identidad reutilizado (sin segunda fuente de verdad)

| Dato | Fuente | Escriben | Leen en el host |
|---|---|---|---|
| Color | `ClusterPreferences.clusterColor`; el campo legado `icon` se usa solo si es un color plano | Settings y el diálogo del hotbar (mismo `ClusterAppearancePicker.setColor`) | `getConfiguredClusterColor(preferences)` |
| Entorno | `ClusterPreferences.clusterEnvironment` (+ `customEnvironmentName`) | Ídem (`setEnvironment`) | `resolveClusterEnvironment({ preferences })` |
| Nombre | `clusterAlias`, luego `clusterName`, luego `contextName` | Ídem | `resolvePanelClusterIdentity` |

- Color y entorno son **campos distintos**. Main los proyecta a `entity.spec.icon.background` y `entity.spec.environment` (`update-entity-spec.injectable.ts`).
- El entorno **nunca** se deduce del nombre (`environment-types.ts`). Un test lo verifica con `clusterName: "prod-payments"`.
- En el frame del clúster, `getClusterById(store.clusterId)` devuelve el `Cluster` observable. Main reenvía cada cambio del store a todos los frames, y `updateModel` actualiza `preferences`. Por eso el host es reactivo sin suscripciones propias.
- `getConfiguredClusterColor` se extrajo de la lógica que ya tenía `ClusterAppearancePicker` (`currentColor`), que ahora la reutiliza. No hay lógica duplicada.
- Sin color configurado, se usa el color del entorno (`var(--envX, default)`). Sin entorno, un neutro del tema (`var(--textColorTertiary)`). No hay colores por nombre ni por panel.

## 2. Menú contextual «Change Color, Icon & Environment...»

- **Reproducción en Electron DEV:** pin del clúster A → clic derecho → «Change Color, Icon & Environment...». El diálogo **no se abre** (`DIALOG_AFTER_MENU_CLICK=0`, con un build sin el arreglo).
- **Causa raíz:** en `hotbar-entity-icon.tsx`, la clase `NonInjectedHotbarEntityIcon` declara `@observable isAppearanceDialogOpen`, pero no llama a `makeObservable(this)`. Con MobX 6 y `useDefineForClassFields: true`, el decorador no surte efecto: el campo es una propiedad común.
  - Al asignarle `true` no se vuelve a renderizar nada, y el diálogo solo aparecía si otro observable forzaba un render por casualidad.
  - Lo mismo pasaba al cerrarlo.
- **Dónde fallaba:** en la notificación reactiva. La escritura y la lectura estaban bien, porque Settings y el diálogo usan el mismo `ClusterAppearancePicker`.
- **Corrección mínima:** un constructor con `makeObservable(this)`.
- **Prueba:** `hotbar-entity-icon.test.tsx`, «opens the appearance dialog…». Falló antes del arreglo (no encontraba el título del diálogo) y pasa después. En Electron, V07 abre el diálogo, cambia a Indigo y los paneles se actualizan.
- **Persistencia:** el cambio se guarda en `lens-cluster-store.json` igual que desde Settings. V08 recarga el frame y conserva el color.

## 3. Identidad visual en el host

- **Línea de 2 px:** `box-shadow: inset 0 2px 0 var(--panel-accent)` (`.clusterAccent`). Al ser inset, no cambia la altura de 28 px. Aparece en:
  - encabezados compactos;
  - pestañas agrupadas;
  - fichas de la banda de recuperación.
- **Texto accesible:**
  - un texto oculto visualmente con `Cluster <nombre>`;
  - `title` del encabezado con `Cluster <nombre> · <entorno>`;
  - `title` de cada ficha con `(cluster <nombre>)`;
  - `data-cluster-id` y `data-production` en el encabezado.
- **Entorno:** se reutiliza `EnvironmentBadge`, el mismo de la sidebar y la barra de workspace. Solo se muestra si hay un entorno configurado. PROD lleva el ícono `warning`, el texto `PROD` y `aria-label="Environment: Production"`, así que no depende solo del color.
- **Sin remounts:** el color llega por contexto (`PanelAccentContext`) y estilos. Las vistas Kubernetes no se vuelven a montar ni abren watches (V12 y el test unitario «without re-mounting»).
- **Diferencia con el drop de H7.2:** el indicador de drop es un rectángulo azul translúcido superpuesto. El acento es una línea de 2 px dentro del encabezado.
- **Sin cambios en el tema grafito:** solo se usan variables existentes, más la variable local `--panel-accent`.
- **Aislamiento:** cada host lee solo `store.clusterId`. Cambiar el clúster A no afecta al B (V09 y el test unitario). El docking entre clústeres sigue rechazado por `dockPanel` (sin cambios).

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `renderer/components/hotbar/hotbar-entity-icon.tsx` | `makeObservable(this)` (arreglo del menú contextual) |
| `common/cluster/environment-types.ts` | `getConfiguredClusterColor` (extraído del picker) |
| `renderer/components/cluster-settings/cluster-appearance-picker.tsx` | Usa `getConfiguredClusterColor` |
| `features/global-docking/renderer/panel-cluster-identity.ts` | Nuevo: `resolvePanelClusterIdentity`, `NEUTRAL_PANEL_ACCENT` |
| `features/global-docking/renderer/global-panel-host.tsx` | Resuelve la identidad, la pasa por contexto y la aplica a las fichas |
| `renderer/components/split-panel/panel-container.tsx` | `PanelAccent`, `accentStyle`, acento, badge y texto accesible en el encabezado |
| `renderer/components/split-panel/dynamic-layout-renderer.tsx` | `PanelAccentContext`; acento en hojas y pestañas |
| `renderer/components/split-panel/split-panel.module.scss` | `.clusterAccent`, `.visuallyHidden` |
| Tests | `cluster-identity-h7-4.test.tsx` (8), `environment-types.test.ts` (+1), `hotbar-entity-icon.test.tsx` (+1) |
| `open-lens/integration/h7-docking-e2e.mjs` | V01–V12; copia y restaura los stores del perfil QA |

## 5. Pruebas unitarias

- Suites `global-docking`, `split-panel`, `hotbar`, `common/cluster` y `cluster-settings`: **26 suites, 218/218**. Incluyen Kubetail, el picker y la sidebar.
- RED antes del arreglo: el menú contextual y el host (módulo inexistente).
- TypeScript: sin errores nuevos en los archivos tocados.
- Lint: los archivos nuevos quedan limpios. `panel-container.tsx` y `dynamic-layout-renderer.tsx` mantienen la misma cantidad de errores que en `HEAD` (2 y 39).

## 6. Playwright sobre Electron DEV

Corrida final `2026-11-02T22-50-03`: **48 PASS · 0 FAIL · 0 SKIP · 0 BLOCKED · 0 NOT IMPLEMENTED**. La API sintética registró 0 escrituras.

| ID | Escenario | Entrada | Resultado |
|---|---|---|---|
| V01 | Panel normal | DOM y geometría | PASS: inset de 2 px, neutro `rgb(133,139,146)` sin color configurado, 28 px, `data-cluster-id` = A, distinto del drop preview |
| V02 | Mismo clúster | DOM | PASS: 2 encabezados en Teal |
| V03 | Agrupar como pestañas | mouse | PASS: `tabs[deployments,*pods]` con ambas pestañas en Teal |
| V04 | Replegar | clic | PASS: ficha en Teal, título "Restore Pods Overview (cluster h7-synthetic)" |
| V05 | Restaurar | clic | PASS: identidad y `clusterId` conservados |
| V06 | Color desde Settings | sidebar → Settings → muestra Teal → Escape | PASS: `rgb(20,184,166)` sin reiniciar |
| V07 | Color desde el menú contextual | clic derecho en el pin → diálogo → Indigo | PASS: pestañas, encabezados y ficha en Indigo |
| V08 | Recarga | recargar el frame | PASS: se conserva Pink |
| V09 | Clúster A no afecta a B | pestaña del workspace | PASS: B sigue neutro, `clusterId` = B |
| V10 | PROD sintético (B) | Settings → Production | PASS: "PROD" con `aria-label="Environment: Production"`, `data-production=true`, 28 px; A sin etiqueta |
| V11 | Flag OFF | sidebar | PASS: 0 hosts, 0 encabezados globales |
| V12 | Color con paneles abiertos | diálogo → Pink | PASS: las 4 vistas conservan su nodo DOM; Deployments started 40→40 y open 1→1; Pods started 24→24 |

**Regresión:**
- D01–D16: 16/16.
- K01: PASS (665 → 812 → 660 px).
- C01–C13: 13/13 (C13 sigue en 28 px).
- W01–W05: 5/5 (Pods open = 1 en 36 muestras; total 4 → 4).
- S01: PASS, 0 errores de consola nuevos. Los 68 errores totales provienen del websocket HMR del dev server.

**Corridas anteriores** (fallas del test, no del producto):
1. 16 FAIL en cascada: Settings cubre las pestañas del workspace y el test no lo cerraba. Se agregó Escape.
2. V07: intentaba arrastrar una pestaña oculta. V10: no contemplaba la ligadura del ícono `warning` en el texto. V12 y V08 fallaron en cascada.
3. V12 esperaba 2 nodos `.KubeObjectListLayout`, pero hay 4 (2 por panel). Todos conservaron el marcador.

**Reproducción del defecto del menú:** con un build sin el arreglo, el diálogo no se abre (`DIALOG_AFTER_MENU_CLICK=0`). Con el arreglo sí se abre (V07).

## 7. Evidencia

- **En Git** (`docs/evidence/h7-4/`, 1,3 MB):
  - `v01-neutral-accent`, `v03-tabs-teal`, `v04-collapsed-band-teal`, `v06-settings-teal`;
  - `v07-hotbar-dialog`, `v07-indigo-collapsed`;
  - `v09-cluster-b-unchanged`, `v10-prod-cluster-b`;
  - `settings-teal`, `settings-production`.
- **Solo local** (`~/Documents/lens/qa-artifacts/h7-playwright/2026-11-02T22-50-03/`, 9,4 MB): `report.html`, `results.json` y `video/h7-qa-run.mp4` (3,8 MB, no versionado).
- **Perfil QA:** la suite copia `lens-cluster-store.json` y `lens-hotbar-store.json` antes de abrir Electron y los restaura al cerrar. Tras la corrida, las preferencias de los clústeres sintéticos vuelven a `{}`.

## 8. Recursos

- Tres builds de `lens-app-renderer` (17–27 s; pico de 1,26 GB), siempre con los mismos 42 errores de tipos preexistentes. Uno de ellos fue sin el arreglo, para reproducir el defecto.
- Corridas en Electron: cuatro de la suite completa y tres sondas cortas de navegación y reproducción. Siempre una sola instancia.
- Disco: 25–28 GiB libres. Swap: ~7,8 GiB de 9 GiB.
- Sin DMG, ZIP ni paquetes. No quedan Electron ni mocks en ejecución. El dev server `:9191` preexistente se reutilizó.

## 9. Pendientes y limitaciones

- El color del docking sigue `preferences.clusterColor`, igual que la barra de workspace. El hotbar y la sidebar leen primero `entity.spec.icon.background`. Main los mantiene sincronizados, pero son dos rutas de lectura preexistentes.
- `setColor` del picker también escribe `preferences.icon`, por lo que borra un ícono subido (`data:`). Es un comportamiento preexistente y no se tocó.
- El diálogo del hotbar usa el `Dialog` existente. Su fondo transparente sobre el contenido es el estilo actual y no se modificó.
- La señal PROD es solo visual: no sustituye ni modifica RBAC ni las confirmaciones existentes.
- El layout global sigue sin persistir: corresponde a H7.7. El color sí persiste, porque pertenece al clúster.
