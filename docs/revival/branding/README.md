# OpenLens DevOps Revival — Identidad visual R6-02

**Autor del fork y de la nueva identidad:** Gustavo Marcon (2026).
**Base upstream:** OpenLens, licencia MIT; mantener avisos de copyright y atribuciones originales.

## Sistema visual

Isotipo: hexágono segmentado con cubo interior, alusión original a observabilidad, Kubernetes, contenedores y estabilidad. No reproducir literalmente el emblema de Lens upstream.

- Fondo nocturno `#0D1117`; superficie `#151B23`; panel elevado `#1D2633`
- Blanco cálido de lectura `#D3DCE6`; acento azul `#7196D2`; acento turquesa `#4FAFB0`
- Rojo PROD `#EF4444` reservado a la seguridad y **nunca sustituible** por estilo de marca.
- Tipografía de aplicación: stack nativo del sistema (`-apple-system`/San Francisco en macOS), **sin incorporar fuentes con licencia restrictiva**. Tipografía monoespaciada de editor/terminal no se modifica.
- Densidad Compact 33 px y Comfortable 42 px; no inflar tablas, filas ni paneles.

## Fuentes y variantes

- `openlens-devops-symbol.svg`: isotipo vectorial visible en interfaz y splash.
- `openlens-devops-app-icon.svg`: ícono oscuro redondeado (macOS Finder/Dock).
- `openlens-devops-wordmark-dark.svg` y `openlens-devops-wordmark-light.svg`: wordmarks editables con variantes de contraste.
- `openlens-devops-symbol-monochrome.svg`: versión de un solo color.
- `openlens-devops-tray.svg`: variante especialmente simplificada, sin colores de estado codificados, para template de barra de menú.
- `previews/app-icon-{16,24,32,64,128,256,512,1024}.png`: prueba de legibilidad por tamaño.
- `openlens-devops.icns`: resultado de iconutil para macOS. El código fuente es el SVG.

## Regeneración de recursos

Desde la raíz del repositorio, con Node 20, Sharp ya instalado, Pillow e iconutil del sistema:

```bash
node docs/revival/scripts/generate-r6-02-branding.cjs
cd open-lens
npm run build:tray-icons
```

El generador sobrescribe únicamente iconos del **árbol de trabajo** (`open-lens/build/`, `packages/core/build/icons/` y `open-lens/static/branding/`), **nunca** aplicaciones almacenadas en `releases/`.

Electron Builder usa `open-lens/build/icon.icns` en macOS, `icon.ico` en Windows y `build/icons/` en Linux. La barra de menú macOS usa archivos `trayIcon*Template.png` generados a partir del SVG monocromático; el estado de actualización se superpone con iconos de notificación existentes. Las imágenes binarias se pueden reconstruir desde SVG y script.

## Alcance de integración

Logo de aplicación (Dock/Finder), encabezado compacto, Welcome, splash, About y tray/menu bar. Son identidad de la herramienta, **no iconos de los clústeres ni de los recursos Kubernetes**. Los permisos, configuraciones explícitas de PROD, preferencias y controles operativos quedan sin cambios.

**Estado de prueba:** R6-02 experimental hasta aprobación; el checkpoint y la aplicación R5-09 permanecen protegidos.
