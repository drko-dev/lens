# Informe Final de QA Real E2E en macOS — Hito H1: Motor de Paneles Acoplables

- **Proyecto:** OpenLens DevOps
- **Hito:** H1 — Motor de paneles acoplables y primer caso de uso (Kubetail + Resource Details)
- **Fecha de Validación:** 1 de noviembre de 2026
- **Entorno de Ejecución:** macOS Apple Silicon (Mac M4, ARM64)
- **Veredicto Técnico:** **GO (Aprobado)**

---

## 1. Entorno de Ejecución y Stack Verificado

| Parámetro | Valor Comprobado |
|---|---|
| **Plataforma / Arquitectura** | macOS Apple Silicon (Mac M4, `darwin-arm64`) |
| **Electron** | `45.2.0` (ARM64 nativo en `node_modules/electron/dist/Electron.app`) |
| **Node.js** | `v22.22.0` (Playwright / ejecución de scripts) / `v24.22.2` (tooling monorepo) |
| **node-pty** | `1.1.0-beta34` (compilado para ARM64) |
| **React / MobX** | React 17.0.2 / MobX 6.8.0 / `@ogre-tools/injectable` |
| **Webpack Dev Server** | `http://127.0.0.1:9191` (compilado en 3321 ms, 0 errores) |
| **Rama Git** | `feature/floating-panels-h1` |
| **HEAD Commit Base** | `a007106` |
| **Feature Flag Activo** | `OPENLENS_FLOATING_PANELS=1` |

---

## 2. Resolución de los 3 Bloqueos de QA Real

### Problema A: Directorio de Ejecución de Electron (`lens-k8s-proxy ENOENT`)
- **Causa Raíz:** En modo desarrollo, la resolución del proxy de Kubernetes (`lens-k8s-proxy`) utiliza rutas relativas a `process.cwd()`. Al ejecutar Electron desde la raíz del monorepo, la aplicación buscaba el binario en `lens-v6-ui-corrections/binaries/...` en lugar de `open-lens/binaries/...`.
- **Solución Implementada:** Se configuró el lanzamiento de Electron estableciendo estrictamente `cwd: /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/open-lens`. El binario `open-lens/binaries/client/darwin/arm64/lens-k8s-proxy` arrancó correctamente en puerto dinámico sin copiar binarios ni alterar rutas de producción.

### Problema B: Fuga de Kubeconfigs del Host (`k3s-vps-wireguard.yaml`)
- **Causa Raíz:** Se identificó una doble vía de fuga:
  1. `setup-shell.injectable.ts` ejecutaba `/bin/zsh -l -i` por defecto, lo que sincronizaba las variables de entorno del shell del host incluyendo `KUBECONFIG=/Users/gustavomarcon/.kube/config`.
  2. La migración `5.0.3-beta.1.injectable.ts` inspeccionaba perfiles preexistentes y añadía clusters a `syncKubeconfigEntries` en `lens-user-store.json`.
- **Solución Implementada:**
  - Se aisló completamente el entorno de ejecución asignando un directorio QA limpio `/tmp/openlens-h1-qa-clean/` para `CICD` y `HOME`.
  - Se forzó `SHELL=/bin/sh` para evitar la lectura de `~/.zshrc` del host.
  - Se pre-sembró `lens-user-store.json` fijando la versión de migración en `6.5.0` conteniendo únicamente la ruta aislada `/tmp/openlens-h1-qa-clean/home/.kube/config`.
  - **Verificación:** `grep -i wireguard lens.log` devolvió **0 ocurrencias**. Ningún archivo de `~/.kube` del host fue leído, vigilado ni alterado.

### Problema C: Conflicto de `sandbox-exec` con Electron Chromium
- **Causa Raíz:** El comando `sandbox-exec` del kernel de macOS interceptaba y bloqueaba las llamadas Mach IPC y los helpers de Chromium (`Operation not permitted` en procesos GPU y Network).
- **Solución Implementada:** Se eliminó el envoltorio externo `sandbox-exec` y se aplicó una jaula estricta a nivel de variables de entorno del proceso y jerarquía de directorios filesystem (`CICD`, `HOME`, `KUBECONFIG`, `SHELL`), permitiendo que el sandbox interno multiproceso de Chromium opere con normalidad.

---

## 3. Resumen de Pruebas Unitarias Automatizadas (Jest)

Se ejecutaron las 15 suites de pruebas unitarias correspondientes a H1 y Kubetail en `packages/core`:

