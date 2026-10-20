# REA Findings — Hito 1 (investigación comparativa)

> **Fecha:** 2026-10-12 · **Rama:** `feat/openlens-devops-revival` · **Base:** OpenLens `6.5.3-dev`
> **Objetivo:** comparar Lens oficial con nuestro fork para decidir qué conservar, modernizar o reemplazar, con foco en la edición confiable de Secrets, ConfigMaps y YAML.
> **Alcance:** solo análisis estático y documentación. No se compiló, no se instalaron dependencias, no se contactó ningún clúster y no se copió código propietario.

## 1. Niveles de confianza

| Nivel | Significado |
| --- | --- |
| **V — Verificado** | Observado directamente en el código de OpenLens o en metadatos/bytes del artefacto oficial. |
| **E — Estático fuerte** | Inferido de marcadores estáticos en módulos oficiales identificados por nombre (conteos de identificadores). No prueba ejecución. |
| **H — Hipótesis** | Plausible, pero requiere prueba en ejecución o en un clúster de laboratorio. |
| **? — Desconocido** | Sin evidencia suficiente. La ausencia de evidencia **no** implica ausencia de funcionalidad. |

## 2. Método de la segunda pasada

1. **Reutilización de la primera pasada REA** (`/tmp/openlens-rea-official.json`, ~605 MB): se mantuvo como referencia; su grafo semántico estaba truncado y no localizaba los módulos funcionales, así que no se repitió el análisis completo.
2. **Descubrimiento dirigido:** el `app.asar` oficial incluye *source maps* (`static/build/lens.js.map`, `main.js.map`, `sub-window.js.map`). Se extrajo **únicamente la lista `sources`** (rutas de módulos: 20.806 renderer, 9.336 main, 4.307 sub-window) para localizar los módulos por nombre.
3. **Sonda de comportamiento por marcadores:** sobre unos 25 módulos oficiales identificados, un script local emitió solo **conteos/booleanos** de identificadores (por ejemplo `resourceVersion`, `createPatch`, tipos de patch, `409`, `requestKubeResource`). No se volcó, guardó ni versionó contenido fuente.
4. **Metadatos del bundle:** `package.json` embebido, binarios empaquetados, versión de Electron y bundle ID.
5. **Inspección directa de OpenLens** con lectura de código y `grep`.

Los scripts y resultados intermedios quedaron en el *scratchpad* de la sesión, fuera del repositorio. Pueden regenerarse con el método anterior.

**Hash del artefacto analizado:** `app.asar` SHA-256 `4757c737af64757eb28d97d9b86c71afbfbad5e5aa320205b4a08a10a70adb36` (Lens `2026.10.51501-latest`).

### Limitaciones

- No se ejecutó Lens oficial ni se observaron peticiones HTTP reales: todo lo marcado como **E** sigue siendo estático.
- Los conteos por regex son aproximados; por ejemplo, el marcador `GET` incluye cualquier `.get(`. Cuando el resultado era determinante, se analizó solo el segmento del método `save()`.
- Las 16 discrepancias de integridad ASAR de la primera pasada siguen registradas como **no confiables**. No se reinterpretaron.
- No se usaron las herramientas de grafo de REA (`trace_application_feature`, etc.) en esta pasada. Requieren reanalizar el ASAR completo en la sesión, y la vía por *source maps* resultó más precisa y barata. Si hace falta trazar llamadas en runtime, el siguiente paso es `capture_electron_scenario` contra un clúster de laboratorio.

## 3. Lens oficial — hechos confirmados

| Hecho | Valor | Conf. |
| --- | --- | --- |
| Versión | `2026.10.51501-latest`, nombre de paquete `lens-desktop` | V |
| Electron / Chromium | `44.4.2` / `152.0.7977.130` | V |
| Node (engines) | `^24.0.0`, npm `^11.6.0` | V |
| kubectl / Helm / lens-k8s-proxy empaquetados | `1.27.16` / `3.20.2` / `0.4.0` (binarios Mach-O arm64) | V |
| `node-pty` | `1.1.0-beta34` | V |
| Bundle ID | `com.electron.kontena-lens` | V |
| Monorepo | Paquetes `business-features/*`, `technical-features/*`, `unknown-features/_legacy/core/split/*`: el *core* de OpenLens fue troceado en features | V |
| Código heredado | Rutas `_legacy/core/split/main/src/routes/port-forward/...` y `shell-session/...` con los mismos nombres de módulo que OpenLens | V |
| CSP | Agrega dominios de terceros (refiner.io, zendesk) | V |

