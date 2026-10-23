# OpenLens DevOps Revival — R6-01 Validation Evidence

## Reporte de Certificación y Evidencias Técnicas: Base Visual Segura Midnight Graphite

- **Fecha:** 2026-10-22
- **Hito:** R6-01 (Midnight Graphite — Base visual segura)
- **Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
- **Branch:** `feat/midnight-graphite-branding`
- **Base commit (checkpoint R5-09):** `6012f4ac52da8c620d3fcae71d4fc406baa27081`
- **Build experimental de validación:** `open-lens/dist-r6-01-stage/mac-arm64/OpenLens DevOps.app` (Mach-O arm64)
- **`app.asar` SHA-256 (R6-01 stage):** `ec7b330f5603be81ced445a1ecfe7bd8e3a80696b319a08b2fb2e731a9a4503b`
- **Build protegida R5-09 (intacta):** `/Users/gustavomarcon/Documents/lens/releases/R5-09/OpenLens DevOps.app` (`app.asar`: `f6c55cb56db6326b60318b4c586f692809f45e5ec89ff6bbce426e011a0d595a`)
- **Veredicto:** **DONE / VALIDATED (Awaiting commit authorization)**

---

## 1. Resumen Ejecutivo y Objetivos Cumplidos

El hito **R6-01** establece la nueva base visual profesional **Midnight Graphite** como un tema oscuro *opt-in* (seleccionable en Preferences > App > Theme), diseñado para jornadas operativas diurnas y nocturnas sin fatiga ocular ni efectos visuales estridentes.

### Logros Principales:

1. **Tema Midnight Graphite Seleccionable (Opt-In):**
   - Registrado como injectable desacoplado (`packages/core/src/renderer/themes/midnight-graphite.injectable.ts`) con el injection token `lensThemeDeclarationInjectionToken`.
   - Aparece automáticamente en el selector de temas de Preferences sin sustituir el tema clásico predeterminado ("Dark").
   - Paleta aprobada integrada: fondo profundo `#0D1117`, paneles `#151B23`, superficies `#1D2633`, texto `#D3DCE6`, acento azul `#7196D2`, turquesa `#4FAFB0`.
   - **PROD Safety Guard Estricto:** Producción estrictamente bloqueada en rojo de seguridad `#EF4444` no sobreescribible.

2. **Reversibilidad Limpia y Compatibilidad con Clásicos:**
   - La selección de **Midnight Graphite** aplica la clase `.theme-midnight-graphite` en `document.body` y mapea los tokens de variables CSS.
   - La vuelta a **Dark** revierte limpiamente el fondo a `#1e2124`, el acento a `#3d90ce`, y remueve `.theme-midnight-graphite` de `document.body` sin residuos ni contaminación de estilos.
   - La selección de **Light** aplica correctamente `.theme-light` y `#f1f1f1`.
   - **Sync with computer** preserva la resolución determinística hacia los temas clásicos ("Dark" cuando el sistema es oscuro, "Light" cuando es claro), evitando activar por error Midnight Graphite.

3. **UX de Operador y Densidad Preservada:**
   - Las dimensiones de tabla Compact (33 px por defecto) y Comfortable (42 px opcional) se mantienen intactas y alineadas con `VirtualList`.
   - Sin alteraciones a la lógica de Kubernetes, Monaco editor, terminales PTY, RBAC, port-forwards ni ventanas desacopladas (detached tool windows).

4. **Branding Condicional en Welcome:**
   - Se incorpora el nuevo SVG vectorial de identidad (`openlens-devops-logo.svg`) registrado en el catálogo de iconos (`icon.tsx`).
   - Reversión visual automática: mientras el tema activo sea clásico (Dark/Light), Welcome muestra el isotipo clásico (`.classic-brand`). Cuando se activa Midnight Graphite, Welcome muestra el logotipo de OpenLens DevOps (`.devops-brand`).

5. **Identidad del Fork y Licencias:**
   - Metadatos en `open-lens/package.json` actualizados con el autor **Gustavo Marcon** y mención clara al fork independiente, manteniendo el copyright original © 2024 OpenLens Maintainers y licencia MIT.

---

## 2. Artefactos y Checksums SHA-256

| Componente | Ruta | SHA-256 |
| :--- | :--- | :--- |
| **macOS Executable (R6-01 Stage)** | `open-lens/dist-r6-01-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` | `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075` |
| **`app.asar` Bundle (R6-01 Stage)** | `open-lens/dist-r6-01-stage/mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar` | `ec7b330f5603be81ced445a1ecfe7bd8e3a80696b319a08b2fb2e731a9a4503b` |
| **Reporte JSON E2E** | `docs/revival/R6_01_VERIFICATION.json` | `56efaa16e50b7e4ef4253457a12a5fc22791cfb54bbd72d2e26e25dc7d7e79c3` |
| **Build Protegida R5-09 (Intacta)** | `/Users/gustavomarcon/Documents/lens/releases/R5-09/OpenLens DevOps.app/Contents/Resources/app.asar` | `f6c55cb56db6326b60318b4c586f692809f45e5ec89ff6bbce426e011a0d595a` |

---

## 3. Matriz de Pruebas Unitarias y Estáticas