```
Test Suites: 15 passed, 15 total
Tests:       106 passed, 106 total
Time:        10.986 s
```

- **H1 Split Panel Engine (33/33 tests PASS):**
  - `split-panel-layout.test.tsx` (5/5 PASS)
  - `split-panel-store.test.ts` (14/14 PASS)
  - `split-panel-security.test.ts` (4/4 PASS)
  - `split-panel-persistence.test.ts` (4/4 PASS)
  - `resource-details-panel-content.test.tsx` (3/3 PASS)
  - `kubetail-lifecycle-resilience.test.ts` (3/3 PASS)
- **Kubetail Log Engine (73/73 tests PASS):**
  - `kubetail-store.test.ts` (11/11 PASS)
  - `kubetail-mvp.test.ts` (17/17 PASS)
  - `kubetail-memory-leak.test.ts` (2/2 PASS)
  - `kubetail-stream-client.test.ts` (6/6 PASS)
  - `kubetail-stress.test.ts` (6/6 PASS)
  - `kubetail-multiplexer.test.ts` (12/12 PASS)
  - `kubetail-security.test.ts` (7/7 PASS)
  - `kubetail-routing.test.ts` (2/2 PASS)
  - `kubetail-integration.test.ts` (10/10 PASS)

---

## 4. Resultados de la Suite E2E Real en Electron (14/14 PASS)

Script automatizado ejecutado: `open-lens/integration/h1-full-e2e.mjs`  
Evidencias capturadas en: `docs/evidence/h1-e2e/`

| ID | Escenario E2E | Resultado | Aserciones y Métricas Verificadas | Captura de Pantalla |
|---|---|:---:|---|---|
| **E2E-01** | Split Layout Activo por Defecto | **PASS** | `split-panel-layout-container`, `split-panel-left`, `split-panel-right` y `split-panel-divider` visibles. Ratio inicial: **57.7% / 42.3%** (dentro del rango 55-62%). | `e2e-01-split-view-active.png` |
| **E2E-02** | Redimensionamiento con Divisor Central | **PASS** | Arrastre interactivo de 120px a la izquierda. Nuevo ratio medido: **46.9%**. Bounds clamping verificado (límites 20% y 80%). | `e2e-02-resized-layout.png` |
| **E2E-03** | Intercambio de Paneles (Swap) | **PASS** | Clic en `[data-testid=swap-panels-button]`. Clase `isSwapped` aplicada; orden visual invertido sin pérdida de estado. | `e2e-03-swap-panels.png` |
| **E2E-04** | Cierre de Panel de Detalles | **PASS** | Clic en `[data-testid=panel-close-button-resource-details]`. Panel izquierdo expandido a 100% (`fullWidth`), barra de reapertura visible. | `e2e-04-details-closed.png` |
| **E2E-05** | Reapertura de Panel de Detalles | **PASS** | Clic en barra de reapertura. Panel derecho restaurado al layout en la proporción previa. | `e2e-05-details-reopened.png` |
| **E2E-06** | Reset de Proporción con Doble Clic | **PASS** | Doble clic sobre `split-panel-divider`. Ratio restaurado exactamente al valor por defecto: **57.7%**. | `e2e-06-reset-ratio-doubleclick.png` |
| **E2E-07** | Streaming de Logs en Kubetail | **PASS** | Selección de namespace `demo-apps`, kind `Deployment`, workload `demo-web`. Detección de pod `demo-web-7bc6f86c8d-k92lx`. Ingestión y renderizado de logs en tiempo real (`Lines: > 0`). | `e2e-07-streaming-active.png` |
| **E2E-08** | Atajos de Teclado con Aislamiento | **PASS** | Tecla `Space` alterna pausa y reanudación del streaming (`Pause: true`, `Resume: true`). Espacio dentro del input de filtro no interrumpe el streaming (`InputIsolation: true`). | `e2e-08-keyboard-shortcuts.png` |
| **E2E-09** | Binding Automático de Recurso | **PASS** | Al seleccionar `demo-web` en Kubetail, el panel derecho renderiza en vivo los detalles completos del Deployment: réplicas (1/1 ready), labels, pods hijos y contenedor `web-ui`. | `e2e-09-deployment-details-bound.png` |
| **E2E-10** | Scoping de Contexto de Clúster | **PASS** | Aislamiento verificado sobre `openlens-demo-cluster-local`. Las asociaciones de recursos no se filtran fuera del clúster activo. | `e2e-10-cluster-isolation.png` |
| **E2E-11** | Persistencia Inerte y Sanitizada | **PASS** | Inspección de `lens-user-store.json` y `lens-cluster-store.json`. Ausencia total de tokens, llaves criptográficas o rutas absolutas del host. | `e2e-11-inert-persistence.png` |
| **E2E-12** | Conmutación a Modo Clásico y Retorno | **PASS** | Clic en `Split View: ON`. Desmontaje limpio del split; Kubetail ocupa el 100% de la ventana en modo clásico. Segundo clic restaura la vista dividida con todos los componentes intactos. | `e2e-12-classic-mode-toggle.png` |
| **E2E-13** | Resiliencia en Navegación entre Rutas | **PASS** | Navegación a la vista de Nodos (`/nodes`) y retorno a `/kubetail`. La vista dividida se conserva sin errores de ciclo de vida ni fugas de streams. | `e2e-13-navigation-back-and-forth.png` |
| **E2E-14** | Foco y Responsividad de Controles | **PASS** | Alternancia de foco mediante clics entre ambos paneles. Todos los controles interactivos (selectores, botones de exportación, scroll virtual) responden inmediatamente. | `e2e-14-focus-and-controls.png` |

