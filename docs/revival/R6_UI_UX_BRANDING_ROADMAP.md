# OpenLens DevOps Revival — R6 UI/UX & Branding Roadmap

**Estado:** Propuesto / autorizado para iniciar R6-01. **Fecha:** 2026-10-22.
**Autor del fork:** Gustavo Marcon. Mantener créditos y licencia MIT del proyecto OpenLens original.
**Checkpoint inmutable:** R5-09, commit `6012f4ac52da8c620d3fcae71d4fc406baa27081`.
**Build protegida:** `/Users/gustavomarcon/Documents/lens/releases/R5-09/OpenLens DevOps.app`.
**SHA-256 de `app.asar` de R5-09:** `f6c55cb56db6326b60318b4c586f692809f45e5ec89ff6bbce426e011a0d595a`.
**Rama de trabajo:** `feat/midnight-graphite-branding`, nacida desde el checkpoint.
**Directorio:** `/Users/gustavomarcon/Documents/lens/lens-r4`.

## Visión aprobada

OpenLens DevOps debe tener identidad propia, contemporánea, robusta y sobria, pero seguir siendo una herramienta de trabajo Kubernetes para jornadas largas, incluidas noches. Referencia de **densidad y exploración de datos:** DBeaver; no copiar su estilo clásico. Grafana inspira contraste nocturno y contenedores, **no** proliferación de gráficos. **No usar la amplitud de Headlamp como referencia:** el usuario rechaza filas enormes, márgenes excesivos y scroll interminable.

Principios medibles:
- **Información primero:** tablas compactas de 33 px por defecto; mantener modo Comfortable de 42 px únicamente opcional. No alterar cálculos de VirtualList.
- **Menos scroll y clics:** filtros y búsqueda cerca de la tabla; navegación consistente; jerarquía clara; preservar menús, atajos y extensiones.
- **Paneles/bloques eficientes:** alto contraste legible con márgenes, separación y encabezados contenidos; nada de glassmorphism, neón, reflejos ni animaciones llamativas.
- **Modo oscuro nocturno profundo:** base #0D1117; superficies #151B23 y #1D2633; texto #D3DCE6; secundario #A2AEC0; acento azul templado #7196D2; turquesa #4FAFB0. Los colores semánticos conservan significado.
- **Seguridad operacional:** PROD siempre rojo inequívoco, basado SOLO en configuración explícita, nunca heurísticas de kubeconfig. Conservar R1–R5: cluster identity, YAML/Secrets/ConfigMaps, RBAC, logs, terminal PTY, port-forward, dock, detached tools, favoritos, extensiones.
- **Branding integral, no un recolor:** símbolo original inspirado conceptualmente en una lente/herramienta observabilidad (sin calcar la marca upstream), wordmark OpenLens DevOps, tipografía, macOS Dock/Finder/app icon, tray/menu bar, Welcome y superficies visibles. Crédito de fork Gustavo Marcon y atribución original.

## Hitos secuenciales

### R6-01 — Base visual segura: Midnight Graphite [DONE]

Objetivo: finalizar e integrar el nuevo tema *opt-in* sobre el mecanismo DI existente, con tipografía densa y colores consistentes. Tema original Dark y Light y sincronización con sistema siguen disponibles. Auditar cambios WIP ya existentes, **NO descartarlos ni empezar de cero**. Pruebas específicas: selección/cambio de tema y retorno al clásico; tipografía, contrastes, tabla 33/42 px y virtualización; consistencia con preferencias de colores/PROD, dock, detached theme IPC; TypeScript/ESLint. Evidencia visual nocturna si hay binario de prueba; no sobrescribir R5-09.

Entregables: tema declarado e integrado, estilos acotados sin cambio de lógica Kubernetes, tests, `R6_01_VALIDATION.md`, capturas opcionales, informe y autorización antes de commit.

### R6-02 — Identidad de marca completa

Objetivo: convertir el logo geométrico original aprobado en un set **real de assets** escalables (SVG/PNG e iconos macOS) con legibilidad a 16/24/32/64/512/1024 px, icono Finder/Dock, ventana, tray, launcher, Welcome, header, About y splash donde corresponda; compatibilidad de tray claro/oscuro y estados. Integrar nombre, tipografía y metadatos del fork *Gustavo Marcon* preservando copyright upstream. No distribuir fuentes ajenas sin licencia. Validar packaged ARM64 con iconos y fallback, y trabajar con source editable en repo.

### R6-03 — UI de alta densidad para operadores

Objetivo: adaptar pantallas de catalog, recursos, detalles, sidebar, workspace tabs, dock y paneles a distribución densa, moderna y consistente. Compact 33 px de forma predeterminada, sin tarjetas anchas ni paddings vacíos; filtros/búsqueda visibles; paneles redimensionables cuando haya soporte actual o sea seguro. Mantener herramientas y los hooks de extensiones, VirtualList/scroll, tema claro, RBAC y estados de recursos. Comparación visual antes/después en viewport habitual.

### R6-04 — UX: menos pasos y búsqueda rápida

Objetivo: ensayar los flujos diarios de localizar clúster, elegir namespace, filtrar recursos, inspeccionar Pod, copiar/ver YAML, logs, terminal, port-forward y volver sin perder contexto. Reducir clics, scroll y saltos de foco con cambios selectivos respaldados por mediciones/Playwright. No inventar dashboards llenos de gráficos ni cambiar operaciones mutantes sin revisión específica. Cerrar con pruebas funcionales y de regresión dirigidas.

### R6-05 — Certificación visual y candidata final

Objetivo: verificar light/dark, branding en binario ARM64, sidebars/tablas compactas en resoluciones reales, contraste y estados PROD, extensiones y flujos representativos en entornos sintéticos DEV/STG/PROD. Documentar hallazgos y generar `releases/R6-RC/` **sin modificar ni reemplazar** `releases/R5-09/`. Autorizar commit y release final por separado; nunca push automático.

## Estado de trabajo ya existente al inicio de R6-01

En `feat/midnight-graphite-branding` se iniciaron cambios WIP sin commit: `midnight-graphite.injectable.ts`, `midnight-graphite.scss`, `openlens-devops-logo.svg`, registro del icono, selector de tema, Welcome, metadatos de autor y tests. **Auditar y corregir**: no considerarlos terminados ni sobreescribirlos; los iconos macOS/tray y la aplicación empaquetada del rediseño **aún no están certificados**. Mantener los archivos no versionados históricos (.omc, docs R4, capturas) fuera del staging.

## Protocolo de hitos

- Antes de editar: comprobar rama, HEAD y Git; cualquier desviación importante, detener acción destructiva.
- Cambios en working tree de R6 son legítimos; jamás `git clean`, `reset --hard`, force checkout ni rebase sobre ellos.
- No commitear ni hacer push sin autorización del usuario, ni tocar la release R5-09.
- Usar Node 20 del proyecto; tests dirigidos y una build por hito cuando aporte evidencia, evitando múltiples Electron builds simultáneas.
- Guardar documentos/validaciones en `docs/revival/`. Guardar capturas nuevas en `docs/revival/evidence/r6-XX/`; no limpiar evidencias de R1–R5.
- Reportar por hito cambios, tests, capturas, hash de artefacto, estado Git y defectos sin maquillar.
