# NovaKube — H8.8-06: IA centralizada y cierre de incidentes reales
**Fecha:** 2026-11-09
**Estado:** Roadmap aprobado por el usuario; implementación todavía pendiente.
**Rama de trabajo:** `feature/incident-ai-default-provider-20261109`
**Base exacta:** `e7003271540c4c52f71ebb533e5c90268a0d42e6` (FINAL-05-R3, RC offline aprobada).
**Punto de retorno:** `checkpoint/final-05-r3-offline-approved-e7003271-20261109`.
**No cambiar:** `feature/final-05-release-candidate`, `develop` ni el binario certificado. Sin merge ni push hasta auditoría independiente.

## Decisión de producto confirmada (2026-11-09)
El usuario quiere **un único proveedor/modelo IA predeterminado para todos los incidentes**, configurado **una sola vez desde la cabecera del Centro de Incidentes Kubernetes**, con estado visible. No desea tener que escoger o configurar IA para cada incidente. En cada diagnóstico sí debe mantenerse la **autorización explícita de envío de evidencias sanitizadas**, con identificación del destinatario. La selección avanzada por incidente queda fuera del MVP.

La configuración actual existe dentro de `IncidentWorkbenchPanel` > `Diagnóstico e Hipótesis` > `Proveedores IA`, donde está demasiado escondida. `IncidentListView` ya tiene una cabecera con acciones. `IncidentStore` administra perfiles, pero el selector y la ventana de configuración viven en el Workbench. `secure-ai-transport.injectable.ts` crea `DefaultSecureAiTransport` sin engine real: el valor por defecto es `DisabledRealNetworkEngine`. En el diálogo de consentimiento, los perfiles distintos de `mock` siguen deshabilitados. **No llamar a esto IA real funcional.** Las credenciales OAuth y los tokens no deben copiarse a preferencias o logs.

## Principios y límites innegociables
1. **Separar usabilidad y habilitación de red.** H8.8-06a no modifica el engine de transporte ni activa conexiones reales: esa decisión necesita auditoría de seguridad separada.
2. **Fail closed.** Sin proveedor predeterminado válido, perfil activo, autorización, modelo permitido o transporte habilitado: mostrar estado claro y no enviar solicitudes.
3. **Consentimiento por incidente.** Mostrar clúster, namespace, proveedor/modelo, destino de las evidencias, vista previa sanitizada, coste y alcance. El consentimiento es de un solo uso, no reutilizable, y se invalida si cambian perfil, modelo, clúster, namespace o evidencias.
4. **Una configuración global, no credenciales duplicadas.** Persistir únicamente un identificador opaco del perfil elegido, gestionado por Main usando mecanismos existentes y IPC validado; secretos exclusivamente en la bóveda segura. No guardar API keys, tokens, kubeconfig ni datos sensibles en renderer/localStorage/SQLite de preferencia.
5. **Sin failover silencioso.** Si el proveedor está caído o pierde permisos, suspender análisis y explicar causa; nunca cambiar automáticamente a otro modelo ni destinatario.
6. **Sin escrituras Kubernetes.** Diagnósticos e hipótesis únicamente, con evidencias sanitizadas, auditoría, límites de cuota, cancelación y propuestas reversibles no ejecutadas.
7. **No conexión automática a clúster real** ni llamadas pagadas de IA sin autorización explícita del usuario y un entorno de prueba autorizado.

## Plan de hitos (ejecutar en orden, cada uno con commit y verificación)
### H8.8-06a — Primer hito: proveedor IA predeterminado + configuración visible [PENDIENTE]
**Objetivo:** Corregir UX y persistencia sin activar red real.
**Implementación:**
- Crear la acción fija **Configuración IA** en la cabecera de `Centro de Incidentes Kubernetes` (`incident-list-view.tsx`), accesible sin abrir un incidente y con navegación por teclado/lector de pantalla.
- En ese diálogo, reutilizar o extraer el formulario existente de OpenAI/DeepSeek y la visualización de perfiles para no duplicar código. Presentar un único selector **Proveedor predeterminado**, modelo/estado/credencial cuando corresponda, y botón guardar. Mostrar explícitamente `No configurado`, `Demo offline`, `Conexión bloqueada`, `Desconectado` o `Disponible` según hechos comprobados; jamás simular conexión.
- Persistir el `defaultProfileId` de forma global por instalación, no por incidente ni por clúster, a través de un contrato de Main/IPC con validación estricta, usando almacenamiento de preferencias compatible con la arquitectura actual. Resolver perfil en Main al analizar; no confiar en un `profileId` arbitrario enviado por Renderer para evadir configuración.
- Proteger el caso de perfil eliminado/revocado, modelo cambiado, sesión expirada y reinicio de la app: mostrar `Configuración requerida` y no elegir otro perfil silenciosamente.
- Eliminar el selector de proveedor del flujo ordinario de Workbench. Mantener únicamente `Analizar con IA` y el consentimiento con el destino predeterminado visible. No ocultar los estados de error; incluir acceso directo a Configuración IA desde un mensaje de falta de configuración.
- Preservar compatibilidad con los perfiles ya existentes: no borrar ni volver a pedir credenciales válidas. Si no hay predeterminado, exigir selección explícita una sola vez en configuración (sin autoelegir el primer perfil).
- Mantener `DisabledRealNetworkEngine` como predeterminado y no modificar consentimiento, transporte, RBAC, scanner, tema, docking ni empaquetado.

