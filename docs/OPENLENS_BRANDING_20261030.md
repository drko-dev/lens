# OpenLens DevOps — identidad visual y selector de iconos (30/10/2026)

Esta implementación es solo del código fuente OpenLens DevOps. No se modifica /Applications/Lens.app, la instalación oficial de Lens.

## Identidad aplicada

El icono macOS azul aprobado, con geometría original, está en open-lens/build/icon.icns. SHA-256: 727edb609f53833e029dbce50231cb596b36d2e573c2f828b44f4e8f678f7f98.

El catálogo incluye 11 presets: azul (predeterminado), grafito, inverso, negro, blanco, índigo, turquesa, verde, violeta, naranja y rojo. Imágenes en open-lens/static/branding/app-icons.

Origen maestro intacto: ~/Documents/OpenLens-DevOps-Identidad-Visual/OpenLens-DevOps-Identidad-Visual-APROBADA-20261029/.
Respaldo de recursos fuente previos: ~/Documents/lens/_backups/icon-source-before-approved-20261030/.

## Settings

Settings > Appearance > Application Icon muestra 11 variantes.
En macOS la selección cambia el Dock de ESTA aplicación; Finder usa el icono principal incluido durante el empaquetado. El identificador de selección se persiste en las preferencias y en openlens-appearance-icon.json, bajo el userData propio de OpenLens DevOps, para restaurar el Dock al iniciar.
IPC con ids aprobados y validación de origen del renderer (incluyendo puerto local dinámico).

No se editaron los recursos firmados de Lens. La edición libre por región (timón, engranaje, fondo, centro), las mezclas de 3/4 colores y la importación de diseños históricos son funcionalidades pendientes: no se deben declarar implementadas.

## Validación

Node 20.20.2; TypeScript Core PASS; build del monorepo 40 proyectos PASS; Jest Appearance 7/7 PASS.
Electron/Playwright aislado con 0 clusters: PARTIAL_PASS. Home superior único, Home lateral ausente, galería 11/11, cambio grafito Dock, preferencia persistida, restauración azul, rail 72px y sin overflow en tres resoluciones.
Evidencia: open-lens/qa/2026-10-30/application-icon-picker/electron-smoke.json.

Binario ARM64: open-lens/dist-stage-branding-picker-fixed-20261030/mac-arm64/OpenLens DevOps.app
SHA-256 app.asar: 4bb9081ff1cbbe58e8c414674df1295af0b1b8bf6edeb60ed0eb37ba00bced3c

Sin firma ni notarización de distribución. No es release.
Pendientes originales: UI-04 cluster pins drag/PROD, terminal reconnect, estabilidad y seguridad.
