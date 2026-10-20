# OpenLens DevOps Revival — Validación Hito R2-01
## Rediseño de pines, favoritos e identificación visual de clústeres

**Fecha:** 2026-10-19
**Rama:** `feat/openlens-devops-revival`
**Release:** `R2` — Productividad y experiencia de usuario
**Hito:** `R2-01`

---

## 1. Resumen Ejecutivo

- **Estado general de `R2-01`:** **APROBADO**.
- **Objetivo alcanzado:** Implementación de un sistema original, moderno y configurable de clasificación de entornos de clústeres, personalización visual de pines en la Hotbar y propagación persistente de advertencias operativas para clústeres de producción en toda la aplicación.
- **Diferenciación y seguridad:** A diferencia de soluciones propietarias o inferencias frágiles por nombre, la clasificación de entorno es explícita, persiste localmente en las preferencias de cada clúster y activa salvaguardas de seguridad en diálogos destructivos (eliminación, force-delete y desalojo).

---

## 2. Componentes Implementados

### A. Clasificación de Entornos (`ClusterEnvironment`)
- Archivo: [`packages/core/src/common/cluster/environment-types.ts`](../../packages/core/src/common/cluster/environment-types.ts)
- Tipos admitidos: `production`, `staging`, `development`, `testing`, `local`, `custom`, `none`.
- Metadatos por entorno: color por defecto, ícono Material, etiqueta (`label`), abreviatura corta para pines (`shortLabel`: `PRD`, `STG`, `DEV`, `TEST`, `LOC`, `CST`) y flag de seguridad `isProduction`.
- Para el entorno `custom`, el usuario puede ingresar un nombre libre (ej. `Sandbox`, `DR`, `DMZ`), derivando automáticamente un `shortLabel` de hasta 4 caracteres en mayúsculas.
- Función de seguridad `isProductionEnvironment()`: **nunca infiere producción únicamente por el nombre del contexto kubeconfig**.

### B. Extensión de Preferencias y Sincronización de Catálogo
- Archivo: [`packages/core/src/common/cluster-types.ts`](../../packages/core/src/common/cluster-types.ts)
  - Incorporación de `clusterEnvironment`, `customEnvironmentName` y `clusterAlias` a `ClusterPreferences`.
- Archivo: [`packages/core/src/main/cluster/update-entity-spec.injectable.ts`](../../packages/core/src/main/cluster/update-entity-spec.injectable.ts)
  - Espejado reactivo de las preferencias del clúster a los campos de la entidad del catálogo (`entity.metadata.name`, `entity.spec.environment`, `entity.spec.customEnvironmentName`).
  - Asignación de etiquetas estándar: `devops.openlens.dev/environment` y `devops.openlens.dev/production: "true"`.

### C. Personalizador Visual y Diálogo de Apariencia
- Archivos:
  - [`packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.tsx`](../../packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.tsx)
  - [`packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.module.scss`](../../packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.module.scss)
  - [`packages/core/src/renderer/components/cluster-settings/cluster-appearance-dialog.tsx`](../../packages/core/src/renderer/components/cluster-settings/cluster-appearance-dialog.tsx)
- Capacidades:
  - Tarjeta de vista previa en tiempo real (*Live Preview Card*) con avatar dinámico, indicador de producción o badge de entorno y subtítulo de configuración.
  - Grilla interactiva de selección de entorno con colores y descripciones.
  - Campo de alias visual (`clusterAlias`) para personalizar el nombre visible sin alterar el contexto de kubeconfig.
  - Paleta de 16 colores vibrantes predefinidos más selector HTML5 nativo para colores hex personalizados.
  - Catálogo de 16 íconos Material de DevOps (nube, hub, servidor, seguridad, cohete, terminal, capas, workstation, etc.) o iniciales de 2 letras.
  - Botón de restablecimiento a valores por defecto (*Reset to default*).

### D. Rediseño de Pines en la Hotbar (`HotbarEntityIcon`)
- Archivos:
  - [`packages/core/src/renderer/components/hotbar/hotbar-entity-icon.tsx`](../../packages/core/src/renderer/components/hotbar/hotbar-entity-icon.tsx)
  - [`packages/core/src/renderer/components/hotbar/hotbar-entity-icon.module.scss`](../../packages/core/src/renderer/components/hotbar/hotbar-entity-icon.module.scss)
- Mejoras visuales:
  - **LEDs de fase de conexión:** Verde para conectado, ámbar con animación de pulso (*pulse glow*) para conectando, gris para desconectado y rojo para fallos.
  - **Etiqueta de entorno en el pin:** Badge compacto en la esquina inferior del pin (`PRD`, `STG`, `DEV`, `TEST`, etc.).
  - **Anillo de advertencia de producción:** Aro perimetral rojo brillante cuando el clúster está en producción.
  - **Acceso rápido desde el menú contextual:** Opción *"Change Color, Icon & Environment..."* que abre directamente el diálogo de apariencia.

