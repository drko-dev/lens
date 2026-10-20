# OpenLens DevOps Revival — R3-05 Validation Report
**Aplicaciones lógicas, Trivy Operator e Imágenes OCI**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
  - **SHA-256 app.asar:** `df663873b747b0cac151cb04c3b9f6b8dadbaa6e2380ed4ae11aa6db9ad8a42a`
- **Estado de salida:** APROBADO (7 tests unitarios específicos de R3-05 al 100% PASS + 36 tests en suite integral R3 PASS + Typecheck 0 errores + Monorepo build 40 paquetes exitosa + Verificación Playwright en paquete macOS ARM64 real con 3 capturas de pantalla)

---

## 1. Resumen de Implementación

En el marco del Hito **R3-05**, se implementó la capa de agrupación lógica de aplicaciones basadas en estándares comunitarios de Kubernetes, la integración segura de reportes de vulnerabilidades provistos por Trivy Operator y el catálogo estructurado de imágenes de contenedores OCI:

### A. Agrupación de Aplicaciones Lógicas (`app.kubernetes.io`)
- **Motor de Agregación (`logical-application.ts`):**
  - Detección y agregación reactiva sobre etiquetas estándar de Kubernetes:
    - `app.kubernetes.io/name`: Nombre del componente/aplicación.
    - `app.kubernetes.io/instance`: Identificador de despliegue.
    - `app.kubernetes.io/version`: Versión de la aplicación.
    - `app.kubernetes.io/component`: Rol arquitectónico (frontend, database, worker, api).
    - `app.kubernetes.io/part-of`: Aplicación de nivel superior.
    - `app.kubernetes.io/managed-by`: Herramienta gestora (helm, argocd, flux, manual).
  - Cálculo de disponibilidad real sin inventar salud mágica a partir de telemetría incompleta (`2/2 ready` vs `degraded` vs `Incomplete telemetry`).
  - Métricas de adhesión a estándares (`completenessScore` de 0 a 5 etiquetas presentes).
  - Recolección de imágenes de contenedores utilizadas por la aplicación.
- **Visualización en Tabla (`LogicalApplications`):**
  - Pestaña **Logical Applications** con resumen de cargas asociadas, versión, estado de salud y herramientas gestoras.