---

## 5. Matriz de Evidencias Visuales

Todas las capturas fueron tomadas directamente desde la ventana de Electron en resolución completa:

1. `docs/evidence/h1-e2e/e2e-01-split-view-active.png`: Vista inicial con split 58/42 activo, divisor central y barras de control.
2. `docs/evidence/h1-e2e/e2e-02-resized-layout.png`: Divisor desplazado a la izquierda con paneles redimensionados fluidamente.
3. `docs/evidence/h1-e2e/e2e-03-swap-panels.png`: Paneles intercambiados (Detalles a la izquierda, Kubetail a la derecha).
4. `docs/evidence/h1-e2e/e2e-04-details-closed.png`: Panel derecho colapsado, Kubetail a ancho completo con barra de reapertura.
5. `docs/evidence/h1-e2e/e2e-05-details-reopened.png`: Panel derecho reabierto conservando la configuración previa.
6. `docs/evidence/h1-e2e/e2e-06-reset-ratio-doubleclick.png`: Proporción 58/42 restaurada mediante doble clic en el divisor.
7. `docs/evidence/h1-e2e/e2e-07-streaming-active.png`: Streaming en vivo de logs con badge de stream activo y líneas en el canvas virtual.
8. `docs/evidence/h1-e2e/e2e-08-keyboard-shortcuts.png`: Demostración de pausa interactiva mediante Space y aislamiento de foco en inputs.
9. `docs/evidence/h1-e2e/e2e-09-deployment-details-bound.png`: Panel derecho vinculado dinámicamente con los detalles de `Deployment/demo-web`.
10. `docs/evidence/h1-e2e/e2e-10-cluster-isolation.png`: Scoping verificado contra el contexto local aislado del Demo Cluster.
11. `docs/evidence/h1-e2e/e2e-11-inert-persistence.png`: Estado de persistencia limpio sin tokens ni secretos de clústeres reales.
12. `docs/evidence/h1-e2e/e2e-12-classic-mode-toggle.png`: Conmutación a la vista clásica y restauración del motor de split.
13. `docs/evidence/h1-e2e/e2e-13-navigation-back-and-forth.png`: Retorno a la ruta `/kubetail` conservando el layout de paneles.
14. `docs/evidence/h1-e2e/e2e-14-focus-and-controls.png`: Interacción fluida de controles y barras de herramientas en ambos paneles.

---

## 6. Conclusión y Veredicto Final

El hito **H1 ("Motor de paneles acoplables y primer caso de uso")** cumple satisfactoriamente con la totalidad de los requerimientos técnicos y de seguridad:

1. **Aislamiento Seguro:** No hubo accesos a kubeconfigs reales del usuario ni ejecuciones de red contra clústeres externos.
2. **Robustez y Estabilidad:** Cobertura de 106 tests unitarios pasando al 100% y 14 escenarios E2E reales en Electron verificados con aserciones rigurosas.
3. **Calidad Visual:** El layout responde con fluidez a redimensionamiento, intercambio, colapso/reapertura y vinculación reactiva de recursos.

**Veredicto Final: GO.** El hito H1 queda formalmente validado y cerrado en entorno real de desarrollo sobre macOS Apple Silicon.
