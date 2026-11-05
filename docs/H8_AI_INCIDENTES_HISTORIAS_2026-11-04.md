# OpenLens DevOps H8 — Backlog de épicas e historias

**Fecha:** 2026-11-04 · **Estado de TODAS las historias:** PROPUESTAS / NO INICIADAS.
**Base:** decisiones funcionales y de arquitectura en `/Users/gustavomarcon/Documents/lens/OPENLENS_AI_ARCHITECTURE_DECISIONS.md` (01/11/2026); orden de implementación en `docs/H8_AI_INCIDENTES_ROADMAP_2026-11-04.md`.

No convertir estas historias en tareas ejecutables de producción antes de resolver los gates de identidad, autorización y aislamiento. RC4 / H7 permanece congelado y aprobado para QA interno.

## Convenciones

- **P0:** imprescindible para el MVP o para permitirlo con seguridad. **P1:** mejora de MVP que puede entrar en hito posterior. **FUTURO:** expresamente diferido.
- **AC:** criterio de aceptación verificable. Todos los casos con Kubernetes se prueban con API sintética y perfiles aislados hasta nuevo permiso.
- **Estado:** `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE` con evidencia real; por ahora todos `TODO`.
- **Salida:** una historia no queda DONE por un screenshot o un test simulado que no reproduzca el flujo; requiere test de módulo y, si hay UI, smoke de Electron focalizado.

## Épica H8.0 — Seguridad, arquitectura y reutilización (ninguna feature nueva)

### H8-001 — Auditoría del MCP ya existente | P0 | H8.0
**Como** arquitecto de OpenLens, **quiero** conocer las capacidades y limitaciones reales del MCP actual **para** reutilizar el servidor seguro sin duplicarlo.

**AC:**
- Inventario de `mcp-server.ts`, `mcp-stdio.ts`, `types.ts` y UI; contrato de las siete herramientas y estado de backend real.
- Matriz de permiso por verbo/recurso/subrecurso, scope, redacción, límite y riesgo; incluir nodes/proxy, pods/exec/attach/portforward, secrets y serviceaccounts/token.
- Evidencia de que sin backend configurado la herramienta deniega; corregir en historia aparte cualquier mensaje UI que anuncie falsamente «Ready».
- ADR sobre qué se reutiliza, qué se refuerza y qué NO se expone.

### H8-002 — Modelo de identidad y mediador de confianza | P0 | H8.0
**Como** responsable de seguridad, **quiero** un broker con credenciales técnicas independientes y privilegios mínimos **para** impedir que el modelo herede el kubeconfig administrador.

**AC:**
- ADR compara broker local aislado y servicio central opcional; define quién provisiona, almacena, rota y revoca cada identidad.
- Diagrama de fronteras de confianza desde Electron renderer hasta Kubernetes/IA, con política default-deny y binding usuario/agente/cluster/namespace/tool.
- Prueba de diseño documentada de que ningún flujo se apoya solo en esconder controles UI o reutilizar permisos de admin.
- No habilitar clúster real ni PROD hasta demostrar el control implementado.

### H8-003 — Política segura de entradas, IPC y datos no confiables | P0 | H8.0
**Como** operador, **quiero** que logs, manifiestos y prompts externos se traten solo como datos **para** evitar instrucciones maliciosas o acceso arbitrario.

**AC:**
- Contratos de schema para IPC/tool args, catálogos de tools verificadas y rechazo de resourceKinds/subrecursos peligrosos.
- Diseño de aislamiento del motor de IA frente al renderer y a extensiones; no `exec`, shell, filesystem libre ni lectura de credenciales.
- Plan focalizado de pruebas de prompt injection, exfiltración y cross-tenant.
- Identificar dependencias legacy de Electron a las que no se debe dar confianza implícita.

### H8-004 — Selección SQLite, secretos y migraciones | P0 | H8.0
**Como** desarrollador, **quiero** una capa de persistencia multiplataforma estable **para** almacenar incidentes y perfiles sin arriesgar los datos clásicos.

**AC:**
- Spike documentado sobre driver SQLite compatible con Electron ARM64 y otras plataformas; evitar introducir un rebuild nativo innecesario sin comparar alternativas.
- Diseño de esquema versionado/migraciones idempotentes, backup/recovery y límites de almacenamiento.
- Contrato de credenciales: solo referencias opacas en SQLite; valores secretos en Keychain/almacén nativo. Evidencia sensible en reposo con protección adecuada.
- Prohibido migrar ahora clusters, kubeconfigs, settings o layout previos.

