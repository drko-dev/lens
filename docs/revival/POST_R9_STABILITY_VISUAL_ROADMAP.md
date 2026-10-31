# OpenLens DevOps — Roadmap de estabilización, paridad visual y auditoría R8/R9

**Fecha:** 2026-10-24
**Estado:** PLAN DE TRABAJO (no es certificación ni evidencia de pruebas ejecutadas)
**Base:** `feat/r7-09-consolidation`, commit `b73122b`
**Artefacto actual:** `Documents/lens-out-of-repo-20261030/releases/R9-RC/OpenLens DevOps.app`
**Referencias independientes:** `Documents/lens-app/` (extracción/análisis estático de Lens oficial) y, para capturas en ejecución autorizada, `/Applications/Lens.app`.

## Objetivos no negociables

1. **Estabilidad P0:** impedir bloqueos de UI, congelamientos de Electron, fallos en cambios de cluster, navegación, pestañas, preferencias o diálogos; medir y guardar evidencia real.
2. **Calidad visual P0:** paridad observable con Lens oficial en tipografía, jerarquía de tamaños, densidad, espaciados, estructura y experiencia de interacción. La aplicación debe iniciar en **Midnight Graphite**.
3. **Funcionalidad P0:** auditar integralmente y probar de forma independiente **todos** los hitos R8-01..R8-07 y R9-01..R9-10, no solo los tests unitarios existentes.
4. **Cambios gráficos futuros:** después de fijar una línea de base visual, iterar en pequeños cambios con capturas, revisiones y regresión automática; evitar rediseños masivos sin comprobación.
5. **Seguridad / licencia:** Lens oficial es referencia de comportamiento y aspecto; no copiar código, assets ni dependencias propietarias al producto MIT. Nunca mutar clústeres reales durante los tests.

## Hallazgos iniciales confirmados / cuestiones abiertas

- **Problema de inicio confirmado en código:** `packages/core/src/common/vars.ts` declara `defaultThemeId = "lens-dark"`; el tema Dark clásico tiene `isDefault: true` y Midnight Graphite tiene `isDefault: false`. Por lo tanto, la configuración de fábrica **no cumple** con Midnight Graphite como predeterminado. También debe verificarse cómo interactúan la selección explícita, el tema del sistema y las preferencias persistidas.
- **Tipografía sin validar en runtime:** `app.scss` declara `--font-primary: "Open Sans"` y tokens de tamaños. La existencia de variables y seis tests previos no prueba que cada control esté renderizando la fuente ni el tamaño de Lens oficial. Medir `getComputedStyle`, fuentes realmente cargadas y los estilos efectivos en Electron.
- **Settings reportados como defectuosos por el usuario:** identificar cada control que no se aplica, verificar escritura, reacción de UI, lectura del almacenamiento y persistencia al reiniciar. Revisar fusiones de preferencias y mutaciones de valores por defecto sin asumir la causa antes de reproducirla.
- **Congelamiento experimentado por el usuario:** los cambios R9-09 y R9-10 y sus tests dirigidos no demuestran ausencia de bloqueos en un escenario real; falta evidencia de interacción end-to-end, rendimiento y recuperación.
- **Herramientas detectadas:** CodeRabbit CLI 0.9.1 y Playwright disponibles en el Mac. Confirmar autenticación/alcance y compatibilidad Electron antes de correr auditorías; CodeRabbit puede enviar diffs a un servicio externo.
- **Límites del material oficial:** `lens-app/ANALYSIS.md` reporta extracción estática desde `Lens.app`, no una prueba de comportamiento. Tomar capturas reales cuando corresponda para fijar la referencia visual. No confundir paths recuperados con una función comprobada.
- **Evidencia previa:** R9-RC último cierre: 42 tests/8 suites PASS, TypeScript y empaquetado PASS; **no** se hizo regresión global ni E2E Electron R9. La documentación R8/R9 describe suites previas cuya cobertura funcional debe auditarse, no darse por suficiente.

## Etapas y gates (en orden)

### Fase 0 — Baseline seguro y matriz exhaustiva (P0)

