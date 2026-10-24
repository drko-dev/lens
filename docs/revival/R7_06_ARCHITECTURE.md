# OpenLens DevOps Revival — R7-06 Arquitectura

**Hito:** R7-06 — Inspector de Permisos y Simulación RBAC (`auth can-i`)
**Fecha:** 2026-10-24
**Rama:** `feat/r7-06-rbac-inspector`
**Base:** `6416055e28d55f9793fcfe6e7d0df05dc36ee125` (Consolidación R7-04)

---

## 1. Visión y Objetivos

El hito **R7-06** dota a OpenLens de una herramienta de diagnóstico y auditoría de autorización nativa de Kubernetes (`auth can-i`), completamente local-first, libre de nube, sin telemetría ni dependencias comerciales.

Permite al operador resolver de forma visual e inmediata:
1. **¿Puede mi usuario actual listar Secrets en un namespace?** (Vía `SelfSubjectAccessReview`).
2. **¿Puede un ServiceAccount o usuario específico modificar Deployments?** (Vía `SubjectAccessReview` con identidad canónica `system:serviceaccount:<ns>:<name>`).
3. **¿Tiene acceso a subrecursos críticos?** (e.g. `pods/exec`, `pods/log`, `pods/portforward`).
4. **¿Qué RoleBindings y ClusterRoleBindings otorgan un permiso determinado?** (Evidencia explicativa correlacionada con las definiciones RBAC en caché).
5. **¿Por qué se produce un error 403 Forbidden?** (Distinción entre denegación explícita, falta de permisos para auditar y fallback a análisis local).

---

## 2. Separación de Responsabilidades y Topología

```
┌────────────────────────────────────────────────────────────────────────┐
│ UI Layer: RbacInspector Component (Midnight Graphite 33px density)     │
│ - Identity Selector (Current User | ServiceAccount | User/Group)       │
│ - Action / Target Builder (Resource & Subresource vs Non-Resource URL) │
│ - Single Verb Check & All Verbs Matrix (8 verbos estándar)             │
│ - Production Cluster Warning Badge                                     │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
                   ▼                               ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│ Remote API Client: AccessReviewClient│  │ Pure Evaluator: LocalEvaluator│
│ - POST selfsubjectaccessreviews      │  │ - Scope resolution           │
│ - POST subjectaccessreviews          │  │ - Wildcard matching (*, */*) │
│ - Cluster switch safety protection   │  │ - Subresource discrimination │
│ - Fail-closed HTTP 403 fallback      │  │ - resourceNames constraint   │
└──────────────────┬───────────────────┘  └──────────────┬───────────────┘
                   │                                     │
                   ▼                                     ▼
      Kubernetes API Server                  Cached RBAC Resources
  (/apis/authorization.k8s.io/v1)        (Roles, RoleBindings, CR, CRB)
```

---

## 3. Motor de Autorización: Dos Modos Complementarios

### 3.1 Modo A — Usuario Actual (`SelfSubjectAccessReview`)
- Endpoint: `POST /apis/authorization.k8s.io/v1/selfsubjectaccessreviews`
- Evalúa los permisos reales de la sesión activa autenticada en Lens.
- Preserva la semántica de Kubernetes:
  - `status.allowed === true` → `ALLOWED_API`
  - `status.allowed === false` → `DENIED_API`
  - `status.evaluationError` → `INDETERMINATE`

### 3.2 Modo B — ServiceAccount o Usuario Específico (`SubjectAccessReview`)
- Endpoint: `POST /apis/authorization.k8s.io/v1/subjectaccessreviews`
- Para ServiceAccounts se construye la identidad canónica según especificación de Kubernetes:
  - Usuario: `system:serviceaccount:<namespace>:<name>`
  - Grupos: `["system:serviceaccounts", "system:serviceaccounts:<namespace>", "system:authenticated"]`
