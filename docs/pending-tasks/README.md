# OpenLens DevOps — Tareas pendientes

**Workspace:** `lens-v6-ui-corrections` · **Rama:** `develop`  
**Actualizado:** 2026-10-30  
**Estado canónico:** [`../PROJECT_STATUS_20261029.md`](../PROJECT_STATUS_20261029.md)  
**Specs de estabilización QA:** [`../../odd/tasks/openlens-final-qa-stabilization.md`](../../odd/tasks/openlens-final-qa-stabilization.md)

La ejecución de QA y el arranque de features nuevas siguen **pausados** hasta que Gustavo autorice el próximo paso. Esta carpeta solo documenta el trabajo abierto.

| ID | Tarea | Prioridad | Estado |
|---|---|---|---|
| PT-01 | QA de estabilización | Alta | Parcial |
| PT-02 | Hotbar / UI-04 | Alta | Abierta (bloquea release) |
| PT-03 | Terminal reconnect | Alta | Abierta (bloquea release) |
| PT-04 | Laboratorio QEMU | Alta | Bloqueada |
| PT-05 | E2E Kubernetes | Alta | Abierta (bloquea release) |
| PT-06 | Release gates | Alta | No listo |

---

## PT-01 — QA de estabilización

**Qué es:** Certificar el `HEAD` actual de `develop` como **DEVELOPMENT_READY** (base usable para seguir desarrollando), sin declarar **RELEASE_READY** por inferencia.

**Incluye:**
- Solo `develop`; no sobrescribir candidatos QA protegidos.
- Runners separados: (A) visual sin Kubernetes real; (B) integración solo con kubeconfig QEMU dedicado.
- Candidato ARM64 del HEAD + SHA-256 de `app.asar`.
- Matriz UI/navegación (Home, hotbar, badge, drag/persistencia, viewports).
- TypeScript, ESLint, Jest, build, Playwright, cierre limpio de procesos.
- Actualizar `PROJECT_STATUS` con PASS / FAIL / BLOCKED / NOT_RUN.

**Aceptación (resumen):**
- DEVELOPMENT_READY si el HEAD compila, lo principal funciona y no hay blockers críticos para desarrollo.
- RELEASE_READY exige además PT-05/PT-06 — no se declara aquí.

**Estado actual:** Parcial — hubo build con Node 20 y smoke visual acotado; faltan matriz UI-04 completa, integración QEMU y certificación formal. Detalle: `odd/tasks/openlens-final-qa-stabilization.md`.

---

## PT-02 — Hotbar / UI-04

**Qué es:** Completar la matriz visual/comportamiento del Hotbar que aún bloquea confianza de release.

**Incluye:** fixtures de 25 y 35 pines; drag-and-drop y persistencia; cambio entre clústeres QA; menú/tooltip; indicador PROD; accesibilidad; geometría rail/pin (72 / 56 / 16) y espaciado compacto.

**Aceptación:** PASS observado sobre el hash de candidato autorizado para el set UI-04 completo; el histórico 27 PASS / 5 BLOCKED no valida HEADs posteriores.

**Estado actual:** Abierta.

---

## PT-03 — Terminal reconnect

**Qué es:** Demostrar desconexión/reconexión explícita del terminal con aislamiento real (no emulación CDP offline, que no activó el estado desconectado).

**Incluye:** interrupción controlada de una sesión de prueba; perfil aislado; sin alterar red/VM del lab salvo autorización.

**Aceptación:** Estado desconectado y camino de reconnect observados bajo aislamiento; si no, documentar BLOCKED con causa.

**Estado actual:** Abierta / previamente BLOCKED bajo emulación CDP.

---

## PT-04 — Laboratorio QEMU

**Qué es:** Restaurar o re-verificar el lab dedicado `openlens-r8r9-qemu` usado para QA de integración.

**Incluye:** kubeconfig dedicado; preflight de contexto/endpoint/permisos; listener disponible (históricamente `https://localhost:50997`); nunca `~/.kube/config` personal.

**Aceptación:** Preflight PASS para poder correr casos de integración; si no hay lab, marcar solo esos casos como BLOCKED.

**Estado actual:** Bloqueada — el endpoint no escuchaba en la última verificación.

---

## PT-05 — E2E Kubernetes

**Qué es:** E2E Electron + clúster real (línea R8/R9 / Hotfix 3) contra el lab aislado, incluyendo flujos que necesitan API viva.

**Incluye:** Nodes / Pods / Deployments (y casos relacionados); identidades read-only o explícitamente autorizadas; runners que preservan sandbox; evidencia en `open-lens/qa/`.

**Aceptación:** PASS/FAIL ejecutado con evidencia sobre el mismo hash de candidato de PT-01; no fabricar fixtures mutando clústeres de producción.

**Estado actual:** Abierta — depende de PT-04 y de un candidato alineado al HEAD.

---

## PT-06 — Release gates

**Qué es:** Todo lo que falta para una release pública o distribuible (más allá de development readiness).

**Incluye:**
- Soak de estabilidad continua (~30 minutos) sobre un único artefacto final.
- Seguridad / firma / notarización de distribución cuando corresponda.
- Validación de empaquetado al mismo hash del candidato elegido.
- Aprobación GO explícita; no inferir release readiness.

**Aceptación:** Todos los gates de release en PASS + GO explícito. Un build ARM64 ad-hoc local **no** es una release.

**Estado actual:** **RELEASE_READY: NO.**

---

## Relacionado (fuera de la tabla)

- **Revisión RDD / Gentle AI** — pendiente por cuota; no aprueba release por sí sola (`PROJECT_STATUS`).
- **Curaduría de docs/evidencia QA** — árboles locales/ignorados grandes; preservar bytes; no subir secretos a granel.
- **Sidecar** `~/Documents/lens-out-of-repo-20261030` — backups/releases apartados; no borrar sin aprobación de Gustavo.

## Fuera de alcance por ahora

- Ejecutar la matriz QA o elegir el modelo barato de tests (pausado).
- Push a `origin` / promover el root git fuera de `lens-v6-ui-corrections`.
