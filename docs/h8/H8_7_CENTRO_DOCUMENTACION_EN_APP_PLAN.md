# H8.7 — Centro de Documentación integrado en OpenLens DevOps

**Incorporación al roadmap:** 2026-11-06
**Prioridad:** P0, requisito de release del MVP.
**Estado:** PLANIFICADO; la implementación visual todavía no existe.
**Posición:** después de completar el gate de aceptación RC2 (H8.6.1 + RC2) y antes del cierre final del MVP.
**Proyecto Engram:** lens-v6-ui-corrections (no kubetail).

## Objetivo

Un usuario nuevo, sin conexión a internet y sin un clúster configurado, puede entrar a **Documentación** desde el menú de la aplicación, encontrar una guía de ventanas flotantes o de IA, y completar los pasos reproducibles en su propia instalación. Se cubren las funcionalidades nuevas de H7 y H8, sus restricciones reales y la resolución de problemas.

**Hallazgo del repositorio:** en packages/core/src/features/application-menu/main/menu-items/help/open-documentation/open-documentation-menu-item.injectable.ts ya existe Help > Documentation, pero abre la web externa docs.k8slens.dev mediante docsUrl. NO es documentación de OpenLens DevOps. Se debe reutilizar y adaptar, no duplicar el menú Help ni generar otra aplicación.

## Alcance funcional y entregables (DOC-001 a DOC-008)

### DOC-001 — Menú y acceso principal

- El menú nativo **Ayuda/Help > Documentación** abre el Centro de Documentación propio, dentro de OpenLens DevOps. En la interfaz española mostrar exactamente **Documentación**.
- Además, ofrecer acceso visible desde la navegación principal, Welcome o equivalente global; preferir la opción integrada a la arquitectura existente, sin contaminar la barra compacta con elementos redundantes.
- Disponible con cero clústeres, sin Kubernetes, sin proveedor de IA, y offline.
- La documentación externa de Lens, si se conserva, debe figurar como **Documentación de Lens (externa)** y no reemplazar el manual propio.
- Navegación de ida/vuelta, índice, artículos relacionados, búsqueda, foco accesible. Atajo F1 solo si no colisiona con atajos reales.

### DOC-002 — Centro de Documentación

- Vista nativa Midnight Graphite con buscador offline, índice lateral por categorías, títulos, contenido y anclas; responsive y navegable con teclado.
- Fuente editable y versionada en el repositorio: propuesta docs/user-guide/es/, empaquetada como recurso de la aplicación (nunca descargada de internet para mostrar).
- Renderizado de Markdown seguro, sin HTML arbitrario ejecutable, scripts, WebView de confianza implícita ni ejecución de comandos incrustados.
- Enlaces externos identificados como tales y abiertos con el mecanismo seguro ya disponible.
- Español argentino como base editorial; no traducir artificialmente controles que todavía estén en inglés: incluir el texto real de la UI entre paréntesis.
- Cada artículo con slug estable, título, versión/estado («Demo sintético», «Disponible», «No implementado»), fecha de revisión y referencias cruzadas.

### DOC-003 — Docking global y ventanas flotantes (H7)

Guía ilustrada, reproducible, paso a paso, que cubra:
1. Workspaces, clústeres, catálogo de paneles, pestañas, agrupación y distribución.
2. Arrastrar y acoplar izquierda/derecha/arriba/abajo; mover con teclado/menú, cambiar de posición y recuperar paneles replegados.
3. Crear una **ventana flotante real**: entrar al clúster correcto, abrir panel compatible, mostrar controles de hover/foco, pulsar «Open in a separate window», confirmar que se creó una ventana independiente.
4. Reacoplar mediante «Redock» o «Redock here», restaurar desde «Show window», cerrar/desacoplar, diferencia entre replegar/cerrar/desacoplar.
5. Múltiples ventanas y monitores; color/acento del pin por clúster; etiquetas de entorno/PROD; vínculo de cada ventana con su clúster.
6. Persistencia, restauración de layouts e inercia de streams: no prometer que se restauran automáticamente conexiones o estados que H7 no conserva.
7. **Restricciones reales verificadas:** las ventanas separadas resource-list para Pods/Deployments de H7.5 son de **solo lectura**; para editar se vuelve a acoplar. No prometer desacople universal sin validación por tipo de panel. Documentar si aplica OPENLENS_DETACHED_TOOLS o el flag correspondiente en el paquete publicado.
8. Problemas frecuentes: control de desacople no visible, ventana minimizada, panel vacío, reconexión, clúster equivocado, cerrar vs reacoplar.

Fuentes: docs/H7_3_CONTROLES_Y_REPLEGADO.md, docs/H7_5_VENTANAS_DESACOPLADAS.md, docs/H7_7_PERSISTENCIA_Y_RESTAURACION.md y docs/H7_8_RC4_CIERRE.md. Los títulos de controles deben verificarse contra la UI real.

### DOC-004 — Centro de Incidentes y escáner (H8)

- Abrir el Centro, seleccionar clúster/namespace, interpretar severidad, estados, timeline, evidencia, historial, retención y borrado.
- «Analizar ahora», «Posponer» y «Descartar»: Descartar lleva a NO CONFIRMADO, **no cierra** el caso mediante autorización privilegiada.
- Explicar reglas: CrashLoopBackOff, ImagePullBackOff, OOMKilled, reinicios, NotReady, rollout degradado, eventos Warning; deduplicación por UID/señal/fingerprint y cooldown.
- **Alcance real de RC2:** «Escáner Local (Demo Sintético)», OFF por defecto, fuente synthetic_feed, **0 watchers reales**. Activar demo no supervisa Kubernetes real, no ejecuta IA automáticamente y no representa disponibilidad 24/7.
- Diferenciar señales sintéticas, evidencia verificada e hipótesis.

