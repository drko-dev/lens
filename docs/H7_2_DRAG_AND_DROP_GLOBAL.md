# H7.2 — Drag & drop en el host global

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Estado:** PASS (DEV, flag OFF por defecto) con un hallazgo preexistente documentado (§6)

## 1. Cambios

| Archivo | Cambio |
|---|---|
| `packages/core/src/renderer/components/split-panel/split-panel-store.ts` | `dockLeafInTree`, `getDockOrientation`, `DockPosition` (operaciones puras del árbol); `PanelPolicy` opcional; `canAddPanelKind`; guard en `addPanel`; nuevo `dockPanel(source, target, position, sourceClusterId)` |
| `.../split-panel/panel-catalog-modal.tsx` | Prop opcional `isKindAllowed`; sin ella (Kubetail) muestra el catálogo completo como antes |
| `packages/core/src/features/global-docking/renderer/global-panel-store.ts` | `globalPanelPolicy`: solo `pods` y `deployments`, una instancia de cada uno |
| `.../global-panel-host.tsx` (+ `.module.scss`) | Drag por encabezado, indicador de destino, drop en fase de captura, catálogo filtrado |
| `.../drop-zones.ts` | Geometría pura: zona del puntero → posición, y área de vista previa |
| Tests | `split-panel-docking.test.ts` (18), `drop-zones.test.ts` (6), `global-panel-store.test.ts` (+4) |

Sin cambios en `movePanel`, `DynamicLayoutRenderer`, `PanelContainer`, Kubetail ni en las plantillas globales.

## 2. Decisiones técnicas

- **Corrección del catálogo (riesgo de H7.1):** la restricción vive en el store (`addPanel` rechaza tipos fuera de la política) y en la UI (el modal oculta lo no permitido). En H7.1 el `+` del host no hacía nada porque el modal solo existía en el layout de Kubetail; ahora el host lo renderiza filtrado.
- **Operación nueva en vez de modificar `movePanel`:** `movePanel` pierde el panel de origen cuando el destino de una división está dentro de un grupo (`splitLeafInTree` solo divide hojas sueltas) y solo inserta a derecha/abajo. Kubetail sigue usando `movePanel` sin cambios; el host usa `dockPanel`.
- **Ubicación:** las funciones de docking están en `split-panel-store.ts`, junto a los demás helpers del árbol. Un módulo separado generaba una dependencia circular, que el build del repo prohíbe.
- **Orientación verificada en el renderer:** `.branchHorizontal { flex-direction: row }` → izquierda/derecha; `.branchVertical { flex-direction: column }` → arriba/abajo.
- **Drop en captura:** el host intercepta `drop` en fase de captura y detiene la propagación, así el `onDrop` de `PanelContainer` (agrupar vía `movePanel`) no se ejecuta dentro del host.

## 3. Operaciones del árbol (`dockLeafInTree`)

| Posición | Resultado |
|---|---|
| `left` / `right` | Rama `horizontal`; el origen va como `first` (left) o `second` (right) |
| `top` / `bottom` | Rama `vertical`; el origen va como `first` (top) o `second` (bottom) |
| `center` | Agrupa como pestañas con el origen activo; si origen y destino están en el mismo grupo, reordena el origen antes del destino |

- El "contenedor" de una división es el grupo que contiene al destino, si existe; si no, la hoja destino. Dividir junto a una pestaña ubica el panel al lado del grupo entero.
- Lado sobre el propio panel activo de un grupo con otras pestañas → lo extrae junto a su grupo (solo la pestaña activa está renderizada, así que es el único destino posible).
- Compactación: al quitar el origen, las ramas con un solo hijo y los grupos de una pestaña colapsan (`removeLeafFromTree`).
- **Inválido → `undefined` y layout intacto:** sobre sí mismo (fuera de un grupo), origen o destino inexistente, ids que no son hojas, único panel, resultado con la misma forma visible (no-op), o cualquier resultado cuyo conjunto de hojas no sea exactamente el mismo (cada hoja una vez).
- `dockPanel` además rechaza un `sourceClusterId` distinto del `clusterId` del store.

## 4. Cómo funciona el drag

1. `dragstart` en el encabezado (`PanelContainer`, ya `draggable`) escribe `application/openlens-panel-id`; el host agrega `application/openlens-panel-cluster`.
2. `dragover` (captura): se resuelve el destino bajo el puntero (pestaña → `center`; panel → la zona es su grupo si lo tiene). El cuarto exterior de cada lado = ese lado; el interior = `center`.
3. Se muestra **un único** indicador (borde de 1 px `--blue`, relleno 12 %) solo si `dockLeafInTree` acepta el movimiento.
4. `drop` (captura) → `store.dockPanel(...)`; `dragend` o salir del host → el indicador desaparece. Cancelar con Esc deja el layout intacto.

## 5. Pruebas

