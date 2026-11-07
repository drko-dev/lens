# H10 — Entrega QA multiclúster y multiventana sobre NovaKube empaquetado

**Fecha:** 2026-11-07. **Rama:** feature/h10-packaged-multicluster-qa. **Base:** develop@836a9ae1.

**Dictamen:** PASS funcional focalizado de H10. No es aprobación de publicación general.

## Binario verificado

- App: open-lens/dist/h9-novakube-rc1/mac-arm64/OpenLens DevOps.app (Electron 45.2.0 ARM64 empaquetado, sin DEV server).
- DMG: open-lens/dist/h9-novakube-rc1/OpenLens DevOps-6.5.3-dev-arm64.dmg
- DMG SHA-256: 5b0b79ae91c4cddab56c0820854e9d7d650962ccdf655736d92c92831fa4fc46
- ZIP SHA-256: eb24367dc41dc5bc6667aca457abae8345c21bda6bfc9d4d7296748580b4071a
- RC1 no se recompiló, reemplazó ni alteró. RC2 anterior sigue sin instaladores válidos.

## H10-00 — Aislamiento y preparación: PASS

- Kubeconfig sintético: exclusivamente http://127.0.0.1:18443 y http://127.0.0.1:18444, token ficticio, sin conexión a Kubernetes real.
- Copia independiente del perfil H7 en /private/var/tmp/h10-novakube-packaged-20261107/profile. Se corrigieron solamente allí rutas absolutas al kubeconfig del perfil original e IDs derivados de la nueva ruta. El perfil original no se modificó.
- Se seleccionó NovaKube en el user store de la copia antes de arrancar.
- El harness H7 ya admite H7_PACKAGED_APP. Se reforzó para arrancar el paquete con --use-mock-keychain --offline y para relanzar el MISMO binario en PS16.
- No push/merge, Keychain real, build nuevo, credenciales ni recursos de producción.

## H10-01 y H10-02 — Multiclúster y ventanas nativas: PASS

Scenarios focalizados: D16, V01, V09, V10, V11, P01, P04, P05, P06, P09, P15. Más QA00, que comprueba que la evidencia histórica versionada permanece intacta.

- D16: clústeres A y B abiertos desde Catálogo por clic real, paneles y streams aislados.
- V01: identidad visual de 2 px comprobada.
- V09: cambiar A no altera la identidad del clúster B.
- V10: B identificado como Production, sin sustituir estado semántico por azul NovaKube.
- V11: flag global OFF conserva navegación clásica.
- P01: BrowserWindow nativa Pods sandboxed y read-only.
- P04: descriptor del detached conserva clusterId y contexto de A.
- P05: banda de 2 px con color Teal real en ventana desacoplada.
- P06: clic Redock real devuelve panel y no acumula watches.
- P09: dos BrowserWindows Pods/Deployments reciben eventos sintéticos independientes.
- P15: B Production muestra aviso/banner, y cross-cluster detach/redock por IPC rechazados. Cero mutaciones registradas por APIs sintéticas (a=0, b=0).

**Ejecución final:** 12 PASS, 0 FAIL, 0 BLOCKED. Reporte JSON y HTML en /private/var/tmp/h10-novakube-packaged-20261107/artifacts-v3/.

### Incidencias de preparación registradas

Primer intento: perfil QA copiado tenía rutas absolutas del perfil original; se detuvo el test y se corrigió la COPIA, sin tocar proyecto productivo.

Segundo intento: 8 PASS y 2 FAIL (V10, P15) por omitir los prerequisitos V09 y V11 del harness existente. Un iframe cubría el clic hacia B y el test P15 esperaba un badge Production que no había sido aplicado. No se ocultaron fallos.

Tercer intento: se incluyeron V09 y V11, y la corrida completa obtuvo 12/12 PASS. Los dos fallos previos se clasifican como problema de fixture/orden de tests, no como regresión de código comprobada.

## H10-03 — Cold restart con ventana detached: PASS

Se ejecutó V06, V03, V07, PS16 y QA00, todos PASS, con el binario ARM64 empaquetado también durante el relanzamiento.

- V06: configuración de color desde Settings.
- V03: agrupación de tabs con interacción real.
- V07: pin y color desde menú contextual.
- PS16: con Pods desacoplado y layout guardado, se cerró y relanzó Electron; después del reinicio hubo 0 ventanas detached autocreadas y como máximo un panel Pods.
- QA00: sin modificar capturas históricas.

**Ejecución final:** 5 PASS, 0 FAIL, 0 BLOCKED. Reporte JSON y HTML en /private/var/tmp/h10-novakube-packaged-20261107/artifacts-ps16/.

La prueba demuestra ausencia de autocreación de ventanas detached y duplicación de paneles; no es una auditoría exhaustiva de todos los streams. La persistencia de selección NovaKube con clic real/cold restart ya fue comprobada en la auditoría independiente H9.

## H10-04 — Jest y evidencia: PASS

- Node 24.22.2. Jest focalizado para novakube, split-panel, detached y versioned-persistence: **26 suites / 291 tests PASS, exit 0**.
- Log Jest: /tmp/h10-novakube-focused-jest-20261107.log
- Se conservaron 6 capturas auténticas y únicas en docs/evidence/h10: dos clústeres, B Production, color 2 px, dos detached windows, B PROD y después del reinicio.
- SHA-256 único comprobado para cada captura; screenshots originales de Playwright siguen disponibles temporalmente fuera del repositorio.
- No se tocaron los archivos versionados de evidencias anteriores. Espacio libre durante QA: aproximadamente 34 GiB.

## Criterio de salida

H10 cierra la validación pendiente de H9 para dos clústeres, multiventana detached/redock e inicio en frío del app empaquetado. El alcance es un fixture Kubernetes sintético aislado, no certifica comportamiento con clústeres productivos ni instalación pública.

Siguiente decisión: aprobar cierre independiente de H10 y luego planear distribución/notarización y rollback válido. No ejecutar push, merge, publicación ni limpieza de H9 RC1 sin autorización.
