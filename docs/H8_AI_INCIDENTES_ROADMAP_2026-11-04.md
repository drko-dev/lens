# OpenLens DevOps H8 — Roadmap: Centro de Incidentes y Diagnóstico IA

**Preparado:** 2026-11-04 · **Estado:** PROPUESTA DE PLANIFICACIÓN, sin implementación H8 · **Base:** `/Users/gustavomarcon/Documents/lens/OPENLENS_AI_ARCHITECTURE_DECISIONS.md` (decisiones del 01/11/2026, aportado por el usuario).

> H7/RC4 está cerrado para QA interno. H8 es una capacidad nueva; no confundirla con H7.8 ni con la certificación R8/R9 antigua. **No hay autorización para instalar infraestructura, conectarse a producción ni crear otra rama todavía.**

## 1. Norte del producto

Un usuario instala OpenLens DevOps en su propia computadora y puede operar con cero, uno o varios clústeres. Desde un recurso Kubernetes o desde el Centro de Incidentes puede abrir una investigación de solo lectura, consultar evidencias de logs/Kubetail, eventos, estados y métricas disponibles, recibir hipótesis con citas, y obtener una propuesta de remediación revisable. **La IA no escribe ni ejecuta comandos en Kubernetes**. El operador mantiene el control.

El MVP funciona **sin Jira, Grafana, Loki, Argo CD, GitHub, servicio central, agente 24/7 ni proveedores de IA concretos obligatorios**. Las conexiones a sistemas externos son adaptadores opcionales. Sin proveedor IA configurado, el Centro de Incidentes y la detección determinística siguen siendo útiles.

### Lo que el MVP SÍ entrega

- Centro de Incidentes nativo en la aplicación local, ligado a clúster + namespace + workload, con historial, evidencias acotadas y estados explícitos.
- SQLite **solo** para incidentes, auditoría, historial y configuraciones NO secretas de proveedores/agentes. No migrar el almacenamiento ya existente de OpenLens.
- Secretos de proveedores exclusivamente en un almacén seguro del sistema operativo, con referencias opacas en SQLite; protección de la evidencia persistida según su clasificación.
- Mediador de herramientas seguro, de lectura y con identidad técnica restringida que impone **intersección de permisos usuario ∩ agente ∩ clúster ∩ namespace ∩ herramienta**.
- Diagnóstico bajo demanda con **un proveedor inicial intercambiable**, presupuestos, sanitización y distinción entre hechos, hipótesis e información inconclusa.
- Propuesta de solución con explicación, diff/YAML sugerido, riesgos, comprobaciones y rollback; ninguna aplicación automática.
- «Agregar contexto» manual de varios archivos **efímeros**, sin conservar sus originales ni su contenido después del análisis.
- Detección local opt-in de señales determinísticas mientras la app está abierta, con notificación e incidente, sin invocación de IA por defecto.

### Fuera del MVP

Monitoreo 24/7 con OpenLens cerrado, receptor central, conectores Grafana/Loki/Jira/Slack/Git, análisis de repositorios y código fuente, escaneo dedicado de imágenes/SBOM, escritura Kubernetes, PR automático, multi-proveedor simultáneo y publicación pública del servicio MCP.

## 2. Inventario confirmado del repositorio (inspección de código, NO auditoría completa)

Ruta canónica: `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`. Rama actual: `feature/global-docking-h7`, HEAD al planificar: `a3b974d`. Hay un único Git worktree activo. No crear ni cambiar de rama durante esta planificación.

| Componente | Estado observado | Implicación H8 |
|---|---|---|
| `packages/core/src/main/mcp/mcp-server.ts` | Existe `OpenLensMcpServer`, validación, redacción, límites y callback opcional `authorizeCluster` | Auditar su uso real y extender con política segura; **no duplicar** |
| `packages/core/src/common/mcp/types.ts` | Siete herramientas declaradas: clusters, info, recursos, logs, eventos, costos | Crear matriz herramienta/verbo/recurso/subrecurso; revisar filtrados y metadatos |
| `packages/core/src/main/mcp/bin/mcp-stdio.ts` | Entrada stdio permite `context` opcional, inicializa sin él | Demostrar conexión real al backend con identidad segura; sin backend NO está listo |
| `packages/core/src/renderer/components/mcp-settings/` | Pantalla MCP existente, con comando de ruta histórica codificada | Sustituir indicador «Ready» no verificado y eliminar ruta hardcodeada en implementación |
| `packages/core/src/main/mcp/__tests__/` | Tests de hardening previos (fail-closed, revocación, límite, redacción) | Reutilizar; evaluar las brechas de aislamiento e identidad de H8 |
| `packages/core/src/renderer/components/kubetail/` | Store de streams que H7 ya reutiliza | Fuente de evidencias, no duplicar watchers |
| `packages/core/src/features/global-docking/` | Docking y recuperación inerte aprobados en RC4 | Integración UI aislada, sin romper H7 |