## 4. Hallazgo central: el editor YAML

### 4.1 OpenLens (V)

Archivo: `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx` (241 líneas).

Flujo de `save()`:

1. Parsea el borrador con `js-yaml` y lo compara con `firstDraft` mediante `createPatch` (`rfc6902`), lo que produce un **JSON Patch**.
2. **Inyecta en el recurso la etiqueta `k8slens-edit-resource-version`** en cada guardado. Es un efecto lateral persistente sobre el objeto del usuario.
3. Envía `PATCH` con `application/json-patch+json` a la ruta derivada de `metadata.selfLink`. Ese `selfLink` se genera en el cliente en `request-kube-resource.injectable.ts`, así que **no depende** del campo eliminado en Kubernetes 1.20 o posterior.
4. `request-patch-kube-resource.injectable.ts` **descarta la respuesta** del servidor y solo devuelve `{ name, kind }`.
5. Muestra "updated" y asigna `firstDraft = yaml.dump(currentVersion)`, es decir, **el texto local, no el estado del servidor**.
6. **No hace GET posterior**, no usa `resourceVersion` como precondición (el JSON Patch omite campos sin cambios, así que `resourceVersion` nunca viaja) y no detecta `409`.

Consecuencias técnicas (V por lectura de código; impacto real **H** hasta probarlo):

- **Pérdida silenciosa en ediciones concurrentes:** sin la operación `test` sobre `resourceVersion`, el PATCH se aplica sobre la versión remota actual. Si cambió un array, las rutas por índice de JSON Patch pueden modificar el elemento equivocado.
- **El editor muestra lo enviado, no lo persistido:** los defaults del API Server, los webhooks mutadores, la conversión de `stringData` a `data` en Secrets y el `resourceVersion` nuevo no se reflejan. El siguiente guardado calcula el diff contra una base falsa.
- Este comportamiento coincide con el síntoma descrito en el roadmap ("aparenta guardar, solo un reinicio muestra el estado real").

### 4.2 Lens oficial (E)

Módulo: `business-features/kube-resource-editing/edit-resource/src/edit-resource-model/edit-resource-model.injectable.tsx` (**241 líneas**, el mismo tamaño que el nuestro).

| Marcador en el módulo oficial | Resultado |
| --- | --- |
| `createPatch` (rfc6902) | presente |
| etiqueta `k8slens-edit-resource-version` | presente |
| `selfLink` | presente (10) |
| `resourceVersion` | **0** en todo el módulo |
| dentro de `save()`: `requestKubeResource` / `load(` | **0 / 0** (no hay re-GET) |
| dentro de `save()`: `requestPatchKubeResource` | presente |
| `409` / `Conflict` | 0 |

**Conclusión (E):** el modelo de guardado del editor oficial es, con alta probabilidad, el mismo diseño que tiene OpenLens 6.5.3. Esto **refuerza la hipótesis** de que el problema reportado en Lens oficial comparte la causa raíz con nuestro código: PATCH sin precondición, sin re-lectura y sin reflejar la respuesta. Para confirmarlo hace falta observarlo en ejecución (sección 8).

Lo que Lens oficial **sí agregó** alrededor del editor (V por nombres de módulo):

- `edit-resource-tools`: **modo diff** (`monaco-diff-editor`) y **revert**, detrás de un *gate* premium/trial (`premium-feature/editor2-*`, `*-upsell.tsx`) y con telemetría.
- Persistencia de pestañas con migraciones (`include-cluster-id`, `into-cluster-scoped-docks`), lo que implica pestañas de edición asociadas al clúster.
- Un helper genérico `_kube/kube-resource/src/patch-kube-resource/patch-kube-resource.injectable.ts` que contiene `resourceVersion` (6) y una operación JSON Patch `"test"` (E), es decir, un **patch con precondición optimista**. El editor YAML **no** lo usa (E).

### 4.3 Secrets y ConfigMaps desde el panel de detalle

