# R12.1 — Errores, Bloqueos y Limitaciones Documentadas

1. **Modal de activación de Lens Desktop (`BLOCKED`)**: En perfiles QA aislados sin licencia/cuenta, el modal `Welcome to Lens` bloquea interacciones de ratón sobre el lienzo central (`Catalog`, `Split`, `Drag-out a sub-window`, `Cluster live`). No se eludió ni se usó el perfil personal del usuario.
2. **OOM de `rea.analyze_javascript_application` en bundles >15 MB (`LIMITATION`)**: `main.js` (18 MB) agotó 2 GB de heap del worker AST (`ev_a53b49b1...`); mitigado con extracción estructural en streaming (`275` canales IPC y fábrica `BrowserWindow`). `lens.js` (31.4 MB) se analizó por la misma vía acotada.
3. **`rea.recover_javascript_sources` en macOS (`LIMITATION`)**: Requiere `util-linux prlimit` en Linux x64; no ejecutable en macOS ARM64.
4. **`rea.list_electron_targets` (`LIMITATION`)**: Solo lista targets `file://` (`splash.html`) y filtra `https://lens.app:<port>/` (`ev_867bdd2c...`).
5. **Contradicciones de integridad ASAR (`CONFIRMED`)**: `rea.inspect_artifact` reportó `16` contradicciones en `.node`/`.dylib` unpacked por firma Mach-O post-empaquetado (`record-and-continue` aplicado).
6. **Grafo de llamadas intra-función completo (`UNKNOWN`)**: Las implementaciones privadas ofuscadas/minificadas dentro de `main.js` y `lens.js` fuera de los módulos extraídos quedan como `UNKNOWN`.