**Pruebas H8.8-06a:**
1. Sin incidentes, botón visible en cabecera; modal accesible.
2. Selección global persiste tras cierre/reapertura y se comparte entre clústeres sin mezclar evidencias.
3. Perfil inexistente/deshabilitado/revocado/expirado o modelo inválido: fail closed, mensaje accionable, 0 solicitudes externas.
4. Al analizar dos incidentes, el proveedor no se vuelve a seleccionar; cada uno requiere **su propio consentimiento** y el diálogo muestra el destinatario.
5. Cambio de perfil invalida consentimiento anterior; no hay fallback automático a otro proveedor.
6. Ningún secreto en IPC de lectura, logs, preferencias ni snapshots de pruebas.
7. Test UI + stores/IPC con mocks; Jest focal, `tsc --noEmit`, `git diff --check`.
**Entrega:** un commit focal, evidencias de pruebas, reporte de cambios y detenerse para revisión. **No merge ni push.**

### H8.8-06b — Activación controlada de OpenAI o DeepSeek real [BLOQUEADO POR AUDITORÍA]
- Auditar la compatibilidad real y los términos de OAuth de OpenAI y API DeepSeek antes de habilitar cualquier endpoint; no asumir que un plan ChatGPT incluye API.
- Sustituir `DisabledRealNetworkEngine` solo por implementación explícita con TLS, allowlist de destinos, controles de SSRF/DNS pinning, límites de tiempo/tamaño, streaming cancelable y almacenamiento seguro de credenciales.
- Separar perfiles **configurados** de perfiles **operativos**; prueba local con servidor fake primero. Incluir fallos 401/403/429/500, expiración, cuota, cancelación, revocación, no fugas y ningún reintento POST.
- Activación real únicamente tras aprobación de seguridad y consentimiento del usuario para prueba con proveedor externo; no usar credenciales de producción sin permiso.
**Gate:** autorización auditable y prueba de extremo a extremo; si no, proveedor Real bloqueado.

### H8.8-06c — Diagnóstico UX end-to-end [PENDIENTE]
- Flujo único: incidente > Analizar con IA > vista previa/consentimiento > progreso/cancelar > hipótesis con citas > propuesta de remediación revisable.
- Estados UI claros y accesibles para ausencia de perfil, permiso, cuota, red y evidencia; sin selección de modelo por incidente.
- Pruebas Electron sobre flujos demo y negativos. No presentar diagnósticos mock como resultados reales.

### H8.8-06d — Scanner Kubernetes real e identidad técnica [PENDIENTE, alcance separado]
- Corregir el `TokenRequest`/ServiceAccount ausente del flujo de producción y verificar identidad dual y RBAC efectivo (Access Reviews) con clúster de pruebas autorizado.
- Conservar rollback SQLite en revocación/cambio de scope, protección TOCTOU y modo Fake predeterminado. Cualquier fallo de autorización debe impedir lectura de recursos.
- **No tocar clústeres reales hasta autorización expresa**; primero mocks adversariales.

### H8.8-06e — Aceptación, integración y distribución [PENDIENTE]
- Regresión Jest + TypeScript + E2E; app instalada probada, no confundir dev Electron con empaquetado.
- Auditoría independiente de privacidad, identidad, consentimiento, presupuesto y salida de red.
- Solo después de aprobación: merge local planificado de la rama a `develop`, nuevos DMG/ZIP y validación de hashes/firma.
- Developer ID + notarización son opcionales para distribución pública; la firma ad-hoc no equivale a notarización.

## Prompt listo para el agente — ejecutar **solo H8.8-06a**
Trabajá en `feature/incident-ai-default-provider-20261109`, con base `e7003271`. Leé este documento y los componentes `incident-list-view.tsx`, `incident-workbench-panel.tsx`, `incident-store.ts`, los IPC de perfiles y el transporte antes de editar. Implementá un selector **global** de proveedor IA en la cabecera del Centro de Incidentes, con persistencia segura de identificador de perfil y estado real. Reutilizá el diálogo existente en un componente compartido, preservá perfiles y credenciales, eliminá la selección repetitiva dentro de cada diagnóstico y conservá autorización de evidencias por incidente. No habilites red externa; respetá `DisabledRealNetworkEngine`. Incluí pruebas de reinicio, selección global, credenciales protegidas, perfiles revocados y consentimiento independiente. Pasá Jest focal, TypeScript y diff check; documentá resultados, creá **un solo commit** y detenete. **Sin merge, push, nuevas llamadas pagas ni Kubernetes real.**

## Recuperación exacta
La RC offline permanece en `feature/final-05-release-candidate` @ `e7003271` y en el tag `checkpoint/final-05-r3-offline-approved-e7003271-20261109`. Para inspeccionar el punto anterior, usar `git show checkpoint/final-05-r3-offline-approved-e7003271-20261109`. No usar `git reset --hard` sobre worktrees con trabajo no guardado.