| Aspecto | OpenLens (V) | Lens oficial (E) |
| --- | --- | --- |
| Secret | `secretStore.update` → **PUT** del objeto completo cacheado (incluye `resourceVersion`, así que el servidor puede devolver `409`) → `postUpdate` con la respuesta | Usa `patchV2`/`patchResult` (`config-secrets/secret-details-data.injectable.tsx`), un patch, no PUT. Precondición: **?** |
| ConfigMap | `configMapStore.update` → **PUT** completo | Usa `patch` (`config-maps/config-map-data-details.injectable.tsx`) |
| Valores Secret | `base64` y toggle de revelado por clave | Toggle de revelado; vista de certificados (`secret-certificate-info`, `expiration-warning`) |
| Mensaje ante `409` | Genérico (`showCheckedErrorNotification`); no ofrece recargar ni diff | ? |

Nota: en OpenLens, el panel de detalle resulta **más seguro** que el editor YAML, porque el PUT con `resourceVersion` obtiene control de concurrencia del servidor.

## 5. Matriz comparativa

Prioridad: P0 bloquea el objetivo · P1 uso diario · P2 mejora.

| # | Funcionalidad | Implementación OpenLens 6.5.3 | Lens oficial (confirmado) | Diferencias | Compat. Kubernetes | Problemas técnicos | Recomendación | Prio. | Evidencia / Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Guardado del editor YAML | JSON Patch (`rfc6902`) + etiqueta + sin re-GET (§4.1) | Mismo diseño (§4.2) | Oficial agrega diff/revert premium | Funciona en 1.20+ (selfLink sintético) | Sin `resourceVersion`/409; base falsa tras guardar; etiqueta intrusiva | **Reemplazar** el flujo `save()` | P0 | `edit-resource-model.injectable.tsx` · V / E |
| 2 | Lectura del recurso en el editor | GET por selfLink sintético; segundo GET si existe la etiqueta | Mismo módulo | — | OK | Depende de la etiqueta propia para la versión de API | Modernizar (usar `apiVersion` del objeto y discovery) | P0 | `request-kube-resource.injectable.ts` · V |
| 3 | Estado del editor (sucio/guardado/conflicto) | Solo `draft`/`firstDraft` | Diff y revert (premium) | — | n/a | No distingue "aceptado" de "verificado" | Reemplazar con una máquina de estados explícita | P0 | `store.ts`, `view.tsx` · V |
| 4 | Edición inline de Secret | PUT completo con `resourceVersion` | `patchV2` | Estrategia distinta | OK | 409 sin UX; sin re-lectura visible | Conservar el PUT + agregar UX de 409 y refresco | P0 | `secret-details.tsx` · V / E |
| 5 | Edición inline de ConfigMap | PUT completo | `patch` | Estrategia distinta | OK | Ídem | Conservar + UX 409 | P0 | `config-map-details.tsx` · V / E |
| 6 | Capa KubeApi (GET/PUT/PATCH/watch) | `kube-api.ts`: PUT, 3 tipos de patch, watch con manejo de 410 y reintento | Mismos 3 tipos de patch; sin SSA (`apply-patch`) ni `fieldManager` | Oficial reorganizado en paquetes | OK | Sin Server-Side Apply ni `dryRun` | **Conservar**; opcional agregar `dryRun=All` para validar | P1 | `common/k8s-api/kube-api.ts` · V / E |
| 7 | Versiones de API de recursos | Mayoría en v1/GA; HPA `autoscaling/v2`; PDB `policy` v1 con fallback a v1beta1; Ingress v1 con fallback | ? | — | **PSP `policy/v1beta1` eliminado en 1.25** (404 esperado); `cluster.k8s.io/v1alpha1` obsoleto | Ruido o errores en clústeres actuales | Modernizar: ocultar/retirar PSP; revisar discovery | P1 | `endpoints/*.api.ts` · V |
| 8 | kubeconfig y autenticación | `@kubernetes/client-node ^0.19`; reserializa kubeconfig con `exec` y `auth-provider` | client-node ? (no aparece en deps declaradas) | — | `auth-provider` está retirado en clientes modernos; `exec` es el camino actual | `dumpConfigYaml` **omite** `tls-server-name`, `proxy-url` y `disable-compression` del clúster | Modernizar (preservar campos; probar EKS/GKE/AKS/OIDC exec) | P0 | `common/kube-helpers.ts` · V |
| 9 | Proxy local (lens-k8s-proxy) | Spawn de `lens-k8s-proxy` 0.3.0 + certificado propio sha256 | `0.4.0` + **verificación de integridad del binario** | Oficial verifica el binario | ? | Binario 0.3.0 antiguo; sin verificación de integridad | Modernizar (actualizar proxy y agregar checksum) | P0 | `main/kube-auth-proxy/*` · V; oficial `internal-proxy/main/*` · V |
| 10 | Binarios kubectl / Helm | 1.25.16 / 3.11.0 | 1.27.16 / 3.20.2 | Ambos antiguos para clústeres 1.30+ | kubectl soporta ±1 minor (skew) | Shell y apply con un kubectl desfasado | Modernizar; parametrizar versión por clúster | P1 | `open-lens/package.json` · V |
| 11 | Port-forward | `kubectl port-forward` vía `port-forward.ts`; sin módulos de stop-on-disconnect/quit; 0 marcadores de retry | `stop-port-forwards-on-disconnect`, `-on-quit`, marcadores de retry (6) | Oficial limpia y reintenta | OK | Posibles procesos huérfanos (H) | Modernizar | P1 | `main/routes/port-forward/*` · V / E |
| 12 | Logs | `features/pod-logs`, `dock/logs` | `_kube/pod/request-pod-logs` | Reubicado | OK | Reconexión no evaluada | Conservar y probar | P1 | ? |
| 13 | Terminal / exec | `main/shell-session` + `node-pty 0.10.1` | Mismo linaje `_legacy/.../shell-session` + `terminal-in-general`; `node-pty 1.1.0-beta34` | Oficial agrega gestor de sesiones | OK | `node-pty 0.10.1` no compila con Node/Electron modernos (H, típico) | Modernizar `node-pty` | P0 para el build | `open-lens/package.json` · V |
| 14 | Electron / IPC | Electron 22, IPC por canales inyectables | Electron 44 | 22 versiones mayores de diferencia | n/a | Electron 22 sin soporte de seguridad; CSP con `unsafe-eval` | Actualizar por escalones después del primer build | P1 | V |
| 15 | Identidad / empaquetado | `productName: OpenLens`, sin `appId` (default de electron-builder), `--publish onTag`, `afterSign: notarize.js` | `com.electron.kontena-lens` | No colisiona con Lens oficial, pero sí con otros OpenLens | n/a | Publicación y notarización automáticas pueden fallar o filtrar | Modernizar: `appId`, nombre y `userData` propios; `--publish never` | P0 | `open-lens/package.json` · V |
| 16 | Métricas | `metrics.k8s.io/v1beta1` + Prometheus | ? | — | OK | No prioritario | Conservar sin cambios | P2 | V |

