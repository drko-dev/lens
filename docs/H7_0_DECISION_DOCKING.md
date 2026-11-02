# H7.0 — Decisión técnica de docking global

**Fecha:** 2026-11-02 · **Estado:** DECIDIDO (sujeto a aprobación del usuario) · **Sin dependencias instaladas**

## Decisión

**Extender el motor propio `split-panel`.** No adoptar Dockview ni otra librería en H7.

## Alternativas evaluadas

| Criterio | Motor propio | Dockview |
|---|---|---|
| Árbol split + pestañas | Ya existe (`Branch/Group/Leaf`) | Sí |
| Desacople nativo | Ya existe: `BrowserWindow` sandbox, partición propia, registro por `webContents.id`, redock fail-closed por `clusterId` | Popout vía `window.open`; habría que reescribirlo para respetar el modelo IPC/sandbox actual |
| Aislamiento por clúster | `clusterId` en store y en descriptor de ventana | No lo modela; habría que envolverlo |
| Persistencia | `version: 3`, migraciones V1/V2, backup corrupto, `assertNoSensitiveFields` | `toJSON/fromJSON` sin estas garantías |
| Tests existentes | ~2 k líneas (h2–h5) | 0 en este repo |
| Peso / riesgo | 0 dependencias nuevas | Dependencia nueva (requiere aprobación), re-tematizar Cursor grafito |
| Brechas | Drop en 4 lados con preview, encabezado compacto, replegado, host global, clave por clúster | Integración IPC, identidad del clúster, tema |

Un POC de Dockview no aporta información que justifique su costo: las brechas del motor propio son de UI, no de modelo, y el desacople —la parte difícil— ya está resuelto y probado.

## Contratos para H7.1+

1. **`GlobalPanelHost`** (renderer, cluster frame): envuelve `<Component />` en `cluster-frame-layout-child-component.injectable.tsx`. Flag OFF → render idéntico al actual (vista clásica). No toca `Sidebar` ni `Dock`.
2. **Ruta → panel:** un adaptador mapea la ruta activa a una hoja (`PanelKind`). Piloto: `pods`, `deployments`. El componente de ruta se monta **una sola vez**; el host no duplica suscripciones ni watchers.
3. **Store:** una instancia por cluster frame (`hostedClusterIdInjectable`); `clusterId` inmutable por panel. Clave de persistencia del host global separada de Kubetail (p. ej. `openlens:global-layout:<clusterId>`), sin reutilizar `openlens:split-layout`.
4. **Movimiento en 4 lados:** extender `movePanel` con posición `before | after` además de orientación (a verificar en H7.2 si ya lo soporta).
5. **Replegado:** estado `collapsed` por hoja/grupo, distinto de `closePanel`.
6. **Identidad visual:** token CSS único `--cluster-accent` derivado de `clusterColor`, aplicado a encabezado, pestaña y ventana desacoplada (H7.4).
7. **Feature flag:** nuevo flag del host global, independiente de `floating-panels` (Kubetail) y de `detached-tools`.

## Riesgos

- **Doble montaje de rutas** (watchers/WebSockets duplicados) si el host renderiza la ruta en más de una hoja. Mitigación: una hoja = una instancia de ruta; probar con contadores de suscripción.
- **Recursión** host global ↔ split de Kubetail: reutilizar la guardia `isNestedInSplit`.
- **Persistencia compartida** con Kubetail si se reutiliza la clave: usar clave separada.
- **Colisión de nombres** con `workspace-tabs` ("workspace"): nombrar el nuevo concepto "layout global".
- **Desacople limitado** a `kubetail`/`resource-details`: ampliar por tipo, con prueba cada uno (H7.5/H7.6).
- **Bug de color** en la acción contextual del hotbar: diagnosticar en H7.4, no antes.
