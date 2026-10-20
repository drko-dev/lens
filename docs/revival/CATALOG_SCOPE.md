# Alcance y estructura del catálogo OpenLens Revival

Fecha: 2026-10-19. Estado: criterios acordados; catálogo comparativo detallado en FEATURE_CATALOG_FULL.md (107 opciones).

## Objetivo
Comparar OpenLens 6.5.3-dev (rama feat/openlens-devops-revival) con los hallazgos de Lens 2026 y seleccionar mejoras para uso personal. No implementar cambios antes de seleccionar funcionalidades.

## Decisiones del usuario
- MCP: incluir como candidato prioritario; favorecer funcionamiento local y neutral respecto del proveedor.
- IA integrada: documentar para una etapa futura, no priorizar ahora.
- Funciones comerciales, licencias, suscripciones y colaboración comercial: excluir.
- Integraciones cloud propietarias: excluir del alcance. Mantener compatibilidad Kubernetes vía kubeconfig y autenticación exec cuando corresponda.
- Evaluar individualmente las mejoras de Kubernetes, DevOps, interfaz y herramientas.
- Orden de trabajo: inventario -> selección -> roadmap -> implementación.

## Secciones del inventario
1. Kubernetes: APIs, recursos, watch, compatibilidad, kubectl, Helm, GitOps.
2. Autenticación y conectividad: kubeconfig, exec, proxy, certificados.
3. Editor y operaciones: YAML, Secrets, ConfigMaps, conflictos, diff, revert.
4. Terminales, logs y port-forward: sesiones, reconexión y limpieza.
5. Interfaz y experiencia de uso: ventanas, pestañas, navegación, tablas, preferencias.
6. MCP local: servidor, herramientas de Kubernetes/Prometheus y seguridad/permisos.
7. Plataforma y seguridad: Electron, Node, binarios, empaquetado y pruebas.
8. IA futura: ideas documentadas sin compromiso de implementación.

## Ficha por funcionalidad
ID | Área | Funcionalidad | OpenLens actual | Lens 2026 | Evidencia (V/E/H/?) | Interés (incorporar/evaluar/descartar) | Complejidad | Dependencias | Riesgos | Referencia documental/código.

## Evidencia y límites
Fuentes: REA_FINDINGS.md, LENS_2026_COMPLETE_CATALOG.md, LENS_2026_K8S_AUTH_DEVOPS_DEEP_DIVE.md, LENS_2026_UI_UX_DEEP_DIVE.md.
Los informes comparan al menos dos builds de Lens 2026; mantener evidencia y versiones separadas. Hallazgos estáticos no equivalen a comportamiento comprobado. Validar el estado actual del fork antes de marcar una funcionalidad como implementada.

## Próximo paso
Consultar FEATURE_CATALOG_FULL.md; revisar opciones con el usuario, registrar elecciones y recién entonces generar roadmap con hitos y dependencias.