- Congelar commit, versión, paquete, firma y hash; hacer backup aislado de preferencias antes de probar.
- Identificar y enlazar módulos, rutas UI, almacenes, tests y dependencias de cada hito R8/R9.
- Crear inventario de escenarios por función con estado `NO PROBADO / PASS / FAIL / BLOQUEADO` y evidencia vinculada.
- Usar clúster de demostración o fixtures aislados de solo lectura; no correr acciones de escritura sobre producción.
- **Gate:** ninguna funcionalidad queda fuera de la matriz; los resultados anteriores no se marcan PASS sin nueva evidencia.

### Fase 1 — Auditoría profunda CodeRabbit + revisión humana (P0)

- Validar login y política de privacidad/datos para `coderabbit review --deep --base-commit 03c2435` (base R7), acotar el diff si supera límites.
- Examinar cambios R8/R9, efectos secundarios, condiciones de carrera, MobX/React lifecycle, memoización, listeners, timers, acceso a API, manejo de errores y persistencia.
- Complementar con TypeScript, ESLint, análisis de dependencias/seguridad y lectura humana de hallazgos; no aplicar cambios automáticamente a partir de la IA.
- **Gate:** clasificar cada hallazgo crítico/major, resolverlo o justificar explícitamente el riesgo; adjuntar reportes y commits.

### Fase 2 — Estabilidad de Electron y recuperación (P0)

- Playwright + Electron **real empaquetado**, con perfil temporal aislado, trazas, screenshot, logs renderer/main, errores JS y tiempos de respuesta.
- Repetir arranque limpio y con perfil existente; cambiar clusters/pestañas; montar y desmontar vistas, dialogs, terminal, tabla y settings; detectar iframes ocultos, estados atascados, listeners duplicados y render loops.
- Ejecutar navegación repetitiva y sesiones prolongadas; registrar RAM/CPU y si existen crecimientos persistentes; hacer prueba de recuperación al fallar/volver una API mock.
- Fallar ante hangs, renderer no responsive, excepciones no controladas, bloqueos persistentes o acciones sin respuesta. Definir umbrales medidos para la Mac de referencia y reportar resultados.
- **Gate:** ninguna falla de estabilidad crítica conocida; pruebas repetibles con evidencia, no solo smoke manual.

### Fase 3 — **Paridad gráfica y UX (PRIORIDAD DEL USUARIO)** (P0)

- Capturar Lens oficial y OpenLens DevOps bajo resolución, escala, densidad y estado equivalentes; registrar versión exacta del oficial. Las capturas son **referencia**, no prueba de equivalencia de implementaciones.
- Validar tipografía real, pesos y tamaños computados, `document.fonts`, jerarquía de encabezados, tabs, sidebar, tablas, formularios, modales, tooltips, terminal y diálogos.
- Verificar defaults y persistencia de **Midnight Graphite**; detectar flash de otro tema en arranque, cambiar entre Dark/Light/Official/Graphite y comprobar contraste, PROD safety y colores de entornos.
- Recorrer Settings: cada control modifica lo prometido, persiste cuando corresponde, se refleja al instante y sobrevive a reinicio. Documentar explícitamente las excepciones.
- Verificar tamaños de ventana y escalado macOS (incluida pantalla Retina), densidad compacta/confortable, overflow, corte de texto y layout responsivo.
- Capturas baseline con Playwright, comparación visual con tolerancias justificadas, revisión manual de diferencias significativas y snapshots aprobados después de cada modificación.
- **Gate:** nada se etiqueta «igual a Lens oficial» sin medidas/capturas; los problemas gráficos reportados por el usuario tienen casos de reproducción y aceptación.

### Fase 4 — Auditoría completa y E2E de Release 8 (P0)

