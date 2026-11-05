# H5: Baseline Real de Rendimiento en macOS Apple Silicon (M4)

**Proyecto:** OpenLens DevOps (Versión 6.5.3-dev)  
**Fecha:** 2026-11-02  
**Plataforma de Medición:** Apple Silicon M4 (10 núcleos, 16 GB RAM unificada)  
**Sistema Operativo:** macOS Sonoma (darwin-arm64)  
**Binario:** Electron 45.2.0 (ARM64)  
**Runtime:** Node.js v24.22.2  
**Herramienta de Instrumentación:** Playwright + Electron `app.getAppMetrics()` + `performance.memory` + `process.getCPUUsage()`  

---

## 1. Metodología de Medición

Las mediciones se obtuvieron en un entorno limpio y aislado (`/tmp/openlens-h5-perf-clean`) conectando directamente al clúster de demostración con proxy determinista (`OPENLENS_PROXY_PORT: "52148"`). Para cada configuración de paneles (1, 4, 8 y 12 paneles activos):

1. Se compuso la jerarquía de splits horizontales y verticales correspondiente mediante la API reactiva de `SplitPanelStore`.
2. Se estabilizó el ciclo de renderizado durante 2000 ms.
3. Se midieron latencias de interacción de usuario en el hilo principal del renderer:
   - **Latencia de Resize:** Tiempo de recálculo de geometría y actualización de ratio.
   - **Latencia de Maximizado:** Tiempo de toggle de panel a pantalla completa y su restauración.
   - **Latencia de Persistencia:** Tiempo de guardado síncrono del snapshot en `localStorage`.
4. Se muestrearon las métricas de memoria del runtime de Chromium (`window.performance.memory`) y los working sets de los procesos de Electron (`electronApp.getAppMetrics()`).
5. Se capturó evidencia visual de cada disposición de layout.

---

## 2. Resumen Comparativo de Baseline

| Métrica | 1 Panel | 4 Paneles | 8 Paneles | 12 Paneles | Presupuesto H5 (Límite) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hojas Activas en Árbol** | 1 | 4 | 8 | 12 | 16 máx. |
| **Nodos del DOM** | 362 | 689 | 1049 | 1260 | < 2500 |
| **Latencia de Resize (ms)** | 0.20 ms | 2.30 ms | 1.10 ms | 3.90 ms | < 16.0 ms (60 FPS) |
| **Latencia de Maximizado (ms)** | 8.10 ms | 12.40 ms | 8.90 ms | 21.50 ms | < 50.0 ms |
| **Renderer JS Heap Usado (MB)** | 235.53 MB | 188.51 MB | 190.63 MB | 202.28 MB | < 350 MB |
| **Renderer JS Heap Total (MB)** | 279.83 MB | 280.90 MB | 280.90 MB | 281.90 MB | < 500 MB |
| **Main Process Resident RAM (MB)** | 250.98 MB | 254.17 MB | 255.77 MB | 252.75 MB | < 400 MB |
| **Total Renderers RAM (MB)** | 642.55 MB | 642.67 MB | 618.45 MB | 629.08 MB | < 900 MB |
| **Procesos Activos de Electron** | 4 | 4 | 4 | 4 | Constante (4) |
| **Captura de Evidencia** | `baseline-layout-1-panels.png` | `baseline-layout-4-panels.png` | `baseline-layout-8-panels.png` | `baseline-layout-12-panels.png` | Registradas |

---

## 3. Análisis de Hallazgos Iniciales

1. **Escalabilidad de Procesos:** La cantidad total de procesos se mantiene rigurosamente constante en 4 (Main, Renderer principal, GPU Process, Utility/Network). La adición de paneles (de 1 a 12) **no genera procesos de renderizado auxiliares**, lo que confirma que la arquitectura de paneles acoplables en el mismo DOM de cluster frame es eficiente.
2. **Uso de Memoria Estable:** El heap de JavaScript del renderer oscila entre 188 MB y 235 MB. La diferencia entre 4 y 12 paneles es de solo ~14 MB de heap JS y el total de working set de renderers se mantiene en ~629 MB, sin evidencia de fugas explosivas al crear ramas profundas.
3. **Fluidez de Interacción (60 FPS):** La latencia de resize oscila entre 0.2 ms y 3.9 ms, significativamente por debajo del umbral de frame drop de 16.6 ms. El toggle de maximizado toma entre 8 ms y 21.5 ms para 12 paneles, garantizando una respuesta inmediata para el operador de DevOps.
4. **Crecimiento Lineal del DOM:** El número de nodos DOM escala a razón de aproximadamente 80 nodos por panel añadido (de 362 en 1 panel a 1260 en 12 paneles), lo que indica que no hay duplicación desmedida de subárboles.

---

## 4. Presupuestos y Metas de Hardening para H5

Para la fase de hardening y unificación visual H5, se fijan los siguientes límites de control estricto:

- **Memoria:** El working set del proceso Renderer no debe superar los 750 MB tras 20 ciclos de alternancia de paneles y workspaces.
- **Streams:** Cero streams huérfanos en background al cerrar o redimensionar paneles.
- **DOM:** Mantener los nodos por panel por debajo de 100 nodos/panel.
- **Consistencia Visual:** Cero elementos con colores no mapeados al sistema Midnight Graphite en las 12 vistas principales auditadas.