- Resiliencia ante RBAC 403:
  - Si la cuenta del operador carece de autorización para crear `SubjectAccessReviews` (HTTP 403):
    - Se captura el 403 sin fallar ni emitir popups de error molestos.
    - Se evalúan las reglas locales en caché.
    - Si existe coincidencia local → `LOCAL_MATCH` con advertencia explícita.
    - Si no existe coincidencia local → `INSUFFICIENT_DATA` con aviso de permisos insuficientes.

---

## 4. Motor Puro de Evaluación Local (`local-evaluator.ts`)

Implementado como función pura sin efectos colaterales (`evaluateLocalRbac`):
- **Resolución de ámbito de RoleBindings:**
  - Un `ClusterRoleBinding` otorga permisos en todos los namespaces y a URLs no asociadas a recursos (`nonResourceURLs`).
  - Un `RoleBinding` otorga permisos **única y exclusivamente** dentro del namespace en que reside (`rb.getNs()`), incluso cuando hace referencia a un `ClusterRole`.
  - Un `RoleBinding` **nunca** puede otorgar acceso cluster-wide ni a `nonResourceURLs`.
- **Subrecursos y semántica upstream `rbac.ResourceMatches()`:**
  - La regla `resources: ["*"]` otorga acceso a todos los recursos y todos sus subrecursos.
  - La regla `resources: ["pods"]` **no** otorga acceso a `pods/exec`.
  - La regla `resources: ["pods/exec"]` otorga acceso específicamente al subrecurso `pods/exec`.
  - La regla `resources: ["*/exec"]` otorga acceso al subrecurso `exec` de cualquier recurso.
  - Patrones no soportados por el autorizador oficial de Kubernetes como `pods/*` y `*/*` **no** son interpretados como comodines válidos.
- **Restricciones de nombre (`resourceNames`):**
  - Si una regla especifica `resourceNames`, los verbos que operan sobre la colección completa (`create`, `list`, `watch`, `deletecollection`) **nunca** pueden ser autorizados por dicha regla, aun si la consulta proporciona un nombre.
  - Para verbos sobre instancias individuales (`get`, `update`, `patch`, `delete`), la regla solo autoriza si el recurso consultado coincide con uno de los nombres listados en `resourceNames`.
- **Fail Closed y Evidencia Local Sin Falsa Autorización:**
  - Cuando una consulta coincide localmente pero el API server devolvió HTTP 403 o está desconectado, el veredicto es `LOCAL_MATCH` con badge visual **`COINCIDENCIA LOCAL — NO VERIFICADA`** y `allowed: false`. **Nunca** se rotula como `ALLOWED`.
  - La ausencia de reglas locales coincidentes **nunca** se dictamina como `DENIED_API` definitivo, ya que la autorización de Kubernetes puede estar concedida por Webhooks de admisión, Node authorizer o roles no cargados en caché.
- **Salud de Stores y ClusterRoles Agregados:**
  - El evaluador verifica la salud de los stores (`isLoaded`, `failedLoading`) y genera advertencias claras si el almacén local está incompleto o si el clúster utiliza ClusterRoles agregados (`aggregationRule`).

---

## 5. Integración con el Sistema de Inyección de Dependencias (DI)

1. `rbac-inspector-route.injectable.ts`: Registra la ruta `/rbac-inspector` bajo `frontEndRouteInjectionToken`.
2. `navigate-to-rbac-inspector.injectable.ts`: Provee función de navegación tipada admitiendo `query` params.
3. `rbac-inspector-sidebar-items.injectable.tsx`: Agrega el ítem en la barra lateral bajo `userManagementSidebarItemId` con `orderNumber: 60`.
4. `rbac-inspector-route-component.injectable.ts`: Asocia la ruta al componente `RbacInspector`.
5. `access-review-client.injectable.ts`: Instancia el cliente HTTP aislado (sin manejadores globales de error toast en 403).
6. Integración en ServiceAccounts:
   - `details.tsx`: Botón "Inspect Permissions (auth can-i)".
   - `service-account-menu.tsx`: Opción de menú contextual "Inspect Permissions".
