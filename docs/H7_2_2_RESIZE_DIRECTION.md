# H7.2.2 — Dirección del resize de los divisores

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Estado:** PASS (Electron DEV, suite Playwright H7)

## 1. Defecto

La suite Playwright (D09) detectó que arrastrar el divisor de una rama 200 px a la derecha **reducía** el panel izquierdo (576 → 230 px). Pasaba lo mismo en vertical. El defecto existe desde H1/H2 (`6680af2`) y afecta a todo layout renderizado con `DynamicLayoutRenderer`: el host global y el modo dinámico de Kubetail.

En H7.2 se había informado "Resize 50 % → 63,9 %" con eventos sintéticos, sin verificar la dirección.

## 2. Causa (verificada en el código de `ResizingAnchor`)

`packages/ui-components/resizing-anchor/src/resizing-anchor.tsx`:

- `onDrag` calcula `unboundedExtent = previousExtent + delta * growthDirection`.
- `growthDirection` tiene por defecto `ResizeGrowthDirection.BOTTOM_TO_TOP` (`-1`).
- `placement` solo agrega una clase CSS (`cssNames("ResizingAnchor", direction, placement)`) y **no interviene en el cálculo**.

`dynamic-layout-renderer.tsx` pasa como `extent` el tamaño del **primer** hijo, que crece cuando el divisor va a la derecha o hacia abajo, pero no indicaba `growthDirection`. El resultado era el signo invertido. El divisor clásico (`split-panel-layout.tsx`) ya usaba `LEFT_TO_RIGHT` y no estaba afectado.

Se verificó que `placement={ResizeSide.TRAILING}` **no** corrige el problema: con ese único cambio, los 5 tests de regresión siguen fallando con los mismos valores.

## 3. Corrección

`packages/core/src/renderer/components/split-panel/dynamic-layout-renderer.tsx`:

```tsx
growthDirection={isHorizontal ? ResizeGrowthDirection.LEFT_TO_RIGHT : ResizeGrowthDirection.TOP_TO_BOTTOM}
```

No se modificaron otros componentes. Los límites siguen a cargo de `updateBranchRatio` (`MIN_SPLIT_RATIO` 0,20 y `MAX_SPLIT_RATIO` 0,80).

## 4. Pruebas

**Unitarias:** `split-panel/__tests__/branch-divider-resize-direction.test.tsx`. Renderiza `DynamicLayoutRenderer` y arrastra el `ResizingAnchor` real con eventos de mouse.

| Caso | Sin arreglo | Con arreglo |
|---|---|---|
| Horizontal +200 px (ratio esperado 0,7) | FAIL (0,3) | PASS |
| Horizontal −100 px (0,4) | FAIL (0,6) | PASS |
| Vertical +120 px (0,65) | FAIL (0,35) | PASS |
| Vertical −80 px (0,4) | FAIL (0,6) | PASS |
| Límites 0,8 / 0,2 | FAIL | PASS |

Las 12 suites de `split-panel` (Kubetail, H2–H5, persistencia y seguridad) pasan: **110/110**.

**Playwright sobre Electron DEV** (`open-lens/integration/h7-docking-e2e.mjs`, perfil QA aislado y API sintética):

| ID | Verificación | Resultado |
|---|---|---|
| D09 | Derecha +200 px | PASS: Pods 576 → 778 px |
| D09 | Izquierda −300 px | PASS: 778 → 480 px |
| D09 | Límites | PASS: 80,0 % y 20,0 % de 1152 px |
| D09 | Vertical abajo +120 px / arriba −200 px | PASS: 393 → 509 → 305 px |
| K01 | Kubetail (modo clásico activo en el perfil QA) | PASS: panel izquierdo 665 → 812 → 658 px |
| S01 | Paso 6 exige que el panel superior crezca | PASS: 393 → 509 px |

Suite completa: **23 PASS, 0 FAIL, 13 NOT IMPLEMENTED (H7.3)**.

- H7.2: 16/16.
- H7.2.1: W01–W05, 5/5.
- 0 errores de consola nuevos. Los 44 registrados son del websocket HMR del dev server.

Limitación: en el perfil QA, Kubetail está en modo clásico. El modo dinámico de Kubetail usa el mismo `DynamicLayoutRenderer` que cubren D09 y el test unitario.

## 5. Recursos

- Disco: 28 GiB libres; swap ~5,8–6,1 GiB.
- Un build de `lens-app-renderer`: 17 s, 1,5 GB pico, con los mismos 42 errores de tipos preexistentes.
- Una sola instancia de Electron. Sin DMG ni ZIP. Al terminar no quedan Electron ni mocks.
