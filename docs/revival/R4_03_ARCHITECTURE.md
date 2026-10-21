# R4-03 — Persistencia segura, restauración e historial por workspace

**Fecha:** 2026-10-21
**Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
**Rama:** `feat/r4-workspace-security`
**HEAD:** `22fbe983f5a6b4059eccbee15c906fbc5447c3d4`
**Estado:** ver `R4_03_VALIDATION.md` § «Certificación de cierre». Los gaps de la certificación anterior (referencia obsoleta en disco, un solo workspace, auditoría OS-level) quedaron resueltos en el `.app` `r4-03-cert-20261021-091636`.

## Actualización de cierre: reconciliación multiworkspace persistente

```text
leer snapshot → validar/migrar (fail-closed, sin reescritura si es corrupto)
  → reconcileSnapshot(): para CADA workspace
       tabs      = tabs con getClusterById(clusterId)?.id === clusterId
       activeTab = activo si sigue válido; si no, primer tab válido
       history   = entradas cuyo (tabId, clusterId) sigue válido; currentIndex recalculado
     workspaces/layouts/historial válidos de workspaces inactivos: sin cambios
  → si difiere: una escritura atómica (serializador v1 + temporal/rename)
  → restaurar SOLO el workspace activo en memoria, tabs inactivos
```

- `saveNow()` fusiona sobre el snapshot completo en memoria: reemplaza la entrada del workspace activo y conserva las demás.
- `createWorkspace()` / `switchWorkspace()` guardan el estado actual, restauran el destino con tabs inactivos y navegan al catálogo; nunca activan un clúster.
- La identidad se compara por `clusterId` exacto; un clúster distinto con el mismo alias visible no hereda tabs ni historial.
- No hay purga general: solo se quitan referencias a clústeres inexistentes.

## Decisiones de arquitectura

### Contrato versionado y allowlist

`SessionSnapshotV1` se valida y serializa en `packages/core/src/common/workspace/session-snapshot.ts`.

- Solo acepta la versión 1; migra snapshots legacy/versionless de forma conservadora. JSON corrupto, versiones futuras y payloads mayores a 2 MiB fallan cerrados.
- Extrae campos conocidos de workspaces, layouts, tabs e historial; limita cantidades y rechaza identidades duplicadas, campos sensibles y propiedades de contaminación de prototipo.
- No serializa secretos, credenciales, tokens, kubeconfig, comandos, buffers, PTYs, borradores ni datos de Secrets. El store actual persiste tabs de clúster, no sesiones de editor, logs, terminal ni port-forward.
- Solo admite rutas internas sanitizadas. La navegación implementada registra rutas raíz de clúster.
- La escritura de archivo usa temporal + rename y solicita permisos `0o600`/`0o700`; esta certificación no midió los permisos efectivos del archivo en el `.app`.

### Restauración inactiva y activación explícita

Flujo implementado y comprobado contra la app empaquetada:

1. El arranque espera al catálogo de clústeres.
2. El renderer lee y valida el snapshot.
3. Cada tab se reconcilia usando igualdad exacta de `clusterId`; nunca se redirige por nombre o alias.
4. Se restaura el orden, foco lógico e historial en memoria, con tabs marcados inactivos.
5. La ruta inicial y el foco lógico no activan el frame. `ClusterView` espera una interacción explícita antes de llamar a la ruta de activación del clúster.
6. Atrás/adelante son acciones explícitas y validan `workspaceId`, `tabId` y `clusterId` antes de navegar.

El binario empaquetado mostró cero solicitudes a los servidores Kubernetes sintéticos mientras se restauraban los tabs inactivos. Atrás, adelante y el clic explícito iniciaron solicitudes únicamente al fixture de la identidad correspondiente. La fixture local rechazó cero escrituras porque no recibió solicitudes no-GET.

### Historial e identidad

`WorkspaceHistoryManager` mantiene hasta 20 entradas por workspace. Una entrada no puede cruzar la identidad de tab/clúster; las rutas inseguras se filtran. El E2E confirmó Back hacia STG y Forward hacia PROD después del reinicio, respetando el tab y el fixture asociados.

El historial cubre rutas raíz `/cluster/<clusterId>`; no registra navegación interna de iframes ni deep routes. Tampoco restaura sesiones de herramientas.

## Flujo de workspace

```text
Inicio del renderer
  → inicializar ClusterStore y catálogo
  → leer + versionar + validar snapshot allowlisted
  → reconciliar clusterId exactos
  → restaurar tabs, orden, foco lógico e historial en memoria
  → mantener tabs inactivos y no mostrar frames
  → esperar interacción explícita
  → activar únicamente el clúster de la acción
```

Se reutilizan `ClusterView`, `ClusterFrameHandler`, `WorkspaceTabsStore`, `WorkspaceHistoryManager`, DI y la feature flag existente; no se crea un store Kubernetes por pestaña. El fallback clásico permanece detrás de la feature flag y su ruta fue comprobada en el mismo `.app`.

