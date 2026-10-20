# Roadmap — OpenLens DevOps Revival

> **Estado:** planificación técnica; ninguna funcionalidad nueva implementada.
> **Fecha de referencia:** 2026-10-12.
> **Repositorio local:** `/Users/gustavomarcon/Documents/lens/lens`
> **Fork:** `drko-dev/lens`
> **Rama de trabajo:** `feat/openlens-devops-revival`
> **Propósito:** construir una edición propia y reconocible de OpenLens para operaciones DevOps diarias, priorizando compatibilidad Kubernetes y edición/guardado verificables.
> **Este documento es el punto de entrada para Claude Code, Gemini y otros agentes.** Consultarlo antes de proponer cambios.

## 1. Objetivo y prioridades

El usuario utiliza Lens diariamente para asistir a desarrolladores, sobre todo editando Secrets, ConfigMaps y manifiestos YAML. El problema principal de Lens oficial es que el editor puede aparentar haber guardado, pero el usuario no consigue comprobar inmediatamente si Kubernetes conserva el cambio; a veces necesita reiniciar Lens para conocer el estado real.

**Prioridades (en orden):**
1. Compatibilidad, autenticación y seguridad con los clústeres Kubernetes actuales del usuario.
2. Edición de YAML, Secrets y ConfigMaps con guardado verificable, estado de lectura consistente, detección de conflictos y errores claros.
3. Operaciones DevOps: logs, exec/terminal, port-forward, CRD, Helm, navegación y múltiples contextos.
4. Aplicación propia para macOS Apple Silicon, con identidad diferenciada de Lens oficial.
5. Mejoras progresivas de UX y rendimiento.
6. Métricas: mantener si es viable, **no** priorizar (el usuario ya dispone de otra observabilidad).

**Restricción:** primero analizar, comparar y demostrar hipótesis; no reescribir ni actualizar todo de golpe. No conectar a producción ni modificar recursos reales sin autorización explícita. No copiar código propietario de Lens oficial; utilizar REA para análisis comparativo de comportamientos, interfaces y compatibilidad, respetando licencias.

## 2. Estado confirmado al 2026-10-12

### Repositorio histórico

- OpenLens: `6.5.3-dev`; último commit local observado: marzo de 2024.
- Stack: Electron `22.3.3`, React 17, TypeScript 4.9, `@kubernetes/client-node` `^0.19.0`.
- Binarios declarados: `kubectl 1.25.16`, Helm `3.11.0`, proxy Kubernetes `0.3.0`.
- `open-lens/package.json` declara Node `>=16 <=20`; Node 20.20.2 quedó instalado mediante NVM para el proyecto.
- `npm run all:install` terminó correctamente; npm informó **159 vulnerabilidades** (11 críticas, 90 altas, 47 moderadas y 11 bajas). Son hallazgos de dependencias, no prueba de explotación.
- No existe todavía una compilación ejecutada y validada de nuestra edición.
- La rama `feat/openlens-devops-revival` se creó para aislar el trabajo de `develop`.
- La carpeta `.codegraph/` ya existía como elemento sin seguimiento; no alterarla ni añadirla a Git sin revisar.

### Lens oficial y REA

- Lens instalado en `/Applications/Lens.app`: versión informada por macOS `2026.10.51501-latest`.
- REA `rea-agents@6.4.0` figura conectado en Claude Code como servidor MCP `rea`.
- Primera pasada REA: análisis estático de `/Applications/Lens.app/Contents/Resources/app.asar`.
- Evidencia local: `/tmp/openlens-rea-official.json` (archivo temporal grande, aproximadamente 605 MB decimales). **No versionarlo ni copiarlo íntegro al repositorio.** Si se necesita preservación duradera, generar un resumen sin secretos y registrar hashes/rutas.
- Estadísticas: 18.680 archivos relevantes inventariados; 11.474 JavaScript parseados; 26 fallos de análisis; 38.523 hallazgos; 96.413 nodos de grafo y 100.996 aristas.
- Cobertura parcial; el grafo semántico está truncado. Se registraron 16 contradicciones de integridad ASAR para binarios empaquetados; REA se ejecutó con `--integrity-policy record-and-continue` para registrar bytes observados como **no confiables**. Esto **no** prueba que Lens esté comprometido.
- Una inspección dirigida del grafo **no identificó de forma fiable** los módulos funcionales de edición, kubeconfig o port-forward de la app oficial. **No inferir que esas funcionalidades están ausentes.** La comparación de comportamientos sigue pendiente.

