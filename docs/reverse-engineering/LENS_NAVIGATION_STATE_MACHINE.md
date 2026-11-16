# Mirantis Lens 2026.11 — Máquina de Estados de Navegación y Ventanas

```mermaid
stateDiagram-v2
    [*] --> Splash: app.whenReady()
    Splash --> RootShell: loadURL(https://lens.app:port) + start-window.js (V8 cache)

    state RootShell {
        [*] --> WelcomeAndReleaseNotes: Primer inicio / estado limpio
        WelcomeAndReleaseNotes --> PreferencesTab: Cmd+, o Lens > Preferences
        WelcomeAndReleaseNotes --> CatalogView: Browse Catalog / Kubernetes Clusters
        WelcomeAndReleaseNotes --> ExtensionsView: Extensions > Installed
        WelcomeAndReleaseNotes --> ClusterActive: Clic en Cluster (Navigator o Catalog)

        state ClusterActive {
            [*] --> ClusterOverview
            ClusterOverview --> ResourceList: Clic en Pods / Nodes / Workloads / etc.
            ResourceList --> DetailsDrawer: Clic en fila
            DetailsDrawer --> ResourceList: Escape / × / Clic fuera
            DetailsDrawer --> DockActive: Clic o activacion de Dock Tab (cierra Drawer)
            ResourceList --> DockActive: Logs / Edit / Terminal (+)
        }

        ClusterActive --> RootNavigator: Clic en "<" del Cluster Header
    }

    RootShell --> SplitView: Drag tab al borde o boton Split
    SplitView --> RootShell: Cerrar ultimo tab del grupo
    RootShell --> SubWindow: Drag tab fuera de ventana (spawn-sub-window -> sub-window.html)
    SubWindow --> RootShell: Cerrar sub-window o reintegrar tab
```

## Reglas Clave de Transición

1. **Sin desmontaje del shell raíz**: `TopBar`, `Hotbar`, `Navigator`, `WorkspaceTabBar` y `StatusBar` permanecen montados en `Welcome`, `Release Notes`, `Preferences`, `Extensions`, `Catalog` y vistas de clúster (`CONFIRMED` vía `r12-lens-preferences-real.png`, `r8-1-topbar-lens.png`).
2. **Navegación interna por tabs (`@lensapp/main-view`)**: `page.goto()` externo recarga la SPA; la navegación normal ocurre vía clicks/comandos internos que abren o seleccionan tabs en `main-view-tab-groups` (`CONFIRMED` en `:9224`).
3. **Subventanas (`sub-window`)**: Usan `sub-window.html` y canales `spawn-sub-window` / `dismiss-sub-window` / `retitle-sub-window` manteniendo el mismo bundle con V8 code cache (`CONFIRMED` en `main.js` + `app.asar`).