### E. Indicadores Persistentes de Seguridad y Alertas Destructivas
- Archivos:
  - [`packages/core/src/renderer/components/layout/sidebar-cluster.tsx`](../../packages/core/src/renderer/components/layout/sidebar-cluster.tsx)
  - [`packages/core/src/renderer/components/layout/sidebar-cluster.module.scss`](../../packages/core/src/renderer/components/layout/sidebar-cluster.module.scss)
  - [`packages/core/src/renderer/components/kube-object-menu/is-production-cluster.injectable.ts`](../../packages/core/src/renderer/components/kube-object-menu/is-production-cluster.injectable.ts)
  - [`packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx`](../../packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx)
  - [`packages/core/src/renderer/components/kube-object-menu/kube-object-menu.module.scss`](../../packages/core/src/renderer/components/kube-object-menu/kube-object-menu.module.scss)
- Salvaguardas operativas:
  - **Cabecera del Sidebar:** Borde lateral izquierdo rojo (`#EF4444`) con tinte translúcido de fondo, badge `⚠️ PRODUCTION` en mayúsculas y soporte para alias visual mostrando el contexto subyacente.
  - **Diálogos de Confirmación:**
    - Al eliminar un recurso en un clúster de producción: banner destacado con ícono de advertencia: `CAUTION: You are about to delete a resource in a PRODUCTION cluster!`.
    - Al forzar la eliminación de pods (`Force Delete` con `--grace-period=0`): banner crítico `CRITICAL: Force deleting in a PRODUCTION cluster may cause severe downtime!`.
    - Al desalojar pods (`Evict`): advertencia de precaución en producción.

---

## 3. Matriz de Pruebas Unitarias y de Regresión

Comando ejecutado:
```bash
export PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"
npm --workspace @openlens/core exec jest -- \
  src/common/cluster/__tests__/environment-types.test.ts \
  src/renderer/components/cluster-settings/__tests__/cluster-appearance-picker.test.tsx \
  src/renderer/components/layout/__tests__/sidebar-cluster.test.tsx \
  src/renderer/components/kube-object-menu/kube-object-menu.test.tsx \
  src/main/cluster/update-entity-spec.test.ts
```

| Suite de Pruebas | Casos | Estado | Cobertura |
| :--- | :---: | :---: | :--- |
| `environment-types.test.ts` | 6 | **PASS** | Mapeo de entornos, configuración custom, flags de producción y no-inferencia por nombre |
| `cluster-appearance-picker.test.tsx` | 5 | **PASS** | Botones de entorno, cambio a producción, alias visual, nombre custom y reset a defaults |
| `sidebar-cluster.test.tsx` | 5 | **PASS** | Renderizado general, avatar/nombre, menú contextual, badge `⚠️ PRODUCTION` y alias |
| `kube-object-menu.test.tsx` | 17 | **PASS** | Menú de objetos K8s, acciones de Pod, y banners de advertencia de producción en Delete y Force Delete |
| `update-entity-spec.test.ts` | 14 | **PASS** | Sincronización de preferencias a spec, etiquetas `devops.openlens.dev/*`, colores e íconos |

- **Total suites verificadas en R2-01:** `5 passed, 5 total`
- **Total tests verificados en R2-01:** `47 passed, 47 total`
- **Regresión completa combinada (R1 + R2-01):** `7 passed, 56 passed, 8 snapshots passed`

---

## 4. Verificación de Compilación y Empaquetado

1. **TypeScript Typecheck:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Resultado: **0 errores**.
2. **Build Completo del Monorepo:**
   - Comando: `npm run build`
   - Resultado: **40 proyectos compilados exitosamente**.
3. **Empaquetado macOS ARM64:**
   - Comando: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never -c.directories.output=dist-stage`
   - Destino: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - Resultado: **Compilación empaquetada con éxito (ad-hoc signing ARM64)**.
4. **Smoke GUI Automatizado con Playwright:**
   - Script: `docs/revival/scripts/smoke-r1-01.cjs` y `docs/revival/scripts/verify-r2-01.cjs`
   - Resultado: **Ejecución limpia, carga de catálogo aislada y preferencias validadas**.
   - Captura: `docs/revival/screenshots/r2-01-catalog-clusters.png`.

---

## 5. Criterios de Salida de R2-01

- [x] Clasificación por entorno configurable y persistida localmente.
- [x] Sin inferencia automática de producción basada únicamente en el nombre del contexto.
- [x] Personalización visual completa de pines (colores vibrantes, íconos Material, alias visual, badges).
- [x] Distinción visual inmediata de clústeres de producción en Hotbar, Sidebar y diálogos de confirmación destructiva.
- [x] Pruebas unitarias completas implementadas y aprobadas.
- [x] Empaquetado en `dist-stage` verificado con Playwright.
- [x] Sin regresiones en las funcionalidades de R1.