## Épica H8.1 — Centro de Incidentes local, sin IA

### H8-005 — Repositorio SQLite para incidentes | P0 | H8.1
**Como** usuario, **quiero** conservar un incidente tras reiniciar OpenLens **para** retomar su investigación.

**AC:**
- Crear/leer/actualizar/listar incidentes con clave/propietario local, clusterId, namespace, recurso, timestamps y severidad.
- Esquema y migración versionados; corrupción/fallo de migración no impide iniciar OpenLens, existe recuperación segura.
- No se escriben Secrets, credenciales ni adjuntos originales; test de restart focalizado.

### H8-006 — Estados y trazabilidad de un caso | P0 | H8.1
**Como** operador, **quiero** distinguir investigación, hipótesis y causa confirmada **para** no confundir sugerencias con certezas.

**AC:**
- Workflow `DETECTADO → INVESTIGANDO → HIPÓTESIS → CONFIRMADO → SOLUCIÓN PROPUESTA → APROBACIÓN HUMANA → VALIDACIÓN → CERRADO`, con alternativas `NO CONFIRMADO` y `INCONCLUSO`.
- Registrar autor, hora, justificación y evidencia para transiciones sensibles; impedir «CONFIRMADO» sin referencia verificable.
- Una propuesta no implica cambio aplicado; cerrar caso sin inventar resultado.
- Incidente conserva su timeline al reiniciar.

### H8-007 — UI Centro de Incidentes y Workbench | P0 | H8.1
**Como** operador, **quiero** abrir un caso desde una vista Kubernetes o una lista de incidentes **para** analizarlo en contexto.

**AC:**
- Lista filtrable por cluster/namespace/severidad/estado y detalle con resumen, evidencia, timeline, hipótesis y propuesta.
- Una ficha conserva vínculo estable clusterId + recurso/UID + rango temporal y muestra diferencias de contexto.
- Funciona sin credenciales IA ni Jira/Grafana; se integra con navegación existente sin romper Global Docking.
- Acción de crear un caso con datos sintéticos no inicia ninguna llamada al modelo.

### H8-008 — Evidencia versionada, deduplicada y auditada | P0 | H8.1
**Como** analista, **quiero** saber de qué dato se dedujo cada conclusión **para** poder comprobarla.

**AC:**
- Cada evidencia guarda tipo, origen, clusterId, scope, recurso/UID, instante, versión, referencia segura y fragmento acotado.
- Permite marcar evidencia insuficiente, caducada, contradictoria y revocada; no presenta la ausencia de métricas como diagnóstico seguro.
- Evita registrar tokens o cuerpos secretos y limita el volumen por incidente.
- Evidencia sensible en reposo sometida al diseño aprobado de protección.

### H8-009 — Conservación de incidentes configurable | P0 | H8.1
**Como** usuario, **quiero** definir cuánto conservo mis incidentes **para** gestionar privacidad y espacio.

**AC:**
- Ajustes de retención manual/indefinida, 30/90/180/365 días y personalizado, con default pendiente de decisión de producto.
- Un incidente fijado/protegido se excluye de purga automática; previsualizar vencimientos antes de habilitar la purga.
- Diferenciar ficha de adjuntos/evidencias voluminosas y registrar borrados locales; no afectar otros equipos ni plataformas externas.
- Sin borrado silencioso del contenido del usuario ni credenciales.

## Épica H8.2 — Broker de lectura y evidencias Kubernetes

### H8-010 — Autorización de doble identidad por llamada | P0 | H8.2
**Como** administrador, **quiero** que cada operación pase la intersección efectiva de permisos **para** evitar acceso lateral o escalamiento.

**AC:**
- `allow = usuario ∩ agente ∩ clúster ∩ namespace ∩ tool`; se resuelve y revalida en el mediador, no solo en React.
- Cambios de clusterId, revocación, cierre de sesión y cambio de namespace invalidan scopes y handles; default deny.
- Tests negativos para namespace ajeno, usuario ajeno, cuenta admin, ID adulterado, TOCTOU y doble herramienta concurrente.
- Sin identidad técnica válida no hay acceso real, aunque la UI tenga un kubeconfig admin.

