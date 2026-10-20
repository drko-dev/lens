# OpenLens DevOps Revival — R3-02 Validation Report
**EndpointSlice y Gateway API Opcional**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
  - **SHA-256 app.asar:** `9956c75b2aec3d2e25d7b5eb1604dfef4c9493172c0786cf6ae4b751d41738c6`
- **Estado de salida:** APROBADO (8 tests unitarios de EndpointSlice y Gateway API al 100% PASS + 6 tests de regresión R3-01 PASS + Typecheck 0 errores + Monorepo build 40 paquetes exitosa + Verificación Playwright en paquete macOS ARM64 real con 4 capturas de pantalla)

---

## 1. Resumen de Implementación

En el marco del Hito **R3-02**, se implementó el soporte completo para `EndpointSlice` (`discovery.k8s.io`) y la integración opcional por descubrimiento de `Gateway API` (`gateway.networking.k8s.io`):

### A. EndpointSlice (`discovery.k8s.io`)
- **Modelo y API (`endpoint-slice.api.ts`):**
  - Tipos completos para `EndpointSlice`, `EndpointSliceEndpoint`, `EndpointSlicePort`, condiciones de endpoints y direcciones IP/FQDN.
  - Negociación automática de versión priorizando `v1` con fallback transparente a `v1beta1`.
  - Métodos auxiliares: `getServiceName()`, `getAddressType()`, `getReadyEndpointsCount()`, `getEndpointsSummary()`, `getPortsSummary()`.
- **Almacén (`EndpointSliceStore`):**
  - Implementación de `getByService(serviceName, namespace)` para vincular reactivamente servicios con sus slices correspondientes.
- **Vista de Lista (`EndpointSlices`):**
  - Tabla configurable con filtros rápidos de R2, exportación segura CSV, búsqueda y ordenamiento por servicio, tipo de dirección, puertos, endpoints y antigüedad.
- **Integración en Detalle de Servicios (`ServiceDetails`):**
  - Se agregó la sección "Endpoint Slices" (`data-testid="service-endpoint-slices"`) que muestra los slices asociados al servicio actual, estado de preparación de endpoints y puertos.
- **Ruta y Navegación Reactiva:**
  - Ítem en el menú lateral bajo *Network* (orden 25), visible únicamente si el clúster anuncia `discovery.k8s.io/endpointslices`.

### B. Gateway API Opcional (`gateway.networking.k8s.io`)
- **Modelos y Negociación de APIs (`gateway.api.ts`):**
  - `GatewayClass` (Cluster-scoped): controlador, descripción y condición `Accepted`.
  - `Gateway` (Namespace-scoped): listeners, direcciones asignadas, clase y condiciones `Programmed` / `Accepted`.
  - `HTTPRoute` (Namespace-scoped): hostnames, referencias a gateways padres (`parentRefs`), reglas de ruteo (`rules`, `matches`) y servicios backend (`backendRefs`).
  - Negociación de versiones con prioridad `v1` y fallback a `v1beta1` y `v1alpha2`.
- **Almacenes (`GatewayStore` y `HTTPRouteStore`):**
  - Extienden `KubeObjectStore` para aislamiento estricto por clúster y namespace, con captura de errores RBAC.
- **Vista de Gateways (`Gateways`):**
  - Componente con pestañas integradas:
    - **Pestaña Gateways:** nombre, namespace, clase, listeners, direcciones, estado (`Programmed`, `Accepted`, `Pending`) con badges visuales distintivos y antigüedad.
    - **Pestaña HTTP Routes:** nombre, namespace, hostnames asociados, gateways padres, resumen de reglas/paths y servicios destino.
- **Opcionalidad por Discovery:**
  - Si el clúster no tiene instalados los CRDs de Gateway API, el ítem se oculta automáticamente del menú lateral (`orderNumber: 35`), no se crean observadores en segundo plano y el sistema degrada limpiamente sin arrojar errores a la interfaz de usuario. Nunca se instalan CRDs automáticamente.

---

## 2. Registro de Pruebas Unitarias

Se ejecutó la suite de pruebas unitarias cubriendo modelos, negociación de versiones, filtrado y resiliencia ante ausencia de APIs:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **R3-02 EndpointSlice & Gateway API** | `r3-02-endpointslices-gateway.test.ts` | 8 | PASS |
| **R3-01 API Compatibility & RBAC (Regresión)** | `r3-01-api-compatibility.test.ts` | 6 | PASS |
| **Total Evaluado** | — | **14** | **100% PASS** |

