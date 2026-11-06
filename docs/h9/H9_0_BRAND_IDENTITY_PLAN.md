# H9 — Identidad de marca OpenLens DevOps / Concepto A

**Fecha:** 2026-11-06
**Estado:** PLAN, rama de implementación preparada; sin cambios visuales aplicados aún.
**Rama:** feature/h9-brand-identity (base: H8.7 aceptado en ddfef9bb; develop continúa sin merge).
**Proyecto Engram:** lens-v6-ui-corrections.

## Fuente de verdad

La última identidad escogida el 06/11/2026 es **Concepto A, Pod / Contenedores**: marco hexagonal abierto/redondeado con **un cubo azul superior y dos cubos grises inferiores**, sin timón ni copia del logo de Kubernetes. Sustituye la propuesta antigua de engranaje/timón del 29/10 para la aplicación futura.

La identidad original y las variantes fueron preparadas en el paquete **OpenLens_DevOps_Brand_Kit_v1** y el documento **PROMPT_IMPLEMENTACION_OPENLENS_DEVOPS.md** de la conversación previa. **Antes de tocar iconos, obtener y comparar el paquete vectorial aprobado**: los assets en el árbol actual pueden corresponder a marcas anteriores. No recrear el logo de memoria, no usar PNG de referencia como sustituto del vector maestro, no elegir otro concepto.

### Paleta y tipografía aprobadas

| Token | Valor |
|---|---|
| Fondo grafito | #12161B |
| Superficie | #242A31 |
| Elevación | #2C343D |
| Bordes | #373D44 |
| Texto principal | #D7DCE2 (sin blanco puro) |
| Texto secundario | #A8B2BF |
| Texto terciario | #8C939B |
| Acento marca | #7792AC |
| Foco visible | #6E9CC6 |
| Healthy | #65B996 |
| Warning | #D2A65E |
| Critical | #D17B7F |

Wordmark **OpenLens** semibold + **DevOps** regular, preferentemente Inter con fallback a system-ui, sin distribuir archivos de tipografía sin licencia. Mantener Midnight Graphite y la densidad de UI actual; marca sobria, sin neón ni azul eléctrico. Los estados semánticos se reservan para estados reales.

## Inventario observado del repositorio

- Fuente de iconos propia existente: open-lens/static/branding/openlens-devops-symbol.svg y open-lens/static/branding/app-icons/{grafito,azul,blanco,negro,verde,...}.png. No asumir que son Concepto A.
- UI Welcome: packages/core/src/renderer/components/icon/openlens-devops-approved.png; imports en packages/core/src/renderer/components/welcome/welcome.tsx.
- Logo de componentes: packages/core/src/renderer/components/icon/openlens-devops-logo.svg y icon.tsx.
- Configuración de paquete macOS: open-lens/package.json -> build/icon.icns. Verificar pipeline exacto y manifest.
- Splash: open-lens/static/splash.html usa branding/app-icons/grafito.png. Tray: packages/core/src/main/tray/menu-icon/ y assets build/tray.
- Selector icono de aplicación: packages/core/src/features/preferences/renderer/preference-items/appearance/application-icon/application-icon-preferences.tsx, con origen app-icons. Preservar su comportamiento y variantes.
- Otros lugares a auditar con búsqueda estática: favicons, ventanas detached, About, tabs, sidebar, barras, cargadores, notificaciones, empaquetado y Centro de Documentación H8.7.
- **No tocar** logos oficiales de Kubernetes, Helm u otras marcas de terceros, ni iconos de recursos cuyo significado no es marca OpenLens DevOps.

## Implementación por etapas H9-001...H9-006

**H9-001 — Asset provenance y checkpoint.** Inventariar logo actual y rutas exactas. Localizar archivos aprobados del Brand Kit v1; validar SVG y metadatos, tamaños y hashes. Crear respaldo Git antes de reemplazar recursos; no tocar archivos sin seguimiento del usuario.

**H9-002 — Fuente única / variantes.** Copiar el maestro aprobado y variantes necesarias a directorio de assets dedicado; evitar duplicados y símbolos heredados. Iconos PNG/ICNS/ICO para macOS, Windows y Linux; favicon, tray template, clear/dark/light. Verificar nitidez en 16/24/32/64/128/512 px. No importar fuentes binarias.

**H9-003 — Tema Midnight Graphite.** Integrar tokens de marca al sistema actual, sin segundo tema raíz ni alterar settings. Revisión visual de headers, sidebar, menús, tabs, botones, tablas, formularios y Centro de Documentación. Conservar contraste accesible WCAG AA, feedback hover y focus visible. No romper personalizaciones.

**H9-004 — Shell y contextos de aplicación.** Aplicar iconos y wordmark a Welcome, splash, About, Dock de macOS, app/instalador, tray, ventanas desacopladas y errores. Mantener package ID, signing identity, API endpoints y rutas sin autorización separada. En ventanas y tabs respetar el color por clúster y la línea fina de 2 px: no reemplazarlo por el azul global.

**H9-005 — QA de integración.** Tests unitarios y typecheck de rutas de recursos, cambios visuales, contraste, branding selector y menú Documentación. Playwright Electron real en perfil sintético, sin kubeconfig ni Keychains reales, screenshot de Welcome, About, Documentación, cluster card, Kubetail, Pod details, detach/redock y multiventana. No montar overlays ficticios ni afirmar pruebas no ejecutadas.

**H9-006 — Release candidate y limpieza.** Tras aprobar UI, generar un único candidato ARM64 nuevo que incluya **H8.7 + H9**. Verificar iconos del .app empaquetado, firma ad-hoc, DMG/ZIP/checksums, smoke fuera del dev server, regresión H7/H8 y persistencia. No reutilizar RC2 ni sobrescribirlo. Preflight de disco antes de compilar, liberar solo caches y perfiles cerrados verificables; RC2 se conserva como rollback hasta aceptación del nuevo candidato. Guardar reportes y hashes antes de retirar builds viejos con autorización. No push/merge sin aprobación explícita.

## Reglas de alcance

- **Identidad visual, no refactor.** No tocar comportamiento de clústeres, kubeconfig, RBAC, logs/Kubetail, streams, terminal PTY, Incidentes/IA, docking, detach/redock, LayoutV1, restauración inerte ni seguridad.
- H8.7 funcional está aprobado en DEV pero aún no fusionado a develop ni empaquetado. H9 se ramifica desde su commit aceptado: es una rama dependiente hasta integrar H8.7 por separado con autorización.
- Antes de aplicar recursos verificar que el **Brand Kit Concepto A aprobado** esté disponible para esta sesión en una ruta real y validada. Si no está, detener sustituciones y solicitar el paquete, en vez de dibujar uno parecido.
- Conservar margen en disco: medición reciente ~14 GiB libres; reevaluar antes de cada build.
- Entrega obligatoria en docs/h9/H9_BRAND_IDENTITY_DELIVERY.md con inventario antiguo/nuevo, capturas, resultados, PASS/PARTIAL/BLOCKED y checklist de recursos residuales.

**Definición de terminado:** La aplicación empaquetada muestra el logo exacto Concepto A y la paleta aprobada de manera consistente en interfaz, instalador, ventanas, splash y documentación; preserva controles, tema, colores por clúster y toda la funcionalidad H7/H8.
