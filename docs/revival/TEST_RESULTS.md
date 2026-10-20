# Pruebas puntuales de verificación — 2026-10-19

**Contexto:** Mac local autorizado, rama `feat/openlens-devops-revival`. Herramienta: Jest en `packages/core`, `--runInBand --no-cache --runTestsByPath`, `CI=true`. No se ejecutó la UI Electron ni se usaron clústeres reales.

| Tanda | Suites aprobadas | Tests aprobados | Casos principales |
|---|---:|---:|---|
| A | 4/4 | 23/23 | Editor YAML: ConfigMap/Secret/Deployment, 409 y verificación posterior; PodDevOpsMenu; PortForward local y on-quit cleanup |
| B | 8/8 | 53/53 | Kubeconfig helpers/sync, PodShellSession, terminal dock, appearance settings, Secret details, cluster update, proxy sistema |
| C | 7/7 | 139/139 | KubeApi parse, API detection, kubeconfig manager, kube-object-menu Evict/Force Delete, pod exec escaping, Helm service |
| **Total** | **19/19** | **215/215** | Suite focalizada, **no** suite completa del monorepo |

**Última tanda:** salida informa `Test Suites: 7 passed, 7 total`, `Tests: 139 passed, 139 total`, `Snapshots: 7 passed`, `exit code 0`. Tandas anteriores: A 4/23 y B 8/53, todas con `exit code 0`.

**Hallazgos que los tests NO resuelven:** race entre GET y PATCH de Deployment sin precondición; prueba de port-forward contra K8s real; validación de clústeres cloud via `exec`; GUI empaquetada en macOS arm64; conexión tras sleep/VPN; E2E de MPC (todavía no implementado); cobertura de nuevas APIs/CRDs; checksum kubectl; compatibilidad host Node v26.7.0 con engines <=20 del core.

**Conclusión:** evidencia útil de regresión focalizada para el fork actual, no garantía de build, integración completa ni corrección en producción. No se modificaron archivos de código para esta ronda.
