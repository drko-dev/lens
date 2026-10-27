# OpenLens DevOps v6 — Hito 1 (layout estilo Lens), cierre

Date: 2026-10-27

- **Hito 1: PASS** — validado sobre la v6 real (`0583d40`) con Demo Cluster conectado; ver «Cierre funcional».
- **Integración v6 completa: PASS en smoke aislado** (Demo Cluster conecta tras `0583d40`; ver «Causa y corrección»).
- Smoke breve: no es una certificación formal ni un soak de 30 min.

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

## Actualización de diagnóstico (misma fecha)
- El `open-lens/package.json` del worktree original tiene un cambio sin commitear (Electron `22.3.3`→`22.3.10`,
  reglas de `files`) que v5 incluyó y `b7472ce` no. Se aplicó solo en el worktree v6 (sin commitear) y se
  reempaquetó con `electron-builder --dir`: el Demo Cluster **sigue DISCONNECTED** en v6. No es la causa.
- Descartados: aislamiento de datos, flags de Chromium, diferencias de archivos del `app.asar`.
- Sin explicar: por qué la activación del Demo Cluster no ocurre en v6 y sí en v5. Próximo paso concreto:
  comparar el proceso main de ambos con logging de `demo-cluster-manager`, o reconstruir v5 desde su worktree.
- Veredicto sin cambios: **BLOCKED**.

## Validación visual (híbrido v5 + lens.css de v6)
- **Híbrido:** copia temporal del `.app` v5 en scratchpad con `lens.css` de v6 como único archivo distinto
  (verificado por hash de todos los archivos del `app.asar`). `app.asar` y DMG v5 sin cambios
  (`6ce244b9…` / `bb875b06…`). `lens.css` v6 pesa solo 7 bytes más que el de v5.
- **Bisección:** v5 completo conecta; v5 + `lens.css` v6 conecta; v5 + `lens.js` v6 queda DISCONNECTED;
  v5 + `main` source no lo arregla; el aislamiento y la firma del proxy se descartaron.
- **Verificado en 1440×900 y 1920×1080 (Demo Cluster conectado):** sidebar a 30 px con submenú a 26 px, cabecera de
  clúster en una línea, sub-pestañas de 30 px, tablas de Pods y Deployments con datos (`demo-apps`), navegación entre
  recursos, Back/Forward operativos, pestañas, favoritos visibles. Sin superposiciones ni recortes en las tablas.
- **Limitación visual:** el nombre largo del clúster se trunca con `…` (una línea). Es el costo de compactar la cabecera.
- Capturas (scratchpad, no versionadas): `shots/hyb-pods-1440b.png`, `hyb-deploy-1440.png`, `hyb-pods-1920.png`,
  `hyb-deploy-1920.png`, `hyb-workloads-1440.png`, `hyb-cluster-1440.png`.

## Tests focalizados
- `sidebar-cluster.test.tsx`: PASS. `visibility-of-sidebar-items`, `order-of-sidebar-items`,
  `sidebar-and-tab-navigation-for-core`: 11 tests FAIL (diffs de snapshot de markup obsoleto).
- Con los SCSS del commit base fallan exactamente los mismos 11: **preexistentes**, no causados por este hito.
  No se regeneraron snapshots.

## Seguridad
- `HOME` temporal + `CICD` + `sandbox-exec`: perfil real con hashes idénticos antes/después; sin procesos residuales;
  R9-RC (PID 97512) sin reinicios; v5 y su DMG intactos.

## Causa y corrección de la integración (commit `0583d40`)
- **Causa:** `b7472ce` no incluía cambios que v5 sí traía sin commitear. En el renderer, el manejador de
  «Launch demo cluster» navegaba a `/cluster/<id>` de inmediato, antes de que el catálogo publicara la entidad:
  no navegaba, no arrancaba `lens-k8s-proxy` y la pestaña quedaba DISCONNECTED. Evidencia: diff de `sourcesContent`
  de los source maps de `lens.js` (un solo módulo distinto, `library/renderer.js`) y de `library/main.js`.
- **Corrección mínima (6 archivos):** `welcome.tsx` espera hasta 40 intentos a `catalogEntityRegistry.getById`
  antes de navegar; `main/demo-cluster/*` (3 archivos) y `kubeconfig-sync/compute-diff.injectable.ts` (publicación
  del demo en el catálogo); el test `r8-06-welcome-demo-cluster` actualiza su mock con `getById`.
- **Bisección acotada:** `welcome` solo, `welcome`+`compute-diff` no conectan; con `demo-cluster` conecta.
  No se aisló cuál de los tres archivos de `demo-cluster` es imprescindible.
- **Verificación:** build de core/app/pack OK; Demo Cluster conecta, 1 proxy v6 activo, navegación a Pods;
  tests `src/main/demo-cluster` y `src/renderer/components/welcome`: 14/14 PASS. Capturas: `shots/v6h-pods-1440.png`,
  `shots/v6h-pods-1920.png`. Perfil real con hashes idénticos; sin procesos residuales; R9-RC intacto.
- **Pendiente:** otros cambios sin commitear de v5 (`k8s-api`, `service-details`, etc.) siguen fuera de v6;
  los 11 tests de snapshot preexistentes siguen fallando; falta validar contra Kubernetes real.

## Cierre funcional del Hito 1 (v6 real, aislada)
- **Smoke en v6 real** (`0583d40`, empaquetada con `electron-builder --dir`, aislamiento `HOME`+`CICD`+`sandbox-exec`):
  Home, Catalog y Settings (tema Midnight Graphite) accesibles; Demo Cluster conecta; sidebar y submenú compactos;
  sub-pestañas Overview/Pods/Deployments; tablas de Pods y Deployments con datos de `demo-apps`; Back/Forward
  navegan entre welcome y catálogo; pestaña del clúster abre y cierra; favoritos visibles.
- **Capturas** (scratchpad): `shots/v6-pods-all-1440.png`, `v6-deploy-1440.png`, `v6-deploy-1920.png`,
  `v6-pods-1920.png`, `v6-prefs-click.png`. Sin superposiciones, recortes ni contenido cortado.
- **Tests y lint focalizados:** `src/main/demo-cluster` + `src/renderer/components/welcome`: 14/14 PASS;
  ESLint sobre los 4 archivos TS tocados: exit 0. Los 11 tests de snapshot de sidebar siguen fallando igual que en
  la base (preexistentes).
- **Seguridad:** perfil real con hashes idénticos; 0 procesos residuales; R9-RC (PID 97512) sin cambios; v5 y DMG intactos.
- **Limitaciones:** nombre largo de clúster truncado con `…`; no se probó Kubernetes real; no es certificación formal
  ni soak; no se generó DMG v6 (Hito 4).
