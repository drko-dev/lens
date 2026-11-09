# NovaKube — H8.8-06a: Proveedor IA predeterminado global

**Fecha:** 2026-11-09
**Rama:** `feature/incident-ai-default-provider-20261109` (base `f4334d6b`)
**Checkpoint conservado:** `checkpoint/final-05-r3-offline-approved-e7003271-20261109`
**Alcance:** solo H8.8-06a. Sin merge, sin push, sin tráfico externo.

## Equipo
- Opus (arquitecto): mapeó el flujo y fijó el diseño. Subagente de solo lectura.
- Sonnet (implementación): Unidad A (Main/IPC/migración) y Unidad B (UI/store).
- Haiku (QA): pruebas de componentes, adversariales, persistencia y flujo OOM.

## Cambios
**Main / contrato**
- Migración `011_ai_default_profile`: tabla singleton `ai_settings(default_profile_id)`. Sin clave foránea a propósito: un perfil eliminado se ve como `Configuración requerida`, no como `No configurado`.
- `AiDefaultProfileService`: deriva el estado, valida `setDefault`, revoca los consentimientos del predeterminado anterior, y `resolveUsableDefaultId()` falla cerrado. No elige nunca otro perfil.
- Canales IPC nuevos: `get-default-provider`, `set-default-provider`, `ensure-demo-profile`.
- `prepare-consent` y `execute-diagnosis` ya no aceptan `profileId` (claves exactas; un `profileId` enviado desde el Renderer se rechaza). Main resuelve el predeterminado.
- `DiagnosisConsentPreview.profileName` para mostrar el destinatario desde datos de Main.

**Renderer**
- Botón fijo **Configuración IA** con chip de estado en la cabecera del Centro de Incidentes, visible sin incidentes.
- `AiProviderConfigDialog` compartido (extraído del Workbench): selector «Proveedor predeterminado» sin autoselección, Guardar, «Crear perfil Demo offline» sin API key, quitar predeterminado, formularios OpenAI/DeepSeek reutilizados; `role="dialog"`, `aria-modal`, foco inicial, Esc.
- Workbench: eliminado el selector de proveedor/modelo y los fallbacks silenciosos; destino de solo lectura en el consentimiento; banner con acceso a Configuración IA si no es utilizable; insignia «DEMO OFFLINE · resultado sintético, no generado por IA externa» para `provider === "mock"`.

## Estados
`No configurado`, `Configuración requerida`, `Demo offline`, `Desconectado`, `Conexión bloqueada`, `Disponible`. «Disponible» solo si el transporte real está habilitado. En este hito OpenAI/DeepSeek quedan en `Conexión bloqueada` porque `DisabledRealNetworkEngine` sigue siendo el predeterminado.

## Archivos (`packages/core/src`)
Modificados: `common/incident/{ai-diagnosis-types,ai-profile-types,incident-ipc}.ts`, `main/ai-diagnostics/ai-diagnosis-engine.ts` (solo `profileName`), `main/incident-storage/{incident-ipc-validator,setup-incident-ipc.injectable}.ts`, `main/incident-storage/migrations/index.ts`, `features/incident-workbench/renderer/{incident-list-view.tsx,incident-store.ts,incident-workbench-panel.tsx}`.
Nuevos: `main/ai-diagnostics/ai-default-profile-service{,.injectable}.ts`, `features/incident-workbench/renderer/ai-provider-config-dialog.tsx`.
Tests: nuevos `ai-default-profile-service.test.ts`, `h8-8-06a-default-persistence.test.ts`, `h8-8-06a-ipc-default-provider.test.ts`, `h8-8-06a-list-ai-config.test.tsx`, `h8-8-06a-workbench-default-provider.test.tsx`; actualizados `ai-ipc.test.ts`, `incident-cluster-isolation.test.ts`, `incident-workbench-ai.test.tsx`.

## Resultados reales (ejecutados por el orquestador)
- `npx jest src/features/incident-workbench src/main/incident-storage src/main/ai-diagnostics src/features/global-docking`: 51 de 52 suites, 681 de 682 tests pasan. **1 fallo:** timeout de 5 s en `restored-sessions-h7-7.test.tsx` («an inert leaf renders the placeholder…»). Ejecutado solo: 17/17 pasan. No se modificó código de docking. Clasificado como flake por carga; sin causa raíz identificada.
- `tsc --noEmit -p tsconfig.json`: exit 0.
- `git diff --check`: exit 0.
- Haiku: 50/50 tests nuevos; regresión amplia (docking, workbench, storage, ai-diagnostics, scanner) 795/796 con el mismo timeout.