| Hito | Función | Escenarios de aceptación obligatorios |
| --- | --- | --- |
| R8-01 | Exportar tablas (CSV/JSON/Clipboard) | selección de filas/columnas/filtros, encoding, caracteres especiales, anti CSV-injection, errores/cancelación y archivos válidos |
| R8-02 | Gateway API | GatewayClass, Gateway, HTTPRoute, GRPCRoute, TLSRoute, ReferenceGrant; list/detail, carga vacía/errores RBAC y versiones API |
| R8-03 | CEL Admission Policies | ValidatingAdmissionPolicy, Binding, MutatingAdmissionPolicy; expresiones legibles, compatibilidad API, paginación/errores |
| R8-04 | DRA | DeviceClass, ResourceClaim, ResourceClaimTemplate, ResourceSlice; list/detail, casos incompletos y versión API |
| R8-05 | Kube Applications | agregación de workloads, labels Helm/legacy, health correcto, cambios de filtro y ausencia de duplicados |
| R8-06 | Demo Cluster | bind solo loopback, datos mock, apertura desde Welcome, lectura, RBAC y denegación verificable de operaciones mutantes |
| R8-07 | Consolidación | empaquetado, inicialización, navegación transversal y ausencia de regresiones contra R7 |

### Fase 5 — Auditoría completa y E2E de Release 9 (P0)

| Hito | Función | Escenarios de aceptación obligatorios |
| --- | --- | --- |
| R9-01 | Auto-fit / resize | ancho de columnas, doble clic, límites, scroll y persistencia |
| R9-02 | Reordenar columnas | DnD, indicadores, encabezados/celdas sincronizados, reset y persistencia |
| R9-03 | Filtros por columna | popover, search, multi-select, clear/select all, combinación con filtros generales y lista vacía |
| R9-04 | Workload Insights | KPIs correctos, degraded/healthy, navegación/filtro y respuesta a cambios de datos |
| R9-05 | Packaging | archivos, recursos, carga en Electron y hash/firma concordantes |
| R9-06 | Lens Official Dark/Light | selección, tokens, legibilidad, cambios y persistencia |
| R9-07 | Midnight Graphite | default en arranque, colores, contraste, PROD safety y clases CSS sin residuos |
| R9-08 | Tipografía Lens | familia realmente usada, fuentes cargadas, escala, pesos, tamaños y diferencias visuales justificadas |
| R9-09 | Anti-freeze | iframes, visibilidad, resize, cambio de vistas y fallbacks sin loops ni UI bloqueada |
| R9-10 | Correctness/Type Safety | patches, guards, casos undefined/null, regresión funcional y revisión del diff |

### Fase 6 — Cierre, certificación honesta y nuevos cambios visuales (P0 → P1)

- Ejecutar regresión integrada con Playwright Electron + unitarias relevantes + CodeRabbit, comparar pantallas con baseline y revisar crashes/memoria.
- Clasificar cada resultado PASS/FAIL/BLOQUEADO/NO PROBADO; cero PASS sintéticos o aserciones triviales.
- Mantener versión estable previa disponible y ruta de rollback; solo etiquetar RELEASE si no quedan bloqueos críticos/major y hay evidencia reproducible.
- En las **siguientes iteraciones gráficas**, exigir ficha por cambio: referencia visual, diseño/tokens, implementación aislada, screenshot before/after, impacto en Settings, regresión y aprobación. No sacrificar estabilidad por semejanza estética.

## Entregables

1. `R8_R9_FULL_AUDIT_MATRIX.md` — cobertura completa por ruta/módulo/escenario y resultado comprobado.
2. `R8_R9_CODERABBIT_REVIEW.md` — hallazgos verificados, severidad, decisión y fix.
3. `R8_R9_ELECTRON_STABILITY_REPORT.md` — crashes/hangs/CPU/RAM y logs/traces.
4. `LENS_OFFICIAL_VISUAL_PARITY.md` — mapa de tipografías, tamaños y snapshots comparados.
5. `R8_R9_ACCEPTANCE.md` — checklist final, cambios, hashes y criterios GO/NO-GO.

**Regla de avance:** primero observamos y reproducimos, luego corregimos por lotes pequeños y volvemos a probar. No mezclar una oleada nueva de diseño con una oleada de correcciones de estabilidad sin baselines independientes.
