# Mirantis Lens 2026.11 — Menús macOS y Atajos de Teclado

Extraído mediante `System Events` (`AXMenuItemCmdChar` / `AXMenuItemCmdModifiers`) sobre la instancia aislada de `/Applications/Lens.app` (`PID 90563`, `:9224`).

## 1. Menú macOS Exacto de Lens vs NovaKube

| Menú | Ítems en Mirantis Lens `2026.11.91422-latest` | Atajo en Lens | Estado en NovaKube `6.5.3-dev` |
|---|---|---|---|
| **Lens** | `About Lens`, `Check for Updates…`, `Preferences` (`Cmd+,`), `Services`, `Hide Lens` (`Cmd+H`), `Hide Others` (`Opt+Cmd+H`), `Show All`, `Quit` (`Cmd+Q`) | `Cmd+,`, `Cmd+H`, `Opt+Cmd+H`, `Cmd+Q` | NovaKube incluye además `Extensions` (`Cmd+Shift+E`) en el menú app. |
| **File** | `Close Window` (`Shift+Cmd+W`), `Close All` (`Opt+Shift+Cmd+W`) | `Shift+Cmd+W`, `Opt+Shift+Cmd+W` | NovaKube incluye `Add Cluster` (`Cmd+Shift+A`) (útil, pero diverge de Lens). |
| **Edit** | `Undo` (`Cmd+Z`), `Redo` (`Shift+Cmd+Z`), `Cut` (`Cmd+X`), `Copy` (`Cmd+C`), `Paste` (`Cmd+V`), `Delete`, `Select All` (`Cmd+A`), AutoFill, Dictation, Emoji | Estándar macOS | `MATCH` |
| **View** | `Toggle Hotbar` (sin atajo), `Command Palette…` (`Shift+Cmd+P`), `Back` (`Cmd+[`), `Forward` (`Cmd+]`), `Reload` (`Cmd+R`), `Actual Size` (`Cmd+0`), `Zoom In` (`Cmd++`), `Zoom Out` (`Cmd+-`), `Toggle Full Screen` (`Ctrl+Cmd+F`) | `Shift+Cmd+P`, `Cmd+[`, `Cmd+]`, `Cmd+R` | NovaKube tiene `Cmd+Shift+B` en `Toggle Hotbar` y conserva `Browse Catalog` (`Shift+Cmd+C`). |
| **Window** | `Minimize` (`Cmd+M`), `Zoom`, `Bring All to Front` | `Cmd+M` | `MATCH` |
| **Help** | `Welcome`, `Documentation`, `Release Notes`, `Premium Features`, `Support`, `Export Support Logs`, `Send Feedback`, `Restart in Safe Mode`, `License` | — | NovaKube tiene `Documentation`, `Release Notes`, `Export Support Logs`, `Restart in Safe Mode`. **Faltan**: `Welcome`, `Support`, `Send Feedback`, `License` en menú `Help`. |

## 2. Atajos Internos de Renderer (`KeyboardMouseShortcutListener`)

| Atajo | Acción en Lens | Equivalente NovaKube | Confianza |
|---|---|---|---|
| `Cmd+,` | Abre tab `Preferences` en `MainView` | Abre tab `Preferences` en `MainView` | `CONFIRMED` |
| `Shift+Cmd+P` | Abre `Command Palette` (`CommandDialog`) | `MATCH` | `CONFIRMED` |
| `Cmd+P` | Abre selector rápido de entidad/clúster (lupa del Navigator) | `ActivateEntityCommand` en `command-container.tsx` | `CONFIRMED` |
| `Escape` | Cierra diálogo/modal/popover/drawer activo | `MATCH` | `CONFIRMED` |
| `Cmd+W` (en Dock enfocado) | Cierra tab activa del Dock | `MATCH` (`dock.tsx`) | `CONFIRMED` |
| `Shift+Escape` (en Dock enfocado) | Minimiza el Dock | `MATCH` (`dock.tsx`) | `CONFIRMED` |
| `Ctrl+Period` / `Ctrl+Comma` (en Dock) | Cambia a tab siguiente / anterior del Dock | `MATCH` (`dock.tsx`) | `CONFIRMED` |
