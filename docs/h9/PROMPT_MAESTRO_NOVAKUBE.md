# PROMPT MAESTRO — H9 NovaKube, identidad de marca y tema completo

## Rol y misión

Actuá como responsable de diseño de producto y desarrollo senior Electron 45 / React / TypeScript / CSS/SCSS / Playwright en el proyecto OpenLens DevOps. Tu misión es **implementar correctamente un tema nuevo llamado NovaKube y la identidad visual Concepto A en toda la aplicación**, siguiendo hitos con validación antes de avanzar. Debe quedar integrado en código real, usable, reversible y verificable, no en una maqueta ni en un reporte declarativo.

Tu fuente de trabajo es el repositorio existente; no crees un proyecto desde cero, no utilices plantillas ajenas y no reemplaces el tema Cursor.

## Lecturas iniciales obligatorias

1. GEMINI.md en la raíz del proyecto.
2. docs/h9/H9_NOVAKUBE_ROADMAP.md (**plan de ejecución y gates obligatorios**).
3. docs/h9/H9_0_BRAND_IDENTITY_PLAN.md (restricciones de marca).
4. docs/h9/H9_PREBUILD_HOME_DISK_CLEANUP_2026-11-06.md (riesgos de espacio).
5. docs/h8/H8_7_FINAL_ACCEPTANCE_INDEPENDENT_2026-11-06.md y H8.7 user guide (no romper documentación).
6. /Users/gustavomarcon/Desktop/Identidad de marca/PROMPT_IMPLEMENTACION_OPENLENS_DEVOPS.md.
7. ZIP original: /Users/gustavomarcon/Desktop/Identidad de marca/OpenLens_DevOps_Brand_Kit_v1.zip.

Trabajá exclusivamente en el repositorio /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections y en la rama feature/h9-brand-identity. Confirmá HEAD, estado y untracked antes de modificar.

**El ZIP aprobado contiene 107 entradas y su SHA-256 es:**
33471dcd7c15217769f2fbf4f230602b8d563f61f34d87ac76ec617c00480bfc

El ZIP tiene los directorios svg, png, icons, tokens y preview. Sólo preview es material visual de referencia; los originales vienen de svg/png/icons/tokens. No recrear el símbolo ni transformar su geometría.

**Logo obligatorio:** Concepto A — hexágono abierto, cubo azul arriba, dos grises abajo. No timón, no engranaje ni copia del símbolo oficial de Kubernetes.

## Contratos de comportamiento

- NovaKube aparece como **nuevo tema oscuro seleccionable** en Settings → Appearance, sin modificar el tema predeterminado actual Cursor. Mantener Midnight Graphite y todos los demás temas.
- Al elegir NovaKube, el color se aplica en todas las vistas (incluidos Documentación H8.7, Centro de Incidentes, Workbench, paneles, modales y terminal); el selector persiste y reaplica tras reiniciar. Cambiar a otro tema no deja residuos de NovaKube.
- La marca propia de aplicación (íconos Dock/Finder, splash, About, tray, branding global, instalador) usa Concepto A como identidad única. **No confundir tema seleccionable con iconos de app**: el icono del Dock no cambia dinámicamente al seleccionar el tema, salvo que el producto ya tenga tal característica explícita.
- Preservar variantes/selector de icono de aplicación que ya existan. No cambiar appId, bundle ID, productName, firma, rutas de usuario ni endpoints.
- Color configurado en pin de cada clúster: **nunca sustituirlo por azul de marca**. Preservar indicador de 2 px, incluidas tabs, contenedores y detached windows.
- Mantener compatibilidad H7/H8: Global Docking, Kubetail, SplitPanel, detach/redock, LayoutV1/restauración inerte, terminal PTY, RBAC, streams, Logs, Workloads, Incidentes, scanner sintético y Diagnóstico IA. Cambiar sólo presentación y assets con tests adecuados.
- No ejecutar escrituras sobre clústeres reales, no acceder a kubeconfigs personales ni Keychain real, no llamar a proveedores de IA externos, no crear DOM falso para engañar el QA.
- No hacer push, merge, publicación, firma/notarización productiva ni eliminar instalador RC2 sin autorización explícita.
- Preservar todo lo no rastreado, checkpoints, commits, evidencia, perfiles reales, caches activas y los directorios de usuario ajenos al proyecto.

