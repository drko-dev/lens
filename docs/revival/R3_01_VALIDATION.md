# OpenLens DevOps Revival — R3-01 Validation Report
**Compatibilidad Kubernetes, API discovery y RBAC**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
  - **SHA-256 app.asar:** `d50c2c081d122a8a7d6ad1098cb71aaea05683c85c30eb8deff1d1ba4a0b3eea`
- **Estado de salida:** APROBADO (6 tests de compatibilidad de API y RBAC + 9 tests de store y layouts + Typecheck 0 errores + Compilación de 40 paquetes exitosa + Verificación Playwright en paquete macOS ARM64 aislado con 3 capturas de pantalla)

---

## 1. Resumen de Implementación

En el marco del Hito **R3-01**, se implementaron las mejoras de compatibilidad con versiones modernas de Kubernetes, negociación de versiones de APIs core, retiro seguro de APIs obsoletas (PSP) y tratamiento contextual de errores de RBAC (403 Forbidden) y ausencia de APIs (404 Not Found):

### A. Negociación Automática de Versiones de APIs Core
- **HorizontalPodAutoscaler (`HorizontalPodAutoscalerApi`):**
  - Configurado con `allowedUsableVersions: { autoscaling: ["v2", "v2beta2", "v2beta1", "v1"] }` y `checkPreferredVersion: true`.
  - En clústeres modernos (Kubernetes v1.23+), negocia y utiliza de forma nativa la versión GA `autoscaling/v2`.
  - En clústeres anteriores a v1.23, degrada limpiamente a `autoscaling/v2beta2` o `v1` sin arrojar errores ni fallar al listar HPA.
- **PodDisruptionBudget (`PodDisruptionBudgetApi`):**
  - Estandarizado en la clase base con `checkPreferredVersion: true` y `allowedUsableVersions: { policy: ["v1", "v1beta1"] }`.
  - Negocia `policy/v1` en clústeres Kubernetes >= v1.21 y degrada a `policy/v1beta1` en versiones previas.

### B. Retiro Seguro y Aviso de Obsolescencia de PodSecurityPolicy (PSP)
- **Ocultamiento Reactivo en Barra Lateral:**
  - El sidebar evalúa `shouldShowResourceInjectionToken` con `{ apiName: "podsecuritypolicies", group: "policy" }`.
  - Al conectarse a un clúster Kubernetes v1.25+ donde PSP fue removido del servidor, `cluster.resourcesToShow` no incluye el recurso y el ítem se oculta automáticamente del menú sin degradar la experiencia de usuario.
- **Aviso Informativo ante Navegación Directa (`PodSecurityPolicies`):**
  - Si un operador navega a la URL `/pod-security-policies` mediante un enlace directo o pestaña guardada, la tabla no muestra un genérico "Failed to load items".
  - Se despliega un aviso formal de obsolescencia (`data-testid="psp-deprecation-notice"`):
    > *"PodSecurityPolicy was deprecated in Kubernetes v1.21 and removed in v1.25+. Modern clusters enforce workload isolation via Pod Security Admission (PSA) and ValidatingAdmissionPolicies."*

### C. Tratamiento Contextual de Errores RBAC (403) y APIs Ausentes (404)
- **Trazabilidad de Errores en `KubeObjectStore`:**
  - Se incorporó la propiedad observable `@observable lastError` en `KubeObjectStore`.
  - Ante fallas en `loadAll` o `loadItems`, se captura el error exacto y su código HTTP (`statusCode` / `code`).
  - Al resolverse una carga exitosa subsecuente, `lastError` se limpia automáticamente.
- **Mensajería Inteligente en `KubeObjectListLayout`:**
  - Método `renderFailedToLoadMessage()` implementado para interpretar el estado del store:
    - **Error 403 Forbidden:** Muestra pancarta de advertencia contextual (`data-testid="kube-list-error-403"`) informando que la cuenta carece de permisos RBAC para listar el recurso en el namespace actual.
    - **Error 404 Not Found / API no soportada:** Muestra mensaje informativo (`data-testid="kube-list-error-404"`) indicando que el API no está registrada en el clúster o fue removida en esa versión de Kubernetes.
    - Respeta mensajes personalizados cuando un componente los define explícitamente (`failedToLoadMessage`).

---

## 2. Registro de Pruebas Unitarias

Se ejecutaron con éxito todas las pruebas unitarias de compatibilidad, negociación de versiones y RBAC:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **R3-01 API Compatibility & RBAC** | `r3-01-api-compatibility.test.ts` | 6 | PASS |
| **Kube Object Store & Watch Error Resilience** | `kube-object.store.test.ts` | 5 | PASS |
| **Kube Object List Layout Integration** | `kube-object-list-layout.test.tsx` | 4 | PASS |
| **Total R3-01 Suite** | — | **15** | **100% PASS** |

---

## 3. Calidad de Código y Compilación

1. **Typecheck TypeScript:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Salida: 0 errores, código de salida 0.
2. **Compilación de Paquetes Monorepo (Lerna / Nx):**
   - Comando: `npm run build`
   - Salida: 40 proyectos compilados exitosamente sin fallos.
3. **Empaquetado de Producción macOS ARM64:**
   - Comando: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never -c.directories.output=dist-stage -c.mac.identity=null`
   - Salida: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - SHA-256 de `app.asar`: `d50c2c081d122a8a7d6ad1098cb71aaea05683c85c30eb8deff1d1ba4a0b3eea`.
   - Protección de proceso: PID en ejecución protegido sin interferencias.

---

## 4. Verificación Automatizada de GUI en Paquete Real (Playwright)

- **Script:** `docs/revival/scripts/verify-r3-01-api-k8s.cjs`
- **Ambiente:** macOS ARM64 aislado (`HOME` y `CICD` en `/tmp/openlens-r3-01-k8s-*`, `KUBECONFIG=/dev/null`).
- **Pruebas en Pantalla Real Validadas:**
  1. **RBAC 403 Forbidden:** Montaje de tabla de recursos simulando falta de permisos RBAC del usuario. Se verificó la visibilidad y renderizado de `[data-testid="kube-list-error-403"]`.
     - Captura generada: [`docs/revival/screenshots/r3-01-error-403-rbac.png`](./screenshots/r3-01-error-403-rbac.png).
  2. **API 404 Not Found:** Montaje simulando una API ausente o no instalada en el clúster. Se verificó el renderizado de `[data-testid="kube-list-error-404"]`.
     - Captura generada: [`docs/revival/screenshots/r3-01-error-404-api-missing.png`](./screenshots/r3-01-error-404-api-missing.png).
  3. **Deprecación de PodSecurityPolicy en K8s >= 1.25:** Montaje del componente `PodSecurityPolicies` con API removida. Se verificó la presencia del aviso explicativo `[data-testid="psp-deprecation-notice"]`.
     - Captura generada: [`docs/revival/screenshots/r3-01-psp-deprecation-notice.png`](./screenshots/r3-01-psp-deprecation-notice.png).

---

## 5. Criterios de Aceptación Cumplidos

- [x] Negociación de HPA priorizando `autoscaling/v2` con fallback a versiones beta.
- [x] Negociación de PDB soportando `policy/v1` y `policy/v1beta1`.
- [x] Retiro seguro de PSP del sidebar en K8s >= 1.25 y mensaje explicativo ante acceso directo.
- [x] Trazabilidad de `lastError` en `KubeObjectStore`.
- [x] Mensajes contextuales claros para errores RBAC 403 Forbidden y 404 Not Found en tablas de recursos.
- [x] Pruebas unitarias al 100%, compilación limpia, binario empaquetado y verificación funcional con Playwright.
