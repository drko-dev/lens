# R12.1 — Almacenamiento, Persistencia y Sincronización de Estado

Observado directamente en perfil QA aislado `/tmp/lens-r12-1-qa/appdata/Lens` (luego eliminado tras captura de estructura) y canales IPC de `main.js`.

| Almacén en Disco (`userData`) | Formato | Responsabilidad Observada | Momento de Escritura / Lectura | Confianza |
|---|---|---|---|---|
| `persisted-state/main-view-feature/` | Directorio JSON/estado | Tabs abiertas, tab activa y `tab-groups` de `MainView` | Sincronizado vía IPC (`changes-of-state`, `state-snapshot-channel`); leído al arranque | `CONFIRMED` |
| `persisted-state/navigator-feature/` | Directorio estado | Estado de secciones y selección del Navigator | Leído/escrito por `navigator-feature` | `CONFIRMED` |
| `persisted-state/initial-navigator-expansion/` | Directorio estado | Expansión inicial del árbol | Primer arranque | `CONFIRMED` |
| `persisted-state/cluster-manager/`, `release-notes/`, `migrations/`, `machine-id/`, `telemetry-use-cases/` | Directorios por feature | Estado de migraciones, última versión de Release Notes vista, ID de máquina | Arranque / cambios de estado | `CONFIRMED` |
| `lens-local-storage-v2/entity-aggregator-main/` | Directorio estado | Índice agregado de entidades del catálogo | Actualización de entidades | `CONFIRMED` |
| `window-state-for-first-application-window.json` | JSON (`width`, `height`, `x`, `y`, `isMaximized`, `isFullScreen`, `displayBounds`) | Geometría y monitor de la ventana principal | Cambio de bounds / cierre / arranque | `CONFIRMED` |
| `lens-user-store.json` | JSON (`__internal__`, `preferences`) | Preferencias del usuario (`App`, `Terminal`, `Tables`, etc.) | Cambios en Preferences | `CONFIRMED` |
| `lens-cluster-store.json` | JSON (`__internal__`, `clusters`) | Registro de clústeres, colores, iconos, metadata | Sync kubeconfigs / settings | `CONFIRMED` |
| `Code Cache/` | V8 bytecode cache | Cache compilado de `lens.js` para arranque 2x más rápido | Primer arranque / carga de ventana | `CONFIRMED` |
| `window.localStorage` | Chromium Storage | Solo cookies de encuesta `refiner_cookie_uuid`, `refiner_first_seen` | Runtime | `CONFIRMED` |
