# R12.1 — Experimentos de Reinicio y Recuperación

## Experimento 1 — Persistencia de Pestañas y Geometría (`:9225`, Perfil QA Aislado)

1. **Estado inicial (Sesión 1)**: Arranque limpio en `1440x900` con tabs `["Welcome", "Release Notes"]`.
2. **Acciones**:
   - Menú `Lens > Preferences`: abre tab `Preferences` (`role="tab"`, 9 categorías `App` .. `External Tools`).
   - Menú `Window > Minimize`: `AXMinimized` pasa a `"true"`, luego restaurado a `"false"`.
   - Cierre controlado (`SIGTERM`) tras esperar persistencia.
3. **Verificación de disco**: Se crearon `window-state-for-first-application-window.json`, `persisted-state/main-view-feature/`, `lens-user-store.json`, `lens-cluster-store.json`, `Code Cache/`.
4. **Reinicio (Sesión 2)** con el mismo `CICD`/`HOME`:
   - **Recuperado (`CONFIRMED`)**: Ventana restaurada en `1440x900`; tabs restauradas `["Welcome", "Release Notes", "Preferences"]` junto con las 9 sub-tabs de Preferences.
   - **Bloqueado (`BLOCKED`)**: Pruebas interactivas de split/drag-out de tabs y activación de clústeres en vivo en perfil limpio quedaron detrás del modal `Welcome to Lens` (activación obligatoria de Lens Desktop), que no debe eludirse.
