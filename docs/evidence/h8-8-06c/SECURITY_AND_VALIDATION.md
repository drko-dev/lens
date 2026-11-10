# H8.8-06c — Corrección del callback OAuth con código opaco (2026-11-10)

## Error observado
El operador recibió `OPENAI_OAUTH_CALLBACK_MALICIOUS` con el mensaje «El código de autorización ('code') en el callback OAuth está ausente o es inválido». La condición combinaba tres causas y exigía sin justificación un largo de 8–512 caracteres y ASCII imprimible.

## Corrección
- Se mantiene el flujo estándar OpenAI: HTTP loopback en 127.0.0.1, ruta exacta y puerto de la sesión, `state` de un solo uso, callback sin parámetros duplicados ni desconocidos, `client_id` válido, PKCE, validación JWT/JWKS y scopes.
- El authorization code es opaco: se pasa **sin modificación** al POST de intercambio. No se exige longitud mínima arbitraria ni alfabeto ASCII-only.
- Conservamos límites defensivos de 8 KiB UTF-8 y rechazo de controles, NUL y código vacío/blanco. No se registra ni muestra el código real.
- Si `code` no está presente o llega vacío, se entrega el error específico `OPENAI_OAUTH_NO_CODE`, con indicación de reiniciar la autorización. No se confunde la ausencia con un ataque.
- Los callbacks con `error=access_denied`, state incorrecto o datos no permitidos siguen fallando cerrados; no se persisten credenciales si falla el callback.

## Validación
- Jest focal OAuth: 28 tests PASS; incluye casos cortos, largos (>512), reservados URL, Unicode, faltante/vacío/blanco, NUL, LF y >8 KiB, y verificación de código exacto hacia PKCE.
- Suite de regresión de IA/IPC/UI: 39 suites / **520 tests PASS**.
- TypeScript `packages/core/tsconfig.json`: PASS.
- `@openlens/core` + `open-lens` webpack producción: PASS.
- Electron real aislado: 26/26 PASS (ver `evidence.json`), guardia de red y `--offline`, sin claves ni clústeres reales.
- `git diff --check`: PASS.

## Limitación de conclusión
No se inspeccionó ni almacenó el callback real del operador por contener un código de autenticación sensible. El error podría haber sido provocado por ausencia de `code` o un valor rechazado por las antiguas reglas; el mensaje original no distingue las dos situaciones. No se realizó login con una cuenta real ni solicitudes pagadas. Si un nuevo intento devuelve `OPENAI_OAUTH_NO_CODE`, el problema está antes del intercambio de tokens, y hay que revisar el resultado de autorización del proveedor sin copiar códigos ni tokens a los logs.