### Editor de nuestro OpenLens (evidencia directa de código fuente)

Punto de entrada: `packages/core/src/renderer/components/dock/edit-resource/`.

- `view.tsx` enlaza EditorPanel y el botón Save a `model.save`.
- `edit-resource-model/edit-resource-model.injectable.tsx` serializa YAML, calcula un JSON Patch (`rfc6902`), llama a `requestPatchKubeResource` y presenta notificación de éxito si responde la llamada.
- `request-patch-kube-resource.injectable.ts` ejecuta el PATCH y retorna nombre/tipo, no el recurso completo.
- **Brecha observada:** después del PATCH exitoso, el flujo de `save` no hace un GET de comprobación del recurso guardado. Esta es una diferencia de diseño, **no una prueba de que sea el mismo bug de Lens oficial**.
- Revisar `metadata.resourceVersion`, lectura del estado remoto, diffs, concurrencia, validación YAML, `selfLink`/rutas API y los efectos de mutaciones/admission webhooks antes de diseñar el reemplazo.

### Hallazgos de la segunda pasada (Hito 1) — detalle en `docs/revival/REA_FINDINGS.md`

- **Editor YAML (verificado en código):** `save()` envía JSON Patch sin `resourceVersion`/`test`, descarta la respuesta, fija `firstDraft` con el texto local y escribe la etiqueta `k8slens-edit-resource-version` en el recurso. Hay riesgo de pérdida silenciosa en ediciones concurrentes, y el editor muestra lo enviado en lugar de lo persistido.
- **Lens oficial (estático fuerte):** el módulo equivalente (`kube-resource-editing/edit-resource/.../edit-resource-model`, 241 líneas, igual que el nuestro) conserva `createPatch`, la etiqueta y el `selfLink`, no usa `resourceVersion` y no hace re-GET en `save()`. Esto **refuerza la hipótesis** de que el bug oficial comparte la causa raíz; la confirmación en ejecución sigue pendiente (U-1).
- Lens oficial agregó diff/revert del editor (detrás de premium/trial), verificación de integridad de `lens-k8s-proxy` y limpieza de port-forward al desconectar o salir.
- Versiones oficiales: Electron 44.4.2, Node ^24, kubectl 1.27.16, Helm 3.20.2, lens-k8s-proxy 0.4.0, `node-pty` 1.1.0-beta34.
- Compatibilidad OpenLens: PSP `policy/v1beta1` eliminado en 1.25; kubectl 1.25.16 fuera de skew; `dumpConfigYaml` omite `tls-server-name`/`proxy-url`; `selfLink` **no** es problema (se sintetiza en el cliente).
- Panel de detalle de Secret/ConfigMap: PUT completo con `resourceVersion` (control de concurrencia en el servidor), pero sin UX para `409`.

### Hito 2 — primer arranque y editor confiable (2026-10-12)

**Cómo levantar OpenLens DevOps (macOS arm64, desarrollo sin empaquetar):**

```bash
cd /Users/gustavomarcon/Documents/lens/lens
source ~/.nvm/nvm.sh && nvm use 20      # el proyecto exige Node >=16 <=20; la shell por defecto trae 22
npm run build                            # monorepo completo (lerna); también descarga kubectl/helm/lens-k8s-proxy arm64
cd open-lens && ../node_modules/.bin/electron .   # ejecutar desde open-lens/ (resuelve binaries/client/darwin/arm64)
```

Tras cambiar solo `packages/core`: `npx lerna run build --scope @openlens/core && (cd open-lens && npm run build)`.
Modo con recarga en caliente: `cd open-lens && npm start`.

