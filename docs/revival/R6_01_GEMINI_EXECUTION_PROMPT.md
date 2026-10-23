# GEMINI 3.8 — OPENLENS DEVOPS REVIVAL — EJECUTAR R6-01

## MISIÓN Y AUTORIDAD

Sos el ingeniero principal a cargo de **R6-01: Base visual segura Midnight Graphite**. Trabajá directamente en el Mac autorizado, con ejecución concreta, mínima investigación indispensable y tests dirigidos. No uses la estructura Opus/Sonnet/Haiku. Podés resolver problemas dentro del hito sin pedir permiso, pero **NO hagas commit ni push**, ni avances a R6-02. Al terminar, solicitá aprobación.

**Leé primero:** `docs/revival/R6_UI_UX_BRANDING_ROADMAP.md`, `docs/revival/R5_IMPLEMENTATION_PLAN.md` y `docs/revival/R5_09_VALIDATION.md`.

## BASE Y ESTADO EXISTENTE

- Repo: `/Users/gustavomarcon/Documents/lens/lens-r4`
- Rama activa esperada: `feat/midnight-graphite-branding`
- Base/HEAD esperado: `6012f4ac52da8c620d3fcae71d4fc406baa27081` (checkpoint R5-09).
- Release intacta y protegida: `/Users/gustavomarcon/Documents/lens/releases/R5-09/OpenLens DevOps.app`.
- SHA-256 esperado del `app.asar` protegido: `f6c55cb56db6326b60318b4c586f692809f45e5ec89ff6bbce426e011a0d595a`.
- Autor del fork: **Gustavo Marcon**. Mantener créditos, licencias y referencias upstream originales donde correspondan.
- Existen **modificaciones WIP reales sin commit** en la rama; NO las descartes ni hagas un checkout destructivo. Revisá `git status --short`, `git diff` y el contenido de archivos nuevos antes de intervenir.

**Punto crucial:** R5-09 es el breakpoint recuperable, NO el sitio donde trabajar. No modificar el commit, la rama histórica ni el bundle archivado. No mover de rama si detectás una desviación sin investigar.

## OBJETIVO DEL HITO

Completar el diseño de base **Midnight Graphite como un tema oscuro seleccionable en Preferences**, sin sustituir aún el tema predeterminado ni forzar el cambio a usuarios existentes. Debe transmitir modernidad, estabilidad y fiabilidad para trabajo día/noche.

Paleta orientativa aprobada:
- Fondo profundo `#0D1117`; paneles `#151B23`; superficies elevadas `#1D2633`.
- Texto `#D3DCE6`, secundario `#A2AEC0`.
- Azul acento `#7196D2`; turquesa `#4FAFB0`.
- PROD rojo de seguridad `#EF4444` **inamovible**; entornos basados exclusivamente en configuración explícita.

UX obligatoria, no decorativa: tablas Compact de **33 px** por defecto, Comfortable de 42 px opcional; alto volumen de filas visibles, menos scroll, controles compactos, búsqueda/filtros fáciles de encontrar. Priorizar densidad tipo DBeaver, no tablas enormes tipo Headlamp; sin dashboards sobrecargados de gráficos tipo Grafana. No usar neón, glassmorphism, reflejos ni sombras ostentosas.

## PASO 1 — AUDITORÍA Y CORRECCIÓN DE WIP (NO REIMPLEMENTAR)

Revisar los cambios ya iniciados:
- `packages/core/src/renderer/themes/midnight-graphite.injectable.ts`
- `packages/core/src/renderer/themes/active.injectable.ts`
- `packages/core/src/renderer/themes/apply-lens-theme.injectable.ts`
- `packages/core/src/renderer/components/midnight-graphite.scss`
- `packages/core/src/renderer/components/app.scss`
- `packages/core/src/renderer/components/icon/openlens-devops-logo.svg`
- `packages/core/src/renderer/components/icon/icon.tsx`
- `packages/core/src/renderer/components/welcome/welcome.tsx` y `welcome.scss`
- `packages/core/src/renderer/themes/__tests__/midnight-graphite.test.ts`
- `open-lens/package.json` (metadatos fork)

