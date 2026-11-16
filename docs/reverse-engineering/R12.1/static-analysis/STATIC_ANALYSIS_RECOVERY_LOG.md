# R12.1 — Log de Recuperación Ante OOM en Análisis Estático

| Fecha | Herramienta / Operación | Target | Tamaño | Resultado / Error | Recuperación Aplicada | Cobertura |
|---|---|---|---|---|---|---|
| 2026-11-16 | `rea.analyze_javascript_application` (`max_heap_mb: 2048`, `timeout: 120s`) | `app.asar::static/build/main.js` | `18,005,550 B` | `Owned JavaScript worker exhausted its heap while analyzing static/build/main.js` (`ev_a53b49b1...`) | No se aumentó heap indiscriminadamente. Se cambió a extracción acotada por límites sintácticos / patrones en streaming Node (`R12.1-C`), capturando los **275** canales IPC (`171` request, `81` message, `23` computed), la fábrica `BrowserWindow` y los **4** stores `configName`. | Estructural completa para IPC/ventanas/stores; grafo de llamadas intra-función de `main.js` queda como `UNKNOWN` estático. |
| 2026-11-16 | `rea.analyze_javascript_application` | `app.asar::static/build/lens.js` | `31,488,146 B` | Omitido AST completo preventivamente para evitar OOM idéntico (>18 MB). | En `R12.1-D` se aplica extracción acotada por tokens/módulos y fragmentos sintácticos <= 256 KiB. | Estructural/tokens completa; AST completo `UNKNOWN`. |
