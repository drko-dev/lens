# H8.7 — Reauditoría independiente final (2026-11-06)

**Rama:** feature/h8-7-documentacion-in-app. **Commit examinado:** f9db8d15.
**Dictamen:** PASS para función de documentación en Electron DEV y regresión Jest; PARTIAL para la cobertura E2E contextual y el alcance de red. No merge ni release por ahora.

## Comprobaciones realizadas

- Jest independiente con Node v24.22.2: 54/54 suites, 443/443 tests y tres snapshots PASS. Las tres suites de Welcome previamente fallidas ahora pasan. Log: /tmp/openlens-h87-final-independent-jest-20261106.log.
- Smoke Electron DEV con HOME, CICD y KUBECONFIG sintéticos, mock keychain, captura fuera de Git: exit 0; 9 screenshots con hashes únicos iguales a los reportados; 12 requests observados, cero externos. Log: /tmp/openlens-h87-final-independent-smoke-20261106.log.
- Menú nativo F1 y botón verdadero de Kubetail comprobados en auditoría anterior. Nueva prueba independiente: navegación al Centro de Incidentes del clúster demo y click verdadero en incidents-help-button abre el artículo correcto. Volver en el navegador raíz devuelve la vista del clúster.
- RC2 preservado y develop sin cambios. No se empaquetó H8.7.

## Hallazgo A: cobertura de botones contextuales incompleta

El smoke usa window.__LENS_RENDERER_DI__.injectById('navigate-to-documentation') cuatro veces desde la ventana principal. Comprueba el router y los cuatro artículos, **no hace click** en los cuatro botones reales. Se verificaron independientemente los botones de Incidentes y Docking. Los de Workbench y Consentimiento siguen sin E2E real: en una prueba sintética, create-synthetic-btn no llegó a montar incident-workbench-panel dentro del timeout. No se atribuye aún a un fallo productivo; falta fixture válido y prueba de los clicks reales, retornando al clúster entre artículos.

## Hallazgo B: auditoría de red de alcance limitado

El listener de requests se registra en win después de electron.launch. El conteo de 0 externos entre 12 requests observados es correcto, pero no cubre posibles requests anteriores al registro, otros BrowserWindows o procesos de Main. Tampoco implementa bloqueo de red completo. No afirmar aislamiento de red global solo con esa evidencia. Ampliar registro/bloqueo de forma segura y demostrar fail-closed mediante prueba negativa sintética.

## Otras observaciones

El commit c8cfaf47 añade overrides sin efectos secundarios al harness de pruebas; también cambia el código productivo create-lens-window.injectable.ts para esperar target.loadUrl(url). Electron DEV arrancó en la nueva prueba, pero conviene revisar el caso de URLs lentas o fallidas antes del release.

Se puede comenzar ahora el **diseño** de identidad de marca en paralelo. No aplicar la nueva marca al código ni crear un instalador final hasta cerrar estas pruebas y preparar el nuevo RC empaquetado con documentación. Conservar RC2 como rollback y medir disco antes de construir.
