# R2 — Checklist técnico de implementación
**Proyecto:** OpenLens DevOps Revival  
**Fecha:** 2026-10-19  
**Rama de referencia:** `feat/openlens-devops-revival`  
**Estado:** Release 2 — Productividad y experiencia de usuario en progreso.

---

## 1. Alcance y Reglas de Release 2

Release 2 focaliza en la productividad diaria del operador DevOps sobre la base estable y segura consolidada en Release 1:
1. **Identificación y ergonomía de clústeres:** Clasificación de entornos (`production`, `staging`, `dev`, etc.), personalización de pines en Hotbar, advertencias persistentes de seguridad y alias visuales.
2. **Edición avanzada de manifiestos:** Integración de Diff/Revert en Monaco Editor, visualización de diferencias remotas/locales y validación sintáctica YAML.
3. **Observabilidad operativa:** Visor de logs con filtrado en tiempo real, búsqueda y formateo.
4. **Herramientas de terminal:** Búsqueda en terminal, scrollback configurable y sesiones robustas.
5. **Manipulación de datos:** Exportación segura de tablas a CSV sin inyección de fórmulas (`=`, `+`, `-`, `@`) y filtros rápidos.

---

## 2. Hitos de Release 2

### [x] Hito R2-01 — Rediseño de pines, favoritos e identificación visual de clústeres
- [x] **Clasificación por entorno:** `ClusterEnvironment` (`production`, `staging`, `development`, `testing`, `local`, `custom`, `none`) con persistencia local en `preferences` y soporte de nombres custom.
- [x] **Salvaguarda de no-inferencia:** Nunca se clasifica automáticamente un clúster como producción basándose únicamente en el nombre del contexto o del clúster.
- [x] **Personalizador visual de apariencia:** Selector de 16 colores vibrantes + HTML5 color picker, selector de 16 íconos Material / iniciales, campo de alias visual (`clusterAlias`) y botón de reset a defaults.
- [x] **HotbarEntityIcon renovado:** LEDs de estado de conexión (verde conectado, ámbar pulsante conectando, gris desconectado, rojo error), badge compacto de entorno (`PRD`, `STG`, `DEV`, `TEST`, `LOC`, `CST`) y anillo hazard rojo para producción.
- [x] **Indicadores persistentes de producción:** Cabecera `SidebarCluster` con badge `⚠️ PRODUCTION` y borde rojo; advertencias destacadas en `KubeObjectMenu` para Delete, Force Delete y Evict.
- [x] **Pruebas unitarias aprobadas:** 5 suites / 47 tests (`environment-types.test.ts`, `cluster-appearance-picker.test.tsx`, `sidebar-cluster.test.tsx`, `kube-object-menu.test.tsx`, `update-entity-spec.test.ts`).
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado en `dist-stage` y smoke GUI de Playwright aprobado.
- [x] **Documentación de evidencia:** Registrado en [`docs/revival/R2_01_VALIDATION.md`](./R2_01_VALIDATION.md).

---

### [x] Hito R2-02 — Monaco Editor: Diff/Revert y validación YAML
- [x] **Monaco Split Diff:** Componente `MonacoDiffEditor` integrado con modos `Editor`, `Diff (Original)` y `Diff (Live)`, sincronización con temas Lens y preservación de borradores.
- [x] **Revert y Reload seguros:** Acciones explícitas de Revert a `firstDraft` y Reload desde clúster con confirmación obligatoria si hay cambios no guardados.
- [x] **Validación YAML estructurada:** Detección de errores de sintaxis (línea/columna) con marcadores nativos en Monaco, validación de recurso único K8s y bloqueo de guardado inválido.
- [x] **Protección estricta de Secretos:** Sanitización de `data` y `stringData` en diffs sin exposición de valores ni fugas en snapshots, con diff read-only para Secrets.
- [x] **Pruebas unitarias y de integración:** 8 suites / 63 tests pasando al 100% (`monaco-validators`, `diff-redaction`, `diff-and-revert`, `view.test.tsx`, `save.test.tsx`, `save.lab-integration.test.tsx`, `config-map-details`, `secret-details`).
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado en `open-lens/dist-stage/mac-arm64` y validación Playwright exitosa.
- [x] **Documentación de evidencia:** Registrado en [`docs/revival/R2_02_VALIDATION.md`](./R2_02_VALIDATION.md).

---

### [x] Hito R2-03 — Visor de logs avanzado y filtrado en tiempo real
- [x] **Integridad de sondeo y deduplicación:** Corrección de `sinceTime` +1s bug, extracción de timestamp ISO-8601 exacto y deduplicación por solapamiento sufijo-prefijo (`mergeLogLines`).
- [x] **Protección contra errores transitorios:** Desacoplamiento de errores en `tabErrors`, preservando el buffer de logs existente intacto y recuperando el estado `LIVE` automáticamente.
- [x] **Acotación de buffer y truncamiento:** Límite de 10.000 líneas con descarte ordenado y badge `TRUNCATED` con contador de mensajes omitidos.
- [x] **Modos duales de Búsqueda y Filtrado:** Modo `Search` (resaltado y navegación) y modo `Filter` (ocultamiento de líneas no coincidentes, contador de filtrados y estado vacío amigable).
- [x] **Expresiones regulares y case-sensitivity:** Botón regex `.*` con cota de 100 caracteres y alerta no invasiva ante patrones inválidos, botón `Aa` para coincidencia de mayúsculas/minúsculas y limpieza de secuencias ANSI.
- [x] **Pausa y reanudación con buffer pendiente:** Botón `Pause` congela la vista sin detener el sondeo en segundo plano, acumula en `pendingLogs` con contador visual `PAUSED (+N)`, y `Resume` actualiza de golpe sin saltos.
- [x] **Word wrap y recálculo dinámico de filas:** Conmutador de ajuste de línea con medición de contenedor (`ResizeObserver`) y cálculo de alturas dinámicas en `VirtualList` para evitar solapamientos.
- [x] **Pruebas y validación:** 6 suites / 48 tests pasando al 100% (`log-buffer-utils`, `search-store`, `log-store`, `log-search`, `to-bottom`, `log-resource-selector`) + 44 pruebas de regresión.
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado en `dist-stage` y prueba Playwright aprobada con captura de pantalla.
- [x] **Documentación de evidencia:** Registrado en [`docs/revival/R2_03_VALIDATION.md`](./R2_03_VALIDATION.md).