No sobreescribir arbitrariamente. Ya hubo una ejecución preliminar con 13 Jest dirigidos PASS y TypeScript limpio, **pero no hay build R6 certificada todavía**; verificar resultado de ESLint desde `packages/core`, pues correrlo desde la raíz falla por la ruta relativa de `license-header`. Corregir encabezados de archivos nuevos según licencia/estilo sin remover atribución. Revisar interacción con `body.theme-midnight-graphite`, selector de temas, autodescubrimiento de injectables y widgets del Dock.

El SVG provisional es un punto de partida para branding, **no un ícono completo y validado de macOS**. No alterar iconos finales del sistema/tray en R6-01: R6-02 cubre el branding integral.

## PASO 2 — REGLAS DE SEGURIDAD Y REVERSIBILIDAD

1. `Dark` y `Light` clásicos mantienen su resultado visual.
2. `Sync with computer` sigue usando el tema clásico para cada modo y no selecciona por accidente Midnight Graphite.
3. Elegir `Midnight Graphite` aplica la paleta nocturna, y elegir `Dark` / `Light` revierte todo sin residuos de variables/clases.
4. La clase CSS especial y las fuentes no cambian las dimensiones/cálculos de `VirtualList`, los menús ni el posicionamiento de overlays.
5. Variables `envProduction` / `envProductionSoft` y advertencias PROD quedan intactas; los colores no deben debilitar su contraste.
6. Conservar preferencias R5-09 (densidad y colores de entorno) y la sincronización de temas de ventanas desacopladas.
7. No modificar lógica de Kubernetes, Secrets/ConfigMaps, editor Monaco, PTY, RBAC, port-forward, estado de cluster o extensiones.

## PASO 3 — DISEÑO TÉCNICO ACOTADO

- Usar tokens de `LensTheme`, CSS/SCSS variables y DI existentes; no introducir framework visual ni nueva dependencia.
- Tipografía contemporánea de sistema y escala consistente; **no añadir ni redistribuir tipografías sin comprobar licencias**.
- Densidad, jerarquías, bordes y fondos funcionales; no cambiar la identidad/proporciones a lo ancho de toda la aplicación de una sola vez.
- Corregir problemas observables de contraste o de reutilización del SVG, si aparecen.
- Integrar reversión del branding en Welcome cuando el tema no es Midnight Graphite.
- Evitar efectos colaterales en tests y modificaciones ajenas.

## PASO 4 — VERIFICACIÓN CON COSTO CONTROLADO

Usar Node 20 disponible en `$HOME/.nvm/versions/node/v20.20.2/bin`. Ejecutar:
- `tsc --noEmit` para `packages/core`.
- ESLint **dirigido desde `packages/core`**.
- Jest dirigido: tests nuevos Midnight Graphite, tema/preferencias, guard PROD, densidad, Welcome si afectado.
- Al menos un test o verificación que demuestre selección/reversión Dark/Light/Sync with computer de forma determinística. No depender solo de un test de declaración de tema.
- `git diff --check`; excepciones legítimas de snapshots solo si aparecieran.

Si la integración resulta estable, crear **una sola build ARM64 experimental** fuera de `releases/R5-09/` (por ejemplo staging `dist-r6-01-stage`), únicamente si hay espacio suficiente. Smoke Playwright con perfil aislado y clústeres sintéticos o pantalla Welcome/Preferences: comprobar paleta al seleccionar, volver al clásico, densidad y advertencia PROD. No tocar clústeres reales ni abrir una app en uso.

Si falta una herramienta para empaquetar, no declarar éxito E2E ficticio: registrar blocker con evidencia real y entregar el código/test verificable.

## PASO 5 — DOCUMENTAR Y DETENERSE

Crear `docs/revival/R6_01_VALIDATION.md`, capturas seleccionadas en `docs/revival/evidence/r6-01/` si las generás, y actualizar `docs/revival/R6_UI_UX_BRANDING_ROADMAP.md` a R6-01 DONE solo si el hito cumple realmente. No agregar cientos de capturas o logs.

Informe final breve con: archivos tocados, paleta/tema y reversión, compatibilidad Dark/Light, tema de sistema, PROD, 33/42 px, resultados TypeScript/ESLint/Jest/Playwright, evidencia y ruta/hash de build si existiera, HEAD/branch, espacio libre y defectos concretos.

**PROHIBIDO:** `git clean`, `reset --hard`, rebase/force checkout, `git add .`, sobrescribir R5-09, commit, push, reemplazar iconos nativos en esta fase o comenzar R6-02.

**Comenzá R6-01 ahora. Entregá el informe y esperá autorización para commit.**