## Evidencia de certificación del binario

La app evaluada fue generada desde este worktree, no reutilizada de una ejecución anterior:

- `.app`: `open-lens/dist-r4-stage/r4-03-certification-20261021-060415/mac-arm64/OpenLens DevOps.app`
- Electron: `22.3.3`; app `6.5.3-dev`; Mach-O `arm64`.
- `app.asar` SHA-256: `5801cdea755a4eb8085154e9f376ebfbf2864650f1fe5ec3bd4e889f95c1fcca`.
- Log GUI: `docs/revival/logs/R4_03_GUI_20261021-063550.log`.
- Capturas: `docs/revival/screenshots/r4-03-persistence-2026-10-21T09-23-37-681Z-*.png`.

Playwright lanzó el ejecutable de ese `.app` con perfiles temporales y tres API fixtures sintéticas loopback DEV/STG/PROD. La secuencia ejecutó tabs reales, drag/drop, cierre total, espera de salida del proceso Electron, reapertura del mismo bundle y verificaciones DOM/ruta/solicitudes. No se usaron kubeconfigs reales ni se conectó un clúster real.

## Límites y riesgos residuales

> Los puntos «Clúster ausente», «Workspaces múltiples», «Herramientas vivas» y el triage de `illegal access` de esta sección describen la certificación anterior y quedaron resueltos/clasificados en `R4_03_VALIDATION.md` § «Certificación de cierre». Se conservan como historial.

- **Clúster ausente:** se omitió el tab y la historia correspondiente en memoria, sin solicitudes; el snapshot serializado todavía conserva la referencia antigua a PROD. El purge no se guarda de vuelta automáticamente. No se forzó `saveNow()` como atajo: el guardado actual reconstruye solo el workspace activo y podría borrar otros layouts presentes en un snapshot futuro. Hace falta una actualización segura que conserve las demás entradas antes de certificar la eliminación persistente.
- **Workspaces múltiples:** aunque el contrato admite layouts múltiples, el store solo persiste/restaura el workspace activo y el GUI no probó selector ni restauración de más de `default`.
- **Herramientas vivas:** el snapshot R4-03 no guarda procesos o estados de herramientas, y el restore inicial no mostró frames. Sin embargo, no se auditó el árbol de procesos/PTYs del sistema ni cada ruta de persistencia externa a `SessionSnapshotV1`; el `.app` mostró una pestaña Terminal después de una navegación explícita a un clúster. No se afirma ausencia absoluta de procesos reanudados por otros stores.
- **Historial:** limitado a rutas raíz de clúster, sin navegación de iframes.
- **Fixture/teardown:** no implementó CustomResourceDefinitions; hubo errores de discovery de esa API sintética. En desmontaje apareció `illegal access` en consola del renderer, sin `pageerror`; la app cerró normalmente, pero el mensaje no fue triageado. La inicialización normal también ejecuta `zsh -l -i` para sincronizar variables de entorno, no como sesión restaurada. No hubo escrituras a fixtures ni tráfico a Kubernetes real.
- **Build:** la app fue firmada localmente pero no notarizada; no había credenciales Apple de notarización. El artefacto de package quedó verificado y ejecutado aunque el tee de la invocación original apuntó a un directorio de logs que todavía no existía; esta limitación está registrada en `R4_03_PACKAGING_20261021-060415.log`.
- R4-01 y R4-02 siguen **PARCIALES**. R4-03 también permanece **PARCIAL** hasta cerrar los riesgos anteriores y completar regresión amplia.

## Componentes principales

- `packages/core/src/common/workspace/session-snapshot.ts`: schema versionado, allowlist, migración, validación de IDs y rutas.
- `packages/core/src/features/workspace-tabs/common/workspace-history.ts`: historial acotado, sanitización y purga en memoria.
- `packages/core/src/features/workspace-tabs/renderer/workspace-persistence-store.ts`: hidratación, reconciliación contra catálogo y guardado con debounce.
- `packages/core/src/features/workspace-tabs/renderer/workspace-session-storage.ts`: adaptadores de archivo, memoria y localStorage.
- `packages/core/src/features/workspace-tabs/renderer/workspace-tabs-store.ts`: tabs, identidad de clúster, historial y estado de tab inactivo.
- `packages/core/src/features/workspace-tabs/renderer/sync-active-cluster-to-workspace-tabs.injectable.ts`: orden de arranque y sincronización de ruta.
- `packages/core/src/renderer/components/cluster-manager/cluster-view.tsx`: guardia de activación y acción explícita.
- `docs/revival/scripts/verify-r4-03-persistence.cjs`: automatización GUI con el ejecutable empaquetado y fixtures sintéticas.