---

### [x] Hito R2-04 — Búsqueda en terminal y resiliencia de sesiones
- [x] **Barra de búsqueda interactiva en terminal:** Componente `TerminalSearch` integrado con `xterm-addon-search`, búsqueda con resaltado y navegación de coincidencias arriba/abajo (`Enter` / `Shift+Enter`).
- [x] **Atajos de teclado:** `Cmd+F` (macOS) / `Ctrl+F` (Win/Linux) abre y enfoca la búsqueda; `Escape` limpia la selección, cierra la barra y devuelve el foco a xterm.
- [x] **Opciones avanzadas:** Modos de sensibilidad a mayúsculas/minúsculas (`Aa`), expresiones regulares (`.*`) y palabra completa (`\b`).
- [x] **Configuración de historial de scrollback:** Opción `scrollback` en `TerminalConfig` (5.000 líneas por defecto) con reactividad en vivo.
- [x] **Resiliencia de sesiones:** Eliminación del auto-cierre prematuro de pestañas ante cortes de red o suspensión en `dock-tab.tsx`; distinción entre salida limpia (`exit` con código 1000) y caída anormal.
- [x] **Reconexión sin pérdida de contexto:** Botón `Reconnect` en la barra de advertencia e icono en la pestaña, reanudando la sesión pty en el backend sin destruir el buffer.
- [x] **Pruebas y validación:** 3 suites / 12 tests pasando al 100% (`terminal-search`, `terminal-resilience`, `create-pod-terminal-tab`).
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado en `dist-stage` y verificación Playwright exitosa con captura de pantalla.
- [x] **Documentación de evidencia:** Registrado en [`docs/revival/R2_04_VALIDATION.md`](./R2_04_VALIDATION.md).

---

### [x] Hito R2-05 — Exportación segura a CSV y filtros rápidos de listas
- [x] **Sanitización contra CSV Injection:** Bloqueo y neutralización estricta con comilla simple de `=`, `+`, `-`, `@`, `|`, `%` e inyecciones precedidas por espacios o caracteres de control (`\t`, `\r`, `\n`).
- [x] **Exportación en memoria sin scraping de DOM:** Exportación completa de filas en memoria respetando ordenamiento, visibilidad de columnas y filtros activos (`VirtualList` safe).
- [x] **Protección estricta de Secrets:** Lista blanca estricta (`SECRET_ALLOWED_COLUMN_IDS`), exclusión categórica de `data`, `stringData` y credenciales.
- [x] **Compatibilidad RFC 4180 y UTF-8:** Escape de comillas y comas, inserción de BOM UTF-8 (`\uFEFF`) para visualización correcta en Excel y hojas de cálculo.
- [x] **Filtros rápidos contextuales:** Chips reactivos por estado (`Running`, `Pending`, `Failed`, etc.) con conteo en vivo e input de etiquetas (`key=value`).
- [x] **Pruebas y validación:** 4 suites / 26 tests pasando al 100% (`csv-builder`, `kube-csv-extractor`, `kube-quick-filters`, `kube-object-list-layout`) + 44 pruebas de regresión.
- [x] **Compilación y empaquetado:** `tsc` 0 errores, `npm run build` exit 0, empaquetado en `dist-stage` y prueba Playwright aprobada con capturas de pantalla y neutralización de fórmula confirmada.
- [x] **Documentación de evidencia:** Registrado en [`docs/revival/R2_05_VALIDATION.md`](./R2_05_VALIDATION.md).

---

### [x] Hito R2-06 — Validación integral de Release 2 y empaquetado final
- [x] **Regresión completa de todas las suites R1 y R2:** 27 suites ejecutadas, 206 tests pasando al 100% (101 tests en R2 + 105 tests en R1, 0 fallos).
- [x] **Calidad de código y compilación:** Typecheck sin errores (`tsc`), 40 proyectos compilados con `npm run build`.
- [x] **Empaquetado final de Release 2 en macOS ARM64:** Generado en `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app` (SHA-256 `f9b2c6f7d1d14789954886d36459f1e254dfedf98bafafa53af3120d7f12629d`), preservando intacto el proceso en ejecución.
- [x] **Smoke GUI integral de extremo a extremo:** Prueba automatizada Playwright (`verify-r2-06-e2e.cjs`) validando runtime, identidad, inyección de dependencias, filtros rápidos y exportación CSV con capturas en `docs/revival/screenshots/`.
- [x] **Criterios de salida de Release 2 cumplidos:** Registrado en [`docs/revival/R2_06_VALIDATION.md`](./R2_06_VALIDATION.md).

---

## Estado Global del Proyecto
- **Release 0 (R0 / Baseline):** COMPLETADO
- **Release 1 (R1 / Estabilidad y Seguridad):** COMPLETADO (Hitos R1-00 a R1-06)
- **Release 2 (R2 / Productividad y Experiencia DevOps):** COMPLETADO (Hitos R2-01 a R2-06)
- **Próximo paso:** Definir prioridades para **Release 3 (R3: APIs K8s modernas, CRDs, GitOps y métricas)** según el catálogo y roadmap.
