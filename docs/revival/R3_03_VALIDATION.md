# OpenLens DevOps Revival — R3-03 Validation Report
**Validating Admission Policies (CEL) y Dynamic Resource Allocation (DRA)**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
  - **SHA-256 app.asar:** `4a2978801a6c0c046b46ecb2c6a19bcd015e23b42e0b73757fd9a0e64f153908`
- **Estado de salida:** APROBADO (8 tests unitarios de Admission Policies & DRA al 100% PASS + 22 tests en suite integral R3 PASS + Typecheck 0 errores + Monorepo build 40 paquetes exitosa + Verificación Playwright en paquete macOS ARM64 real con 4 capturas de pantalla)

---

## 1. Resumen de Implementación

En el marco del Hito **R3-03**, se implementó el soporte para las políticas de admisión modernas basadas en CEL (`admissionregistration.k8s.io`) y para la asignación dinámica de recursos de hardware especializado DRA (`resource.k8s.io`):

### A. Validating Admission Policies y CEL (`admissionregistration.k8s.io`)
- **Modelos y APIs (`validating-admission-policy.api.ts`):**
  - `ValidatingAdmissionPolicy`: soporte para `matchConstraints` (reglas de recursos, operaciones), `failurePolicy` (`Fail` / `Ignore`), expresiones de validación CEL (`validations`), advertencias de chequeo de tipos y parámetros tipados (`paramKind`).
  - `ValidatingAdmissionPolicyBinding`: vinculación de políticas con parámetros de configuración y acciones de admisión (`Deny`, `Warn`, `Audit`).
  - Negociación de versiones priorizando `v1` (Kubernetes 1.30+) con fallback a `v1beta1` y `v1alpha1`.
- **Almacenes y Vistas (`config-validating-admission-policies/`):**
  - Componente de dos pestañas: **Admission Policies** y **Policy Bindings**.
  - Visor interactivo de reglas CEL en línea (`cel-code-snippet`) con tooltip de expresiones completas y resumen de restricciones.
  - Cartel informativo de seguridad (`data-testid="cel-readonly-notice"`):
    > *"In-Tree CEL Policies: Validating Admission Policies are evaluated natively by the kube-apiserver without external webhooks. Read-only policy viewer."*
- **Ruta y Navegación Reactiva:**
  - Registrado bajo *Config* (orden 105), con visibilidad gobernada reactivamente por discovery (`admissionregistration.k8s.io/validatingadmissionpolicies`).

### B. Dynamic Resource Allocation (DRA) (`resource.k8s.io`)
- **Modelos y APIs (`resource-dra.api.ts`):**
  - `DeviceClass` (Cluster-scoped): selectores de hardware definidos mediante expresiones CEL (`cel.expression`).
  - `ResourceClaim` (Namespace-scoped): solicitudes de dispositivos, estado de asignación de pools/drivers y seguimiento de cargas que reservan el claim (`reservedFor`).
  - Negociación de versiones con soporte para `v1beta1` y fallback a `v1alpha3` y `v1alpha2`.
- **Almacenes y Vistas (`cluster-dra/`):**
  - Componente de dos pestañas: **Device Classes** y **Resource Claims**.
  - Indicadores de asignación de dispositivos (`Allocated` / `Pending Allocation`) y resumen de consumidores asociados (Pods/Jobs).
  - Cartel informativo de arquitectura (`data-testid="dra-readonly-notice"`):
    > *"Dynamic Resource Allocation (DRA): Manages non-standard devices (GPUs, FPGAs, DPUs) natively via the resource.k8s.io API. Read-only viewer."*
- **Ruta y Navegación Reactiva:**
  - Registrado bajo *Storage* (orden 40), visible únicamente si el clúster anuncia `resource.k8s.io/deviceclasses`.

### C. Salvaguardas de Seguridad y Read-Only
- Ambas características operan estrictamente en modo **solo lectura**. No se permite la mutación, creación o eliminación de políticas ni de claims desde estas pantallas en R3, garantizando la estabilidad operativa del clúster.

---

## 2. Registro de Pruebas Unitarias

Se ejecutó la suite de pruebas unitarias cubriendo modelos, parsing CEL, negociación de versiones y resiliencia ante clústeres donde estas APIs no están habilitadas:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **R3-03 Admission Policies & DRA** | `r3-03-admission-policies-dra.test.ts` | 8 | PASS |
| **R3-02 EndpointSlice & Gateway API (Regresión)** | `r3-02-endpointslices-gateway.test.ts` | 8 | PASS |
| **R3-01 API Compatibility & RBAC (Regresión)** | `r3-01-api-compatibility.test.ts` | 6 | PASS |
| **Total Evaluado** | — | **22** | **100% PASS** |