Detalle de casos en `r3-02-endpointslices-gateway.test.ts`:
1. `EndpointSlice Model & Store › correctly parses addressType, endpoints, ports, and readiness`: PASS.
2. `EndpointSlice Model & Store › EndpointSliceApi prioritizes discovery.k8s.io/v1 over v1beta1`: PASS.
3. `EndpointSlice Model & Store › EndpointSliceStore filters slices by service name and namespace`: PASS.
4. `Gateway API Models & Negotiation › Gateway model parses listeners, addresses, and Programmed condition`: PASS.
5. `Gateway API Models & Negotiation › GatewayApi prioritizes v1 and supports fallback to v1beta1`: PASS.
6. `Gateway API Models & Negotiation › HTTPRoute model parses hostnames, parents, routes summary, and backend services`: PASS.
7. `Gateway API Models & Negotiation › GatewayClass model parses controllerName and Accepted condition`: PASS.
8. `Absence and Safe Discovery › GatewayApi throws gracefully when discovery fails and does not alter default apiBase`: PASS.

---

## 3. Calidad de Código y Compilación

1. **Typecheck TypeScript:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Salida: 0 errores, código de salida 0.
2. **Compilación de Paquetes Monorepo (Lerna / Nx):**
   - Comando: `npm run build`
   - Salida: 40 proyectos compilados exitosamente sin fallos.
3. **Empaquetado macOS ARM64 Aislado:**
   - Comando: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never -c.directories.output=dist-stage -c.mac.identity=null`
   - Salida: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - SHA-256 de `app.asar`: `9956c75b2aec3d2e25d7b5eb1604dfef4c9493172c0786cf6ae4b751d41738c6`.
   - Proceso productivo protegido (PID no alterado).

---

## 4. Verificación Automatizada de GUI en Paquete Real (Playwright)

- **Script:** `docs/revival/scripts/verify-r3-02-gateway.cjs`
- **Ambiente:** macOS ARM64 aislado (`HOME` y `CICD` en `/tmp/openlens-r3-02-gw-*`, `KUBECONFIG=/dev/null`).
- **Pruebas en Pantalla Real Validadas:**
  1. **Vista de EndpointSlices:** Renderizado de tabla, columnas de servicio, tipo de dirección IPv4, endpoints listos y puertos.
     - Captura generada: [`docs/revival/screenshots/r3-02-endpoint-slices-view.png`](./screenshots/r3-02-endpoint-slices-view.png).
  2. **Vista de Gateways (Pestaña Gateways):** Renderizado de gateways con clase `cilium-gateway`, listener `443/HTTPS` y badge de estado `Programmed`.
     - Captura generada: [`docs/revival/screenshots/r3-02-gateways-view.png`](./screenshots/r3-02-gateways-view.png).
  3. **Pestaña HTTP Routes:** Alternancia reactiva de pestañas mediante `#tab-http-routes`, renderizado de ruta `shop-api-route` con hostnames, gateway padre y servicio backend.
     - Captura generada: [`docs/revival/screenshots/r3-02-http-routes-view.png`](./screenshots/r3-02-http-routes-view.png).
  4. **Integración en ServiceDetails:** Despliegue de la tarjeta de Endpoint Slices en el panel de detalle de un servicio Kubernetes con conteo de endpoints listos y puertos.
     - Captura generada: [`docs/revival/screenshots/r3-02-service-endpoint-slices.png`](./screenshots/r3-02-service-endpoint-slices.png).

---

## 5. Criterios de Aceptación Cumplidos

- [x] Modelo, API, store y tabla para `EndpointSlice` (`discovery.k8s.io`).
- [x] Integración de EndpointSlices en `ServiceDetails`.
- [x] Modelos y APIs para `GatewayClass`, `Gateway` y `HTTPRoute` con negociación de versiones `v1`/`v1beta1`/`v1alpha2`.
- [x] Vista con pestañas para Gateways y HTTPRoutes con badges de estado y relaciones de servicio.
- [x] Opcionalidad estricta por discovery de APIs; clústeres sin Gateway API no se ven afectados y degradan limpiamente.
- [x] Sin instalación automática de operadores ni mutaciones de clúster.
- [x] 14 tests unitarios pasando al 100%, empaquetado macOS ARM64 y verificación funcional Playwright aprobada con 4 capturas registradas.