**Hecho y verificado:**
- Build completo OK con Node 20.20.2 (sin actualizar dependencias). La app abre ventana funcional ("Welcome to OpenLens DevOps!").
- Identidad: `productName` "OpenLens DevOps", `appId` `dev.drko.openlens-devops`, datos en `~/Library/Application Support/OpenLens DevOps`, protocolo `openlens-devops://` (antes `lens://`, colisionaba con Lens oficial), `--publish never`.
- Extensiones y plantillas en `~/.openlens-devops/` (antes `~/.k8slens/`, que es el directorio de Lens oficial).
- `lens-k8s-proxy ENOENT`: un build de producción lanzado sin empaquetar usaba `process.resourcesPath`. Ahora la ruta depende de `is-packaged-app` (`NODE_ENV=production` y sin `process.defaultApp`). Verificado: el proxy corre desde `open-lens/binaries/client/darwin/arm64/`.
- Editor (R-005/R-006/R-011): ConfigMap/Secret se guardan con PUT y el `resourceVersion` cargado originalmente. El 409 conserva el borrador, muestra las rutas en conflicto y ofrece re-aplicar los cambios de forma explícita. Después de guardar se hace un GET de verificación de los campos editados (Secrets: `stringData` contra `data` en base64, sin exponer valores). La confirmación solo aparece si la verificación pasa. Se eliminó la escritura de la etiqueta `k8slens-edit-resource-version` (sigue leyéndose por compatibilidad). Otros tipos (Deployment, StatefulSet, CRD) mantienen JSON Patch mínimo y agregan la verificación GET: un PUT podría pisar campos de controladores y generaría conflictos espurios por cambios de `status`.
- Pruebas: 16 nuevas (`edit-resource-model/save.test.tsx`) más la suite de namespaces adaptada. Semántica validada en minikube v1.30 (`openlens-lab`): PUT con `resourceVersion` viejo → 409 sin pisar el cambio remoto; `stringData` persiste como `data`.

- Protocolo en tiempo de ejecución: `setup-deep-linking` registraba `lens://` con `setAsDefaultProtocolClient("lens")`, aunque `package.json` ya usaba otro esquema. Ahora se usa la constante `protocolScheme` (`openlens-devops`), también en el router y en `show-initial-window`.
- Prueba de integración opcional `edit-resource-model/save.lab-integration.test.tsx` contra un clúster real de laboratorio. Pasa en `openlens-lab`: guardado con verificación de ConfigMap, 409 con cambio remoto preservado y re-aplicación, y `stringData` de Secret. Para ejecutarla:
  `KUBECONFIG=<lab> kubectl proxy --port=8099` y luego `OPENLENS_LAB_API=http://127.0.0.1:8099 npx jest edit-resource-model/save.lab-integration` (en `packages/core`).

**Arranque aislado para pruebas de laboratorio** (no ve `~/.kube` ni restaura sesiones reales): `CICD=<dir>` redirige `appData`. Hay que sembrar `<dir>/OpenLens DevOps/lens-user-store.json` con `preferences.syncKubeconfigEntries` apuntando solo a `<dir>/OpenLens DevOps/kubeconfigs`, copiar ahí el kubeconfig de laboratorio y lanzar `CICD=<dir> ../node_modules/.bin/electron .`. `HOME=` y `--user-data-dir` **no** aíslan.

**Pendiente:**
- Prueba manual del editor en la UI. Con la instancia aislada se llegó a ver solo `openlens-lab`, pero la automatización de clics no fue fiable: abrió un diálogo "Sync file(s)" no solicitado y se cerró la app sin sincronizar. Además, el botón "Browse Clusters in Catalog" de la bienvenida terminó activando el clúster que estaba bajo el cursor (*click-through*). Hacerla a mano.
- Las ejecuciones previas a la corrección pudieron registrar el Electron de desarrollo como manejador de `lens://` en macOS. Abrir Lens oficial una vez para que lo recupere.
- `~/Library/Application Support/OpenLens DevOps` (perfil real de desarrollo) ya contiene tus clústeres y restaura el último usado al iniciar.
- Al abrir, la app restaura el último clúster usado. Evaluar desactivarlo para clústeres sensibles.
- `JsonApi.writeLog` registra siempre los cuerpos de request/response a nivel `debug`, incluidos Secrets, y llegan al log cuando el logger está en `debug`. Es preexistente (`packages/utility-features/json-api/src/json-api.ts`); conviene redactarlo.
- Visor diff completo en conflictos (hoy se muestran solo las rutas) y empaquetado `.app` firmado (R-003).

