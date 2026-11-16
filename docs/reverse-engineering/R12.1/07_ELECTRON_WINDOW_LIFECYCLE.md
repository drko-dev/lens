# R12.1 — Ciclo de Vida de Ventanas Electron (`application-window` & `splash`)

1. **Inicio (`before-electron-is-ready`)**:
   - `app-paths-setup-main:setup-app-paths` resuelve `userData` (`CICD` o `~/Library/Application Support/Lens`).
   - `enforce-single-application-instance` impide segundas instancias sobre el mismo `userData`.
   - `internal-proxy-main` genera certificado del proxy HTTPS interno y arranca `NetworkService` con `--host-resolver-rules=MAP lens.app 127.0.0.1`.
2. **Splash Window (`file://.../static/splash.html`)**:
   - Se muestra mientras inicia el servidor HTTPS interno y `first-application-window`; al renderizarse la ventana principal, se destruye `webContents for "splash"`.
3. **Ventana Principal (`first-application-window`)**:
   - Bounds guardados y restaurados desde `window-state-for-first-application-window.json` (`width`, `height`, `x`, `y`, `isMaximized`, `isFullScreen`, `displayBounds`).
   - Carga `https://lens.app:<puerto>/` -> `/start-window.js` -> `lens.js` con V8 Code Cache.
   - `View`/`Window > Minimize` (`Cmd+M`) minimiza (`AXMinimized: true`), restaurable desde Dock o Accessibility.
4. **Cierre y Reinicio**:
   - `NSQuitAlwaysKeepsWindows: false` en `Info.plist`; al cerrar/terminar persiste `persisted-state/main-view-feature` y `window-state-for-first-application-window.json`.
