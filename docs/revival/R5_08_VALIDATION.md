# OpenLens DevOps Revival — R5-08 Validation Evidence

## Reporte de Certificación y Evidencias Técnicas: Modernización de Catálogo y Pantalla de Bienvenida

- **Fecha:** 2026-10-22
- **Hito:** R5-08 (Modernización del catálogo y pantalla de bienvenida)
- **Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
- **Branch:** `feat/r4-workspace-security`
- **Base commit:** `1ca87d18e3ca6eba6a01b7c2ca864e21c9067712`
- **Build empaquetado:** `open-lens/dist-r5-stage/mac-arm64/OpenLens DevOps.app` (Mach-O arm64)
- **`app.asar` SHA-256:** `61b76d41e29e6a87fefb8f3fc619e1aa53724a0a97ddbf416105ad0c73193eb8`
- **Veredicto:** **DONE / CERTIFIED**

---

## 1. Resumen Ejecutivo y Objetivos Cumplidos

El hito **R5-08** moderniza el catálogo y la pantalla de bienvenida (Welcome) de OpenLens DevOps, convirtiendo el catálogo en el panel principal de control y observación para operadores de Kubernetes, garantizando la visibilidad inmediata de entornos y favoritos sin romper la arquitectura basada en inyección de dependencias ni los contratos de extensiones.

### Logros Principales:
1. **Catálogo como Centro de Operaciones:**
   - **Identidad visual clara:** Nombre/alias prominente con tooltip que exhibe el contexto de kubeconfig subyacente cuando difiere del alias.
   - **`EnvironmentBadge` integrado:** Columna dedicada que muestra el badge de entorno (`DEV`, `STG`, `PROD`, etc.) y avatar con el color temático configurado.
   - **Anillo de advertencia PROD estricto (`.prodMarker`):** Anillo perimetral rojo visible y destacado sobre el avatar del clúster en producción, independiente del color asignado por el usuario.
   - **Cero inferencia heurística:** PROD se determina exclusivamente por configuración explícita en `preferences.clusterEnvironment` o `spec.clusterEnvironment`. Clusters con "production" en el nombre del contexto o id no son tratados como PROD (verificado por tests negativos).
   - **Indicador de favoritos/hotbar:** Ícono de pin interactivo en cada fila que refleja y conmuta el estado de fijado al hotbar.
   - **Filtros en memoria (`CatalogFilters`):** Botones segmentados por entorno (`All`, `PROD`, `STG`, `DEV`, `TEST`, `LOCAL`, `CUSTOM`, `None`), filtro de fijados (`Pinned`) y botón visible "Add cluster". Estado 100% en memoria (no persistido en disco).
   - **Estado vacío con reset (`CatalogFilterEmpty`):** Vista amigable cuando ningún clúster cumple los filtros con botón "Show all".
2. **Pantalla de Bienvenida (Welcome) Modernizada:**
   - **Diseño sobrio y profesional:** Tipografía moderna basada en tokens de diseño Lens.
   - **Aclaración explícita de no auto-conexión:** `"Your local workspace for Kubernetes clusters. Nothing connects until you open a cluster."` visible permanentemente.
   - **Acciones directas:** Botones principales "Open catalog" y "Add cluster".
   - **Resumen local del workspace:** Métrica en tiempo real del conteo total de clústeres, fijados y badges por entorno disponible.
   - **Eliminación del Carousel prescindible:** Cuando hay 0 o 1 banner registrado, se renderiza directamente sin cargar controles de carrusel innecesarios.
   - **100% retrocompatible:** Preserva íntegramente los extension points `welcomeMenuItems`, `welcomeBannerItems` y `customCatalogCategoryColumnInjectionToken`.

---

## 2. Artefactos y Checksums SHA-256

| Componente | Ruta | SHA-256 |
| :--- | :--- | :--- |
| **macOS Executable** | `open-lens/dist-r5-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` | `902c5240292ff243a75877cba14ca15f79a9572b8bf5ceb15cb2aa22ae31a28a` |
| **`app.asar` Bundle** | `open-lens/dist-r5-stage/mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar` | `61b76d41e29e6a87fefb8f3fc619e1aa53724a0a97ddbf416105ad0c73193eb8` |
| **Reporte JSON E2E** | `docs/revival/R5_08_VERIFICATION.json` | `d6015560b7e424268e64c399a9a3b68078cfa8249fc31c8e9b8676dc4c5852f6` |

---

## 3. Matriz de Pruebas Unitarias y Estáticas

### Verificación Estática:
- **TypeScript:** `npx tsc --noEmit -p packages/core` $\rightarrow$ **0 errores**.
- **ESLint:** `npx eslint --max-warnings=0` en todos los componentes tocados y suites $\rightarrow$ **0 advertencias, 0 errores**.

### Cobertura de Suites Unitarias:
```bash
cd packages/core && npx jest --runInBand \
  src/renderer/components/catalog/__tests__/r5-08 \
  src/renderer/components/welcome/__tests__/r5-08
```