### H8-011 — Herramientas de diagnóstico de solo lectura | P0 | H8.2
**Como** investigador, **quiero** consultar estado, eventos y logs dentro de un incidente **para** reunir evidencia sin modificar nada.

**AC:**
- Reutiliza `OpenLensMcpServer` y adaptadores de lectura existentes; no crear un servidor paralelo.
- Allowlist mínima validada incluyendo verbo/subrecurso (no equiparar GET a seguro); prohíbe Secrets, nodes/proxy, exec, portforward, attach, token minting y escrituras.
- Límites de líneas, longitud, resultados, tiempo y concurrencia; errores y permisos faltantes quedan como INCONCLUSO.
- Prueba adversarial confirma cero escrituras a la API sintética.

### H8-012 — Sanitización antes del modelo | P0 | H8.2
**Como** usuario, **quiero** que la evidencia se filtre antes de llegar al proveedor **para** evitar filtrar tokens y datos personales.

**AC:**
- Redacción y/o bloqueo de tokens, contraseñas, certificados, claves, URLs sensibles, Secret, PII según clasificación.
- Los logs y manifiestos son datos no confiables: ignorar instrucciones embebidas y excluir texto peligroso de los prompts del sistema.
- Pruebas adversariales con patrones conocidos y variantes; salidas, errores, auditoría y reportes tampoco filtrarán el secreto de prueba.
- La UI muestra qué parte de la evidencia fue limitada/redactada.

### H8-013 — Presupuesto de herramientas y auditoría por caso | P0 | H8.2
**Como** usuario, **quiero** limitar solicitudes, logs y duración **para** controlar costos y carga en Kubernetes.

**AC:**
- Presupuesto por incidente/usuario/cluster para herramientas, líneas, bytes, duración, reintentos y concurrencia.
- Cancelación/revocación detiene el flujo y evita respuestas tardías hacia un caso ya cerrado.
- Auditoría: quién pidió qué, sobre qué scope, resultado y denegaciones, sin guardar secretos.
- Se llega a límite → detener y pedir aprobación explícita para ampliar; no afirmar tope monetario universal.

## Épica H8.3 — Diagnóstico bajo demanda con proveedor IA

### H8-014 — Perfiles de IA y gestión segura de credenciales | P0 | H8.3
**Como** usuario, **quiero** conectar un proveedor soportado **para** iniciar diagnósticos sin almacenar su token en claro.

**AC:**
- Perfil en SQLite: nombre, proveedor, endpoint/modelo permitido, estado y cuotas; token y OAuth solo en almacén seguro, referenciado de modo opaco.
- Alta, prueba de conexión, edición, desconexión, rotación y revocación; nunca exponer credenciales al LLM ni a logs.
- Arquitectura adapter que permite sustituir proveedor; un proveedor inicial basta para el MVP.
- Sign in with ChatGPT/planes Claude u OAuth quedan solo como opción de viabilidad a verificar; no prometer uso gratuito de APIs.

### H8-015 — Ejecutar diagnóstico bajo demanda y acotado | P0 | H8.3
**Como** operador, **quiero** pulsar «Analizar incidente» **para** recibir hipótesis comprobables basadas en la evidencia disponible.

**AC:**
- Requiere incidente/contexto y consentimiento de envío; reúne solo datos suficientes mediante H8.2 y controla presupuesto.
- Estructura resultado en hechos con citas, hipótesis con confianza, contradicciones, datos faltantes y próximo paso.
- Si no hay permisos, métricas o evidencia, devuelve INCONCLUSO y no inventa causa ni CVE.
- Reintento/cancelación/desconexión no duplica cargos o investigación sin control y deja auditoría.

### H8-016 — Plan de remediación reversible sin ejecución | P0 | H8.3
**Como** responsable del servicio, **quiero** una propuesta revisable **para** decidir qué cambiar sin delegar escrituras al modelo.

**AC:**
- Plan incluye explicación, diff/YAML sugerido, precondiciones, riesgos, impacto, validación y rollback; no ejecuta comandos.
- Los cambios sugeridos son propuestas, no reflejan estado real hasta verificarse.
- No se expone herramienta de patch, apply, merge, deploy, sync o PR al modelo en el MVP.
- Se registran la versión/base de evidencia y la decisión humana de revisión.

### H8-017 — Verificación posterior exclusivamente de lectura | P0 | H8.3
**Como** operador, **quiero** comparar salud antes/después de un cambio humano **para** decidir si realmente mejoró el incidente.