## 6. Problemas de compatibilidad Kubernetes identificados

1. **PSP (`policy/v1beta1/podsecuritypolicies`)**: eliminado en 1.25. El endpoint devolverá 404 en clústeres actuales (V en código; efecto en la UI: H).
2. **PDB**: preferencia v1 con fallback a v1beta1 (correcto; v1beta1 eliminado en 1.25).
3. **kubectl 1.25.16** empaquetado: fuera de la política de skew para clústeres 1.27 o posteriores en shell y apply (V en versión; impacto real: H).
4. **kubeconfig reserializado sin `tls-server-name`/`proxy-url`**: puede romper clústeres detrás de proxy o con SNI distinto (V en código; impacto: H).
5. **`auth-provider`** (gcp/azure legacy) ya no funciona en clientes modernos; los clústeres GKE/AKS actuales usan `exec` (`gke-gcloud-auth-plugin`, `kubelogin`). Hay que probar que el `exec` llega al proxy con el `PATH` correcto (H).
6. **`selfLink`**: no es un problema, porque OpenLens lo genera en el cliente (V).
7. **`client-node ^0.19`**: muy desactualizado; actualizarlo implica cambios de API (los clientes 1.x pasaron a otra generación). No migrar sin tests (H).

## 7. Riesgos y dependencias críticas

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Pérdida silenciosa de cambios en el editor YAML | Alto (datos de producción) | Reescribir `save()` (R-005/R-006) antes de usar el build contra clústeres reales |
| Etiqueta `k8slens-edit-resource-version` escrita en recursos | Medio (ruido en GitOps; drift en Argo/Flux) | Eliminar la escritura de la etiqueta y leerla solo por compatibilidad |
| `node-pty 0.10.1` + Electron 22 en arm64 | Bloquea el build | Primer intento con las versiones actuales; si falla, subir `node-pty` de forma aislada |
| Electron 22 sin soporte | Seguridad | Actualizar después del primer build reproducible |
| 159 vulnerabilidades npm | Desconocido | Triage por ruta de ejecución (R-009) |
| lens-k8s-proxy 0.3.0 sin verificación | Cadena de suministro | Checksum en `ensure-binaries` |
| Publicación y notarización automáticas | Builds fallidos o publicación accidental | `--publish never`; sin `afterSign` en builds locales |

