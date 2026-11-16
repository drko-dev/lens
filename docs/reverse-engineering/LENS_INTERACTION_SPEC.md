# Mirantis Lens 2026.11 — Especificación de Interacciones (Capa E)

Cada interacción documentada distingue su estado inicial, acción, transición observable, estado final y nivel de confianza (`CONFIRMED` | `INFERRED` | `UNKNOWN`).

| ID | Componente | Acción | Estado Inicial → Estado Final | Evidencia | Confianza |
|---|---|---|---|---|---|
| `INT-01` | **Workspace Tab** | 1 clic en recurso / enlace | Abre tab efímera (título en cursiva) que se reutiliza ante el siguiente 1 clic. | Release Notes + comportamiento `@lensapp/main-view` | `CONFIRMED` |
| `INT-02` | **Workspace Tab** | Doble clic en tab efímera | Convierte la tab en fija (quita cursiva; ya no es reemplazada). | Release Notes + `@lensapp/main-view` | `CONFIRMED` |
| `INT-03` | **Workspace Tab** | Drag de tab al borde del `MainView` | Crea un nuevo `tab-group` en Split Screen con divisor redimensionable (`main-view-groups-width-state`). | Release Notes + `lens.js` (`main-view-tab-groups`) | `CONFIRMED` |
| `INT-04` | **Workspace Tab** | Drag de tab fuera de la ventana | Dispara `main-view-tab-dragged-out-of-window` -> `spawn-sub-window` abriendo `BrowserWindow` con `sub-window.html`. | `main.js` + `lens.js` + `sub-window.html` | `CONFIRMED` |
| `INT-05` | **Navigator Context** | Clic en `<` junto al nombre de clúster | Regresa del Cluster Navigator al Root Navigator (`Home`, `Kubernetes Clusters`, `Extensions`). | `r8-2-navigator-lens.png` + `:9224` | `CONFIRMED` |
| `INT-06` | **Navigator Search** | Clic en lupa / `Cmd+P` | Abre selector rápido de clústeres/entidades sobre el Navigator. | `r8-2-navigator-lens.png` + `command-container` | `CONFIRMED` |
| `INT-07` | **Details Drawer & Dock** | Clic o activación de cualquier Dock Tab con Drawer abierto | El `Details Panel` (`@lensapp/drawer`) se cierra automáticamente al activar el Dock Tab. | Release Notes (`Details Panel and Dock Tabs`) + verificado | `CONFIRMED` |
| `INT-08` | **Table Search** | Clic en reloj / estrella / `.*` / `Aa` | Abre recientes/favoritos globales compartidos entre listas y clústeres; preserva flags Regex y Match Case por búsqueda. | Release Notes (`Recent and Favorite Searches`) | `CONFIRMED` |
| `INT-09` | **Preferences** | `Cmd+,` o menú `Lens > Preferences` | Abre `Preferences` como pestaña en `MainView` sin ocultar `Hotbar`, `Navigator` ni `StatusBar`. | `r12-lens-preferences-real.png` | `CONFIRMED` |
| `INT-10` | **App Single-Instance** | Lanzar segunda instancia con mismo `userData` | `enforce-single-application-instance` enfoca la ventana existente y cierra el segundo proceso. | `lens.log` (`:9224`) | `CONFIRMED` |
| `INT-11` | **Window Close / Quit** | `Shift+Cmd+W` / `Opt+Shift+Cmd+W` | Cierra la ventana activa (o todas las ventanas); en macOS `NSQuitAlwaysKeepsWindows: false`. | `Info.plist` + menú macOS `File` | `CONFIRMED` |
| `INT-12` | **Ask AI / Extension Prompt** | Extensión solicita respuesta de AI tool | Solicita aprobación explícita del usuario; corre como proceso visible en `StatusBar > Processes`; revocable en `Preferences > Extensions > Permissions`. | Release Notes (`Answers from Your AI Tool`) | `CONFIRMED` |
| `INT-13` | **YAML Diff / Revert** | Clic en Diff / Revert en `EditResource` | Compara draft vs original/live con `MonacoDiffEditor` y revierte cambios locales en 1 clic. | `app.asar` (`@lensapp/monaco-editor`) + paridad R11.9 | `CONFIRMED` |
