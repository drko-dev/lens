# H7.6.4 — Docking de vistas globales (piloto)

## Arquitectura del frame raíz
- `ClusterManager` renderiza TopBar, `<div id="lens-views">` (iframes de cluster, montados imperativamente) y la ruta actual. Con el flag `openlens:global-docking` activo y la ruta Preferences o Catalog activa, en lugar del componente de ruta se monta `RootPanelHost`. `#lens-views`, TopBar y Hotbar no se tocan: los cluster frames no se remontan (GV11).
- Flag OFF o cualquier otra ruta: comportamiento clásico idéntico (GV10). El flag se lee al crear el injectable; cambiarlo requiere recargar.

## Host global y aislamiento
- Un único motor de docking: el cuerpo de `GlobalPanelHost` se extrajo a `PanelHostView`; el host por cluster y el host raíz lo reutilizan. No hay segundo algoritmo de drag-and-drop.
- `createRootPanelStore`: `clusterId` vacío, sin identidad de cluster (sin acento, sin etiqueta de entorno ni colores PROD), sin detach, sin persistencia, política `{settings, catalog}` de instancia única. Singleton del frame raíz: el layout sobrevive a los cambios de ruta entre ambas vistas.
- Aislado del layout por cluster y del layout clásico de Kubetail (`openlens:split-layout`).
- Los kinds `settings`/`catalog` son `policyOnly`: no se ofrecen en stores sin política.

## Vistas compatibles
- Settings (`Preferences`) y Catálogo (`Catalog`), reales y no duplicados, vía `bound-settings` / `bound-catalog` (lazy). `translateZ(0)` hace que el `SettingLayout` fijo llene el panel.
- Se abre la otra vista con el "+" del host (no navega).

## Extensiones y limitaciones
- Las páginas de extensiones siguen en el modo clásico: dependen de rutas dinámicas, parámetros y estado habilitado de la extensión; requerirían `registerPanelRenderer` dinámico con contrato de montaje propio. Fuera de este hito.
- El último panel no tiene botón de cerrar (regla del motor, `canClose = activos > 1`); GV12 valida esa regla.
- Tab/categoría de una vista se leen de parámetros de ruta: una segunda vista en el panel usa su valor por defecto hasta que se navega a ella.
- Sin persistencia del layout (H7.7).

## Seguridad
- Sin cambios en permisos Electron ni IPC; sin clusterId ficticio; detach deshabilitado en el host raíz.
- Terminal PROD: ahora Main revoca el grant pendiente al cerrar la pestaña (canal `terminal-shell:release-authorization`, valida sender, no toca PTY en curso ni grants de otras pestañas/clusters). Commit `5cfa13b`; 5 tests negativos RED→GREEN (2 fallaron con la revocación desactivada).

## Playwright
- GV01–GV12: 12/12 PASS con mouse y teclado reales. Regresión completa: **170 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED**.
- Evidencia representativa en `docs/evidence/h7-6-4/`; el resto en artefactos QA (no versionados).

## Recursos
Build renderer en línea base (42 errores TS preexistentes, sin nuevos). Al cierre ~15 GiB libres, swap ~8,0/9,0 GiB, sin procesos Electron/proxy residuales del harness.

## Pendientes para H7.7
Persistencia de layouts globales, páginas de extensiones, cerrar el último panel / estado vacío, detach de vistas raíz, vistas globales adicionales.