## Tokens: usar Brand Kit como única fuente

Leer tokens/brand-tokens.json original. Valores principales esperados:

Fondo #12161B; fondo app #161C23; superficie #242A31; raised #2C343D; hover #303943; borde #373D44; texto primario #D7DCE2; secundario #A8B2BF; muted #8C939B; acento #7792AC; focus #6E9CC6; Healthy #65B996; Warning #D2A65E; Danger #D17B7F; Info #7792AC.

Inter con fallback system-ui (no incluir fuentes sin licencia); OpenLens semibold + DevOps regular. Sin blanco puro, neón ni azul eléctrico. No usar color de marca para estados críticos.

Usar el **sistema de temas existente**, no montar un segundo CSS root. El proyecto declara temas mediante lensThemeDeclarationInjectionToken y los selecciona por nombre con lensThemesInjectable; el applyLensTheme publica colores CSS en camelCase y kebab-case, y usa clases body.theme-*. Crear un único novakube.injectable.ts en packages/core/src/renderer/themes/ con isDefault false, registro de DI, terminalColors y tests. Agregar theme-novakube con limpieza al cambiar.

Los tres archivos ya copiados a packages/core/src/renderer/themes/novakube/ (brand-tokens.json, logo-mark-primary.svg, logo-horizontal-dark.svg) proceden del ZIP y son trabajo local sin seguimiento. **Reutilizalos y verificá hashes; no eliminarlos ni duplicarlos por error**.

## Hitos a ejecutar, en este orden

### H9-00 — Preflight

Leer plan y realizar inventario real de branding. Documentar exactamente qué rutas son propias de OpenLens DevOps, cuáles son de Kubernetes o terceros y cuáles son assets de solo lectura. Comprobar git status, activos/procesos y espacio libre. Crear checkpoint antes de tocar iconos globales. **Gate:** inventario + matriz de riesgos + hashes comprobados.

### H9-01 — Design System / Asset Pipeline

Importar únicamente recursos oficiales que se consumen. Centralizar variantes necesarias SVG, PNG, ICNS, ICO y favicon/tray, con SHA-256. No regenerar logo. Vincular tokens del JSON original al tema, sin hardcodes inconsistentes. Verificar tamaño pequeño: 16/24/32 y 64/128/512. **Gate:** lista completa de consumidores, integridad de assets.

### H9-02 — NovaKube seleccionable

Implementar el tema mediante DI, isDefault false, terminalColors, registro sin duplicados, CSS body.theme-novakube y su desactivación al cambiar a Cursor. Mapear texto/superficie/borde/acento/estado/hover y clases de compatibilidad. Probar Settings → Appearance, persistencia, cold restart y reversibilidad. **Gate:** tests + capturas reales de selector; ningún tema anterior roto.

### H9-03 — Integración visual funcional

Con NovaKube activo recorrer Welcome, Catálogo, Pods, Deployments, Events, Resource Details, Kubetail, Global Docking, editor, terminal, filtros, tablas, tabs, overlays, tooltips, modales, Centro de Documentación, Incidentes, Workbench y consentimiento. Corregir casos con hardcodes visuales **scoped al tema**. Incluir estados vacíos, error, warning y disabled. **Gate:** matriz de pantallas y screenshots reales, contraste WCAG AA.

### H9-04 — Identidad del shell y aplicativo

Actualizar logo/wordmark propios en Welcome, splash, About y otras cabeceras pertinentes; Dock de macOS, build/icon.icns, iconos Windows/Linux si están soportados, favicon, tray monocromático template y selector de iconos existente. Usar rutas reales de open-lens/package.json y del asset pipeline; no modificar appId. **Gate:** auditoría completa de logos antiguos, capturas y comparaciones de assets 16→512px.