## 3. Plan de trabajo por fases (orden y criterios de salida)

### Fase 0 — Evidencia comparativa REA y alcance — P0 — EN CURSO (estático completo; falta runtime)

**Tareas:**
- [x] Inventariar Lens oficial y completar la primera pasada estática de REA.
- [x] Inspeccionar cobertura, límites y hallazgos del primer análisis.
- [x] Segunda pasada **dirigida** (2026-10-12): localización de módulos vía la lista `sources` de los *source maps* oficiales + sonda de marcadores (solo conteos) en unos 25 módulos. Evidencia y método en `docs/revival/REA_FINDINGS.md` §2.
- [ ] Donde REA no permita inferir comportamiento, estudiar la aplicación **en ejecución** mediante casos controlados y observables (sin copiar su código propietario). Registrar acciones, mensajes, request/response redaccionados y estado confirmado del clúster de prueba. → incógnitas U-1 a U-8; requiere un clúster de laboratorio y autorización (D-5).
- [x] Crear `docs/revival/REA_FINDINGS.md` con matriz: funcionalidad, comportamiento oficial observado, comportamiento OpenLens confirmado, evidencia/ruta, cobertura y decisión (reutilizar / modernizar / sustituir).
- [ ] Verificar versiones y políticas de compatibilidad Kubernetes exigidas por los clústeres reales; no asumirlas a partir de las versiones de kubectl incluidas. (U-7)

**Salida:** matriz priorizada, con evidencia reproducible y lista de incógnitas. Si REA no puede resolver una incógnita, marcarla como tal.

### Fase 1 — Build de referencia reproducible macOS ARM64 — P0 — PENDIENTE

- [x] Crear rama aislada e instalar Node 20 y dependencias.
- [ ] Registrar herramientas y lockfile; verificar compilación y tests sin actualizar paquetes masivamente.
- [ ] Resolver bloqueos de compilación, compatibilidad de dependencias nativas y empaquetado arm64 con cambios mínimos.
- [ ] Cambiar **identidad del producto** (`productName`, bundle/app ID, icono, directorio de datos y canales de actualización) para instalarlo junto a Lens oficial sin sobrescribir perfiles.
- [ ] Crear build ejecutable `OpenLens DevOps`; abrirlo en Mac M4 y capturar versión, commit, arquitectura y resultado de smoke test.
- [ ] Evitar publicadores/updaters ajenos y credenciales de firma de terceros.

**Salida:** build propio abre, se distingue de Lens oficial, no pisa sus datos y puede reproducirse desde instrucciones documentadas.

### Fase 2 — Núcleo Kubernetes compatible y seguro — P0 — PENDIENTE

- [ ] Determinar versiones Kubernetes objetivo y matriz de compatibilidad de API, cliente, kubectl, Helm y proxy.
- [ ] Probar carga de kubeconfig, contextos, certificados, exec credential plugins (cuando correspondan), namespaces y errores de autenticación.
- [ ] Verificar discovery y recursos core/CRD sin depender indebidamente de campos antiguos como `selfLink`.
- [ ] Asegurar contexto/clúster/namespace visibles en operaciones mutables, permisos RBAC y protección contra escrituras en clúster equivocado.
- [ ] Introducir tests de conectividad y contratos en un clúster **de laboratorio** sin credenciales productivas.

**Salida:** lectura y navegación correctas con los clústeres objetivo; matriz de pruebas compatible y documentada.

### Fase 3 — Editor confiable de Secrets, ConfigMaps y YAML — P0 — PENDIENTE

