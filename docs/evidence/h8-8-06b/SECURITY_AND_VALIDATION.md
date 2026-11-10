# H8.8-06b — Corrección de bloqueo OAuth (10 de noviembre de 2026)

## Alcance

El error `EXTERNAL_PROVIDER_DISABLED` ocurría porque el servicio de DI creaba siempre `DefaultSecureAiTransport` sin motor de red, dejando `DisabledRealNetworkEngine` activo. La UI exponía un botón OAuth que no podía iniciar sesión. Se corrigió el circuito sin habilitar red durante el arranque.

- Se agrega `AuthorizedOpenAiNetworkEngine`: motor HTTPS nativo de Node, limitado a `auth.openai.com` y `api.openai.com`, puerto 443 y proveedor OpenAI. No hay red con otros proveedores ni destinos.
- Aislamiento por defecto: el motor arranca desautorizado; `--offline` obliga a usar `DisabledRealNetworkEngine`.
- Consentimiento real del operador: nuevo IPC validado y `dialog.showMessageBox` de Electron Main; rechazo o cierre de la ventana no habilita la red. No basta enviar un booleano desde Renderer. La autorización es efímera por proceso.
- DNS y seguridad: resolución previa con validación de direcciones, selección de IP, `https.Agent.lookup` fijado a esa IP, verificación TLS/SNI y comparación de `remoteAddress` contra el ticket autorizado. Sin redirecciones automáticas; el coordinador existente mantiene límites de tiempo y respuesta, cancelación y no-reintentos POST.
- Conserva PKCE/state/nonce, la bóveda de tokens, política de proveedor único y consentimiento independiente de evidencias por incidente. No hay cambio automático a DeepSeek.
- Estado de red por proveedor; autorizar OpenAI no presenta DeepSeek como disponible.
- Se corrige texto de error y avisos UI. Las dos entradas «Continuar con ChatGPT» pasan por la autorización del proceso Main.

## Validaciones ejecutadas

- `tsc -p packages/core/tsconfig.json --noEmit`: PASS.
- Jest sobre `src/main/ai-diagnostics`, `src/main/incident-storage`, `src/features/incident-workbench`: 38 suites, **509 tests PASS**.
- Prueba adicional del estado por proveedor: 1 PASS. Total: **510**.
- Test adversarial nuevo del motor: DNS malicioso, host equivocado, rechazo TLS e IP, TLS simulado con respuesta bounded: 5 PASS.
- Test de autorización Main: emisor IPC no confiable, Cancel, Aprobar, sin duplicar diálogo: PASS.
- Compilación de `@openlens/core` y `open-lens`: PASS.
- Electron real, con `--offline`, guardia de red temprana, perfil y kubeconfig sintéticos: **26/26 PASS** (evidence.json). El nuevo caso prueba Cancelar desde la UI con diálogo Main interceptado, sin iniciar OAuth ni transmitir tráfico. R2c desktop y narrow responsiveness mantienen PASS.
- `git diff --check`: PASS.

## Límite honesto de la aceptación

No se realizó inicio de sesión con una cuenta real de ChatGPT ni conexiones de red hacia OpenAI, y no se enviaron evidencias de incidentes. Las pruebas demuestran apertura de la ruta de autorización y despacho HTTPS simulado, además de la preservación de la política offline. La autenticación OAuth y los permisos efectivos de una cuenta deben comprobarse voluntariamente desde el nuevo binario, a través del navegador y el diálogo de macOS.

Compatibilidad del protocolo contrastada con documentación oficial para clientes open source: `https://developers.openai.com/siwc/token-sharing-open-source/sign-in`.

## Archivos de evidencia

- `run-acceptance.mjs` — harness Electron aislado, fail-on-FAIL.
- `evidence.json` — 26 medidas y resultados.
- Capturas PNG — diálogos y estados, incluido `06b-native-consent-cancel.png`.