### Verificación Estática:
- **TypeScript:** `npx tsc --noEmit` en `packages/core` $\rightarrow$ **0 errores**.
- **TypeScript:** `npx tsc --noEmit` en `open-lens` $\rightarrow$ **0 errores**.
- **ESLint:** `npx eslint --max-warnings=0` en todos los archivos modificados $\rightarrow$ **0 advertencias, 0 errores**.
- **Git diff whitespace:** `git diff --check` $\rightarrow$ **0 advertencias**.

### Cobertura de Suites Unitarias Específicas:
```bash
cd packages/core && npx jest \
  src/renderer/themes/__tests__/apply-environment-colors.test.ts \
  src/features/preferences/renderer/preference-items/appearance/__tests__/appearance-preferences.test.tsx \
  src/renderer/components/table/__tests__/table-density.test.tsx \
  src/common/__tests__/user-store.test.ts \
  src/renderer/themes/__tests__/midnight-graphite.test.ts \
  src/renderer/components/welcome/__tests__/r5-08-welcome.test.tsx \
  src/common/detached-tools/__tests__/detached-theme.test.ts \
  src/main/detached-tool-windows/__tests__/detached-theme-ipc.test.ts
```

**Resultados Unitarios (8 suites, 59 tests PASS):**
- `midnight-graphite.test.ts`: **4/4 PASS** (registro no sustitutivo, paleta y PROD guard intacto, resolución determinística activa y system-sync, aplicación y reversión limpia en DOM sin residuos).
- `r5-08-welcome.test.tsx`: **6/6 PASS** (incluye renderizado condicional de iconos classic-brand y devops-brand).
- `apply-environment-colors.test.ts`: **4/4 PASS** (cálculo rgba, PROD guard estricto, limpieza de CSS vars).
- `appearance-preferences.test.tsx`: **7/7 PASS** (metadata, compact por defecto, switch comfortable reactivo, colores de entorno, borrador hex).
- `table-density.test.tsx`: **3/3 PASS** (compact 33px, comfortable 42px, VirtualList prop forwarding).
- `user-store.test.ts`: **4/4 PASS** (persistencia y migraciones).
- `detached-theme.test.ts`: **26/26 PASS** (sanitizador de colores para ventanas desacopladas).
- `detached-theme-ipc.test.ts`: **5/5 PASS** (broadcasting y aislamiento de temas desacoplados).

---

## 4. Validación E2E con Playwright sobre Build Empaquetada

Ejecutado con:
```bash
node docs/revival/scripts/verify-r6-01-midnight-graphite.cjs
```

**Resultados E2E (7/7 Checks PASS):**
1. `initialThemeClassicDark`: El perfil arranca en tema clásico Dark; sin clase `theme-midnight-graphite` y con isotipo clásico visible en Welcome.
2. `midnightGraphiteSelected`: Se selecciona Midnight Graphite en el selector de Preferences; el DOM adquiere `.theme-midnight-graphite`, `--mainBackground` pasa a `#0D1117`, `--contentColor` a `#151B23`, `--primary` a `#7196D2`, y `--envProduction` retiene `#EF4444`.
3. `devopsBrandLogoVisible`: Al navegar a Welcome con Midnight Graphite activo, `.classic-brand` se oculta (`display: none`) y el nuevo logo `.devops-brand` se muestra visible (`display: inline-flex`).
4. `tableDensityCompactDefault`: Preferences > Appearance conserva la densidad compacta (33px) predeterminada.
5. `prodGuardActive`: Indicador de Producción bloqueada (`data-testid="prod-locked-indicator"`) visible y no editable.
6. `revertedToClassicDark`: Al volver a seleccionar Dark, `.theme-midnight-graphite` se retira de `document.body` y los estilos vuelven al valor clásico (`#1e2124`, `#3d90ce`) sin residuos.
7. `classicLightWorking`: Al seleccionar Light, se activa `.theme-light` y `#f1f1f1` de forma inmediata.

---

## 5. Evidencias Gráficas Capturadas

Las capturas generadas se encuentran archivadas en `docs/revival/evidence/r6-01/`:

| Archivo | Contenido |
| :--- | :--- |
| `00-initial-welcome-classic.png` | Pantalla Welcome con tema clásico Dark activo y logo original |
| `01-preferences-midnight-graphite.png` | Preferencias con Midnight Graphite seleccionado y paleta `#0D1117` aplicada |
| `02-welcome-midnight-graphite.png` | Pantalla Welcome con Midnight Graphite activo y nuevo logo OpenLens DevOps |
| `03-appearance-midnight-graphite.png` | Pestaña Appearance con densidad compacta 33px y PROD safety guard |
| `04-reverted-classic-dark.png` | Reversión limpia a tema clásico Dark sin residuo de variables ni clases |
| `05-classic-light.png` | Switch a tema clásico Light funcionando con normalidad |

---

## 6. Estado de Git y Reglas de Cierre

- **Rama:** `feat/midnight-graphite-branding`
- **HEAD Commit:** `6012f4ac52da8c620d3fcae71d4fc406baa27081` (R5-09 checkpoint)
- **Modificaciones pendientes de commit:** 12 archivos auditados y validados.
- **Commit:** **PENDIENTE DE AUTORIZACIÓN EXPLICITA** (cero commits automáticos).
- **Push:** **ESTRICTAMENTE PROHIBIDO / CERO PUSH**.
- **Espacio en disco disponible:** 17 GiB.