### Unitarias (Jest, `--runInBand`, secuenciales)

| Suite | Resultado |
|---|---|
| `split-panel-docking.test.ts` — 4 lados, centro, reordenar, grupo como destino, extraer de su grupo, compactación, 7 inválidos/no-op | PASS 18/18 (RED observado antes de implementar) |
| `global-panel-store.test.ts` — dock, cluster ajeno, catálogo restringido, `addPanel` rechazado | PASS 13/13 |
| `drop-zones.test.ts` | PASS 6/6 |
| Las 10 suites existentes de `split-panel` (Kubetail, H2–H5, persistencia, seguridad) | PASS |
| **Total** `src/features/global-docking` + `src/renderer/components/split-panel` | **121/121 PASS** |
| `tsc --noEmit` (core) | 42 errores, los mismos preexistentes; 0 en archivos de H7.2 |

### Electron DEV (perfil aislado, API sintética, eventos de drag despachados por CDP)

| Prueba | Resultado |
|---|---|
| Pods → derecha / arriba / abajo / izquierda de Deployments | PASS: `H(dep,pods)`, `V(pods,dep)`, `V(dep,pods)`, `H(pods,dep)` |
| Pods → centro de Deployments | PASS: `tabs[deployments,*pods]` |
| Cambiar de pestaña | PASS |
| Reordenar soltando sobre una pestaña | PASS: `tabs[*pods,deployments]` |
| Extraer una pestaña al lado derecho de su grupo | PASS: `H(deployments,pods)` (falló en la primera corrida; corregido, ver §3) |
| Cancelar (dragend sin drop) | PASS: indicador visible durante el drag, layout sin cambios |
| Inválido (sobre sí mismo) y no-op | PASS: sin indicador, sin cambios (el no-op mostraba indicador en la primera corrida; corregido) |
| Resize del divisor | PASS: 50 % → 63,9 % |
| Catálogo `+` | PASS: con ambos abiertos no ofrece nada; cerrando Pods ofrece solo Pods; agregarlo funciona |
| Drop con cluster ajeno | PASS: rechazado, layout sin cambios |
| `clusterId` del host | PASS: siempre el del frame |
| Flag OFF | PASS: Pods y Deployments clásicos, sin host |

Limitación de la prueba: los eventos `DragEvent` se despacharon por CDP con un `DataTransfer` real, no con el mouse físico. El arrastre manual con el mouse queda **PENDING** para la QA visual del usuario.

Capturas: `docs/evidence/h7-2/h7-2-initial-side-by-side.png`, `h7-2-drop-preview-bottom.png` (indicador durante el drag), `h7-2-tabs-grouped.png`.

## 6. Mounts y watchers

- **Mover un panel o cambiar de pestaña desmonta y vuelve a montar la vista** (verificado con un marcador en la raíz de cada vista). El árbol es inmutable y React reconcilia por estructura; las pestañas inactivas no se renderizan. Conservar la instancia requiere un rediseño del renderer (portales/keep-alive), así que en H7.2 no se hizo.
- No hay dos instancias del mismo panel: la política impide duplicados, y en cada estado medido hubo 1 vista por tipo.
- **Hallazgo preexistente (no causado por H7.2):** el mock contó las conexiones watch abiertas. Cada montaje de Deployments abre un watch nuevo y el anterior no se cierra hacia la API (20 conexiones del proxy de Lens abiertas al final). Pasa igual en **modo clásico RC3**: dos visitas a Deployments, +2 watches abiertos. En el host, 5 movimientos dieron +4. Cada movimiento cuesta lo mismo que un cambio de ruta clásico, pero el drag lo hace más frecuente. Investigarlo aparte (cierre del watch upstream en el proxy) antes de usar el host global con clústeres reales.

## 7. Recursos

- Disco: 19,89 GiB al iniciar (código y tests); 32,23 GiB antes de Electron (espacio liberado por el usuario); 23,87 GiB al cerrar.
- Swap: de 5 a **12 GiB** durante la sesión de Electron, y no se liberó al cerrar. Explica casi toda la caída de disco.
- RAM: 67 % libre al cerrar. Procesos DEV: Electron + dev server + core watch + mock.
- Al cerrar: 0 procesos, puertos 9191/9223/9229/18443 libres; se borraron 24 `*.hot-update.*` de la sesión. Sin DMG ni ZIP.

## 8. Rollback

- Por flag: `localStorage.removeItem("openlens:global-docking"); location.reload();` en el iframe del clúster → vista clásica (verificado).
- Por código: `git revert` del commit de H7.2; Kubetail no depende de él.

## 9. Próximo: H7.3

Controles discretos en hover/foco (replegar −, cerrar ×) sin cambiar la altura del encabezado; replegado con banda recuperable; accesibilidad por teclado del movimiento (alternativa a drag); evaluar doble clic para maximizar. Antes, decidir si se investiga el hallazgo de watches (§6).
