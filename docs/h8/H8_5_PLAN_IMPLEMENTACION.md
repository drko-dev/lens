# OpenLens DevOps — H8.5: Detector local de incidentes sin IA obligatoria

Fecha: 2026-11-05
Rama: feature/h8-5-local-incident-scanner
Código base: 9f8e5aec
Checkpoint: checkpoint/h8-4-1-2026-11-05
Historias autorizadas: H8-021 (P0) y H8-022 (P0).
Excluido: H8-023 (triaje automático por IA, P1, requiere autorización posterior).
Estado: PLANIFICADO. No se ha desarrollado el escáner todavía.

## 0. Preparación y arquitectura

- Leer GEMINI.md, docs/H8_AI_INCIDENTES_HISTORIAS_2026-11-04.md, docs/h8/H8_2_BROKER_ENTREGA_REPORTE.md, docs/h8/H8_4_1_GATE_CORRECCIONES.md, y la arquitectura de watchers, IncidentRepository, BrokerService, budgets, SQLite, timeline e IPC.
- Baseline H8.4.1 validado independientemente el 2026-11-05: 25 suites focalizadas / 225 tests PASS. Gemini reportó 27 suites / 229 PASS y smoke en Electron; el smoke no se repitió en la auditoría independiente.
- Respetar arquitectura existente: Electron Main para política, orquestación y auditoría; Renderer para controles y visualización; repositorio de incidentes SQLite, sin segundo gestor de estado ni segundo servidor MCP.
- H8.5 no autoriza solicitudes a clústeres reales: primero fixtures y un watcher/API sintéticos con credenciales falsas; nunca aprovisionar ServiceAccounts ni usar kubeconfig admin.
- Proveedores IA externos siguen deshabilitados. El escáner opera sin proveedor ni perfil IA.
- No hacer push, merge, RC package, git clean ni borrar datos personales; los viejos instaladores compilados se borraron por decisión explícita anterior.

## H8-021 — Escáner determinístico, explícito y acotado

### Funcionalidad

- Scanner **OFF por defecto** (incluso después de migrar SQLite, resetear preferencias o reiniciar).
- Activación opt-in claramente reversible por clúster, namespace y recursos; mostrar estado, alcance, última lectura, errores y momento de desactivación.
- Detección local con reglas determinísticas, no mediante LLM:
  - CrashLoopBackOff / ImagePullBackOff (revisar prioridad y reglas por separado).
  - OOMKilled y salidas de contenedor relevantes.
  - Reinicios anómalos (umbral + ventana configurables).
  - Node NotReady.
  - Deployment/StatefulSet/DaemonSet rollout degradado, no ready/available y agotamiento de deadline.
  - Eventos Warning importantes.
- Reutilizar watchers/streams/métricas existentes sin duplicar conexiones ni barrer indiscriminadamente logs.
- Alcance por clúster/namespace/recurso: impedir cualquier lectura lateral o al clúster equivocado.
- Ejecutar consultas solo a través de read broker H8.2 (identidad usuario ∩ identidad agente, RBAC, allowlists, cuotas) cuando se habilite algún clúster real posteriormente. En H8.5 actual, solo ejecutores sintéticos.
- No ejecutar diagnósticos IA, ni acciones automáticas Kubernetes.
- Schedulers cancelables, con backoff, jitter, cola acotada y límites de CPU/RAM/eventos. Prohibir múltiples escáneres duplicados del mismo scope.
- Detener completamente al desactivar, cerrar OpenLens, cerrar/conmutar clúster, revocar sesión/permisos o perder conexión. Esperar/descartar respuestas tardías y limpiar timers/listeners/streams.

### Señal y consistencia

- Clasificar severidad preliminar como heurística, no como causa raíz confirmada.
- Registrar origen, timestamp, clusterId, namespace, UID/recurso, tipo de señal, condición observada y observaciones sanitizadas.
- No persistir logs ni manifests brutos en la tabla de incidentes por el mero hecho de detectar una anomalía.
- Separar eventos desconocidos/incompletos de evidencias comprobadas.
- Garantizar diseño idempotente/restart-safe sin iniciar escaneo por defecto.

## H8-022 — Deduplicación, cooldown y Centro de Incidentes

- Fingerprint estable de señal por clusterId, namespace, UID o identidad estable de recurso, regla y ventana lógica; evitar colisiones entre clústeres o recreaciones del mismo nombre.
- Deduplicar y aplicar cooldown con comportamiento documentado ante fluctuaciones, reintentos, restart, cambios de UID y cambio de estado.
- Repeticiones actualizan un incidente existente y timeline de forma atómica, sin cientos de incidentes nuevos.
- Persistir solo contenido sanitizado y metadatos acotados para investigación y auditoría.
- UI: Centro de Incidentes con alerta agrupada y acciones **Analizar ahora**, **Posponer**, **Descartar**; ninguna lanza IA automáticamente.
- Posponer/descartar no detienen la política de seguridad; manejar reaparición y nuevos eventos respetando cooldown y decisiones del operador.
- Contadores de tasa de alertas, deduplicados, descartados, último ciclo, errores y coste de watchers (si se mide).
- Botón Detener: inmediato, visible y verificable sin perder datos existentes.

## Tests de seguridad y resiliencia

1. Escáner apagado por defecto en DB nueva, migrada y reiniciada, y sin watchers en estado OFF.
2. Activar/detener scoped en clúster/namespace con fixtures; denegar scope ajeno incluso con kubeconfig admin simulado.
3. CrashLoopBackOff, OOMKilled, NotReady, restarts, rollouts, Warning, recuperación, datos faltantes y falsos positivos.
4. Dedupe concurrente, intervalos cooldown, UID cambiado, reintentos e idempotencia SQL bajo carreras.
5. Alta tasa de eventos (tormenta) con presupuestos/tasas, recuperación de errores, backoff y ausencia de bucle CPU.
6. Cierre de aplicación, cambio de clúster, revocación, pérdida de red y respuesta tardía: cero listeners/timers/streams huérfanos.
7. Secret/logs maliciosos, prompt injection y manifest descontrolado: cero fuga a SQLite, UI, auditoría o IA.
8. Verificar que 0 solicitudes HTTP K8s mutadoras y 0 llamadas a proveedores IA ocurren.
9. UI Midnight Graphite + Global Docking, smoke Electron DEV con API y watch sintéticos; sin red Kubernetes real.
10. Regression focalizada H8.1-4 y docking; sin builds RC ni suites globales masivas.

## Riesgo residual para H8.6

El contexto manual H8.4.1 ya valida existencia y correspondencia incidente/cluster/namespace/archivo en IPC. Una auditoría posterior deberá reforzar o demostrar de modo explícito la **correlación de WebContents/ventana/sesión autorizada con el incidente** y rechazar invocaciones desde otra ventana interna válida. No presentar la simple coincidencia de IDs en argumentos renderer como autorización. Cubrir en H8.6 adversarial security gate antes de conectar clústeres reales.

## Entrega y promoción

- Commits convencionales separados para H8-021 y H8-022, pruebas y documentación.
- Informe docs/h8/H8_5_ENTREGA_REPORTE.md, capturas y métricas honestas, memoria Engram actualizada.
- Dictamen explícito APROBADO/BLOQUEADO según tests y smoke real.
- No push, merge a develop, RC packaging ni H8-023 sin autorización posterior.
- Tras gate H8.5, pasar a H8.6 auditoría adversarial, rendimiento/resiliencia y RC MVP (H8-024..026).