```
PASS src/renderer/components/welcome/__tests__/r5-08-welcome.test.tsx
  R5-08 Welcome modernization
    ✓ renders product name, purpose and no-autoconnect notice (1887 ms)
    ✓ triggers catalog and add-cluster navigation actions (19 ms)
    ✓ displays local workspace summary with cluster counts, pinned counts and environment badges (10 ms)
    ✓ renders a single banner directly without carousel (9 ms)
    ✓ preserves extension welcome menu items (12 ms)

PASS src/renderer/components/catalog/__tests__/r5-08-catalog-filters.test.tsx
  R5-08 catalog filters
    ✓ environment filter narrows rows and hides non-cluster entities (247 ms)
    ✓ pinned-only shows only hotbar entities (7 ms)
    ✓ controls drive state and Show all resets it (17 ms)
    ✓ add button calls onAddCluster (9 ms)

PASS src/renderer/components/catalog/__tests__/r5-08-catalog-presentation.test.tsx
  R5-08 catalog presentation
    ✓ shows PROD marker even with a non-red custom icon background (243 ms)
    ✓ has no PROD marker for development (8 ms)
    ✓ shows pin indicator when in hotbar (10 ms)
    ✓ exposes kubeconfig context in the name title when it differs (7 ms)
    ✓ renders status label (7 ms)

Test Suites: 3 passed, 3 total
Tests:       14 passed, 14 total
```

---

## 4. Certificación E2E con Playwright sobre Binario Real ARM64

Se ejecutó el arnés de pruebas automatizado `docs/revival/scripts/verify-r5-08-catalog-welcome.cjs` contra el binario empaquetado `OpenLens DevOps.app` levantando servidores sintéticos en loopback para 4 clústeres (`DEV`, `STG`, `PROD`, `LOCAL` con contexto con palabra "production").

### Fases Ejecutadas:
1. **Fase 1: Tema Oscuro (Dark Theme)**
   - Validación del aviso de no auto-conexión y botones de acción en Welcome.
   - Resumen del workspace verificado: 4 clústeres, 2 fijados, badges activos.
   - Navegación al Catálogo: verificación de barra de filtros, columna de entorno, avatares y pins.
   - **Garantía PROD:** Detección de exactamente 1 `.prodMarker` perimetral rojo en el clúster productivo. Confirmación de ausencia de `.prodMarker` en el clúster con nombre de contexto `minikube-production-local`.
   - Filtrado por `PROD`: aislamiento inmediato del clúster productivo.
   - Filtrado por `Pinned`: aislamiento de los 2 clústeres marcados en el hotbar.
   - Filtrado por `TEST`: activación del componente `CatalogFilterEmpty` con mensaje "No entities match the current filters." y botón "Show all" funcional.
2. **Fase 2: Tema Claro (Light Theme)**
   - Verificación de contraste y renderizado nativo de tokens CSS en pantalla Welcome.
   - Verificación de renderizado de la tabla de Catálogo con `lens-light`.

---

## 5. Galería de Evidencias Fotográficas

Todas las capturas se encuentran almacenadas en `docs/revival/evidence/r5-08/`:

| Evidencia | Descripción | Archivo |
| :--- | :--- | :--- |
| **Welcome (Dark)** | Pantalla de bienvenida modernizada en tema oscuro con resumen de workspace y aviso de no auto-conexión. | `welcome-dark.png` |
| **Welcome (Light)** | Pantalla de bienvenida en tema claro validando contraste y tokens. | `welcome-light.png` |
| **Catalog (Dark)** | Catálogo completo con barra de filtros, badges de entorno, anillo PROD y pins. | `catalog-all-dark.png` |
| **Catalog (Light)** | Catálogo completo en tema claro. | `catalog-all-light.png` |
| **Filtro PROD** | Vista del catálogo filtrada exclusivamente a clústeres de producción. | `catalog-filter-prod.png` |
| **Filtro Pinned** | Vista del catálogo filtrada exclusivamente a clústeres fijados en el hotbar. | `catalog-filter-pinned.png` |
| **Filtro Vacío** | Estado vacío informativo al filtrar por entorno sin clústeres asociados (`TEST`). | `catalog-empty-filters.png` |

---

## 6. Archivos Modificados / Creados

```
packages/core/src/renderer/components/catalog/resolve-entity-environment.injectable.ts
packages/core/src/renderer/components/catalog/catalog-filters/catalog-filter-state.injectable.ts
packages/core/src/renderer/components/catalog/catalog-filters/catalog-filters.tsx
packages/core/src/renderer/components/catalog/catalog-filters/catalog-filters.module.scss
packages/core/src/renderer/components/catalog/catalog-filters/index.ts
packages/core/src/renderer/components/catalog/catalog.tsx
packages/core/src/renderer/components/catalog/catalog.module.scss
packages/core/src/renderer/components/catalog/columns/kubernetes-environment.injectable.tsx
packages/core/src/renderer/components/catalog/columns/render-named-category-column-cell.injectable.tsx
packages/core/src/renderer/components/catalog/columns/default-category.injectable.tsx
packages/core/src/renderer/components/welcome/welcome.tsx
packages/core/src/renderer/components/welcome/welcome.scss
packages/core/src/main/getDiForUnitTesting.ts
packages/core/src/renderer/components/catalog/__tests__/r5-08-catalog-presentation.test.tsx
packages/core/src/renderer/components/catalog/__tests__/r5-08-catalog-filters.test.tsx
packages/core/src/renderer/components/welcome/__tests__/r5-08-welcome.test.tsx
docs/revival/scripts/verify-r5-08-catalog-welcome.cjs
docs/revival/R5_08_VERIFICATION.json
docs/revival/evidence/r5-08/
```

---

## 7. Estado del Espacio en Disco

- Espacio libre disponible tras el empaquetado: **~8.9 GiB**.
- Las pruebas utilizaron directorios temporales aislados en `$TMPDIR` con limpieza automática tras la finalización.
- No se han modificado ni sobreescrito los binarios de release protegidos en `releases/`.