### DOC-005 — Diagnóstico con IA, consentimiento y privacidad (H8)

- Diferenciar proveedor mock y proveedores externos, perfiles, bóveda de credenciales del sistema y límites de disponibilidad de integraciones.
- Cómo iniciar un diagnóstico bajo demanda, seleccionar evidencia, revisar consentimiento y ver límites/cuotas, cancelar y entender invalidación de consentimiento.
- Agregar **varios archivos de contexto efímero** (ejemplos Dockerfile, values.yaml, manifiestos), formatos/tamaños reales, metadatos, sanitización, eliminación al cancelar/finalizar; no subir contraseñas/Secrets.
- Leer hechos, hipótesis, confianza, referencias/citas verificadas vs no verificadas, resultado INCONCLUSO, diff de propuesta y rollback.
- Remediación reversible significa **propuesta revisable**, no aplicación automática. **La IA no hace escrituras en Kubernetes**.
- Diagnóstico mock no implica conexión a GPT/Claude/Gemini reales. No equiparar suscripción de ChatGPT/Claude con API pagada.
- Explicar lo que se almacena en SQLite y lo que es temporal, sin prometer zeroización física absoluta de strings JavaScript.

### DOC-006 — Primeros pasos, funciones generales y FAQ

- Importar/configurar kubeconfig, cambiar de clúster, favoritos, namespaces, Workloads, tabla, filtros, búsqueda, Kubetail/logs, eventos y terminal.
- Colores/pines por clúster y tema Midnight Graphite.
- Atajos únicamente validados contra el software; problemas frecuentes al importar kubeconfig, permisos RBAC, no aparece ventana flotante, diagnóstico mock/no configurado, escáner demo sin alarmas y recuperar layout.
- Distinguir instrucciones de DEV y de app empaquetada: nunca ofrecer flags internos como si fueran configuración accesible en todos los builds.

### DOC-007 — Ayuda contextual y mantenimiento obligatorio

- Acciones de ayuda «?» o «Ver documentación» discretas y coherentes en Docking, Centro de Incidentes, Workbench, consentimiento IA, Settings/Perfiles. Deep link al artículo correspondiente.
- Cada funcionalidad nueva debe actualizar documentación, ejemplos y capturas como parte del Definition of Done: doc desactualizada implica gate de feature incompleto.
- Manifest de artículos/slug/versión/estado legible y probado; edición Markdown fuente, sin CMS ni servidor externo.
- Enlaces y búsquedas funcionan offline; no telemetría obligatoria de lectura.

### DOC-008 — QA real de documentación y release

- Jest focalizado para manifest, búsqueda, rutas, accesibilidad, links internos/externos y contenido seguro.
- Playwright en aplicación Electron REAL: menú nativo Documentación, acceso secundario, cero clústeres, sin internet, buscar «ventana flotante» y «IA», cambiar tema/artículo, volver, foco de teclado, ayuda contextual.
- Probar de principio a fin tutoriales contra botones reales; capturas auténticas y distintas sin overlays fabricados, sin claves ni kubeconfig reales.
- Control visual Midnight Graphite, estilos responsivos, textos legibles y pruebas de regresión H7/H8 afectadas.
- Si se modificó runtime para agregar menú y pantalla, RC2 **no** contiene H8.7. Requerirá nuevo candidato empaquetado (RC3 u otra etiqueta aprobada), con checksum, firma y smoke independiente.
- No iniciar build con espacio insuficiente: última medición del disco previa a plan ~6.2 GiB libres. Conservar RC2 como rollback hasta que el candidato nuevo pase; no eliminar paquetes o datos ajenos para hacer lugar sin autorización.
- Informe de entrega: docs/h8/H8_7_DOCUMENTACION_ENTREGA.md con artículos, ejemplos, pruebas, capturas, limitaciones honestas y PASS/PARTIAL/BLOCKED.

## Secuencia de hitos y política Git

1. **Ahora:** registrar este hito y su alcance mediante documentación únicamente. El gate RC2 actual tiene modificaciones de QA sin commitear de otro proceso. No pisarlas ni cambiar su rama; no hacer push ni merge.
2. **Antes de desarrollar H8.7:** terminar la aceptación RC2 pendiente (Docking real, no DOM artificial; diagnóstico con aserciones; perfil de QA sin Keychain real). Aprobar/cerrar checkpoint.
3. **Después:** crear una rama nueva desde una base aprobada, propuesta feature/h8-7-documentacion-in-app, y ejecutar DOC-001…DOC-008 en commits pequeños. No mezclar implementación con corrección del gate RC2.
4. **Por último:** nuevo paquete ARM64 con documentación offline, prueba visual y funcional, documentación de seguridad; aprobación humana para integrar en develop y cerrar MVP. Sin push automático.
5. Conservar checkpoints, documentación técnica, código y el candidato estable; limpieza de RC1/RC2 compilados solo con autorización y verificando el nuevo candidato.
6. Engram canónico: lens-v6-ui-corrections, no kubetail.

## Gate de cierre (innegociable)

Una persona sin experiencia abre la aplicación, hace clic en **Documentación**, encuentra en menos de 3 pasos «Cómo crear una ventana flotante» y «Cómo usar el diagnóstico con IA», sigue pasos reales, identifica restricciones de demo y ve las ayudas sin internet ni clúster conectado.

**H8.7 es un hito P0 y bloquea el cierre definitivo del MVP. El PASS técnico de RC2 no lo reemplaza.**
