# OpenLens DevOps — H8.3 code checkpoint / integración pendiente

Fecha: 2026-11-05
Rama de origen: feature/h8-3-ai-diagnostics
Base de código: f5f19645
Próxima rama: feature/h8-3-1-integration-gate
Estado: H8-014..018 implementados en módulos; NO se aprobó todavía el gate end-to-end de H8.3.

## Realizado
- H8.2.1: hardening de broker (4d658741).
- H8-014: perfiles IA, validador SSRF y bóveda de credenciales (5025d5e5).
- H8-015..018: consentimiento, diagnósticos mock, propuestas sin escritura, verificación y presupuesto (f5f19645).
- Verificación independiente 2026-11-05: 23 suites H8 focalizadas, 187/187 pruebas PASS.
- Reporte previo: docs/h8/H8_3_DIAGNOSTICO_IA_ENTREGA.md.

## Pendientes bloqueantes de H8.3.1

1. Wiring real de Electron Main: setup-incident-ipc.injectable.ts registra IPC sin pasar AiProfileManager, AiDiagnosisEngine, RemediationVerifier ni AiDiagnosisRepository. Registrar dependencias y probar arranque real, no solo tests con registro manual.
2. SecureCredentialVault conserva ciphertext en Map en RAM. Las referencias opacas en SQLite no pueden recuperar secretos después de reiniciar. Implementar almacenaje persistente respaldado por Keychain/almacén OS; no persistir clave AES junto al ciphertext; fail-closed sin almacén seguro.
3. Los adaptadores OpenAI/Anthropic/Gemini son ExternalAiProviderStub y no hacen llamadas externas. En este gate mantenerlos DESHABILITADOS y claramente identificados; mock será el único adapter ejecutable.
4. El consentimiento está ligado a incidentId/profileId/TTL pero no a hash/versión exacta del inventario de evidencias. Vincular al contenido sanitizado, destino, modelo, scope y cuota, y revalidar antes de ejecutar.
5. Validar que la cita de texto corresponde efectivamente a la evidencia, no solo que existe el ID; esquema de respuesta estricto y tratamiento INCONCLUSO de información insuficiente.
6. Antes de proveedores externos reales, reforzar destinos con allowlist estricta, resolución DNS, redirecciones y verificación efectiva de conexión; nunca pagos ni conexiones sin autorización explícita.

## Gate de salida H8.3.1

- Tests de wiring DI e IPC real, persistencia/reinicio de bóveda sin fugas, invalidación de consentimiento al cambiar evidencias, citas falsas, cancelaciones, presupuesto y errores.
- Smoke Electron DEV en perfil aislado y datos sintéticos: crear perfil mock, incident/evidence, consentimiento, diagnóstico, reporte/timeline y reinicio.
- Sin acceso a Kubernetes real, sin credenciales reales, sin APIs pagas, sin publicación, sin push/merge.
- Preservar el código de H8.1 RC1 y el historial de H7 mediante commits. El usuario autorizó descartar los BINS compilados antiguos y regenerar nuevos, NO eliminar su historia Git.
- Tras aprobación de H8.3.1 crear rama feature/h8-4-ephemeral-context para historias H8-019/020, sin mezclar los hitos.

## Política de limpieza aprobada por el usuario

Eliminar solo artefactos compilados regenerables ignorados por Git, incluyendo los antiguos directorios:
- open-lens/dist (rc2, rc4, h8-rc1)
- open-lens/static/build
- packages/core/static/build

Preservar manifiestos e informes versionados bajo docs/, código fuente, .git, dependencias node_modules, configuración, evidencias y archivos de trabajo desconocidos. No hay worktrees adicionales registrados por Git; no borrar ramas con historia.

Estos artefactos binarios no están versionados; la eliminación requiere volver a compilar para ejecutar una app empaquetada. Las referencias SHA-256 históricas seguirán en la documentación.