- [ ] Diseñar estado explícito: `sin cambios`, `modificado`, `guardando`, `guardado/verificado`, `conflicto`, `error`.
- [ ] Validar sintaxis YAML, esquema y existencia de recurso; conservar texto sin guardar ante errores o reconexiones.
- [ ] Usar precondiciones/estrategias seguras con `resourceVersion` y detectar conflictos `409`; nunca sobrescribir silenciosamente una edición concurrente.
- [ ] Al guardar, mostrar respuesta del servidor y volver a consultar el objeto; comparar **campos editables relevantes** con los solicitados, explicando defaults, conversiones, webhooks/admission y cambios hechos por el API Server. No exigir igualdad literal de todo el YAML.
- [ ] Permitir refrescar, mostrar diff local/remoto, reintentar explícitamente y volver a editar tras fallo; impedir afirmar éxito verificado si falló el GET posterior.
- [ ] Secret: no registrar ni exponer valores en logs, telemetría o capturas; tratar correctamente valores `data` (base64) y `stringData`, permisos y mensajes de error.
- [ ] Probar escenarios: éxito; invalid YAML; RBAC prohibido; pérdida de conexión; timeout; `409`; cambio simultáneo; webhook mutador; editor cerrado; recarga inmediata; cambio de contexto.

**Salida:** un usuario puede editar un ConfigMap y un Secret de laboratorio, guardar, recargar y constatar el estado persistido sin reiniciar la aplicación.

### Fase 4 — Operaciones DevOps del día a día — P1 — PENDIENTE

- [ ] Logs con streaming estable, reconexión y distinción por pod/contenedor.
- [ ] Exec/terminal seguros con manejo de sesiones y cierre.
- [ ] Port-forward robusto (estado visible, liberación de puertos y reconexión).
- [ ] Navegación rápida entre clústeres/namespaces; Pods, Deployments, StatefulSets, Services, Ingress, CRD.
- [ ] Helm: lectura, compatibilidad con versiones actuales y acciones explícitas.
- [ ] Optimización de tablas, filtros, recursos grandes y feedback visual.
- [ ] Métricas existentes: conservar si no bloquean; no priorizar rediseño.

**Salida:** suite de smoke tests DevOps aprobada en entorno de prueba.

### Fase 5 — Seguridad, estabilidad y distribución — P1 — PENDIENTE

- [ ] Triar las 159 alertas originales por explotabilidad y ruta de ejecución; actualizar por lotes compatibles y repetir tests.
- [ ] Revisar Electron, aislamiento entre procesos, IPC, CSP, native addons, dependencias y permisos.
- [ ] Agregar tests unitarios/integración/end-to-end y CI para macOS arm64.
- [ ] Documentar compilación, firma/notarización si se distribuye, canales de actualización, rollback y recuperación de datos.
- [ ] Validación de uso diario y plan de releases versionadas.

**Salida:** versión candidata utilizable, con regresiones controladas, seguridad revisada y procedimiento de rollback.

## 4. Propuesta de primeros tickets

| ID | Prioridad | Tarea | Prueba de finalización |
| --- | --- | --- | --- |
| R-001 | P0 | Matriz REA (edición/conectividad/proxy) | Evidencias y lagunas por módulo; ningún supuesto presentado como hecho |
| R-002 | P0 | Compatibilidad Kubernetes objetivo | Versiones reales y escenarios soportados definidos |
| R-003 | P0 | Build macOS ARM64 propio | Ejecutable con marca diferente; instalación paralela |
| R-004 | P0 | Smoke test clúster de laboratorio | Navegación, auth y permisos validados |
| R-005 | P0 | GET posterior al guardado y estados de editor | UI distingue PATCH aceptado de contenido verificado |
| R-006 | P0 | Edición concurrente y conflictos | Test de `resourceVersion` / `409`, sin pérdida silenciosa |
| R-007 | P0 | Tests Secrets/ConfigMaps/YAML | Casos positivos, errores y reconexión pasan |
| R-008 | P1 | Logs/exec/port-forward | Smoke tests reproducibles |
| R-009 | P1 | Auditoría de dependencias | Riesgos priorizados, mitigaciones y tests |
| R-010 | P1 | CI y distribución | Build versionado e instrucciones de rollback |
| R-011 | P0 | Eliminar la escritura de la etiqueta `k8slens-edit-resource-version` en `save()` | El guardado no agrega etiquetas; test unitario |
| R-012 | P0 | Preservar `tls-server-name`/`proxy-url` en `dumpConfigYaml` y probar `exec` credentials | Test de serialización + conexión a laboratorio con `exec` |
| R-013 | P1 | Actualizar lens-k8s-proxy/kubectl/Helm y verificar checksums en `ensure-binaries` | Binarios arm64 con hash verificado |
| R-014 | P1 | Retirar u ocultar PSP (`policy/v1beta1`) y revisar los endpoints obsoletos | Sin 404 de PSP en clúster 1.25 o superior |
| R-015 | P1 | Limpieza de port-forward al desconectar o salir | Sin procesos huérfanos (U-5) |
| R-016 | P0 | UX de `409` en el panel de detalle Secret/ConfigMap (recargar y diff) | Test con edición concurrente |