## Cobertura de los requisitos de prueba
Botón sin incidentes, modal accesible, persistencia tras «reinicio» (nueva instancia sobre el mismo archivo SQLite), configuración global con consentimiento atado a clúster/namespace, sin selector por incidente, consentimiento de un solo uso por incidente, cambio de predeterminado invalida tokens, perfil eliminado/revocado/deshabilitado falla cerrado con 0 llamadas al transporte, DTO y logs sin `credentialRef`/`apiKey`/`oauthSubject`, flujo OOM sintético con Mock, 0 tráfico externo.

## Limitaciones
- **Capturas de pantalla: no incluidas.** No se ejecutó la app Electron real; la UI se validó con tests de componentes (jsdom). No hay prueba UI/Electron end-to-end en este hito.
- El caso sintético OOM se siembra dentro del test; la ruta del botón `Cargar Caso Sintético OOM` del renderer no se ejerce de punta a punta.
- La comprobación de «sin tráfico externo» es estructural (Mock nunca llega al transporte) más un spy sobre el motor de despacho.
- Verificación de secretos en logs solo sobre `console.*`.
- `aiListProfiles` ya devolvía `credentialRef`/`oauthSubject` al Renderer (preexistente, fuera de alcance); el DTO nuevo no lo replica.
- OpenAI/DeepSeek no están operativos: los perfiles pueden guardarse pero el transporte real sigue deshabilitado (H8.8-06b).

Risk: item 3 (contrato IPC `prepare/execute` sin `profileId`, cambio deliberado y pedido) e item 1 (migración 011 aditiva).

---

# R1 — Corrección final y aceptación visual (base `af106ff1`)

## Fallo corregido
`ai-provider-config-dialog.tsx` inicializaba `selectedDefaultId` una sola vez con `useState`. Tras «Crear perfil Demo offline» el backend quedaba en `demo_offline` pero el selector seguía vacío, y **Guardar** enviaba `null`, borrando el predeterminado recién creado.

- Dialog: el selector sigue a `store.aiDefaultStatus.profile?.id` con un efecto; una elección sin guardar no se pisa en re-renders ajenos. Se eliminó la escritura directa a `store.error`.
- Store: `setAiDefaultProfile` y `ensureDemoAiProfile` capturan errores IPC, releen el estado real del backend y luego fijan `store.error`; selector y backend quedan coherentes.
- Test `h8-8-06a-r1-ai-config-dialog-default-sync.test.tsx` (6 tests). **RED observado** contra el código anterior: 3 fallos (esperado `"demo-probe"`, obtenido `""`; fallo de set-default dejaba `"other"`; fallo de ensure-demo no llegaba a `store.error`). **GREEN** tras la corrección.

## Regresión (ejecutada por el orquestador)
- Jest (workbench, incident-storage, ai-diagnostics, global-docking): **53/53 suites, 688/688 tests**. El timeout de docking no reapareció.
- `tsc --noEmit`: exit 0. `git diff --check`: exit 0.

