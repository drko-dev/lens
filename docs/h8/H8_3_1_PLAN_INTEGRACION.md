# OpenLens DevOps — H8.3.1: Gate de integración antes de H8.4

Fecha: 2026-11-05
Rama: feature/h8-3-1-integration-gate
Baseline: acabf44d (checkpoint/h8-3-2026-11-05)
Estado: PLANIFICADO; no declarar H8.3 terminado a nivel Electron hasta superar los criterios de aceptación.

## Por qué este gate

La suite focalizada (187/187 tests, 23 suites) pasa, pero una auditoría independiente encontró que el arranque Main llama a registerIncidentIpcHandlers() sin inyectar los componentes AI. Los adapters OpenAI/Anthropic/Gemini son stubs y la bóveda cifrada usa Map en RAM. La vista previa de consentimiento tampoco está ligada a un inventario/hash inmutable de evidencias. Los tests que pasan no sustituyen smoke en Electron real.

## H8.3.1 — historias de integración

1. **Arranque real:** registrar mediante DI AiProfileManager, SecureCredentialVault, AiDiagnosisEngine, AiDiagnosisRepository, AiBudgetTracker y RemediationVerifier; inyectarlos en setup-incident-ipc.injectable.ts y comprobar canales openlens:incident:ai:* en Electron real. El registro no debe depender de wiring manual de mocks de test.
2. **Bóveda segura persistente:** elegir mecanismo seguro del OS para cifrar y conservar referencias opacas después de reinicio; safeStorage/Keychain del entorno soportado con clave OS protegida. No persistir una master key en el mismo disco junto al ciphertext; no aceptar fallback software AES-GCM volátil silencioso en producción. Fail-closed cuando OS store no esté disponible.
3. **Proveedores:** mock funciona offline; OpenAI, Anthropic y Gemini siguen disabled/unconfigured hasta un hito expresamente autorizado, con indicadores UI honestos. No enviar peticiones ni datos a APIs externas.
4. **Consentimiento:** al preparar la vista previa en Main, inmovilizar hash/versiones del contenido sanitizado, conjunto exacto evidenceIds, incidente, scope de sesión, proveedor, modelo, endpoint, bytes, límite de tokens y expiración. Revalidar en Main justo antes de la ejecución. Si cambian contenido/estado/perfil/permisos, invalidar y volver a pedir consentimiento. Los tokens son efímeros de uso único, pero por sí solos no autentican al operador OS.
5. **Citas/respuesta:** validar esquema del proveedor y correspondencia entre evidenceId, recurso y fragmento efectivamente disponible (no solo existencia de ID). Distinguir hipótesis verificadas y no verificadas, devolver INCONCLUSO cuando falte sustento.
6. **Gate de red futuro:** preparar validación DNS, host final, redirecciones, IPv6, DNS rebinding y SSRF, pero no habilitar adaptadores HTTP reales todavía. Preferir endpoints permitidos de proveedor a destinos definidos arbitrariamente por usuario.
7. **Presupuestos y cancelación:** tests de cuota, tiempo máximo, cancelación, cambio de sesión/cluster y descarte de respuestas tardías sin contaminar SQLite ni producir operaciones K8s.

## Criterios de aceptación

- Tests Jest H8 focalizados verdes, incluidos tests de DI/IPC production wiring, reinicio de perfiles, consentimiento alterado, citas incorrectas, cuotas y revocación.
- Smoke de Electron real **DEV en perfil y DB sintéticos aislados**: levantar UI, crear un perfil mock sin key real, guardar, cerrar/reabrir, crear incidente, ingestar evidencia sanitizada, previsualizar, dar consentimiento, ejecutar diagnóstico mock, inspeccionar timeline y persistencia.
- Cero tráfico a Kubernetes real y cero APIs pagas; no clústeres ni credenciales corporativas.
- Mantener Global Docking intacto y ejecutar solo regresión focalizada, no RC4/H7 completos.
- No empaquetar nuevos RC con espacio limitado hasta autorizarlo; no borrar dependencias ni datos personales.
- Documentar resultados, capturas, limitaciones, commits convencionales y actualizar Engram.
- No push ni merge.

## Qué sigue

Al aprobar realmente el gate H8.3.1, crear **nueva rama** feature/h8-4-ephemeral-context para historias H8-019 y H8-020 (contexto multiarchivo temporal, no ejecutable, con eliminación verificable). No mezclar H8.3.1 y H8.4 en un mismo commit o rama de desarrollo.

## Limpieza del workspace aprobada y ejecutada

- 2026-11-05: eliminados los directorios ignorados y regenerables open-lens/dist/h8-rc1, open-lens/dist/rc4, open-lens/dist/rc2, open-lens/static/build, packages/core/static/build.
- El único worktree registrado es el principal. git worktree prune no detectó worktrees antiguos.
- El espacio libre pasó de alrededor de 9 GiB a alrededor de 12 GiB, variando por actividad del sistema.
- Se preservaron dependencias node_modules, código, historial Git, documentos y evidencias. No se tocaron datos SQLite en userData.
- Los manifiestos/checksums históricos persisten en docs/; los instaladores binarios se deberán regenerar si se requieren. Esta decisión reemplaza las instrucciones anteriores de conservar archivos compilados RC4/RC1, a pedido del usuario.
