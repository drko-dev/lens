# H7.1 — Contenedor global mínimo (GlobalPanelHost)

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Estado:** PASS (DEV, flag OFF por defecto)

## Qué se hizo

Las rutas Pods y Deployments del cluster frame se pueden mostrar como dos paneles reales, lado a lado, usando el motor `split-panel` existente. Sidebar, Dock, el resto de las rutas y Kubetail no cambian.

## Arquitectura

| Archivo | Rol |
|---|---|
| `packages/core/src/features/global-docking/renderer/global-docking-feature-flag.ts` | Flag `localStorage["openlens:global-docking"] === "true"`; OFF por defecto e independiente de `floating-panels` y `detached-tools` |
| `.../global-panel-store.ts` | Crea una instancia propia de `SplitPanelStore` con layout inicial Pods \| Deployments y el `clusterId` del frame |
| `.../global-panel-store.injectable.ts` | Una instancia por cluster frame (`hostedClusterIdInjectable`) |
| `.../should-use-global-panel-host.injectable.ts` | `flag && (ruta /pods \|\| ruta /deployments)` vía `routeIsActiveInjectable` |
| `.../global-panel-host.tsx` (+ `.module.scss`) | Renderiza `DynamicLayoutRenderer` con el store global |
| `packages/core/src/renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable.tsx` | Único cambio en código existente: `shouldUseGlobalPanelHost ? <GlobalPanelHost/> : <Component/>` |

Decisiones:
- **Sin duplicar montajes:** cuando el host está activo, el componente de ruta clásico no se renderiza; cada vista se monta una sola vez (verificado: 1 Pods y 1 Deployments).
- **Aislamiento de Kubetail:** al store se le inyectan accesores de almacenamiento que no persisten nada. Sin ellos, `SplitPanelStore` lee y escribe `localStorage["openlens:split-layout"]`, y al restaurar modifica `WORKSPACE_TEMPLATES`, un mapa compartido.
- **Persistencia:** solo en memoria durante la sesión del frame; el layout se mantiene al cambiar de ruta. La persistencia por clúster (`openlens:global-layout:<clusterId>`) se difiere a H7.7.
- Reutilizado sin cambios: `SplitPanelStore`, `DynamicLayoutRenderer`, `PanelContainer`, `PanelContentResolver`, `panel-catalog`.

## Activar / volver al modo clásico

En el cluster frame (DevTools del iframe del clúster):

```js
localStorage.setItem("openlens:global-docking", "true"); location.reload();   // activar
localStorage.removeItem("openlens:global-docking"); location.reload();        // clásico (RC3)
```

## Pruebas

| Prueba | Resultado |
|---|---|
| `global-panel-store.test.ts` (6 tests: layout inicial, no toca la clave de Kubetail, aislamiento por clúster, flag OFF por defecto / solo `"true"` / sin storage) | PASS, RED observado antes de implementar |
| Electron DEV, flag OFF: `/pods` y `/deployments` | PASS: vista clásica, sin host |
| Electron DEV, flag ON: `/pods` y `/deployments` | PASS: host con 2 hojas, 1 instancia de cada vista, `data-cluster-id` correcto, sidebar y Dock presentes |
| Electron DEV, flag ON: `/overview` (no piloto) | PASS: vista clásica |
| Layout estable al cambiar de ruta | PASS: mismos IDs de hoja |
| `localStorage["openlens:split-layout"]` | Intacto (ausente) |
| Rollback flag OFF + recarga | PASS |
| `npx tsc --noEmit` (core) | 42 errores preexistentes en otros archivos; 0 en archivos de H7.1 |
| `src/features/cluster/workloads/pods.test.tsx` | 6 fallos **preexistentes** (también fallan sin el cambio, comprobado con stash) |

Entorno de QA: perfil aislado `~/Documents/lens/qa-profiles/h7-dev` y una API de Kubernetes sintética mínima (servidor HTTP local en `127.0.0.1:18443`, listas vacías, script en el scratchpad de la sesión; no es parte del repo). El kubeconfig de QA apunta a ese mock.

## Recursos

- Disco: 25,33 GiB al iniciar (después del reinicio), 19,00 GiB al terminar, principalmente por el swap (0 → 6 GiB). Sin DMG ni ZIP.
- Procesos DEV: Electron + dev server + core watch + mock ≈ 0,7–3,3 GiB RSS; todos cerrados al final.

## Limitaciones

- `packages/core/static/build/library/` (ignorado por Git) quedó con el bundle de desarrollo de esta sesión, que ya incluye H7.1 con el flag OFF. El respaldo del bundle de producción previo estaba en `/private/tmp` y se perdió con el reinicio. Funciona igual para DEV; un futuro `npm run build` lo regenera.
- El menú «Mover» y el «+» del panel (catálogo) son los del motor existente; desde ahí se pueden agregar otros tipos de panel (por ejemplo Events o Kubetail) que no se probaron en el host global. El drag en 4 direcciones corresponde a H7.2.
- Sin línea de color del clúster todavía (H7.4).

## Siguiente: H7.2

Drag & drop por encabezado con drop-zones izquierda/derecha/arriba/abajo y agrupación como pestaña; extender `movePanel` con posición `before | after`; restringir el catálogo del host global a los tipos piloto hasta validarlos.
