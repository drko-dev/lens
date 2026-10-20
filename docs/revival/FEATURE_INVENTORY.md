# Inventario de funcionalidades — OpenLens Revival
Fecha: 2026-10-19 · Estado: inventario documental inicial, pendiente de validar contra código y seleccionar.

## Criterios
MCP local: candidato a incorporar. IA: futuro. Excluir servicios comerciales, licencias, sincronización cloud y conectores propietarios. Mantener kubeconfig para clústeres de cualquier proveedor. Sin cambios de código hasta aprobación del roadmap.

**Leyenda:** C = candidato; B = base técnica necesaria; F = futuro; X = fuera de alcance. La presencia en el informe no implica implementación ni funcionamiento verificado.

| ID | Área | Funcionalidad / diferencia identificada | Decisión provisional | Fuente |
|---|---|---|---|---|
| K01 | Kubernetes | Selección/descarga de kubectl según versión del clúster y SHA-256 | C | Deep Dive §2.1 |
| K02 | Kubernetes | Discovery dinámico de API Eviction; flags de drain actualizados | C | Deep Dive §2.1 |
| K03 | Kubernetes | Resiliencia de watch, manejo de reconexión y arquitectura reactiva | C | Deep Dive §2.2 |
| K04 | Kubernetes | Nuevas APIs/CRDs como Gateway API y DRA | C | Deep Dive §2.3 |
| K05 | Kubernetes | Retirar referencias a PodSecurityPolicy eliminado | B | REA Findings §6 |
| K06 | Kubernetes | Actualizar Helm y herramientas CLI | C | Complete Catalog §1 |
| A01 | Autenticación | Diagnóstico por entrada de kubeconfig y redacción de secretos | C | Deep Dive §1.1 |
| A02 | Autenticación | Sincronización local y detección de cambios en kubeconfig | C | Deep Dive §1.2 |
| A03 | Autenticación | Conexión directa/proxy, verificación del proxy y certificados | C | Deep Dive §1.3 |
| A04 | Autenticación | Soporte de proxy del sistema y CAs del sistema operativo | C | Deep Dive §1.4 |
| A05 | Autenticación | Preservar tls-server-name/proxy-url y credenciales exec | B | REA Findings §5-6 |
| A06 | Autenticación | Conectores integrados EKS/AKS/GKE/MKE y login cloud propio | X | Deep Dive §1.5 |
| E01 | Editor | Guardado YAML con precondición resourceVersion y verificación GET | B | REA Findings §4-5 |
| E02 | Editor | Estados explícitos de edición, guardado y conflicto 409 | B | REA Findings §5 |
| E03 | Editor | Diff y revert en Monaco | C | REA Findings §4.2 |
| E04 | Editor | Persistencia de pestañas de edición por clúster | C | REA Findings §4.2 |
| E05 | Editor | Secret/ConfigMap: refresco y resolución de conflictos | B | REA Findings §4.3 |
| T01 | Terminal | Modernizar node-pty y gestión de sesiones | C | REA Findings §5 |
| T02 | Terminal | Port-forward con retry, limpieza al desconectar/cerrar | C | REA Findings §5 |
| T03 | Terminal | Logs y terminales asociados al clúster | C | UI/UX Deep Dive §3 Area 7 |
| U01 | Interfaz | Ventanas múltiples y mensajería entre ventanas | C | UI/UX Deep Dive §3 Area 1 |
| U02 | Interfaz | Navegación, topbar, statusbar, hotbar y pestañas | C | UI/UX Deep Dive §3 Area 2 |
| U03 | Interfaz | Apariencia visual diferenciada por clúster | C | UI/UX Deep Dive §3 Area 3 |
| U04 | Interfaz | Tablas virtualizadas y filtros | C | UI/UX Deep Dive §3 Area 4 |
| U05 | Interfaz | Panel de detalles y Monaco moderno | C | UI/UX Deep Dive §3 Area 5 |
| U06 | Interfaz | Temas y componentes visuales | C | UI/UX Deep Dive §3 Area 6 |
| M01 | MCP | Servidor MCP local | C | Deep Dive §3.2 |
| M02 | MCP | Herramientas Kubernetes, navegación y Prometheus | C | UI/UX Deep Dive §2 |
| M03 | MCP | Modelo de permisos, acceso de solo lectura y confirmación de acciones | C (diseño propio; verificar) | Requisito de seguridad propuesto |
| P01 | Plataforma | Actualización escalonada de Electron/Node | B | REA Findings §5 |
| P02 | Plataforma | Identidad, appId, userData y empaquetado sin publicación automática | B | REA Findings §5 |
| P03 | Plataforma | Integridad de binarios, CSP y aislamiento | B | REA Findings §3, §5 |
| D01 | DevOps | Argo CD y Flux locales contra clúster | C | Deep Dive §3.6 / UI/UX §2 |
| D02 | DevOps | Seguridad Trivy y escaneo de vulnerabilidades | C | Deep Dive §3.4 |
| D03 | DevOps | Métricas y costos OpenCost/Kubecost sin backend comercial | C | Deep Dive §3.5 |
| F01 | IA | Lens Prism y agentes IA integrados | F | Deep Dive §3.1 |
| F02 | IA | Lanzador de agentes externos y extensiones generadas por IA | F | Deep Dive §3.3 |
| X01 | Comercial | Licencias, premium, upsells y suscripciones | X | Complete Catalog §3 |
| X02 | Cloud | Sincronización en nube, cuentas y colaboración propietaria | X | Complete Catalog §3 |

## Pendiente antes del roadmap
1. Contrastar cada candidato con el estado real de la rama `feat/openlens-devops-revival`, distinguiendo lo ya implementado de lo nuevo.
2. Mantener separados los artefactos Lens `2026.10.121159-latest` y `2026.10.51501-latest`; no mezclar conclusiones estáticas.
3. Expandir las filas a fichas con rutas de código, evidencia V/E/H/?, complejidad, dependencias y pruebas.
4. Revisar cada sección con el usuario y registrar incorporar/evaluar/descartar antes de generar hitos.

## Documentos fuente
- `REA_FINDINGS.md`
- `LENS_2026_COMPLETE_CATALOG.md`
- `LENS_2026_K8S_AUTH_DEVOPS_DEEP_DIVE.md`
- `LENS_2026_UI_UX_DEEP_DIVE.md`
