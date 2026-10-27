# OpenLens DevOps — Roadmap de paridad visual con Lens oficial

**Fecha:** 27 de octubre de 2026  
**Objetivo:** igualar la organización y el comportamiento visual de Lens oficial en **toda la aplicación**, tomando como referencia las dos capturas proporcionadas, sin perder funciones propias de OpenLens DevOps.  
**Base protegida:** v6, rama `feat/v6-final-release`, commit `20d3d96`.  
**Rama de trabajo:** `feat/v6-ui-corrections`.  
**Regla principal:** ninguna etapa se aprueba solo porque compile o pase tests: **hay que verla en una aplicación ejecutable y poder probarla**.

## Checkpoint estable y rollback obligatorios

- **Punto de retorno inmutable: v6 estable**, con código en `20d3d96`, `releases/v6/OpenLens DevOps.app` y `releases/v6/OpenLens-DevOps-v6-arm64.dmg`. No reescribir, mover ni borrar estos artefactos.
- **Checkpoint de desarrollo actual:** `dc5f686` en `feat/v6-ui-corrections`: cambio de selección de sidebar compilado en SCSS, aún **sin validar visualmente** en una app nueva.
- Cada etapa debe dejar un commit y un build candidato etiquetados, más una versión anterior funcional lista para volver atrás. Un build nuevo NO reemplaza al último estable hasta superar la comprobación visual y funcional.
- Si hay una regresión, volver al binario anterior y preservar la información para investigarla; nunca hacer `git reset --hard` ni borrar trabajo existente.
- No modificar kubeconfigs, el perfil real, R9-RC, releases congeladas ni datos Kubernetes durante las pruebas.

## Comparación visual de partida (capturas recibidas)

| Zona | Lens oficial (referencia) | OpenLens DevOps v6 (pendiente) |
|---|---|---|
| Izquierda | Hotbar angosta y navegación Kubernetes clara | Menús resaltados con celeste intenso; la selección Workloads tapa el contraste |
| Selección | Marca lateral mínima en el árbol; pestaña activa con énfasis discreto | Relleno azul/celeste y línea gruesa; revisar también tabs y clúster |
| Área superior | Pestañas compactas; namespace y búsqueda alineados | Workspace, pestañas de recursos redundantes y controles en varias filas |
| Vista Pods | Tabla enseguida debajo de namespace/búsqueda | Cuatro tarjetas enormes Total/Healthy/Degraded/Namespaces |
| Tabla | Filas compactas, CPU, RAM, estado, namespace y otras columnas | Datos comprimidos por resúmenes superiores; preservar funciones avanzadas |
| Favoritos | Columna izquierda vertical | Selector `‹ 1 ›` inferior cambia de hotbar; el usuario pide una lista continua, desplazable verticalmente |
| Terminal | Dock inferior | Conservar terminal y redimensionamiento |

**No copiar código, marcas, servicios ni recursos comerciales propietarios de Lens.** La referencia es el layout, los colores, la densidad, el comportamiento y la experiencia visual.

## Etapas y entregables comprobables

| Etapa | Implementación solicitada | Qué debe ver y probar el usuario |
|---|---|---|
| **1. Navegación y selección** | Quitar fondos celestes de Workloads y las otras selecciones, conservar texto legible y marcas de selección finas como en Lens oficial. Unificar hover/focus. | Build candidata y comparación de sidebar, clúster y pestañas con Lens oficial. |
| **2. Estructura global** | Reorganizar barra superior, workspace, árbol Kubernetes, pestañas, márgenes, tamaños y colores; eliminar navegación redundante sin perder funciones. | Abrir Pods, Deployments, Nodes y Config y ver layout equivalente a Lens oficial. |
| **3. Favoritos verticales** | Columna única de 20–25+ clústeres con scroll de arriba a abajo. Eliminar navegación paginada `‹ 1 ›` como mecanismo de búsqueda de clústeres. Migrar sin perder favoritos preexistentes; persistencia, reordenamiento y acceso con clic. | Usar scroll real en la app, llegar al favorito 20–25, cambiar y reiniciar sin perder orden. |
| **4. KPI y tablas** | Quitar la barra compartida `WorkloadInsightsBar` y sus cuatro tarjetas donde se rendericen. Mantener filtros útiles en formato compacto, CPU/RAM, estados, columnas, orden, resize, export y búsqueda. | Tabla visible inmediatamente bajo controles compactos en Pods, Deployments y otras listas. |
| **5. Search y controles** | Alinear namespace, Search, exportación y toolbar según referencia; corregir foco y raya/subrayado invasivo sin romper atajos. | Foco sobrio y búsquedas/filtros operativos mediante mouse y teclado. |
| **6. QA visual y release** | Comparar imágenes lado a lado con misma resolución/tema, probar navegación y funcionalidades afectadas con perfil aislado; crear nueva app ARM64 separada. | Capturas antes/después, app ejecutable, checklist funcional y aceptación visual explícita. |