### H9-05 — Multi-clúster/multiventana

Probar 2 clústeres demo con colores diferentes, Global Docking, SplitPanel, múltiples tabs, detach/redock, cambiar tema con ventana separada, persistencia y reinicio. Confirmar 2px de color por clúster en todos los scopes existentes. **Gate:** invariantes funcionales, capturas y Playwright real sin DOM fabricado.

### H9-06 — QA exhaustivo

Jest focalizado + regresión H7/H8 relevante, ESLint/typecheck y Playwright Electron real aislado. Reusar perfiles sintéticos; --use-mock-keychain, KUBECONFIG vacío sintético, sin red externa. Capturas auténticas guardadas en docs/evidence/h9; hashes únicos si corresponden a imágenes distintas. Reportar cada comando y exit code, sin atribuir PASS a pruebas que no ejecutaste.

**Gate:** tests y UI visual PASS; si hay fallos, corregir y reauditar sin saltos/overrides engañosos. Guardar logs y docs/h9/H9_NOVAKUBE_DELIVERY.md.

### H9-07 — Empaquetado ARM64 nuevo

**No lanzar un build hoy si la medición sigue cerca de 8–9 GiB libres o si cae entre muestras.** Antes tomar al menos dos mediciones de espacio separadas (p. ej. 60 s) y comprobar que hay margen de al menos 18 GiB o el pico de build medido más reserva. No borrar RC2 ni nodos instalados para ganar espacio sin aprobación.

Una vez aprobado preflight, compilar **un solo RC nuevo** con H8.7 + H9 y destino separado del RC2. Validar icono real adentro de .app/DMG/ZIP, boot sin dev server, menú Documentación F1, cambio de tema, tray, splash, multiventana, Dock, Workbench y cold restart. Generar hashes y reporte de espacio antes/después.

**Gate:** evidencia real del paquete, no inferida del código.

### H9-08 — Aceptación y entrega

Revisar al detalle el roadmap, marcar criterios uno por uno como PASS/PARTIAL/BLOCKED, anexar evidencias y problemas. Crear checkpoint. Esperar la **revisión independiente** y autorización expresa antes de fusionar a develop, hacer push, publicar o borrar RC2. Informar qué quedó implementado y qué no.

## Forma de trabajo y comunicación

- Dividir los cambios por hito, preferentemente commits pequeños y convencionales. No hacer commit de archivos que otro agente o el usuario haya dejado sin seguimiento.
- Al cerrar **cada** hito: breve reporte de rutas tocadas, código y tests ejecutados, resultado real, referencias a evidencias, espacio libre y próximo paso. Si aparece un bloqueo funcional o de disco, detenerse e informarlo.
- Actualizar docs/h9/H9_NOVAKUBE_ROADMAP.md marcando los gates sin falsear sus estados.
- Crear y mantener docs/h9/H9_NOVAKUBE_DELIVERY.md como entrega acumulativa de implementación, screenshots y QA.
- Memoria del proyecto en Engram: lens-v6-ui-corrections, no kubetail.
- Si hay cambios no esperados en el worktree, otra sesión trabajando en los mismos archivos, faltan assets o el disco cae abruptamente: **NO sobrescribir, NO borrar; reportar conflicto y detener ese paso**.

## Definición de terminado

NovaKube se selecciona desde la interfaz real, persiste y se revierte; usa exactamente el Brand Kit aprobado; presenta colores y branding coherentes en toda la aplicación, conserva el color único por clúster y las reglas de seguridad H7/H8; pasa pruebas reales y se ve correcto **en un instalador nuevo ARM64**, con documentación H8.7 incluida. No se considera terminada la tarea sólo porque exista un archivo de tema o una captura.

**Empezá ahora por H9-00 y H9-01. No hagas build, no hagas merge y no hagas push.**