## 8. Incógnitas que requieren pruebas

| ID | Pregunta | Prueba propuesta (clúster de **laboratorio**, p. ej. kind/k3d) |
| --- | --- | --- |
| U-1 | ¿El editor oficial pierde ediciones concurrentes? | Abrir un ConfigMap en Lens, modificarlo por `kubectl` y guardar en Lens; comparar resultado y `resourceVersion` |
| U-2 | ¿Lens oficial muestra el estado mutado por webhook o defaults? | Webhook mutador de prueba; guardar y comparar editor vs `kubectl get -o yaml` |
| U-3 | ¿`patchV2` del Secret oficial usa precondición? | `capture_electron_scenario` (REA) o mitmproxy sobre el proxy local, con datos ficticios |
| U-4 | ¿El `exec` credential funciona en nuestro build (EKS/GKE/OIDC)? | kubeconfig de laboratorio con plugin `exec` de prueba |
| U-5 | ¿Quedan procesos de port-forward huérfanos en OpenLens? | Abrir un PF, desconectar el clúster o salir, y revisar `ps` |
| U-6 | ¿Compila `node-pty 0.10.1` en arm64 con Node 20/Electron 22? | Primer build (Fase 1) |
| U-7 | ¿Qué versiones Kubernetes usa realmente el usuario? | Inventario con `kubectl version` en cada contexto (solo lectura; requiere autorización) |
| U-8 | ¿Cómo se comporta `stringData` en el editor? | Agregar `stringData`, guardar y recargar |

## 9. Plan técnico: primer build funcional en macOS ARM64

Sin cambios funcionales; solo build e identidad.

1. **Reproducibilidad:** registrar `node -v` (20.20.2), `npm -v`, `xcode-select -p`, hash de `package-lock.json`.
2. **Build base sin tocar código:** `npm run build` en el monorepo (nx/lerna) → registrar errores. No ejecutar `npm audit fix`.
3. **Binarios:** `npm run download:binaries` en `open-lens` (kubectl 1.25.16, helm 3.11.0, proxy 0.3.0 arm64). Verificar arquitectura con `file`.
4. **Nativos:** si `node-pty` falla, ajustarlo en un commit aislado con la versión mínima compatible con Electron 22.
5. **Identidad (cambio de configuración, no funcional):** `appId` (p. ej. `dev.drko.openlens-devops`), `productName: "OpenLens DevOps"`, que separa `userData` de `~/Library/Application Support/OpenLens`; ícono propio.
6. **Empaquetado local:** `electron-builder --mac dir --arm64 --publish never`, sin firma (`CSC_IDENTITY_AUTO_DISCOVERY=false`) y sin `afterSign`.
7. **Smoke test:** abrir la app, verificar versión/commit/arquitectura y que no altera los perfiles de Lens ni de OpenLens existentes; conectar **solo** a un kind local.
8. **Después del build:** R-005/R-006 (editor), luego modernizar proxy/kubectl y Electron por escalones.

## 10. Decisiones pendientes (usuario)

- D-1: `appId` y nombre definitivo del producto.
- D-2: estrategia de guardado del editor: (a) JSON Patch con `test` de `resourceVersion` + re-GET, (b) PUT completo con `resourceVersion` + re-GET, (c) Server-Side Apply. **Recomendación: (b)**. Es la semántica de `kubectl edit`/`replace`, con 409 nativo y la implementación más simple; (c) queda para más adelante.
- D-3: ¿eliminar la etiqueta `k8slens-edit-resource-version` (recomendado) o mantenerla por compatibilidad?
- D-4: versiones Kubernetes objetivo (depende de U-7).
- D-5: ¿se autoriza `capture_electron_scenario` sobre Lens oficial con un clúster de laboratorio?