Detalle de casos en `r3-03-admission-policies-dra.test.ts`:
1. `ValidatingAdmissionPolicy & CEL Models › parses CEL validation expressions, match constraints and failure policy`: PASS.
2. `ValidatingAdmissionPolicy & CEL Models › ValidatingAdmissionPolicyApi negotiates v1 and falls back to v1beta1`: PASS.
3. `ValidatingAdmissionPolicy & CEL Models › ValidatingAdmissionPolicyBinding parses policyName, validationActions, and paramRef`: PASS.
4. `Dynamic Resource Allocation (DRA) Models › DeviceClass parses CEL selectors`: PASS.
5. `Dynamic Resource Allocation (DRA) Models › ResourceClaim parses allocation and reservedFor references`: PASS.
6. `Dynamic Resource Allocation (DRA) Models › DeviceClassApi prioritizes v1beta1 and falls back to v1alpha3`: PASS.
7. `Absence Resilience › ValidatingAdmissionPolicyApi handles cluster without 1.26+ CEL admission gracefully`: PASS.
8. `Absence Resilience › DeviceClassApi handles cluster without DRA feature gate gracefully`: PASS.

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
   - SHA-256 de `app.asar`: `4a2978801a6c0c046b46ecb2c6a19bcd015e23b42e0b73757fd9a0e64f153908`.
   - Proceso productivo protegido (PID no alterado).

---

## 4. Verificación Automatizada de GUI en Paquete Real (Playwright)

- **Script:** `docs/revival/scripts/verify-r3-03-admission-dra.cjs`
- **Ambiente:** macOS ARM64 aislado (`HOME` y `CICD` en `/tmp/openlens-r3-03-adm-*`, `KUBECONFIG=/dev/null`).
- **Pruebas en Pantalla Real Validadas:**
  1. **Vista de Validating Admission Policies:** Renderizado de la tabla con reglas CEL (`check-deployment-replicas`), badge de failure policy `Fail` y banner informativo `[data-testid="cel-readonly-notice"]`.
     - Captura generada: [`docs/revival/screenshots/r3-03-validating-admission-policies-view.png`](./screenshots/r3-03-validating-admission-policies-view.png).
  2. **Pestaña Policy Bindings:** Alternancia de pestaña mediante `#tab-admission-policy-bindings`, renderizado de bindings (`check-deployment-replicas-binding`) y badges de acción `Deny` y `Warn`.
     - Captura generada: [`docs/revival/screenshots/r3-03-admission-policy-bindings-view.png`](./screenshots/r3-03-admission-policy-bindings-view.png).
  3. **Vista de Device Classes (DRA):** Renderizado de clases de dispositivos hardware (`gpu.nvidia.com`) con selectores de modelo H100 en CEL y banner informativo `[data-testid="dra-readonly-notice"]`.
     - Captura generada: [`docs/revival/screenshots/r3-03-dra-device-classes-view.png`](./screenshots/r3-03-dra-device-classes-view.png).
  4. **Pestaña Resource Claims (DRA):** Alternancia de pestaña mediante `#tab-resource-claims`, renderizado de claims (`ai-inference-gpu-claim`), asignación `gpu.nvidia.com/gpu-0` y carga asociada `llama3-worker-0`.
     - Captura generada: [`docs/revival/screenshots/r3-03-dra-resource-claims-view.png`](./screenshots/r3-03-dra-resource-claims-view.png).

---

## 5. Criterios de Aceptación Cumplidos

- [x] Modelos, APIs y stores para `ValidatingAdmissionPolicy` y `ValidatingAdmissionPolicyBinding` con negociación de versiones `v1`/`v1beta1`/`v1alpha1`.
- [x] Visor de expresiones de reglas CEL con constraints de match y acciones de binding.
- [x] Modelos, APIs y stores para `DeviceClass` y `ResourceClaim` (DRA `resource.k8s.io`).
- [x] Vistas en dos pestañas para Admission Policies y DRA con banners informativos y badges de estado.
- [x] Operación estrictamente en modo solo lectura; cero mutaciones de políticas o claims.
- [x] Opcionalidad por discovery de API; clústeres sin estas APIs no sufren bloqueos.
- [x] 22 tests unitarios pasando al 100%, empaquetado macOS ARM64 en `dist-stage` y verificación funcional con Playwright aprobada con 4 capturas registradas.