## Aceptación visual en Electron real
- **Ejecutable (Electron de desarrollo, NO la app empaquetada):** `/private/var/tmp/lens-final-05-rc-20261108/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, lanzado con Playwright `_electron.launch` (cwd `open-lens`, `-r integration/early-network-guard.cjs . --user-data-dir=… --remote-debugging-port=9333 --use-mock-keychain --offline`).
- Perfil aislado: `CICD` y `HOME` apuntan a un directorio temporal (`--user-data-dir` por sí solo no aísla; la app reescribe `userData`). Sin kubeconfig real, sin API keys, sin proveedores externos. Directorio: `/private/var/tmp/novakube-h8806a-iso.n5Suuc`.
- Fue necesario reconstruir: core (`npm run build`, 61 s) y open-lens (webpack, 14 s); los builds previos no contenían la UI nueva.
- Evidencias: `docs/evidence/h8-8-06a-r1/` (capturas PNG, `run-acceptance.mjs`, `evidence-main.json`, `evidence-restart.json`, `EVIDENCE.md`).

| Paso | Resultado |
|---|---|
| 1. «Configuración IA» visible con 0 incidentes | PASS |
| 2. Modal `role=dialog`, `aria-modal`, Esc cierra | PASS |
| 3. Crear Demo offline: estado «Demo offline», selector sincronizado | PASS |
| 4. Guardar, cerrar, reabrir conserva el proveedor | PASS |
| 4b. Reinicio con el mismo perfil conserva el proveedor | PASS |
| 5. «Cargar Caso Sintético OOM» desde el botón real | PASS |
| 6. Analizar: evidencia sanitizada + destino de solo lectura, sin selector | PASS |
| 7. Insignia «DEMO OFFLINE · resultado sintético, no generado por IA externa» | PASS |
| 8. Sin tráfico externo durante los pasos de IA | PASS con reservas |

**Paso 8:** la guarda de red bloqueó 6 conexiones TLS al arrancar la app (`k8slens.dev`, `docs.k8slens.dev`, `forums.k8slens.dev`, `twitter.com`, `medium.com`, `kubernetes.io`), unos 6 s antes de la primera captura; por tiempo (inferido, no trazado) son enlaces de la pantalla de bienvenida de Lens. Ninguna ocurrió en los pasos 3–7; `lsof` no mostró conexiones inet no locales. Es una vista por muestreo (log de la guarda, eventos de Playwright, un `lsof` final), sin captura de paquetes.

## Observaciones abiertas (no corregidas; fuera del alcance de R1)
- El diálogo se renderiza en línea, bajo los filtros, y no como superposición flotante (`03-demo-profile-created.png`). Conserva `role="dialog"` y `aria-modal`.
- Tras Esc el foco pasa a `BODY` en lugar de volver al botón disparador.
- La insignia DEMO se corta en una columna estrecha junto al botón «Analizar incidente con IA» (cosmético).
- Los incidentes no persisten tras reiniciar (0 filas); el proveedor predeterminado sí.

---

# R2 — Cierre visual y accesibilidad (base `bee9d69e`)

## Defectos cerrados
1. **Diálogo sin estilos propios.** `ai-provider-config-dialog.tsx` importaba `incident-workbench-panel.module.scss`, donde no existían `modalBackdrop`, `modalContent`, `modalHeader`, `modalTitle`, `modalFooter` y `formGroup` (el consentimiento del Workbench usaba las mismas seis). Ahora el diálogo tiene su módulo `ai-provider-config-dialog.module.scss` (backdrop `position: fixed`, `z-index: 1000`, contenido centrado con scroll interior y adaptación `max-width: 560px`) y se renderiza con un portal a `document.body`. El panel recibió las seis clases que le faltaban (solo adición; el módulo del listado no se tocó por esa causa).
2. **Accesibilidad.** Escape, botón Cerrar y clic en el backdrop devuelven el foco al botón que abrió el diálogo; Tab/Shift+Tab no salen del diálogo; los errores de guardado, creación de Demo y creación de perfiles se muestran dentro del diálogo con `role="alert"`; el selector sigue sincronizado con el backend tras un error; una operación fallida no se presenta como exitosa (ya no se borra la API key escrita y se limpia el error obsoleto al reintentar).
3. **Insignia DEMO.** El texto completo se mantiene, ahora con `title` y sin cortarse (`white-space: normal`, `min-width: 0`, grupo con wrap).

## Defectos hallados por la validación en Electron real y corregidos
- **D6:** tras «Quitar proveedor predeterminado» el botón se desmonta, el foco cae en `BODY` y Escape dejaba de cerrar el diálogo (el handler estaba en el backdrop). Ahora Escape y la trampa de Tab usan un listener de `document`, y si el foco queda fuera del diálogo se recupera hacia el contenedor.
- **Insignia invisible a 700 px o menos:** el contenedor del Centro de Incidentes colapsaba el Workbench a altura 0 y la página desbordaba en horizontal. Arreglo solo de CSS en `incident-list-view.module.scss`: `.actions` con `flex-wrap`, y un bloque `@media (max-width: 900px), (max-height: 700px)` que apila tabla y Workbench a altura natural (panel de 560 px) con scroll vertical del contenedor.

## Pruebas nuevas
- `h8-8-06a-r2-css-classes.test.ts`: analiza `styles.x`/`styles["x"]` en el diálogo, el listado y el panel contra su `.module.scss` (identity-obj-proxy oculta clases inexistentes, por eso se parsea el scss). **RED observado:** listaba las seis clases faltantes.
- `h8-8-06a-r2-ai-dialog.test.tsx` (9 tests): foco de retorno, trampa de Tab, errores con `role="alert"`, sin éxito falso, y Escape/Tab con el foco en `BODY` (**RED** observado antes de la corrección de D6).
- `h8-8-06a-r2-narrow-layout.test.ts`: las reglas de layout estrecho existen y el selector sigue coincidiendo con el estilo inline del TSX.

## Regresión (ejecutada por el orquestador)
- Jest (workbench, incident-storage, ai-diagnostics, global-docking, components/incidents): **57/57 suites, 709/709 tests**.
- `tsc --noEmit`: exit 0. `git diff --check`: exit 0.
- Sin cambios en Main, IPC, SQLite, RBAC, transporte IA, docking ni lógica Kubernetes. `DisabledRealNetworkEngine` intacto.

## Electron real (Electron de desarrollo, NO la app empaquetada)
Ejecutable `/private/var/tmp/lens-final-05-rc-20261108/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, perfil aislado (`CICD` y `HOME` temporales), `--offline`, guarda de red, sin kubeconfig real ni API keys.
- `docs/evidence/h8-8-06a-r2/`: primera pasada con el build de R2 antes de la corrección de D6 y del layout estrecho. Conserva los dos FAIL detectados (histórico).
- `docs/evidence/h8-8-06a-r2b/`: pasada final con todas las correcciones. Todos los pasos PASS.

