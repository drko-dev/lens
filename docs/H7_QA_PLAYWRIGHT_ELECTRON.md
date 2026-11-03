# H7 — QA automatizado con Playwright sobre Electron

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Commit probado:** `d252434` (sin cambios de aplicación sin commitear) · **Electron probado:** 45.2.0 (binario de desarrollo `node_modules/electron`, sin empaquetar)

**Resultado:** 21 PASS · 1 FAIL (defecto real del producto, §5) · 0 BLOCKED · 13 NOT IMPLEMENTED (H7.3)

**Actualización H7.2.2:** el defecto D09 se corrigió (`docs/H7_2_2_RESIZE_DIRECTION.md`). Se agregó K01 (Kubetail) y D09 ahora verifica ambas direcciones, el eje vertical y los límites. Suite actual: **23 PASS · 0 FAIL · 13 NOT IMPLEMENTED**.

**Actualización H7.3:** C01–C13 implementados y ejecutados (`docs/H7_3_CONTROLES_Y_REPLEGADO.md`). S01 ejecuta los pasos 7–8. Suite actual: **36 PASS · 0 FAIL · 0 NOT IMPLEMENTED**.

**Actualización H7.4:** se agregan V01–V12, sobre identidad visual del clúster (`docs/H7_4_IDENTIDAD_VISUAL_CLUSTER.md`). La suite respalda y restaura los stores del perfil QA. Suite actual: **48 PASS · 0 FAIL**.

**Actualización H7.5:** se agregan P01–P16, sobre ventanas nativas desacopladas (`docs/H7_5_VENTANAS_DESACOPLADAS.md`). El harness habilita `OPENLENS_DETACHED_TOOLS=1` y la API sintética sirve 1 Pod y 1 Deployment y emite eventos de watch a pedido. Suite actual: **64 PASS · 0 FAIL**.

## 1. Arquitectura del harness

| Archivo | Rol |
|---|---|
| `open-lens/integration/h7-docking-e2e.mjs` | Suite: D01–D16, C01–C13, W01–W05 y S01. Genera reportes JSON/HTML, trazas de los fallos y video |
| `open-lens/integration/h7/harness.mjs` | Arranque del entorno y helpers de interacción real e inspección del layout |
| `open-lens/integration/h7/synthetic-kube-api.mjs` | API Kubernetes sintética de solo lectura. Cuenta los watches **abiertos** separados de los **iniciados** |

- **Control de Electron:** `_electron.launch()` de Playwright 1.42.1 (ya instalado, sin dependencias nuevas), con `cwd: open-lens` y `NODE_ENV=development`. El main hace proxy del renderer al dev server `:9191`: el harness lo reutiliza si ya está corriendo; si no, lo levanta y lo detiene al terminar.
  - Espera la ventana `https://lens.app`, porque la primera ventana es el splash.
  - No se usó `connectOverCDP`.
- **Aislamiento:** `HOME`, `CICD` y `KUBECONFIG` apuntan a `~/Documents/lens/qa-profiles/h7-dev`.
  - Dos clústeres sintéticos: `h7-synthetic` (`:18443`) y `h7-synthetic-b` (`:18444`, contexto agregado al kubeconfig QA; backup en `config.bak-pre-h7qa`).
  - Si un puerto QA está ocupado, el harness se detiene sin tocar el proceso ajeno.
- **API sintética:** responde GET y las consultas de permisos (`selfsubject*reviews`, que llegan por POST). Rechaza con 405 cualquier otra escritura. En esta corrida hubo **0 escrituras**.
- **Interacción real:** los arrastres usan `page.mouse.move/down/up` con trayectoria progresiva (24 pasos). Las coordenadas salen de `boundingBox()` del encabezado arrastrable (`[data-testid^=panel-container-leaf-<kind>-] > [draggable=true]`) y de la zona de destino.
  - Los botones y pestañas se accionan con `locator.click()`, y la cancelación con `page.keyboard.press("Escape")`.
  - No se usa `dispatchEvent` ni se llama a `dockPanel()`.
- **Verificación:** la estructura se lee del DOM renderizado (por ejemplo `H(pods, deployments)` o `tabs[deployments,*pods]`). Además, la geometría real de cada panel (`getBoundingClientRect`) confirma izquierda/derecha y arriba/abajo, y el indicador de destino se lee durante el arrastre.
  - Los watches se leen de los contadores de la API sintética. Es la única verificación programática.