**No se identificó una integración SQLite de incidentes ni un Centro de Incidentes H8 en la inspección rápida.** El inventario anterior no certifica que los siete tools MCP funcionen conectados a clústeres reales, ni que cumplan la autorización dual de H8.

## 3. Arquitectura propuesta (separación de responsabilidades)

```text
OpenLens UI
  ├── Centro de Incidentes / Workbench
  └── Detección local determinística (opt-in)
          │
          ▼
  Incident Application Service
  ├── modelo de incidentes y evidencias
  ├── motor de investigación / estados
  ├── presupuesto, cancelación y auditoría
  └── selector de adaptador IA (uno al inicio)
          │
          ▼
  Broker / Policy Enforcement Point (Main o proceso aislado)
  ├── identidad del solicitante y del agente
  ├── intersección RBAC y scope por llamada
  ├── allowlist de métodos/subrecursos
  ├── sanitización y límites de datos
  └── adaptadores de lectura Kubernetes/MCP
          │
          ▼
  Kubernetes (GET/list/watch autorizado, sin Secrets/exec/proxy arbitrario)

Persistencia: SQLite local (incidentes, auditoría, perfiles no secretos)
Secretos: bóveda OS (Keychain / Credential Manager / equivalente Linux)
Adjuntos manuales: efímeros en memoria / temporal seguro con limpieza
Proveedores IA: adaptadores; nunca reciben kubeconfig ni tokens Kubernetes
```

**Decisión pendiente obligatoria:** concretar si el mediador seguro será un servicio local aislado o un servicio central opcional y demostrar cómo se obtiene/custodia la identidad técnica independiente sin aprovechar un kubeconfig administrativo como barrera. En la primera fase no se toca ningún clúster productivo.

## 4. Hitos y entregables

| Hito | Entrega | Historias clave | Gate de cierre |
|---|---|---|---|
| **H8.0** Fundaciones y amenazas | ADRs, inventario MCP real, contratos de identidad, tecnología SQLite/cifrado | H8-001…H8-004 | Diseño de permisos y seguridad revisado; sin código funcional necesario |
| **H8.1** Centro de Incidentes local | SQLite migrable, vista nativa, estados, retención, auditoría | H8-005…H8-009 | Crear/consultar/cerrar/reabrir incidentes en DEV sintético, sin IA |
| **H8.2** Broker de evidencias | Acceso mediado con doble identidad, datos acotados, vínculo a evidencias | H8-010…H8-013 | Pruebas negativas de acceso lateral, secreto y revocación; fail-closed |
| **H8.3** Diagnóstico IA bajo demanda | Perfil seguro de proveedor, diagnóstico con fuentes, cuotas, propuesta reversible | H8-014…H8-018 | Un incidente sintético diagnosticado con evidencia y sin writes |
| **H8.4** Contexto efímero | Agregar contexto manual multiarchivo, correlación con fuentes | H8-019…H8-020 | Ningún adjunto original persiste tras terminar/cancelar/reabrir |
| **H8.5** Alertas locales | Scanner opt-in sin IA, deduplicación/cooldown, incidentes y notificación | H8-021…H8-023 | Se detiene al cerrar app, evita duplicados y funciona sin proveedor IA |
| **H8.6** Endurecimiento y candidato MVP | Red-team, rendimiento, QA sintético, docs, empaquetado candidato aparte | H8-024…H8-026 | Todos los gates críticos pasan; cualquier uso PROD exige aprobación separada |

H8.1 puede desarrollarse en paralelo con la especificación de H8.2, pero **H8.3 no accede a datos reales** antes del gate de autorización y aislamiento de H8.2.

### Desglose práctico de primeras entregas

- **Entrega 0 (solo arquitectura):** ADR de límites, dibujo de confianza, inventario y clasificación de los 7 tools MCP, decisión de broker y almacenamiento. No crear nuevo servidor MCP.
- **Entrega 1 (valor local):** abrir un incidente sintético, persistirlo/reiniciar la app y recorrer sus estados; sin IA ni clúster real.
- **Entrega 2 (evidencia):** capturar logs/eventos/estado sintéticos mediante el broker, con citas, cuotas y rechazo comprobable de datos prohibidos.
- **Entrega 3 (primer diagnóstico):** invocar un proveedor configurado para un incidente, con salida estructurada y coste acotado; no usar suscripción ChatGPT/Claude como si fuera API.
- **Entrega 4 (contexto opcional):** correlacionar Dockerfile y values.yaml aportados manualmente, descartar archivos y registrar solo referencias mínimas sanitizadas.
- **Entrega 5 (detección opt-in):** alertas de CrashLoopBackOff/NotReady/OOMKilled/events Warning que crean incidentes sin gastar tokens.

## 5. Reglas de producto que prevalecen sobre propuestas anteriores

