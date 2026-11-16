# R12.1 — Preguntas Abiertas de Investigación (Ordenadas por Impacto)

1. **Protocolo exacto de handshake de `window-messaging-relay-*` al arrastrar una tab hacia/desde una `sub-window` (Impacto Alto)**: Verificable en una sesión QA activada con licencia de prueba o inspección de los fragmentos de `main-view-tab-dragged-out-of-window` en `lens.js`.
2. **Esquema JSON interno de los archivos binarios/JSON dentro de `persisted-state/main-view-feature/` durante Split View multi-grupo (Impacto Alto)**: Verificable capturando snapshots en un perfil activado antes/después de crear 2 splits.
3. **Ciclo completo de `ask-ai-function-invocation-request` y `ai-tool-driving-drive-window` (Impacto Medio)**: Verificable inspeccionando los payloads entre `main.js` y el servidor MCP embebido de Lens.
4. **Comportamiento exacto de `Extensions > Permissions` y compilación in-app con `tsc` unpacked (Impacto Medio)**: Verificable en entorno Lens Pro/Plus activado.