- **Selectores:** solo `data-testid` existentes. No hubo que agregar ninguno ni modificar la UI.
- **Video:** screencast CDP de la ventana principal, que incluye el iframe del clúster ya compuesto, codificado a MP4 con el `ffmpeg` del sistema. Se descartó `recordVideo` porque requiere descargar un ffmpeg propio de Playwright (no instalado); sin él, la app no abría la ventana principal.
- **Trazas:** `tracing` por test, guardadas solo cuando el test falla.

## 2. Ejecución

```bash
cd open-lens
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
node integration/h7-docking-e2e.mjs
```

- Requisitos: los puertos 18443/18444 y el CDP del perfil QA libres, y una sola instancia de Electron.
- La suite deja el flag `openlens:global-docking` en OFF al terminar.
- Variables opcionales: `H7_QA_PROFILE`, `H7_QA_ARTIFACTS`, `H7_CLUSTER_A`.
- Duración: alrededor de 4,5 min. El código de salida es distinto de 0 si hay FAIL o BLOCKED.

## 3. Matriz de resultados

### H7.2 — Docking (16 pruebas: 15 PASS, 1 FAIL)

| ID | Prueba | Entrada | Resultado | Evidencia verificada |
|---|---|---|---|---|
| D01 | Pods a la izquierda | mouse | PASS | `H(pods, deployments)`, Pods a la izquierda por geometría |
| D02 | Pods a la derecha | mouse | PASS | indicador `right`, `H(deployments, pods)` |
| D03 | Pods arriba | mouse | PASS | `V(pods, deployments)`, Pods arriba |
| D04 | Pods abajo | mouse | PASS | `V(deployments, pods)` |
| D05 | Centro → pestañas | mouse | PASS | `tabs[deployments,*pods]`, un solo panel visible |
| D06 | Alternar pestañas | click | PASS | el panel visible cambia con la pestaña |
| D07 | Reordenar pestañas | mouse | PASS | `tabs[*pods,deployments]`, orden visual verificado por x |
| D08 | Extraer pestaña | mouse | PASS | `H(deployments, pods)` |
| D09 | Redimensionar | mouse | **FAIL** → PASS tras H7.2.2 | antes: +200 px a la derecha llevaba Pods de 576 a 230 px. Ahora: 576→778 (+200), 778→480 (−300), límites 80 %/20 %, vertical 393→509→305 |
| K01 | Divisor de Kubetail | mouse | PASS (H7.2.2) | panel izquierdo 665→812→658 px |
| D10 | Cancelar (Escape) | mouse + teclado | PASS | indicador visible durante el drag, layout intacto, sin indicador después |
| D11 | Zona inválida (sidebar) | mouse | PASS | sin indicador, layout intacto |
| D12 | Sobre sí mismo (centro y bordes) | mouse | PASS | sin indicador, layout intacto |
| D13 | Catálogo `+` | click | PASS | con ambos abiertos ofrece `[]`; con Deployments cerrado ofrece `[deployments]`; agregar lo restaura |
| D14 | Cambio de rutas | click (sidebar) | PASS | `V(pods, deployments)` se conserva Pods → Deployments → Overview → Pods |
| D15 | Flag OFF | click (sidebar) | PASS | sin host; listas clásicas de Pods y Deployments |
| D16 | Cambio de clúster | click + mouse | PASS | B arranca en el layout por defecto, `data-cluster-id` = B y su watch va a la API B; A conserva `V(deployments, pods)` |

### H7.3 — Controles y replegado (13 pruebas: NOT IMPLEMENTED)

La suite busca `panel-collapse-button-*` en el host y no lo encuentra. Tampoco existe `docs/H7_3_CONTROLES_Y_REPLEGADO.md` ni código de replegado. C01–C13 quedan como **NOT IMPLEMENTED**: no son PASS ni FAIL del producto. El cierre con × y la reapertura desde el catálogo (C09/C10) ya se ejercitan como parte de D13 y W04.

### H7.2.1 — Watches (5 pruebas: 5 PASS)

| ID | Prueba | Resultado |
|---|---|---|
| W01 | 10 navegaciones Deployments → Overview | PASS: 1 abierto en Deployments y 0 en Overview en los 10 ciclos; iniciados 22→31 |
| W02 | 10 arrastres de Deployments | PASS: abierto siempre 1; iniciados 32→42 |
| W03 | Agrupar y alternar pestañas ×5 | PASS: 0 con la pestaña Pods activa, 1 con Deployments |
| W04 | Cerrar y reabrir el panel | PASS: 0 al cerrar, 1 al reabrir |
| W05 | Suscripción compartida de Pods y crecimiento | PASS: Pods abierto = 1 en las 36 muestras, nunca duplicado; total abierto 4 → 4 |

