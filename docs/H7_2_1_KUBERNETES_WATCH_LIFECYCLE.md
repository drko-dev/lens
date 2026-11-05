# H7.2.1 — Ciclo de vida de los watches Kubernetes

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Estado:** PASS (DEV, API sintética)

## 1. Resumen

Los watches que el renderer cancelaba quedaban abiertos contra la API de Kubernetes. La causa no estaba en Deployments, en el store ni en el host global: estaba en el proxy de Lens del proceso main, que no cerraba la petición upstream cuando el cliente se desconectaba. Afectaba a **todas** las vistas (Deployments, Events, Nodes…) y también al modo clásico de RC3.

Corrección: 11 líneas en `packages/core/src/main/lens-proxy/lens-proxy.ts`. Sin cambios en el renderer, en `GlobalPanelHost` ni en la interfaz.

## 2. Ciclo investigado

```
Deployments (KubeObjectListLayout.componentDidMount)
  → subscribeToStores → KubeWatchApi.subscribeStores        (renderer)
  → KubeObjectStore.subscribe → watchNamespace → KubeApi.watch (fetch + AbortController)
  → LensProxy (http-proxy, proceso main)
  → lens-k8s-proxy (proceso aparte) → API de Kubernetes
```

| # | Pregunta | Respuesta (con evidencia) |
|---|---|---|
| 1 | Quién inicia la suscripción | `KubeObjectListLayout.componentDidMount` → `KubeWatchApi.subscribeStores` → `store.loadAll` y luego `store.subscribe` → `KubeApi.watch` |
| 2 | Referencia compartida | Sí. `KubeWatchApi` tiene un contador por store (`WatchCount`). El segundo consumidor reutiliza el watch existente. Lo cubre `kube-watch-api-reference-count.test.ts` |
| 3 | Quién libera | El disposer de `subscribeStores`. Cuando el contador llega a 0, aborta el `AbortController`, y eso cancela el `fetch` hacia el proxy |
| 4 | Al desmontar Deployments | El renderer libera bien: los logs muestran siempre `dec() count for /apis/apps/v1/deployments is now 0`. **Pero la conexión upstream seguía abierta** |
| 5 | Al navegar a otra ruta | Igual que en el punto 4: es un desmontaje |
| 6 | Al cambiar de pestaña | La pestaña inactiva no se renderiza, así que es un desmontaje |
| 7 | Al arrastrar un panel | El árbol se reconstruye y la vista se remonta: un desmontaje y un montaje |
| 8 | Dos consumidores legítimos | Pods (Overview y vista Pods) se mantuvo en 1 watch activo durante todas las pruebas. El contador del renderer no se tocó |

### Causa raíz

`http-proxy@1.18.1` (`web-incoming.js`) solo aborta la petición upstream con el evento `aborted` de `req`. Node ≥ 16 ya no emite `aborted` cuando un GET llegó completo, que es justamente el caso de un watch. Resultado: el renderer cancela, el socket entre el renderer y `LensProxy` se cierra, pero `LensProxy` → `lens-k8s-proxy` → API queda abierto hasta su propio timeout.

Reproducción aislada, fuera de Lens: el mismo `http-proxy` y 10 watches cancelados dejan **10 abiertos**. Pasa igual con Node 24.22.2 y con el Node de Electron 45 (24.22.1).

## 3. Corrección

`LensProxy.configureProxy` registra un handler `proxyReq`. Si la respuesta al cliente se cierra antes de terminar (`!res.writableFinished`), destruye la petición upstream.

- Una respuesta normal termina antes de `close`, así que no se interrumpe.
- No hay caché nueva ni políticas globales nuevas, y no cambian RBAC ni el contexto.
- La deduplicación entre consumidores sigue a cargo del contador del renderer, que no cambió.

## 4. Pruebas

### Regresión (Jest, `--runInBand`)

`packages/core/src/main/lens-proxy/__tests__/h7-2-1-watch-upstream-close.test.ts`: usa servidores HTTP reales en loopback, el `http-proxy` real y los handlers instalados por `LensProxy`.

| Caso | Sin arreglo | Con arreglo |
|---|---|---|
| Cierra el watch upstream al desconectarse el cliente | FAIL (quedan 1 abierto) | PASS |
| 10 ciclos montaje/desmontaje sin acumulación | FAIL (quedan 10 abiertos) | PASS |
| El watch sigue abierto mientras el cliente está conectado, y se libera al cortar | FAIL (no se libera) | PASS |
| No interrumpe respuestas normales (no watch) | PASS | PASS |

Suites focalizadas: `src/main/lens-proxy`, `src/main/__test__/lens-proxy.test.ts` y `src/renderer/kube-watch-api`. Resultado: **7 suites, 60/60 PASS**.

### Electron DEV (perfil QA aislado, API sintética en 127.0.0.1:18443)

El mock cuenta **conexiones activas** (se descuentan al cerrarse el socket) separadas de las **iniciadas** (histórico).

**Modo clásico (flag OFF), 10 ciclos Deployments → Overview, medido en Overview:**

| Ciclo | Deployments activos: antes | Deployments activos: después | Total activos: antes | Total activos: después |
|---|---|---|---|---|
| 1 | 1 | 0 | 8 | 4 |
| 5 | 5 | 0 | 24 | 4 |
| 10 | **10** | **0** | **44** | **4** |

Antes, al final había Events 21, Nodes 11 y Deployments 10 abiertos sin consumidores. Después, los iniciados crecen de 1 a 10 (histórico) mientras los activos se mantienen: 1 con la vista montada, 0 sin ella.

**Host global (flag ON), con el arreglo:**

| Acción | Deployments activos | Total activos |
|---|---|---|
| Host montado | 1 | 4 |
| 10 arrastres izquierda/derecha | 1 (iniciados 11 → 21) | 4 |
| Agrupar como pestaña | 1 | 4 |
| 5 × (pestaña Pods / pestaña Deployments) | 0 / 1 alternando | 3 / 4 |
| Cerrar el panel Deployments | 0 | 3 |
| Pods (consumidor compartido) en toda la secuencia | 1 constante | — |

Datos al reabrir: cada montaje hizo un LIST nuevo (28 LIST para 28 montajes) antes del watch, y la vista cargó sin error. Con el flag OFF, Deployments clásico renderiza normalmente ("0 items": el mock no tiene objetos).

Limitación: el paso "extraer junto al grupo" no se ejecutó, porque el helper de QA no encuentra un panel que es pestaña inactiva. Ese movimiento ya se validó en H7.2 y no cambia nada del ciclo de watches.

## 5. Recursos

- Disco: 27 GiB libres al iniciar y 28 GiB al cerrar.
- Swap: 7,6 GiB al iniciar y 7,3 GiB al cerrar; no creció.
- RAM: 58 % libre al cerrar.
- Build único de `lens-app-main` (desarrollo): 20 s, 1,3 GB pico. Salió con los mismos 42 errores de tipos preexistentes.
- Una sola instancia Electron a la vez. Al cerrar: 0 procesos de QA y puertos 9191/9223/9229/18443 libres. Sin DMG ni ZIP.
- `packages/core/static/build/library/main.js` (gitignored) quedó como build de desarrollo con el arreglo.

## 6. Rollback

`git revert` del commit de H7.2.1. No hay datos persistidos ni formatos afectados.