### Estado real de la etapa 1

El commit `dc5f686` ya quitó el fondo `var(--blue)` de la opción activa en `sidebar-items.module.scss`, redujo la marca lateral de submenú a 1 px y ajustó los colores. **Compiló el SCSS, pero NO se construyó ni comprobó visualmente una app nueva.** Las selecciones de clúster y pestañas siguen pendientes.

### Criterios de aceptación generales

1. El usuario puede abrir y probar una compilación de la rama de trabajo antes de aprobar una etapa.
2. Comparamos Lens oficial y OpenLens DevOps en la misma vista, tamaño de ventana y tema.
3. Las correcciones visuales se propagan a todos los módulos pertinentes, no solo a Pods.
4. Se conservan terminal, accesibilidad, operaciones de tabla y datos útiles.
5. Las pruebas se realizan con perfil verdaderamente aislado: `HOME` temporal, `CICD` / `--integration-testing` y bloqueo de escrituras en perfil real y `~/.kube`. **No alcanza con `--user-data-dir`.**
6. Ningún resultado de tests se presenta como aprobación de diseño. La aprobación visual la da el usuario.

## Limpieza obligatoria después de CADA build

1. **Antes:** medir disco disponible con `df -h`, registrar ruta y artefactos previos; identificar los archivos de QA prescindibles sin tocar otras áreas.
2. **Build:** crear una carpeta identificada por etapa/versión, fuera de `releases/v6`. No sobrescribir ningún checkpoint.
3. **Validación:** abrir el candidato en entorno aislado, guardar capturas y resultado focalizado. Si falla, conservar el mínimo necesario para diagnóstico.
4. **Limpieza real:** conservar el candidato actual, la última versión estable/rollback, checksums e informes mínimos; eliminar salidas de compilación antiguas **verificadas como prescindibles**, caches temporales específicas y directorios de QA obsoletos. Evitar comandos masivos y archivos en uso.
5. **Protecciones:** no borrar Git WIP, worktrees activos, `releases/v6`, `releases/R9-RC`, `~/.kube` ni preferencias reales. No vaciar toda la Papelera como sustituto de clasificación.
6. **Después:** medir otra vez con `df -h` y dejar en el reporte qué se borró, qué se preservó y cuánto espacio se recuperó. **Mover a Papelera no equivale a liberar espacio.**

### Condición para dar un hito por cerrado

**App ejecutable + capturas comparativas + prueba funcional real + reporte de limpieza + checkpoint de rollback.** Si alguno falta, el hito sigue pendiente.

## Fuera del alcance inicial

Rediseño de logo/branding, funciones nuevas, cambios de autenticación, proxy o Kubernetes y licencias/servicios de Lens oficial. Primero paridad visual aprobada; después se deciden personalizaciones.

## Registro de progreso

- 27/10 — v6 estable protegida: `20d3d96` (GO técnico interno, NO aprobación visual).
- 27/10 — `dc5f686`: cambio de estilo de sidebar en código; compilación SCSS correcta, validación visual pendiente.
- 27/10 — este roadmap se registra en `docs/` del worktree de correcciones.
