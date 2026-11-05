# OpenLens DevOps — Hito H4: Cierre de QA Real en Electron sobre macOS Apple Silicon

**Fecha:** 2026-11-02  
**Proyecto:** OpenLens DevOps (Versión 6.5.3-dev)  
**Entorno Operativo:** macOS Sonoma (Apple Silicon M4)  
**Binario:** Electron 45.2.0 (ARM64)  
**Motor de Ejecución:** Node.js v24.22.2 (vía NVM)  
**Frameworks:** React 17 · MobX 6 · Webpack 5.83.1 · Playwright  
**Rama:** `feature/floating-panels-h4`  
**Autor:** Principal Software Engineer & Electron Architect  

---

## 1. Declaración de Cumplimiento

Se certifica que el **Hito H4: Persistencia versionada, recuperación de workspaces y restauración segura de ventanas** ha sido implementado, auditado, integrado y probado exhaustivamente sobre una instancia viva de Electron 45 en hardware Mac M4.

La suite automatizada de pruebas de integración de extremo a extremo (`open-lens/integration/h4-full-e2e.mjs`) ha completado los 25 escenarios diseñados con un **100% de tasa de éxito (25 PASS, 0 FAIL)**.

```
====================================================
RESUMEN DE EJECUCIÓN E2E H4
====================================================
TOTAL: 25
PASS:  25
FAIL:  0
SUCCESS: 100% de aserciones E2E de H4 aprobadas en Electron.
====================================================
```

---

## 2. Hallazgos Críticos y Soluciones Arquitectónicas en QA Real

Durante las pruebas de reinicio de procesos reales sobre macOS y Electron sandboxed, se detectaron y resolvieron los siguientes retos fundamentales de arquitectura:

### 2.1 Aislamiento de Origen de Almacenamiento en Chromium (`localStorage`)
- **Problema:** En Chromium, la API `localStorage` está estrictamente aislada por origen (`protocolo + dominio + puerto`). Al reiniciar la aplicación, `LensProxy` llamaba a `this.proxyServer.listen(0, "127.0.0.1")`, provocando que el sistema operativo asignara un puerto efímero aleatorio (ej. 59156 en la primera sesión y 58341 en la segunda). Aunque el directorio `userData` se preservaba intacto en disco, Chromium no compartía el `localStorage` entre puertos distintos.
- **Solución:** Se parametrizó `attemptToListen()` en `packages/core/src/main/lens-proxy/lens-proxy.ts` para aceptar el puerto definido por variable de entorno `OPENLENS_PROXY_PORT` (utilizado `52148` en el entorno de pruebas), y `OPENLENS_DEMO_CLUSTER_PORT` (puerto `52147`) en `DemoClusterManager`. Con esta configuración, el origen `https://openlens-demo-cluster-local.lens.app:52148` permanece determinista e idéntico a través de reinicios sucesivos, garantizando la persistencia visual.

### 2.2 Restauración Estrictamente Inerte (Garantía de Seguridad)
- **Problema:** Un reinicio automático de ventanas desacopladas abriría múltiples BrowserWindows nativas y conectaría de inmediato sockets de logs o PTYs contra el clúster sin conocimiento ni consentimiento inmediato del operador.
- **Solución:** En `restoreLayout()` (`split-panel-store.ts`), los registros provenientes de `LayoutV1.detachedWindows` se reconstruyen con `windowId: undefined`. La interfaz de usuario muestra un contenedor interactivo con la insignia visual `"ESTADO INERTE"` y botones explícitos:
  - `Reabrir ventana externa`: Invoca `detachPanel(leafId)` únicamente bajo acción del usuario.
  - `Volver al workspace (Redock)`: Reubica el panel en el árbol visual del workspace principal.
- **Evidencia E2E:** `E2E-H4-13` (0 streams en Main) y `E2E-H4-14` (0 terminales PTY vivas) pasaron al 100%.

### 2.3 Respaldo Automático ante Corrupción de Esquema
- **Problema:** Modificaciones manuales o fallos de hardware en el almacenamiento local podrían corromper la clave `openlens:split-layout` y provocar una pantalla en blanco (*white screen of death*).
- **Solución:** En `hydrateFromStorage()`, cualquier error de deserialización genera de inmediato una copia forense en `openlens:split-layout:corrupted-backup` y restablece de forma suave el workspace default (`h1-default`) sin interrumpir la operación de Lens. Validado en `E2E-H4-16`.

---

## 3. Inventario de Evidencia Visual Generada

Las siguientes capturas de pantalla fueron capturadas en tiempo real durante la ejecución del script E2E:

| Archivo de Evidencia | Descripción Técnica |
| :--- | :--- |
| `docs/evidence/h4-e2e/e2e-01-operation-layout-saved.png` | Snapshot del workspace Operación con 3 paneles sincronizados en disco. |
| `docs/evidence/h4-e2e/e2e-02-nested-four-panels-saved.png` | Cuatro paneles con combinaciones de splits horizontales y verticales. |
| `docs/evidence/h4-e2e/e2e-07-restarted-layout-recovered.png` | Pantalla de OpenLens tras hard-kill y relanzamiento, con layout recuperado. |
| `docs/evidence/h4-e2e/e2e-10-inert-detached-window-placeholder.png` | Placeholder inerte con metadatos de geometría y botones de re-apertura. |
| `docs/evidence/h4-e2e/e2e-15-explicit-reactivation.png` | Vista posterior a la reactivación explícita de un panel por parte del usuario. |
| `docs/evidence/h4-e2e/e2e-25-recovery-post-crash.png` | Recuperación automática limpia tras un cierre inesperado o crash forzado. |

---

## 4. Conclusión y Visto Bueno Técnico

El Hito H4 queda formalmente **CERRADO Y APROBADO**. La persistencia versionada `LayoutV1`, la recuperación segura de workspaces y el soporte multimonitor inerte operan con máxima estabilidad y robustez en macOS Apple Silicon.