1. **«Agregar contexto», no un módulo AI Security independiente.** El Dockerfile es contexto opcional de un incidente; hay soporte multiarchivo.
2. **Los adjuntos son efímeros y de una sola investigación.** Se descartan originales y contenido al terminar, cancelar, fallar o cerrar. SQLite solo guarda referencias mínimas no sensibles y conclusiones sanitizadas.
3. **Sin servidor SHD obligatorio.** El producto es instalable localmente y multiclúster. Integraciones empresariales son adaptadores opcionales.
4. **MVP solo lectura en todos los entornos.** No hay ejecución de remediación, PR/merge/deploy automáticos ni terminal libre para la IA.
5. **Vigilancia local solo mientras OpenLens funciona.** 24/7 y triaje proactivo con IA quedan para fases futuras explícitas.
6. **Retención de incidentes configurable.** No fijar 90 días; default pendiente de decisión. Límites separados para evidencias voluminosas.
7. **OAuth / Sign in with ChatGPT:** solo investigación posterior según condiciones vigentes; nunca asumir que un plan Plus/Pro o Claude permite consumo general gratuito de API.
8. **No causa raíz inventada:** cualquier resultado puede terminar INCONCLUSO; «solución propuesta» no equivale a cambio aplicado ni incidente resuelto.

## 6. Criterios globales de aceptación (Definition of Done)

- Un caso de DEV sintético comprueba lectura correcta y reproducción con evidencia identificada (origen, clusterId, resource UID, hora/version y referencia).
- El mediador deniega por defecto el acceso fuera de `usuario ∩ agente ∩ clúster ∩ namespace ∩ tool` y registra la denegación sin datos sensibles.
- Ningún modelo recibe kubeconfig, token de Kubernetes, Secret ni permisos amplios de shell/filesystem.
- El diagnóstico distingue observación, hipótesis, verificación y falta de datos; incluye fuente concreta, limitaciones y estimación de impacto.
- Presupuesto por incidente y cancelación funcionan, incluso durante desconexiones.
- SQLite tiene migraciones/backup/rollback y no interfiere con el almacenamiento clásico de OpenLens.
- El Centro funciona sin proveedor IA ni integraciones externas.
- Unit tests acotados por módulo + smoke Electron DEV sintético al terminar cada hito; adversariales solo sobre los gates afectados, sin regresiones enormes por rutina.
- No se acepta PROD hasta contar con identidad técnica restringida demostrada, defensa frente a inyección/exfiltración, auditoría, aislamiento y autorización explícita del usuario.

## 7. Decisiones que requieren definición antes de codificar

- **ADR-01 (bloqueante):** topología de broker/mediador y modelo exacto de identidad técnica por agente/cluster/namespace; quién lo provisiona y revoca.
- **ADR-02 (bloqueante):** confianza/IPC del renderer legado vs Main, aislamiento del proceso de IA, tool grants y defensa contra prompt injection.
- **ADR-03 (técnico):** driver SQLite multiplataforma para Electron ARM64, esquema/migraciones, cifrado local y keychain; evaluar rebuild nativo.
- **ADR-04 (producto):** duración predeterminada de retención y límites físicos de DB/adjuntos, manteniendo configuración del usuario.
- **ADR-05 (producto):** proveedor y modalidad del primer diagnóstico (API pagada / cliente MCP / OAuth si fuese viable) y límites de costo.
- **ADR-06 (producto):** alcance exacto del escáner local opt-in y cómo representar alertas y severidades.
- **ADR-07 (UX):** lugar del Centro de Incidentes en sidebar/global docking, sin invadir ni alterar la UI ya cerrada en RC4.

## 8. Protocolo Gemini / Git / pruebas

- Leer `GEMINI.md` y `docs/GEMINI_HANDOFF_OPENLENS_H7_RC4_2026-11-04.md` para recuperar el workspace canónico, Engram y worktree. Usar `lens-v6-ui-corrections`; no elegir `kubetail`.
- H8 debe comenzar en una **nueva rama a acordar**, propuesta `feature/h8-ai-incident-workbench`, partiendo de la rama estable H7; no crearla hasta autorización.
- RC3 y RC4 quedan intactos. No push/merge sin autorización.
- Sonnet coordinador + subagentes Sonnet para módulos independientes + Haiku en QA focalizado, si la herramienta elegida admite esos agentes; no prometer modelos/subagentes que Gemini no tenga.
- Validación de bajo consumo: tests específicos primero, smoke del hito después; E2E integral/packaging solo en un candidato acordado.

## 9. Referencia

**Documento fuente:** `/Users/gustavomarcon/Documents/lens/OPENLENS_AI_ARCHITECTURE_DECISIONS.md` (227 líneas, proporcionado por el usuario). Contiene decisiones del 01/11/2026, propuestas conceptuales y correcciones posteriores que prevalecen sobre versiones previas. Este roadmap es una propuesta de ejecución derivada de ese contenido y de la inspección del repositorio, no una declaración de implementación existente.
