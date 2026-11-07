# H9 — Roadmap de implementación integral: tema NovaKube + identidad Concepto A

**Fecha:** 2026-11-06
**Proyecto / rama:** lens-v6-ui-corrections / feature/h9-brand-identity
**Estado:** PLAN DE EJECUCIÓN, no confundir con implementación finalizada.
**Fuente original verificada:** /Users/gustavomarcon/Desktop/Identidad de marca/OpenLens_DevOps_Brand_Kit_v1.zip
**SHA-256 del ZIP:** 33471dcd7c15217769f2fbf4f230602b8d563f61f34d87ac76ec617c00480bfc
**Complemento:** PROMPT_MAESTRO_NOVAKUBE.md y H9_0_BRAND_IDENTITY_PLAN.md.

## Objetivo y decisiones

NovaKube será un **nuevo tema oscuro seleccionable en Settings**, usando la paleta oficial de Concepto A. NO reemplaza ni cambia el tema predeterminado Cursor. Mantener Midnight Graphite, Cursor Team, Dark y Light funcionales.

La **marca de aplicación** (logo en Welcome, splash, Dock, favicon, tray, iconos de instalador, About, etc.) es un segundo contrato visual: estos recursos pertenecen al ejecutable o a superficies compartidas, por lo que no cambian necesariamente al seleccionar NovaKube. Aplicar la marca Concepto A allí sólo cuando corresponda, sin confundirla con la preferencia de color.

Aprobado: hexágono abierto con cubo azul arriba y dos grises debajo, sin timón/engranaje. Wordmark OpenLens semibold y DevOps regular, tipografía Inter con fallback system-ui; no distribuir fuentes. Paleta oficial extraída de tokens/brand-tokens.json: fondo #12161B, app #161C23, superficie #242A31, raised #2C343D, hover #303943, borde #373D44, texto #D7DCE2 / #A8B2BF / #8C939B, acento #7792AC, foco #6E9CC6, healthy #65B996, warning #D2A65E, danger #D17B7F.

El color de **cada clúster** proviene del pin/configuración del clúster y nunca se sustituye por el acento NovaKube; mantener línea indicadora fina de 2 px donde esté implementada. Mantener contrastes WCAG AA (texto normal 4.5:1 cuando aplique, indicadores UI 3:1); si un color original no llega, adaptar sólo el tono funcional documentando la desviación, sin mutar el Brand Kit.

## Mapa de dependencias y secuencia obligatoria

H9-00 preflight → H9-01 assets → H9-02 tema registrado → H9-03 superficies y contenidos → H9-04 shell/íconos → H9-05 multi-clúster y multiventana → H9-06 QA → H9-07 paquete ARM64 → H9-08 aceptación/integración.

**Cada hito tiene una puerta de salida**: commit pequeño, pruebas focalizadas, captura auténtica cuando aplique, reporte de cambios y riesgos. No avanzar si la puerta falla o si la ejecución detecta trabajo simultáneo sin conciliar.

### H9-00 — Preflight, procedencia y línea base [P0] — PASS

Alcance: confirmar rama, git status y untracked preexistentes, checkpoints, H8.7 aprobado, SHA-256 del ZIP y 107 elementos de su manifiesto. Inventariar todas las rutas actuales de temas y branding. Clasificar cada referencia como «marca propia reemplazable», «icono de recurso/tercero intocable» o «tema configurable».

Rutas principales verificadas: packages/core/src/renderer/themes/, components/welcome/welcome.tsx, components/icon/, features/preferences/renderer/preference-items/appearance/, open-lens/static/splash.html, open-lens/package.json (build.mac.icon = build/icon.icns), packages/core/src/main/tray/menu-icon/, preferencias de iconos y ventanas detached. Buscar además About, favicon, cargadores, notificaciones, errores y documentación H8.7.

**Salida:** tabla de inventario antes/después, SHA de fuente, checkpoint. No editar fuentes ajenas ni borrar untracked. Medir disco: si menos de 18 GiB estables o el libre cae durante dos muestras separadas, no hacer build/packaging; las tareas de código y pruebas livianas pueden continuar. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-01 — Fuente única y assets oficiales [P0] — PASS

Importar, desde el ZIP real y con validación de rutas seguras, solamente variantes requeridas de svg/, png/, icons/ y tokens/brand-tokens.json. Mantener la estructura de fuente en un directorio canónico del proyecto y registrar SHA-256 por archivo; no copiar 107 recursos si sólo se usan 15. Evitar base64 inline, logos reconstruidos o assets duplicados innecesarios.

Asignar responsabilidades:
- marca in-app: svg/logo-mark-primary.svg, logo-horizontal-dark.svg, logo-horizontal-light.svg, logo-mark-micro.svg;
- app/instalador: icons/OpenLensDevOps.icns e .ico, PNG por tamaño;
- tray: icons/trayTemplate-16/18/20/22/24/32.png en los lugares que el pipeline de macOS realmente consume;
- favicon: icons/favicon.ico o micro SVG/PNG según el empaquetado actual.

