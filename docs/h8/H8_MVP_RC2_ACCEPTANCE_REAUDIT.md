# OpenLens DevOps — Reauditoría independiente del gate RC2

Fecha: 2026-11-06
Base: feature/h8-mvp-rc2-acceptance-gate, commit a31bd593.
Checkpoint de la entrega informada: checkpoint/h8-mvp-rc2-acceptance-a31bd593-2026-11-06.
**Estado: PARTIAL — no fusionar con develop aún.**

## Verificado y preservado

- Commits QA en a31bd593, solo cambios de script de pruebas, capturas y reporte; runtime empaquetado RC2 no se modificó.
- Seis capturas nuevas con seis hashes SHA-256 genuinamente distintos; hashes de DMG y ZIP RC2 preservados y coincidentes con los validados anteriormente.
- El informe QA informa migración SQLite v7->v8, deduplicación por UID/señal, inicio/fin y auditoría. El código del script contiene interacciones de UI con pestaña Evidence, adjunto de values.production.yaml, modal de consentimiento y botón de análisis.
- develop permanece en 90bafad1. Se puede hacer fast-forward después del gate, pero una historia de Git sin conflictos no reemplaza el QA funcional.

## QA-BLOCK-01 — Captura y test de Global Docking fabricados

En open-lens/integration/h8-mvp-rc2-packaged-qa.mjs, aproximadamente líneas 900-995, el QA llama a mainWin2.evaluate() y CREA un div #qa-docking-overlay, luego construye con React.createElement un "workspace-root-layout", "workspace-toolbar", panel izquierdo/derecho, botones swap/reset/save/detach y otros data-testid. Monta con ReactDOM.render el DOM diseñado por el propio test. Playwright comprueba esos mismos data-testid y captura ese overlay.

**Consecuencia:** prueba que un test puede dibujar un layout ficticio; NO verifica los componentes reales de Global Docking, ni su estado persistido, ni guardar/restaurar, ni desacoplar/reacoplar. Es inválido declarar "Global Docking restaurado PASS" por esa captura.

**Criterio de salida:** eliminar totalmente inyección de overlay y creación de controles/falsos data-testid. Usar ruta, cluster frame y controles reales de la aplicación empaquetada, referenciando open-lens/integration/h2-full-e2e.mjs, open-lens/integration/h7-docking-e2e.mjs y packages/core/src/renderer/components/split-panel/split-panel-layout.tsx. Habilitar únicamente entorno de prueba sintético sin conexiones de Kubernetes real. Guardar layout usando UI/estado real; cerrar app y verificar layout restaurado, paneles, intercambio/acople, sin escribir artificialmente el DOM. Si no es posible, marcar PARTIAL real y no fabricar evidencia.

## QA-BLOCK-02 — Reporte de diagnóstico no es una aserción

En el mismo script, fase 5, se hace click en confirm-ai-diagnosis-btn pero las variables hasStatusBadge y hasRemediationVerifyBtn solo se imprimen; NO hay aserción que falle cuando sean false. No se hace click en verify-remediation-btn, ni se confirma cita literal verificada, status CONCLUSIVE, relación con evidenceId, ni purga del archivo después de completar. La inexistencia de tablas llamadas ephemeral_context_files/raw_file_buffers no demuestra ausencia de cuerpos crudos en otras columnas/logs.

**Criterio de salida:** convertir cada expectativa en aserciones fail-closed. Confirmar reporte mock real, estado y citation text/source, realizar la acción de verificación de remediación y evaluar resultado, comprobar limpieza de estado/handles efímeros luego de terminar/cancelar, buscar marcadores sintéticos crudos en SQLite/logs (sin archivos secretos). Mantener sin APIs externas.

## QA-BLOCK-03 — "100% perfil aislado" es incorrecto con Keychain real compartido

El script crea SYNTHETIC_HOME y KUBECONFIG, pero líneas 39-44 enlaza de manera simbólica SYNTHETIC_HOME/Library/Keychains al Keychain REAL del usuario (path.join(process.env.HOME, 'Library/Keychains')). Esto viola el requisito anterior de que QA opere íntegramente bajo HOME sintético, aunque no signifique que los haya modificado. El detector de filtraciones solo busca la cadena fija '/Users/gustavomarcon/.kube' en logs; ausencia de esa cadena no demuestra ausencia de lectura de archivos, y no generaliza a otros HOME.

**Criterio de salida:** NO crear enlace a Keychains reales ni tocar default keychain o datos de identidad del usuario. Diseñar Keychain temporal de prueba con permisos aislados sin modificar los keychains existentes, o resolver dependency safeStorage mediante una estrategia QA segura y explicitar limitaciones. Derivar HOME de runtime, usar KUBECONFIG de fixture y verificar mediante logs/contadores/entorno que nunca hay accesos a kubeconfig o credenciales reales. No declarar aislamiento absoluto basado solo en ausencia de una cadena de log.

## Requisitos para volver a intentar integración

1. Corrección solo del QA, mocks y evidencia. No añadir features, no reconstruir DMG/ZIP RC2 si no cambia runtime.
2. Reejecutar QA empaquetado evitando acceso a Keychains/kubeconfigs reales. No poner en riesgo configuración del macOS ni instalaciones.
3. Adjuntar capturas verificables del Global Docking *real*, citas y verificación de remediación realmente completadas. Las capturas deben mostrar estados genuinos.
4. Publicar informe revisado con PASS/PARTIAL/BLOCKED por componente; si un criterio no se puede cubrir, reconocerlo sin pasar el gate como 100%.
5. Solo tras revisión independiente y PASS, git switch develop; git merge --ff-only feature/h8-mvp-rc2-acceptance-gate. SIN push.
6. Conservar RC1 hasta autorización de limpieza posterior a RC2 aceptado; el checkpoint original está preservado.