| Verificación (pasada final) | Resultado |
|---|---|
| Modal superpuesto, centrado, `position: fixed`, desde cabecera y desde Workbench (1440×900) | PASS |
| Escape devuelve el foco al disparador (cabecera, Workbench, banner) | PASS |
| Escape y Tab tras «Quitar proveedor predeterminado» (D6) | PASS (0 escapes en 14+14 pulsaciones) |
| Errores visibles con `role="alert"` y selector sincronizado (error inducido en el main process, una vez) | PASS (pasada r2) |
| Diálogo a 700×700 y 700×500 (mínimo real de la ventana) sin desbordes | PASS |
| Insignia DEMO visible a 700×700 y 700×500 (fracción visible 1), sin desborde horizontal | PASS |
| Layout a 1440×900 sin cambios | PASS |
| Crear Demo, Guardar, reabrir; OOM sintético, consentimiento, diagnóstico con insignia | PASS |
| Sin tráfico de IA externa tras el arranque | PASS |

## Limitaciones
- A 700 px de ancho o de alto la insignia es alcanzable haciendo scroll vertical en el Centro de Incidentes; no está en el primer viewport (a 700×700 queda en y≈1146 sin scroll).
- El `@media` también se activa en ventanas de 700 px de alto o menos a cualquier ancho. El selector del arreglo (`div[style*="min-height"]` con `!important`) depende del estilo inline de `incident-list-view.tsx` y es frágil; el test narrow-layout lo vigila.
- La comparación de píxeles contra capturas anteriores no se revisó en detalle: una región inferior derecha difería en una captura sin inspeccionar. La conclusión visual se apoya en medidas y capturas.
- 600 y 480 px (pasada r2) están por debajo del mínimo de la app y se alcanzaron anulando `setMinimumSize`. La pasada final no los anula.
- En la pasada r2 algunos clics a anchos estrechos se hicieron con `el.click()` por una capa superpuesta; marcado como `viaJsClick_*` en `evidence.json`.
- El caso de error (E) se indujo envolviendo handlers `ipcMain` desde el harness, no con un fallo natural.
- La prueba de foco desde la cabecera en Jest no existe; está validada solo en Electron.
- Tráfico: vista por muestreo (guarda en proceso, `lsof` final), sin captura de paquetes; 6 conexiones TLS bloqueadas al arrancar, antes de cualquier paso de IA.
- No se re-ejecutó la persistencia tras reinicio en R2 (cubierta en R1).
- Directorios temporales de pruebas (`/private/var/tmp/r2-root.*`, `r2b-root.*`, `r2b-diag.*`) sin borrar.

Risk: none (solo renderer: estilos y manejo de foco/teclado del diálogo).