### Estabilidad (S01: PASS)

Secuencia completa:

1. Abrir Pods y Deployments.
2. Pods a la derecha.
3. Agrupar.
4. Alternar.
5. Extraer Deployments abajo (`V(pods, deployments)`).
6. Redimensionar.
7–8. Replegar y recuperar: **SKIP** (H7.3 no existe).
9. Cerrar Deployments: watch 0.
10. Reabrir desde el catálogo.
11. Ambas vistas renderizan sin error de carga.
12. Watches de Deployments y Pods = 1.
13. **0 errores de consola nuevos.**

El paso 6 solo exige que el divisor cambie los tamaños; la dirección se evalúa en D09.

## 4. Evidencia

> **Desde H7.6.3C la suite ya no escribe en `docs/evidence/`.** Las capturas de cada corrida van a `<H7_QA_ARTIFACTS>/evidence/<grupo>/` (la carpeta de la corrida lleva su marca de tiempo), junto a videos, trazas y `results.json`. Las imágenes versionadas de hitos anteriores quedan intactas. Para documentar un hito se copian a mano a `docs/evidence/<hito>/` solo las capturas representativas. El escenario `QA00` compara `git status` de `docs/evidence` antes y después de la corrida y falla si cambió algún archivo rastreado.

- **En Git** (`docs/evidence/h7-qa/`, JPEG ~1 MB en total): `01-initial-side-by-side`, `d02-right`, `d03-top`, `d05-tabs`, `d13-catalog-offers-deployments`, `d15-flag-off-classic`, `d16-cluster-b`, `s01-final` y `results.json`.
- **Solo local** (`~/Documents/lens/qa-artifacts/h7-playwright/2026-11-02T20-45-26/`, 8,1 MB):
  - `report.html`, `results.json` y `console-errors.json`.
  - PNG de cada estado.
  - `video/h7-qa-run.mp4` (2,2 MB).
  - `traces/D09.zip`, que se abre con `npx playwright show-trace`.

## 5. Errores detectados

1. **Producto, preexistente (H1/H2, `6680af2`):** el divisor de ramas redimensiona al revés.
   - `dynamic-layout-renderer.tsx` usa `ResizingAnchor` con el `placement` por defecto (`LEADING`), cuya dirección de crecimiento es inversa, mientras la medida que se pasa es la del primer hijo.
   - Al arrastrar a la derecha, el panel izquierdo se achica. Afecta también al layout de Kubetail.
   - **Corregido en H7.2.2** con `growthDirection`. La hipótesis inicial de usar `placement` era incorrecta: `placement` solo afecta el CSS.
   - En H7.2 se había reportado "Resize 50 % → 63,9 %" con eventos sintéticos, sin verificar la dirección.
2. **Harness, corregidos durante el desarrollo** (no son del producto):
   - La API sintética respondía `[null]` a la lista de namespaces.
   - La API sintética rechazaba los POST de consultas de permisos.
   - El selector del catálogo hacía clic en la tarjeta en lugar de "Agregar Panel".
   - El locator de la zona inválida no tenía caja visible.
   - La verificación de vista de S01 era demasiado estricta.
   - Había una carrera en el grabador de video.
3. **Consola:** 42 errores, todos del websocket HMR de `webpack-dev-server`, propios del modo dev. Ninguno nuevo durante S01.

## 6. Recursos

- Disco: 29 GiB libres al iniciar y 28 GiB al cerrar.
- Swap: 4,9 → 6,0 GiB.
- RAM: 50 % libre.
- Una sola instancia de Electron por corrida. Sin builds, sin DMG ni ZIP.
- Al terminar no quedan Electron ni mocks, y los puertos 18443/18444 quedan libres. El dev server `:9191` ya estaba corriendo, así que se reutilizó y se dejó como estaba.
- Antes de empezar se cerró, con autorización del usuario, un entorno QA de otra sesión que usaba el mismo perfil (Electron y mock `:18443`).

## 7. Limitaciones de cobertura

- Playwright intercepta el drag HTML5 a nivel CDP. Los eventos `dragstart/dragover/drop` llegan al renderer real y se ve el indicador, pero el cursor de arrastre del sistema operativo no se ejercita.
- El cuadro de diálogo nativo, el multimonitor y las ventanas separadas no forman parte del alcance.
- La API sintética no tiene objetos: las vistas muestran "0 items". Las pruebas verifican montaje, LIST y watch, no la representación de datos.
- H7.3 no está implementado (C01–C13 y los pasos 7–8 de S01).