### Decisiones pendientes (ver `REA_FINDINGS.md` §10)

- D-1 `appId`/nombre del producto. · D-2 estrategia de guardado (recomendado: PUT con `resourceVersion` + re-GET). · D-3 retirar la etiqueta propia. · D-4 versiones Kubernetes objetivo. · D-5 autorización para observar Lens oficial en runtime con un clúster de laboratorio.

## 5. Instrucciones para cualquier IA/agente que continúe el trabajo

1. **Leer este archivo primero**, luego `README.md` y `open-lens/package.json`. Revisar rama y `git status` antes de editar.
2. Dar preferencia a cambios pequeños, pruebas y evidencias; separar lo observado, lo inferido y lo aún desconocido.
3. No dar por completo el análisis de Lens oficial: REA reportó **cobertura parcial**. Un nombre o función no hallado en el grafo **no** demuestra ausencia en el producto.
4. REA y su JSON están en **el Mac local**, no necesariamente en otro entorno de agente. Si el archivo `/tmp/openlens-rea-official.json` no existe, pedir acceso a evidencia preservada antes de afirmar comparaciones.
5. No extraer ni redistribuir fuentes propietarias de Lens; documentar comportamientos e implementar soluciones originales sobre el código abierto bajo su licencia.
6. Nunca usar credenciales productivas, editar clústeres reales ni revelar valores de Secrets sin aprobación explícita.
7. Registrar decisiones técnicas en `docs/revival/` y actualizar este roadmap al completar tickets (fecha, cambios y pruebas). No marcar casillas sin resultados verificables.
8. No ejecutar `npm audit fix --force` ni upgrades masivos sin revisión de compatibilidad y tests; no confundir instalación correcta de dependencias con build correcto.
9. No modificar `develop` ni subir cambios a remoto salvo indicación del usuario; trabajar en la rama actual.
10. **Próxima acción recomendada:** R-001 está completo en su parte estática. Seguir con R-003 (primer build arm64, plan en `REA_FINDINGS.md` §9) y, en paralelo y con autorización, las pruebas runtime U-1/U-3 en un clúster de laboratorio. La implementación del editor (R-005/R-006/R-011) sigue tras probar conectividad.

## 6. Bitácora de hitos

- **2026-10-12:** inspección estática del fork; se identificaron versiones, rutas del editor y ausencia de verificación GET posterior al PATCH.
- **2026-10-12:** rama `feat/openlens-devops-revival`, Node 20.20.2 y dependencias instaladas; sin build validado.
- **2026-10-12:** primera pasada REA de Lens oficial completada; evidencia parcial, 16 discrepancias de integridad, 26 fallos de análisis.
- **2026-10-12:** segunda **inspección** de evidencia: no se lograron identificar de forma fiable módulos funcionales clave; falta trazado dirigido y observación de comportamiento.
- **2026-10-12:** roadmap inicial documentado. Fases de desarrollo pendientes.
- **2026-10-12:** Hito 1, segunda pasada dirigida: módulos oficiales localizados vía *source maps*; el editor oficial conserva el mismo diseño de `save()` (estático); se crearon la matriz y el plan de build en `docs/revival/REA_FINDINGS.md`. Sin cambios de código ni contacto con clústeres.

---
*Este documento es un plan de trabajo, no una declaración de compatibilidad o estabilidad del producto.*
