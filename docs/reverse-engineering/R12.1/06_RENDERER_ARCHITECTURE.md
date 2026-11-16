# R12.1-D — Arquitectura del Renderer (`static/build/lens.js`)

- **Bundle**: `app.asar::static/build/lens.js` (`31,488,146 B`), compartido por `application-window` (`index.html`) y `sub-window` (`sub-window.html`) mediante `static/start-window.js` + V8 Code Cache.
- **Sistema DI**: `@ogre-tools/injectable` (`getInjectable2`, `getInjectionToken`, `computedInjectManyInjectionToken`) + MobX (`action`, `computed`) + React.
- **Sin `<iframe>` por clúster**: Los clústeres, vistas globales, tabs, splits y Dock corren en el mismo árbol React del renderer principal (`@lensapp/root-layout`, `@lensapp/main-view`, `@lensapp/navigator`).

## Subsistemas Identificados en `lens.js` (`CONFIRMED`)

| Subsistema / Paquete | Rol en Renderer | Mecanismos / Tokens Observados |
|---|---|---|
| **`@lensapp/root-layout`** | Shell de ventana (`TopBar`, `Hotbar`, `<main>`, `StatusBar`) | CSS Modules atómicos + 215 CSS vars en `:root` |
| **`@lensapp/main-view`** | Tab groups, splits, tabs efímeras y drag-out a subventanas | `main-view-tab-groups`, `tab-groups-reactive`, `set-focused-tab-group-id`, `set-tab-as-not-ephemeral`, `main-view-tab-dragged-out-of-window`, `main-view-bottom-items`, `main-view-left-items` |
| **`@lensapp/navigator`** | Árbol unificado raíz + clúster con teclado (`tree`) | `focus-previous-node`, `focus-next-node`, `focus-child-or-open-node`, `focus-parent-or-close-node`, `open-node-context-menu-keyboard-shortcut` |
| **`@lensapp/keyboard-shortcuts`** | Shortcuts declarativos por scope DOM (`data-keyboard-shortcut-scope`) | `keyboard-mouse-shortcut-listener`, `invoke-shortcut`, `invoke-mouse-shortcut`, 36+ shortcuts dedicados |
| **`@lensapp/drawer` & `details-panel`** | Drawer de detalles de recursos y secciones extensibles | `@lensapp/kube-object-details-panel`, `@k8slens/details-panel-components`, cierra al activar Dock tab |
| **`@lensapp/table` & `item-object-lists`** | Listas virtualizadas de recursos + búsqueda global | `move-to-next-row-in-item-list-layout-keyboard-shortcut`, `trigger-entity-single/double-click` |
| **`@lensapp/preferences`** | Categorías y formularios reactivos | 9 categorías confirmadas en vivo (`App` .. `External Tools`) |