### B. Trivy Operator Opcional (`aquasecurity.github.io`)
- **Modelos y APIs (`trivy.api.ts`):**
  - `VulnerabilityReport`: modelo para el CRD `vulnerabilityreports.aquasecurity.github.io/v1alpha1`.
  - Parseo de severidades (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`, `NONE`), recursos objetivo (tipo, nombre, contenedor), resumen de vulnerabilidades totales y fixable count.
  - Endpoint `VulnerabilityReportApi` con registro de versiones utilizables y manejo resiliente ante clústeres sin el operador instalado.
- **Almacén (`vulnerability-report-store.ts`):**
  - Extensión de `KubeObjectStore<VulnerabilityReport>` con filtrado por recurso objetivo, por imagen y conteos agregados por nivel de severidad.
- **Visualización en Tabla (`VulnerabilityReports`):**
  - Pestaña **Vulnerability Reports (Trivy)** con badges de severidad coloreados, desglose por nivel de criticidad y edad del escaneo.
  - Opcionalidad por discovery: si el CRD no está instalado o no se tienen permisos RBAC, se muestra el aviso contextual informativo (`data-testid="trivy-optional-notice"`).

### C. Catálogo de Imágenes de Contenedores OCI (`container-image.ts`)
- **Parser Seguro de Imágenes:**
  - Separación segura de `registry`, `repository`, `tag` y `digest` sin realizar consultas de red externas a registries ni extraer credenciales.
  - Detección de inmutabilidad:
    - `Digest Pinned`: fijado criptográficamente por hash SHA-256 (`badge-pinned`).
    - `Floating Tag`: etiquetas mutables (`latest`, `main`, etc.) con advertencia ámbar (`badge-floating`).
    - `Semver Tag`: etiquetas versionadas semánticamente (`badge-semver`).
- **Visualización en Tabla (`ContainerImages`):**
  - Pestaña **Container Images** con listado único de todas las imágenes activas en el clúster, su estado de inmutabilidad y los workloads que las consumen.

### D. Seguridad y Salvaguardas
- **Banner de Seguridad (`data-testid="apps-trivy-security-notice"`):**
  - > *"Logical Applications & OCI Security: Aggregated views based on standard app.kubernetes.io labels and optional Trivy Operator CRDs (aquasecurity.github.io). External registries are not queried and secrets are never extracted."*
- Estrictamente de **solo lectura**. No se ejecutan mutaciones ni se envían credenciales fuera del clúster.

---

## 2. Registro de Pruebas Unitarias

Se ejecutó la suite de pruebas unitarias cubriendo agregación de aplicaciones, parsing de imágenes OCI, modelos de Trivy y resiliencia ante ausencia de CRDs:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **R3-05 Applications, Trivy & Images** | `r3-05-apps-trivy.test.ts` | 7 | PASS |
| **R3-04 GitOps (Regresión)** | `r3-04-gitops.test.ts` | 7 | PASS |
| **R3-03 Admission Policies & DRA (Regresión)** | `r3-03-admission-policies-dra.test.ts` | 8 | PASS |
| **R3-02 EndpointSlice & Gateway API (Regresión)** | `r3-02-endpointslices-gateway.test.ts` | 8 | PASS |
| **R3-01 API Compatibility & RBAC (Regresión)** | `r3-01-api-compatibility.test.ts` | 6 | PASS |
| **Total Evaluado** | — | **36** | **100% PASS** |

Detalle de casos en `r3-05-apps-trivy.test.ts`:
1. `Logical Applications Aggregation › groups workloads by app.kubernetes.io standard labels and calculates readiness`: PASS.
2. `Logical Applications Aggregation › indicates degraded health when one component is not ready without inventing signals`: PASS.
3. `Container Image Metadata & Immutability Parsing › parses image with sha256 digest as pinned`: PASS.
4. `Container Image Metadata & Immutability Parsing › identifies floating tags like latest as not pinned`: PASS.
5. `Container Image Metadata & Immutability Parsing › identifies semver tags`: PASS.
6. `Trivy VulnerabilityReport Model › parses target metadata, image reference, and counts correctly`: PASS.
7. `Trivy VulnerabilityReport Model › VulnerabilityReportApi handles cluster without Trivy Operator gracefully`: PASS.

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
   - SHA-256 de `app.asar`: `df663873b747b0cac151cb04c3b9f6b8dadbaa6e2380ed4ae11aa6db9ad8a42a`.
   - Proceso productivo protegido (PID no alterado).

---

## 4. Verificación Automatizada de GUI en Paquete Real (Playwright)

- **Script:** `docs/revival/scripts/verify-r3-05-apps-trivy.cjs`
- **Ambiente:** macOS ARM64 aislado (`HOME` y `CICD` en `/tmp/openlens-r3-05-apps-*`, `KUBECONFIG=/dev/null`).
- **Pruebas en Pantalla Real Validadas:**
  1. **Vista de Aplicaciones Lógicas:** Renderizado de la aplicación `ecommerce-platform`, estado `2/2 ready`, completitud `5/5 labels`, gestor `helm` y banner informativo `[data-testid="apps-trivy-security-notice"]`.
     - Captura generada: [`docs/revival/screenshots/r3-05-logical-applications-view.png`](./screenshots/r3-05-logical-applications-view.png).
  2. **Pestaña Trivy Vulnerability Reports:** Alternancia mediante `#tab-trivy-reports`, renderizado del reporte `deployment-ecommerce-frontend`, badge `CRITICAL`, 2 críticas, 4 altas y severidad máxima.
     - Captura generada: [`docs/revival/screenshots/r3-05-trivy-reports-view.png`](./screenshots/r3-05-trivy-reports-view.png).
  3. **Pestaña Catálogo de Imágenes OCI:** Alternancia mediante `#tab-container-images`, renderizado de `quay.io/myorg/ecommerce-web` con badge `Semver Tag` y cargas consumidoras.
     - Captura generada: [`docs/revival/screenshots/r3-05-container-images-view.png`](./screenshots/r3-05-container-images-view.png).

---

## 5. Conclusión y Estado de Aceptación

El Hito **R3-05** queda **completado y certificado**:
- Agrupación lógica de aplicaciones basada en estándares comunitarios `app.kubernetes.io` operativa.
- Integración opcional de Trivy Operator operativa y con degradación limpia ante su ausencia.
- Catálogo de imágenes OCI con postura de inmutabilidad y máxima salvaguarda de seguridad.
- 100% probado en suite unitaria (36 tests en R3), typecheck sin errores, build monorepo y GUI real automatizada.
