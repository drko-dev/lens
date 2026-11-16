# Mirantis Lens 2026.11 — Tokens Visuales y Geometrías (Capa D)

Extraído en vivo mediante `getComputedStyle(document.documentElement)` y `getBoundingClientRect()` sobre Mirantis Lens `2026.11.91422-latest` en `1440x900` (`:9224`).

## 1. Tipografía y Espaciado Base

| Token / Propiedad | Valor Observado en Lens | Valor en NovaKube (`novakube.scss`) | Estado |
|---|---|---|---|
| `fontFamily` (`body`) | `"Open Sans", Helvetica, Arial, sans-serif` | `"Open Sans", "Helvetica", "Arial", sans-serif` | `MATCH` |
| `--font-terminal` | `Lucida Console, Monaco, Consolas, monospace` | Configurado en terminal theme | `MATCH` |
| `--font-size-big` | `calc(2 * 8px)` (`16px`) | `16px` | `MATCH` |
| `--font-weight-bold` | `500` | `500` | `MATCH` |
| `--border-radius` | `3px` | `3px` | `MATCH` |
| `--scrollbar-size` | `6px` | `6px` | `MATCH` |
| `--min-layout-header-height` | `calc(8px * 5.5)` (`44px`) | `40px` (`--main-layout-header`) | `PARTIAL` |
| `--vscode-sash-hover-size` | `4px` | `4px` | `MATCH` |

## 2. Paleta de Colores CSS (215 variables observadas en `:root`)

| Variable CSS | Valor Lens 2026.11 | Uso Principal |
|---|---|---|
| `--grey100` / `--mainBackground` / `--backgroundSecondary` | `#181A1C` | Fondo principal `MainView`, `Hotbar`, `DockHead`, `ItemList`, `InputControl`, `SelectMenu` |
| `--grey80` / `--tableHeaderBackground` / `--modalHeaderBg` / `--modalFooterBg` | `#1F2123` | `TopBar`, `StatusBar` (neutro), headers de tabla, modales |
| `--grey70` / `--grey40` / `--sidebarBackground` / `--modalContentBg` / `--colorVague` | `#26292B` | `Sidebar` / `Navigator`, contenido modal, radio active |
| `--grey60` / `--borderColor` / `--modalDividerColor` | `#2D2F31` | Bordes de `TopBar`, `Hotbar`, `StatusBar`, divisores |
| `--grey30` / `--sidebarLogoBackground` / `--select-menu-border-color` / `--columnResizerColor` | `#414348` / `#414448` | Bordes de inputs/selects, resizer, scrollbar `#414349` (hover `#64656a`) |
| `--grey20` / `--textColorPrimary` / `--modalSubtleHeaderColor` | `#AAACAE` | Texto primario de UI |
| `--grey10` / `--modalAccentColor` | `#F1F3F5` | Texto destacado / títulos |
| `--navHoverColor` | `#dcddde` | Hover en ítems del Navigator |
| `--navSelectedBackground` | `#262b2e` | Ítem seleccionado en Navigator |
| `--tableBgcSelected` / `--menuActiveBackground` / `--inputOptionHoverColor` | `#37383e` | Fila seleccionada / hover de menú |
| `--tableBgcStripe` | `#2a2d33` | Filas alternadas de tabla |
| `--logRowHoverBackground` | `#35373a` | Hover en filas de Logs |
| `--colorInfo` / `--linkColor` | `#3d90ce` | Acento azul primario, links, StatusBar conectado |
| `--success` / `--colorSuccess` | `#4caf50` / `#43a047` | Indicador conectado / éxito (`--successTint: rgba(76, 175, 80, 0.10)`) |
| `--warning` | `#ff9800` | Advertencias (`--warningTint: rgba(255, 152, 0, 0.10)`) |
| `--criticalTint` | `rgba(206, 57, 51, 0.10)` | Errores críticos |
| `--golden` / `--magenta` | `#ffc63d` / `#c93dce` | Badges / acentos |

## 3. Geometrías Exactas (`1440x900`, `dpr: 2`)

| Región | `x` | `y` | `width` | `height` | Notas |
|---|---|---|---|---|---|
| `TopBar` | `0` | `0` | `1440` | `49` | Traffic lights `0..80`, controles internos `x:80, y:8, w:1352, h:32` |
| `Hotbar` | `0` | `49` | `64` | `830` | `borderRight: 1px solid #2D2F31` |
| `<main>` | `64` | `49` | `1376` | `830` | Incluye `Navigator` (`248px`) + `WorkspaceTabBar`/`MainView` (`1128px`) |
| `Navigator Header` | `64` | `49` | `248` | `36` | Alineado horizontalmente con `WorkspaceTabBar` |
| `WorkspaceTabBar` | `312` | `49` | `1128` | `36` | Tabs de `36px` de alto |
| `StatusBar` | `0` | `879` | `1440` | `21` | `grid-template-columns: 1436px 4px`, `borderTop: 1px solid #2D2F31` |
