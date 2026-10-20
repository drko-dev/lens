# R1 — Ejecución continua de hitos (instrucción del usuario)
Fecha: 2026-10-19. Rama: `feat/openlens-devops-revival`. Repositorio: `/Users/gustavomarcon/Documents/lens/lens`.

## Mandato
Avanzar automáticamente de un hito al siguiente **sin solicitar aprobación rutinaria entre hitos**, respetando la seguridad y los bloqueos reales. Se permite corregir código, ejecutar pruebas, reconstruir y lanzar builds locales aisladas. **No interpretar esto como autorización para borrar datos del usuario, operar clústeres de producción, publicar paquetes, acceder a credenciales reales o realizar acciones externas**. En caso de bloqueo de seguridad, detener la actividad peligrosa y documentar el motivo; proseguir únicamente en tareas independientes y seguras.

## Estado verificado al iniciar esta ejecución
- R1-00: diagnóstico cerrado en `R1_00_PREFLIGHT.md`.
- R1-01: build y smoke Playwright reales completados; pruebas visuales de terminal y tema pendientes (`R1_01_VALIDATION.md`).
- R1-02: JSON Patch con precondición resourceVersion y uid, build y smoke offline completos; integración Kubernetes local pendiente (`R1_02_VALIDATION.md`).
- Instancia de **OpenLens DevOps.app actualmente abierta** desde `open-lens/dist/mac-arm64/OpenLens DevOps.app` usando el perfil habitual `~/Library/Application Support/OpenLens DevOps`. **No cerrarla, no matarla, no sobreescribir el bundle que usa**. Hacer nuevos empaquetados en un destino distinto o una copia versionada; elegir una estrategia compatible con el espacio libre y el actual electron-builder.
- Espacio libre último observado: ~12 GiB en volumen de datos; comprobar antes de toda build y evitar acumular copias gigantes. Preservar al menos una build conocida como funcional. No eliminar respaldos ni caches sin criterio/consentimiento explícito.
- El árbol de trabajo posee múltiples cambios sin commit y artefactos sin seguimiento: nunca `git clean`, `git reset --hard`, `git stash` automático ni commit de cambios ajenos.

## Ciclo obligatorio por hito funcional
(1) leer estado y código vigente, (2) introducir cambios **acotados**, (3) unit tests + typecheck, (4) build Node `v20.20.2` y empaquetado macOS arm64 sin publicación ni notarización, (5) lanzar **binario del .app realmente generado** con `CICD`, `HOME` y `KUBECONFIG` aislados, (6) pruebas Playwright GUI + regresión, (7) usar laboratorio local autorizado o simulado para operaciones Kubernetes, (8) documentar comprobaciones, defectos y limitaciones en `docs/revival/R1_XX_VALIDATION.md`; actualizar casillas demostradas. **Nunca declarar probado visualmente lo que no se observó**. Conservar app habitual del usuario abierta y operativa.

## Hitos con tareas
### R1-00 — Preflight (COMPLETADO)
Estado Git, espacio, Node 20, identidad, binarios, requisitos de build.
### R1-01 — Primer ejecutable (BASE GUI VERIFICADA; PENDIENTES)
Confirmar y, si es posible, terminar smoke de tema/terminal y separar perfiles. Respetar la instancia de app habitual.
### R1-02 — Concurrencia YAML (CÓDIGO Y GUI OFFLINE VERIFICADOS; LAB PENDIENTE)
JSON Patch `test /metadata/resourceVersion` y `uid`; confirmar 409/422 con fake API y laboratorio para CRDs/StatefulSet/Deployment. Proteger borrador.
### R1-03 — Edición inline Secret y ConfigMap (SIGUIENTE)
Corregir `config-secrets/secret-details.tsx` y `config-maps/config-map-details.tsx`: reconocer 409, conservar borrador de usuario incluso si store emite refresh, ofrecer diferencias **solo por nombre de clave** en Secret (no valores), recarga remota y re-aplicación **solo por confirmación**; manejo de 403, cambios externos y lectura fallida; tests focalizados, build + smoke offline; acciones sobre clúster solo local autorizado.
### R1-04 — Fidelidad kubeconfig
Preservar `tls-server-name`, `proxy-url`, `disable-compression`, `exec.env`, `exec.interactiveMode` y `exec.provideClusterInfo` en carga y roundtrip; tests con datos sintéticos, errores redactados, PATH; build + smoke.
### R1-05 — Conectividad esencial
Validar selección de kubectl por versión en port-forward/exec, checksums de binarios y descargas, Helm/proxy, watches con backoff + bookmarks y recuperación tras suspend; pruebas unitarias, integración simulada, build + smoke.
### R1-06 — Integración y aceptación de R1
Suite regresión, laboratorio Kubernetes local solo si está disponible y autorizado, pruebas CRUD concurrentes con recursos ficticios, logs/terminal/port-forward y recuperación; **build final ejecutable**, Playwright GUI, reporte de pendientes y limitaciones; no declarar R1 completado si funcionalidades críticas no pudieron validarse.

## Política de errores
Si un test falla, registrar y corregir dentro del alcance sin avanzar como si hubiera pasado. Si no es posible un smoke visual, dejar el hito pendiente de validación y continuar solo con tareas que no dependan de esa prueba. Si el laboratorio no está disponible, testear con mocks y dejar la certificación de Kubernetes como pendiente. No realizar cambios de infraestructura ni borrar procesos/perfiles ajenos sin permiso.

## Documentación
`ROADMAP_PROVISIONAL.md`, `FEATURE_CATALOG_FULL.md`, `R1_IMPLEMENTATION_CHECKLIST.md`, `R1_00_PREFLIGHT.md`, `R1_01_VALIDATION.md`, `R1_02_VALIDATION.md`, `TEST_RESULTS.md`.

## Próximo paso concreto
Tomar R1-03 de manera incremental, priorizar primero tests de conflicto 409 y preservación de borrador; evitar modificar en caliente la app del usuario.
