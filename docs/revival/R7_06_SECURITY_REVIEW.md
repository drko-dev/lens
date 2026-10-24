# OpenLens DevOps Revival — R7-06 Revisión de Seguridad

**Hito:** R7-06 — RBAC Permission Inspector (`auth can-i`)
**Fecha:** 2026-10-24
**Evaluador:** Arquitecto Senior de Kubernetes, DevOps & Seguridad
**Estado:** **CERTIFICADO LOCALMENTE — CHECKPOINT APROBADO**
**Resultado de Seguridad:** APROBADO (0 vulnerabilidades, 100% de operaciones de solo lectura sobre recursos operativos, semántica oficial Kubernetes RBAC)

---

## 1. Alcance de Seguridad y Modelo de Amenazas

La herramienta `auth can-i` expone una superficie de inspección de permisos sobre el clúster. Para asegurar que no constituya un vector de ataque, abuso, desinformación o falsificación de estado, se auditaron y blindaron los siguientes principios fundamentales:

1. **Principio de Operación Estrictamente de Solo Lectura:**
   - La herramienta **nunca** muta cargas de trabajo, Secretos, Roles ni RoleBindings.
   - Las solicitudes remotas emitidas son únicamente `POST` dirigidos a los endpoints autorizados de Kubernetes:
     - `/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`
     - `/apis/authorization.k8s.io/v1/subjectaccessreviews`
   - En la semántica de Kubernetes, crear un AccessReview es la operación estándar de consulta de autorización (creación de objetos efímeros que no persisten en etcd).
   - El script de verificación E2E Playwright auditó todas las solicitudes HTTP registradas en el servidor sintético y certificó:
     - `mutatingRequests: 0` (0 PUT, 0 PATCH, 0 DELETE, 0 POST a recursos operativos).
     - `accessReviewRequests: 13` (100% legítimos, correspondientes a consultas de autorización).

2. **Evidencia Local Sin Falsa Autorización (`LOCAL_MATCH`):**
   - Una coincidencia en las definiciones locales en memoria (Roles y RoleBindings en caché) **NO** equivale a una autorización efectiva del clúster (puesto que webhooks de admisión, Node authorizer o políticas denegatorias externas no se reflejan en el caché local).
   - Por diseño estricto de seguridad:
     - El badge visual se renderiza obligatoriamente como **`COINCIDENCIA LOCAL — NO VERIFICADA`** (estilizado en tono ámbar/alerta).
     - El campo lógico `allowed` se establece categóricamente en **`false`**.
     - **Nunca** se rotula como `ALLOWED` ni se presenta como veredicto positivo concluyente.

3. **Manejo Seguro de Errores RBAC 403 y Respuestas Indeterminadas (Fail Closed):**
   - Si la cuenta del operador no posee privilegios para crear `SubjectAccessReviews` (HTTP 403 Forbidden):
     - El cliente **no** colapsa silenciosamente a `false` (lo cual confundiría "no tengo permisos para auditar" con "la cuenta auditada tiene el acceso denegado").
     - Se informa al operador de forma transparente: `"Sin permisos para verificar vía API server (RBAC 403)"`.
     - Si en el análisis local tampoco se encuentra una regla coincidente, el veredicto es `INSUFFICIENT_DATA` y **nunca** un `DENIED` categórico.
   - Si la respuesta del API server carece de `status.allowed` explícitamente booleano, o el `status` está ausente, o hay un `evaluationError`, o la respuesta está malformada, el resultado es **`INDETERMINATE`** y **nunca** `DENIED_API` ni `ALLOWED_API`.

4. **Semántica Rigurosa Kubernetes RBAC (`rbac.ResourceMatches`):**
   - Reglas con `resources: ["*"]` cubren tanto recursos de primer nivel como subrecursos.
   - Reglas con `resources: ["pods/exec"]` coinciden específicamente con el subrecurso `pods/exec`.
   - Reglas con `resources: ["*/exec"]` coinciden con el subrecurso `exec` de cualquier recurso.
   - Patrones no estándar como `pods/*` y `*/*` **no** se interpretan como comodines válidos.
   - Reglas con `resources: ["pods"]` **nunca** coinciden con subrecursos como `pods/exec`.
   - Reglas con `resourceNames`: autorizan subrecursos `create` sobre la instancia nombrada (ej. `create` en `pods/exec` con `name: "my-pod"`), autorizan solicitudes `list`/`watch` con filtro de nombre (`metadata.name`), y rechazan tajantemente `create` de raíz de colección, `list`/`watch` de colección sin filtro de nombre y `deletecollection`.

5. **Protección Multiclúster y Prevención de Carreras Asíncronas:**
   - Cada consulta incorpora el identificador del clúster activo (`clusterId`).
   - Se realiza comprobación pre-flight de identidad y conexión antes de emitir la petición POST.
   - Se valida nuevamente el clúster activo tanto al completar la promesa como en caso de rechazo.
   - Respuestas asíncronas tardías de clústeres anteriores se descartan inmediatamente.
   - Se implementó un contador monótono `currentRequestId`: respuestas asíncronas lentas o fuera de orden son descartadas si el operador ya emitió una consulta más reciente.
   - Cualquier cambio en los inputs del formulario (identidad, namespace, verbo, recurso, subrecurso) invalida y limpia inmediatamente los resultados en pantalla.
   - La pantalla cancela e invalida consultas activas al desmontarse (`componentWillUnmount`).

6. **Acción Consciente del Operador (No Auto-ejecución):**
   - Al navegar a la pantalla desde Drawer de ServiceAccounts con parámetros de URL (`?identity=service-account...`), los campos se pre-pueblan para comodidad del operador, pero **nunca** se auto-ejecuta una consulta contra el clúster. La evaluación requiere un clic consciente en "Check Permission".

7. **Salud de Stores RBAC y ClusterRoles Agregados:**
   - La evaluación local examina el estado de carga (`isLoaded`, `failedLoading`, errores) de los 4 stores de RBAC. Si alguno falló por 403 o está pendiente, se emite un banner de advertencia informando al operador sobre la cobertura parcial.
   - Se detecta la presencia de ClusterRoles con `aggregationRule` y se advierte que sus reglas definitivas dependen del cálculo dinámico del controller-manager.

---

## 2. Matriz de Veredictos de Seguridad

| Veredicto | Significado | Comportamiento Seguro |
|---|---|---|
| `ALLOWED_API` | Confirmado permitido por el API server de Kubernetes | Certificado por el motor de autorización del API server (`allowed: true`). |
| `COINCIDENCIA LOCAL — NO VERIFICADA` (`LOCAL_MATCH`) | Coincide con Role/RoleBinding local en caché (API server 403 o desconectado) | Marcado con origen `local-analysis`, advertencia explícita y `allowed: false`. Nunca presentado como `ALLOWED`. |
| `DENIED_API` | Confirmado denegado por el API server de Kubernetes | Confirmación oficial de rechazo (`allowed: false`). |
| `INSUFFICIENT_DATA` | 403 al auditar vía API y sin coincidencias locales | Se informa que no se cuenta con datos concluyentes para determinar el acceso. |
| `INDETERMINATE` | Respuesta malformada, `status.allowed` ausente, error de evaluación, desconexión o cambio de contexto de clúster | Se invalida el resultado para evitar falsos positivos y falsas denegaciones. |

---

## 3. Conclusión de Seguridad

La implementación de R7-06 cumple rigurosamente con los estándares de seguridad de Kubernetes v1.20+, garantiza el principio de mínimo privilegio, previene filtraciones y ofrece total certeza operativa en clústeres empresariales y de misión crítica.