**Salida:** manifest de asset → consumidor, hashes y comprobación visual a 16, 24, 32, 64, 128 y 512 px. No modificar aún el shell si no se identificó su fuente de verdad. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-02 — Tema oscuro NovaKube en selector nativo [P0] — PASS

Crear packages/core/src/renderer/themes/novakube.injectable.ts usando lensThemeDeclarationInjectionToken. Heredar un tema existente para cobertura de todos los LensTheme colors y terminalColors, pero sobreescribir exhaustivamente tokens visibles con los valores del JSON oficial. No crear un segundo motor de temas ni CSS variables globales incondicionales.

Nombre mostrado: **NovaKube**. Identificador estable no conflictivo (p. ej. openlens-devops-novakube-theme). isDefault: false. Persistir selección con el mecanismo existente de colorTheme y restaurar correctamente tras cold restart. Agregar selector body.theme-novakube a apply-lens-theme.injectable.ts y retirarlo al seleccionar cualquier otro; las clases de Cursor/Midnight Graphite deben seguir funcionando.

Mapear backgrounds, surfaces, text, borders, accents, botones, tablas, menús, formularios, headers, dock, modales, tooltips, logs, diagramas, scrollbar, badges y semánticos. Mapear también ANSI/terminal colors de lectura. Preservar envProduction/envStaging/envDevelopment y colores personalizados del usuario, no usar brand blue para estados críticos.

**Salida:** tests de registro, tema único predeterminado Cursor, cambio A→NovaKube→A sin contaminación CSS, persistencia y contraste. No reemplazar estilos del tema Cursor. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-03 — Coherencia visual de todos los componentes [P0] — PASS

Auditar con NovaKube activo: Welcome, catálogo de clústeres, buscador, pin/color de entorno, sidebar, navegación, cluster cards, Pods, Deployments, Events, detalles de recursos, Kubetail, split panels, Global Docking, tabs, context menus, popovers, dialogs, drawers, formularios, filtros, tablas, gráficos y terminal. Incluir **Centro de Documentación H8.7, Centro de Incidentes, Workbench IA, consentimiento y avisos de seguridad**.

Preferir variables del tema existentes y reglas scoped body.theme-novakube en un SCSS central importado por el renderer; evitar !important global, reglas que afecten temas distintos o hardcodes dispersos. Conservar densidad, tamaños de fuente, hover/focus, layout responsive y accesibilidad.

**Salida:** screenshots reales de pantalla por grupo y revisión de legibilidad/focus; comparación visual antes/después, incluyendo errores, loading, vacío, disabled, success, warning y critical. Sin cambios de navegación ni estructura funcional. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-04 — Branding de aplicación y shell [P1] — PASS

Aplicar el **logo Concepto A original** a las superficies de marca propias: Welcome/logo, cabecera donde corresponda, splash y loading, About, app Dock/Finder, icon.icns de macOS, config de electron-builder, favicon/touch icon, tray monocromático, iconos Linux/Windows donde el proyecto los soporte, ventanas desacopladas y documentación.

Si el archivo del producto es global (p. ej. Dock/instalador), la identidad queda global independientemente del tema; si un componente es theme-aware, seleccionar variante dark/light adecuada sin afectar la semántica.

Preservar productName, bundle identifier, appId, firma, rutas, instalador, credenciales y endpoints. No eliminar iconos oficiales de Kubernetes, Helm o marcas de terceros. Si las preferencias permiten escoger un icono de app, conservar la función y usar variantes correctas sin romper otras opciones.

**Salida:** auditoría de importaciones y paths, captura de splash/Welcome/About, microiconos legibles, compatibilidad macOS. NO empaquetar aún. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-05 — Multi-clúster, multiventana y restauración [P0] — PASS

Probar H7 Global Docking, separación/acoplamiento, tabs agrupadas, layout SplitPanel de Kubetail, persistencia LayoutV1, recuperación inerte y varias ventanas. Verificar que cada ventana, panel y tab respeta el **mismo clúster de origen y su color** (línea 2 px), aunque el acento global sea azul acero. Probar cambio de tema con ventana detached abierta, restauración tras reinicio y estados donde no hay clúster.

No modificar ownership de streams, APIs de PTY, lifecycle de Electron, permisos RBAC ni writes de Kubernetes. Preservar no reactivar streams y terminales en restauraciones inertes.

**Salida:** screenshots auténticos en dos clústeres con colores distintos y 1 ventana detached; assertions sobre invariantes de layout/clúster. Estado: **PASS** (documentado en H9_NOVAKUBE_DELIVERY.md).

### H9-06 — QA automatizado, contraste y revisión visual [P0]