**AC:**
- Verifica estado, eventos/logs y métricas cuando existan, en ventana temporal definida.
- Etiqueta «cambio aplicado por humano», «validación exitosa/fallida/inconclusa» separadamente de «propuesta generada».
- Si no hay evidencia posterior suficiente, no marca resuelto automáticamente.
- Todo acceso pasa por el broker y queda trazado.

### H8-018 — Cuota y transparencia de costos IA | P0 | H8.3
**Como** usuario, **quiero** un límite visible por análisis **para** evitar gastar tokens indefinidamente.

**AC:**
- Presupuestos por incidente, usuario y mes (cuando el proveedor permita cuantificar), con límite de iteraciones/tiempo/contexto.
- Mostrar consumo real o estimado claramente identificado; el límite local no se presenta como garantía de facturación del proveedor.
- Alcanzar cupo detiene automatismos y exige aprobación para ampliar.
- Funciona con proveedores sin medición monetaria directa.

## Épica H8.4 — Contexto adicional manual y efímero

### H8-019 — «Agregar contexto» multiarchivo | P0 | H8.4
**Como** investigador, **quiero** adjuntar temporalmente Dockerfile, values.yaml, ConfigMap y otros archivos de configuración **para** dar contexto a un incidente.

**AC:**
- Permite cargar varios archivos manualmente y corregir tipo/entorno/recurso/version declarados; advierte si no se acredita correspondencia con lo desplegado.
- Nunca ejecuta `RUN`, shell, Helm, scripts ni plantillas aportadas; Secret por defecto no aceptado.
- Antes de consultar IA, muestra archivos/tamaño/advertencias/costo y exige consentimiento.
- No depende de GitHub, repositorio, registry, CI ni escáner externo.

### H8-020 — Procesamiento y eliminación efímera de adjuntos | P0 | H8.4
**Como** usuario, **quiero** que mis archivos se descarten después de cada investigación **para** no almacenar configuraciones sensibles.

**AC:**
- Solo memoria o temporal seguro; limpiar contenido al terminar, cancelar, fallar, cerrar y tras crash al próximo arranque.
- SQLite almacena únicamente nombre/tipo/hash/fecha/versión declarada no sensible y hallazgos filtrados, nunca cuerpo original ni fragmentos sensibles.
- Nueva versión requiere carga nueva y consentimiento; no hay reutilización silenciosa.
- Informar que la retención del proveedor IA externo sigue sus propias condiciones y no se elimina solo por borrar el temporal local.

## Épica H8.5 — Detección local opt-in sin IA obligatoria

### H8-021 — Escáner determinístico por clúster y namespace | P0 | H8.5
**Como** operador, **quiero** activar supervisión local **para** detectar CrashLoopBackOff, OOMKilled, reinicios, NotReady, rollouts degradados y Warning.

**AC:**
- OFF por defecto, activación explícita por clúster/namespace/recurso, con indicador de actividad y hora de últimas lecturas.
- Reutiliza watchers y métricas existentes sin barrer todos los logs indiscriminadamente.
- Se detiene al cerrar OpenLens; no promete 24/7, funciona sin IA.
- Permisos y cuotas aplican igual que al diagnóstico manual.

### H8-022 — Deduplicación y Centro de Incidentes para señales | P0 | H8.5
**Como** usuario, **quiero** que una misma anomalía no genere cientos de alertas **para** conservar señal útil.

**AC:**
- Fingerprint estable, cooldown/ventanas, severidad preliminar y agrupación por origen/recurso.
- Un evento repetido actualiza incidente existente con timeline, no crea duplicados.
- Alerta permite «Analizar ahora», «Posponer» y «Descartar», sin lanzar IA por defecto.
- Mide tasa de alertas y permite desactivar inmediatamente el escáner.

### H8-023 — Triaje automático IA opcional | P1 | H8.5+ (NO requerido para MVP inicial)
**Como** usuario, **quiero** optar por análisis IA ante señales significativas **para** reducir investigación manual sin perder presupuesto.

**AC:**
- Segunda autorización separada del escáner, desactivada por defecto y por alcance específico.
- Límites de severidad, cuota, cooldown, cancelación y notificación previos a gasto.
- Si proveedor está caído o se alcanza presupuesto, continuar alertando sin IA.

## Épica H8.6 — Seguridad, integración y cierre del candidato

