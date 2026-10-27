# OpenLens DevOps v6 — Hito 1 (layout estilo Lens), cierre

Date: 2026-10-27 · Veredicto: **BLOCKED** (no PASS)

## Rama, base y procedencia
- Rama `feat/v6-lens-ui-h1`, worktree `/Users/gustavomarcon/Documents/lens/lens-v6-h1`, base `b7472ce`.
- El original tiene 557 cambios sin commitear; en `src` solo difieren `cost-observability.ts` y
  `trivy.api.ts` (ajenos al hito). Dependencias y builds ignorados se clonaron (copy-on-write).
- Comparación `app.asar` v5 vs v6 empaquetado: mismos 404 archivos; difieren solo los bundles compilados.

## Archivos modificados (solo estilos locales)
- `features/workspace-tabs/renderer/workspace-tab-bar.scss`: botones `‹ ›` 22 px, sin borde.
- `renderer/components/layout/tab-layout.scss`: sub-pestañas 34→30 px; margen del área central a la mitad.
- `renderer/components/layout/sidebar-items.module.scss`: items 30 px, submenú 26 px, centrado vertical.
- `renderer/components/layout/sidebar-cluster.module.scss`: cabecera de clúster en una línea.
- Los `‹ ›` navegan el historial de pestañas del workspace, no el de la app: se conservan.

## Pruebas reales
- Build de `@openlens/core` y del renderer del app: OK, 0 errores. Empaquetado `--dir` en scratchpad: `.app` completo.
- Smoke aislado en v6 (Home, Catalog, pestañas, favoritos, Back/Forward): renderiza correctamente.
- **Demo Cluster en v6: queda DISCONNECTED** (build suelto y empaquetado). El v5 empaquetado conecta con
  el mismo aislamiento. Causa no identificada. Por eso la vista de clúster (sidebar, cabecera, sub-pestañas, tablas)
  **no se verificó en v6**.
- No se ejecutaron tests unitarios focalizados ni el smoke de pestañas dentro de un clúster.

## Aislamiento de datos
- `HOME` temporal + `CICD` + `sandbox-exec` negando escritura al perfil real y a `~/.kube`
  (`--no-sandbox --disable-gpu` necesarios bajo sandbox-exec). Hashes del perfil real idénticos antes/después de la
  corrida final. Un incidente previo (primer smoke sin aislamiento) escribió en ese perfil; no hay copia anterior.
- R9-RC (PID 97512) sin reinicios; sin procesos v6 residuales.

## Capturas (scratchpad de la sesión, no versionadas)
- 1440×900: `shots/v6-home-1440.png`, `shots/v6-cluster-1440.png` (Catalog), `shots/v5-demo-1440.png` (referencia v5).
- 1920×1080: `shots/v6-home-1920.png` (solo Home).

## Pendiente para PASS
Conectar el Demo Cluster en v6 (diferencia de entorno vs v5 aún sin explicar), capturar la vista de clúster a
1440×900 y 1920×1080, y correr tests focalizados de layout.