- unit tests de registro, CSS variables, theme switching, persistencia, assets/imports y color por clúster;
- lint y typecheck focalizados, luego regresión H7/H8 relevante (incluir 443 tests previamente aprobados cuando el conjunto corresponda);
- Playwright con Electron **real**, HOME/KUBECONFIG/CICD sintéticos, --use-mock-keychain, clúster demo, sin IA externa, sin datos productivos;
- capturas por pantalla y tamaños; hashes únicos sólo donde se afirma diferencia;
- contraste y legibilidad en texto, focus, menús, tablas y badges; responsive sin degradar densidad.

**Salida:** reporte con PASS/PARTIAL/FAIL de cada requisito. No inventar resultados ni manipular DOM para aprobar pruebas.

### H9-07 — Preflight de disco y nuevo candidato empaquetado [P0]

**Bloqueo actual:** últimas mediciones del 06/11 rondan 8–9 GiB libres (96 % ocupado), insuficiente para iniciar otro build grande con seguridad. No ejecutar webpack/electron-builder/clean hasta comprobar espacio estable; objetivo operativo >=18 GiB antes de build (ajustar por medición real de consumo + margen). Evitar limpiar node_modules de dependencias, RC2 o datos personales.

Con autorización para crear el release candidate: usar solo un nuevo destino de artefactos, no overwrite RC2. Construir ARM64 real con H8.7 + NovaKube + marca, comprobar icon.icns adentro de .app, DMG/ZIP/checksums, instalación/descompresión y lanzamiento fuera del dev server. Ejecutar smoke en perfil sintético, confirmar menú Documentación F1, centro offline, temas, splash, tray, Dock, detach/redock, cold restart, incidentes y layout. No ejecutar firma/notarización productiva ni publicar.

**Salida:** candidato nuevo verificable con hashes SHA-256, logs, evidencia de app empaquetada y medición final de disco. Si el disco cae abruptamente, detener empaquetado y diagnosticar almacenamiento.

### H9-08 — Gate independiente, aceptación y limpieza [P0]

Revisión independiente de artefactos, tests, screenshots y ausencia de logos viejos en assets propios. Confirmar línea 2 px/color del pin, ausencia de impacto en H7/H8, restauración, tema revertible, Docs H8.7 y no modificación de recursos de terceros.

**Solo con autorización explícita:** merge fast-forward local, push remoto, release final o eliminación de RC2. Mantener checkpoint antes del merge. Retirar caches/temporales de QA finalizados luego de preservar evidencia requerida. No eliminar worktrees ni archivos sin seguimiento sin revisión.

**Salida final:** docs/h9/H9_NOVAKUBE_DELIVERY.md y checklist completo de branding, comandos realmente ejecutados, estado del candidate, espacio libre antes/después y pendientes.

## Matriz de aceptación al cierre

| Área | Evidencia requerida |
|---|---|
| Selectable theme | NovaKube aparece en Settings, guarda selección y revive tras reinicio |
| Existing themes | Cursor continúa default, Midnight Graphite/Cursor Team/Light/Dark sin regresiones |
| Brand assets | Hashes del ZIP y mapa de consumidores; logo exacto Concepto A |
| UI coverage | Welcome, navegación, recursos, Kubetail, panels, Docs, Incidentes, IA, modales, terminal |
| User safety | Contraste y estados semánticos; cluster stripe original de 2 px sin sobrescribir |
| Multiventana | Tema + iconos + cluster identity consistentes en detached/redock y restart |
| Test/QA | Jest + typecheck + Playwright real, sin DOM artificial ni clúster real |
| Packaging | Nuevo DMG/ZIP ARM64 con icono correcto, checksum, smoke fuera de DEV |
| Hygiene | RC2 preservado, Git y archivos untracked intactos; libre estable y medido |
| Integration | No push/merge hasta aprobación humana |

## Restricciones absolutas

No cambiar funcionalidad de Kubernetes (kubeconfig, RBAC, logs, Kubernetes resources), de terminal/PTYS, CI/CD, Global Docking, streams, restauración, incidentes ni IA. No modificar credenciales, Keychain real, perfiles reales o cluster PROD. No instalar fuentes binarias sin licencia. No usar logos nuevos generados por IA ni reimaginar el Concepto A. No dar por terminado un hito que sólo tiene implementación de código sin QA.

## Punto de partida actual

El ZIP aprobado ya está localizado y comprobado. **Tres archivos de trabajo extraídos** a packages/core/src/renderer/themes/novakube/: brand-tokens.json, logo-mark-primary.svg y logo-horizontal-dark.svg. Son trabajo local SIN SEGUIMIENTO creado durante la exploración; no borrar ni duplicar. El tema injectable, las reglas SCSS, el selector y el branding aún están pendientes. La rama H9 no debe mezclarse con develop sin autorización.