### H8-024 — Campaña adversarial de seguridad | P0 | H8.6
**Como** responsable de seguridad, **quiero** verificar la frontera de confianza **para** impedir fugas y escalamiento antes de exponer un clúster real.

**AC:**
- Pruebas negativas para Secret, token, proxy, impersonación, escritura, maliciosos en logs/manifiestos, IDs de incidente ajenos, scopes cruzados, revocación y tool output.
- Logs y auditoría de pruebas no contienen credenciales; pruebas ejecutadas con identidades sintéticas restringidas.
- Toda vulnerabilidad bloqueante genera rechazo de release hasta corregirse; documentar casos no verificados.

### H8-025 — Rendimiento, resiliencia y límites del Centro | P0 | H8.6
**Como** usuario, **quiero** que OpenLens siga utilizable al investigar incidentes **para** no degradar el equipo ni generar conexiones huérfanas.

**AC:**
- Tests focalizados para cerrar/reabrir app, corrupción SQLite, caídas de API/IA, cancelación, pérdida de red y cuotas agotadas.
- Comprobar conteo de listeners, timers, streams, memoria y CPU del flujo modificado sin testear todo H7 de nuevo.
- Preservar permisos, workspaces y sesiones existentes de H7, incluso cuando el proveedor IA falla.
- Release documenta limitaciones y no toca perfiles reales durante QA.

### H8-026 — Candidato MVP y aceptación en Electron | P0 | H8.6
**Como** usuario, **quiero** instalar una versión verificable **para** evaluar el Centro de Incidentes sin comprometer RC4.

**AC:**
- Ejecutar una campaña integral del nuevo módulo sobre Electron QA aislado, solo cuando el código esté estable.
- Empaquetar en salida distinta de `dist/rc4`; mantener RC3/RC4 intactos y hashes comprobables.
- QA de instalación, esquema y recuperación, cero escrituras Kubernetes y rollback, con informe PASS/PARTIAL/BLOCKED.
- Sin push/merge, servicios centrales ni distribución pública salvo aprobación.

## Backlog posterior explícitamente diferido

- Integraciones Grafana/Loki/Alertmanager, Jira, GitHub/GitLab/Bitbucket, Slack/correo y GitOps.
- Servicio receptor de alertas 24/7, conectores residentes, sincronización entre escritorios y multitenancy central.
- Búsqueda de casos similares, aprendizaje, correlación entre servicios, dashboards avanzados, escaneo de imágenes/SBOM.
- Análisis directo de repositorios y conexión remota de código/archivos; los adjuntos manuales son el primer paso.
- Multi-proveedor simultáneo, OAuth de planes de consumo y cliente MCP remoto autenticado, sujetos a revisión de elegibilidad, seguridad y operación.
- Acciones Kubernetes y despliegue mediante agentes: **NO forman parte del MVP**; cualquier evolución exige nuevo diseño y permisos explícitos.

## Primer paquete listo para estimar

**Sprint 0 — H8.0**: H8-001, H8-002, H8-003, H8-004. Entregable: inventario real + ADRs de broker, identidad y SQLite. Sin ejecutar tests masivos, sin cambios de clúster, sin código de feature.

**Sprint 1 — H8.1** (solo después de ADR-03): H8-005, H8-006, H8-007, H8-008; H8-009 requiere decidir el default de retención. Entregable: incidente sintético creado y recuperado tras reinicio.

**Sprint 2 — H8.2** (después del modelo de identidad validado): H8-010…H8-013. Entregable: mediador de lectura y auditoría con denegaciones comprobadas.

La estimación de esfuerzo y asignación de implementadores se realizará después de H8.0; no inventar puntos de historia sin inspección técnica adicional.

## Política de ejecución para Gemini

- Proyecto Engram canónico `lens-v6-ui-corrections`; leer `GEMINI.md` antes de empezar.
- Crear rama H8 nueva solo tras autorización; no modificar código H7/RC4 en esta etapa documental.
- Sonnet/subagentes Haiku eran la preferencia de orquestación en Claude; al usar Gemini, adoptar roles equivalentes disponibles y no asumir acceso a esos modelos.
- Paralelismo para investigar archivos independientes; un solo build pesado y Electron QA por vez.
- Tests por historia, no suite completa H7/4.039 Core; test de seguridad negativo obligatorio cuando se toca el broker.
- No llamar PASS a historias sin evidencia de comportamiento; no tocar clústeres reales sin autorización explícita y revisión de seguridad.
