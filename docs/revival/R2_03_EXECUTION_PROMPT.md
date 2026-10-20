# OpenLens DevOps Revival — Hito R2-03
## Visor de logs avanzado, búsqueda/filtrado y continuidad de registros

**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens`  
**Rama:** `feat/openlens-devops-revival`  
**Release:** R2 — Productividad y experiencia de usuario  
**Iniciar:** R2-03, sin rehacer R1 ni R2-01/R2-02.

### 1. Contexto y código que debés leer
Leer `docs/revival/R2_02_VALIDATION.md`, `R2_01_VALIDATION.md`, `R2_IMPLEMENTATION_CHECKLIST.md`, `R1_06_VALIDATION.md`, `ROADMAP_PROVISIONAL.md`, el estado Git y las pruebas existentes. Inspeccionar:
- `packages/core/src/renderer/components/dock/logs/store.ts`
- `packages/core/src/renderer/components/dock/logs/logs-view-model.ts`
- `packages/core/src/renderer/components/dock/logs/list.tsx`, `list.scss`
- `packages/core/src/renderer/components/dock/logs/controls.tsx`, `view.tsx`
- `packages/core/src/renderer/components/dock/logs/search.tsx`
- `packages/core/src/renderer/components/dock/logs/tab-store.ts`
- `packages/core/src/renderer/components/dock/logs/__test__/log-search.test.tsx`
- `packages/core/src/renderer/search-store/search-store.ts` (ajustar ruta real), y el código de `VirtualList`, `call-for-logs`, `reload-logs`.

**Hallazgos de código previo:** ya existe `LogSearch` con texto, resaltado y navegación; `LogList` está virtualizado, incluye ANSI saneado mediante DOMPurify, selector de timestamps, preferencias de zona horaria y descargas; el store consulta logs periódicamente. **No duplicar estas funciones**. Primero verificar el comportamiento real y diferenciar mejoras de funcionalidades ya existentes.

### 2. Requisito central: continuidad e integridad de logs
El código actual de `LogStore.getLastSinceTime()` incrementa el último timestamp un segundo antes de usar `sinceTime`; además concatena `oldLogs` con la respuesta de la siguiente consulta. **Investigar y corregir la posibilidad de perder líneas dentro del mismo segundo y de duplicar mensajes**. Diseñar cursor de alta precisión y solapamiento controlado, con deduplicación determinista; no deduplicar únicamente por texto porque pueden existir dos líneas iguales legítimas. Considerar:
- Varios eventos con mismo timestamp pero contenido diferente, eventos repetidos legítimos y orden estable.
- Reinicios de contenedor, Pod/UID distinto, cambio de contenedor, `showPrevious`, relojes discordantes, retrasos en la API, timeout, 403/404 y desconexión.
- Respuestas de sondeo superpuestas, cancelación de consultas en vuelo al cerrar/cambiar pestaña y backoff limitado.
- Mensajes multilínea, errores transitorios y estados de reconexión sin reescribir silenciosamente todo el buffer con un texto de error.
- Límite de memoria configurable por pestaña y política clara de truncamiento, con contador/aviso; no prometer conservación ilimitada ante desconexiones o buffers acotados.
- Tests que reproduzcan pérdida de registros, duplicados y errores, con llamadas de logs simuladas.

### 3. Búsqueda y filtrado moderno
Extender el `LogSearch` existente para ofrecer:
- **Modo buscar** (resaltado y navegación de coincidencias) y **modo filtrar** (ocultar líneas que no coincidan), separados y claramente identificados.
- Texto simple y expresiones regulares opcionales; sensibilidad a mayúsculas/minúsculas opcional; contador de coincidencias y líneas filtradas.
- Validación y mensaje no invasivo ante regex inválida; protección ante patrones patológicos (longitud máxima, ejecución acotada u otra estrategia que no bloquee el renderer).
- Buscar sobre contenido textual visible sin interpretar HTML/ANSI como texto de búsqueda; resaltar coincidencias sin HTML no confiable ni `dangerouslySetInnerHTML` con texto no saneado.
- Filtros por pestaña y no globales para evitar cruzar criterios entre diferentes clústeres/pods.
- Atajos de teclado razonables y estado vacío claro (sin coincidencias vs sin logs).
- Mantener copia/selección de texto y scroll hacia coincidencia activa aun con virtualización y filtros.

### 4. Pausa/reanudación sin pérdida dentro de la sesión
Definir y mostrar explícitamente la diferencia entre **pausar el seguimiento/auto-scroll** y **pausar visualización**. Preferencia sugerida: mientras el usuario pausa la vista, continuar capturando mensajes en buffer acotado, mostrar contador de pendientes y ofrecer `Resume` que actualice de golpe sin perder lo recibido dentro del límite. No confundir con `Stop loading` que detiene el sondeo. Informar de líneas descartadas por límite y de brechas que no puedan reconstruirse. No afirmar \"cero pérdida absoluta\" si el API server no permite reanudar el historial.

### 5. Ergonomía del visor
- Conmutador **word wrap**, respetando virtualización. El alto de filas no puede permanecer fijo en 18 px si se permite wrap: medir filas o elegir una técnica probada que no solape ni esconda registros.
- Toggle de timestamps legibles en hora local y posibilidad de ver fecha/hora en formato claro (evitar interpretar timestamps faltantes como fechas actuales).
- Indicadores de estado: LIVE, PAUSED, RECONNECTING, ERROR, TRUNCATED, con contraste accesible, consistentes con la UI de R2-01.
- Mantener selector de pod/contenedor, `showPrevious`, descarga de logs y scroll-to-bottom ya existentes.
- Cuidar rendimiento con decenas de miles de líneas; evitar filtrado regex costoso en cada render y re-render completo innecesario por poll.
- No exponer logs del usuario en capturas, telemetría ni informes de pruebas: usar fixtures ficticios y sanear mensajes.

### 6. Pruebas y criterios de aceptación
Crear/ampliar pruebas unitarias y de integración para:
1. Dos o más logs con timestamp idéntico, mismo texto repetido legítimamente, cursor con precisión subsegundo y reintentos de la última ventana sin pérdida ni duplicación artificial.
2. Pausa y reanudación con mensajes entrantes, contador de pendientes, ventana truncada y aviso visible.
3. Búsqueda de texto/regex con highlights correctos, invalid regex, match-case, modo filtro, no coincidencias y aislamiento entre pestañas.
4. Timestamps, zonas horarias, ausencia de timestamp, ANSI/XSS y word-wrap con listas virtualizadas.
5. Desconexión, error API/RBAC, regreso de red, cambio de pod/contenedor, `showPrevious`, limpieza de timers y requests.
6. No regresión de tabs, logs downloading, terminal y editor YAML (R1 y R2-02).

Correr Jest focalizado, `tsc --noEmit` y build bajo **Node v20.20.2**. Registrar exit codes y no reportar como aprobadas pruebas omitidas.

### 7. Build y GUI real al concluir
Generar `OpenLens DevOps.app` para **macOS ARM64** con `--publish never`, sin firma comercial ni notarización y usando **`open-lens/dist-stage`**, no `dist` si la instancia habitual sigue abierta. Verificar que el binario empaquetado se ejecuta con perfiles HOME/CICD aislados y `KUBECONFIG=/dev/null` para el smoke offline. No sobrescribir la app en uso.
Además del smoke de Welcome, realizar **una comprobación de la pestaña de logs con un fixture sintético o API local simulada**, ejercitando filtros, regex, pausa, resaltado, wrap y scroll. Si Playwright no llega a esa pantalla sin clúster, dejar esa parte pendiente y no declararla verificada. Para laboratorios Kubernetes, usar solo clúster local previamente autorizado; nunca operar producción.

### 8. Evidencia y continuidad
Crear `docs/revival/R2_03_VALIDATION.md`: cambios y rutas, diagnóstico/corrección del polling, tests/exit codes, evidencia GUI real, ruta/hash del binario, capturas **con datos ficticios**, rendimiento, problemas y límites documentados. Actualizar `docs/revival/R2_IMPLEMENTATION_CHECKLIST.md` solo por comprobaciones realmente realizadas.

**No borrar código, builds de respaldo, preferencias ni clústeres; no usar `git clean/reset --hard` ni hacer commits automáticos.** Tras terminar R2-03 continuar con R2-04 (terminal y sesiones) sin autorización rutinaria, salvo bloqueos de seguridad o validaciones imprescindibles pendientes.

**Comenzar por R2-03 y priorizar la integridad de recepción de logs antes del maquillaje visual.**
