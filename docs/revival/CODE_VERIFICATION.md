# Verificación técnica del fork — primera pasada
Fecha: 2026-10-19. Rama: feat/openlens-devops-revival. Lectura estática; sin tests ejecutados.

## Estado del repositorio
El árbol de trabajo tiene numerosas modificaciones sin commit y archivos nuevos. No se alteraron archivos de aplicación ni se limpiaron cambios. Estas conclusiones describen el working tree, no necesariamente el último commit.

## Hallazgos confirmados por lectura de código
| ID inventario | Resultado | Evidencia local | Pendiente |
|---|---|---|---|
| E01 | **Implementación ya presente**: guardado por reemplazo con resourceVersion original, seguido de GET de verificación. | `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx` métodos `replace` y `verifySaved`; `request-replace-kube-resource.injectable.ts` | Ejecutar pruebas unitarias y laboratorio; revisar rutas alternativas PATCH. |
| E02 | **Implementación ya presente**: manejo explícito de conflicto y rebase manual del borrador. | Mismo modelo: `reportConflict`, `rebaseOnClusterVersion`, `conflict.set` | Verificar UX en ejecución y cobertura de error 409. |
| E05 | **Parcial**: existen pruebas de Secret y ConfigMap en editor YAML; esto no verifica todavía los paneles inline. | `save.test.tsx` fixtures y casos de conflicto | Inspeccionar los paneles inline por separado. |
| T02 | **Parcial**: se encontró `stop-port-forwards-on-quit.injectable.ts` y pruebas; no se confirmó retry ni desconexión. | `packages/core/src/main/routes/port-forward/functionality/` | Leer implementación y ejecutar pruebas. |
| T01 | **Parcial**: hay archivos nuevos de sesiones de pod y pestañas de terminal. | `main/shell-session/pod-shell-session/`, `renderer/components/dock/terminal/create-pod-terminal-tab.injectable.ts` | Revisar flujos y ejecución real. |
| U03 | **Parcial**: existen picker y diálogo de apariencia de clúster. | `renderer/components/cluster-settings/cluster-appearance-*.tsx` | Confirmar integración visual y persistencia. |

## Implicación para el catálogo
No clasificar E01/E02 como funcionalidades por implementar desde cero: ya hay trabajo concreto en el fork. Separar estado «implementado en working tree» de «validado en ejecución». Las demás filas del inventario permanecen sin verificar contra código.

## Próximas comprobaciones
Revisar conectividad/kubeconfig, port-forward, terminal, apariencia, kubectl, MCP y paneles inline; ejecutar tests sin tocar clústeres reales, después pruebas de laboratorio controladas. Registrar por fila evidencias y riesgos antes de pedir selección final.

## Segunda pasada — módulos restantes (lectura estática)
| ID | Estado del working tree | Evidencia | Acción sugerida |
|---|---|---|---|
| A05 | **Parcial**: `dumpConfigYaml` conserva `tls-server-name` y `exec`; no se encontró serialización de `proxy-url` ni `disable-compression` en ese método. | `packages/core/src/common/kube-helpers.ts:197,220` | Tests de round-trip kubeconfig, añadir campos faltantes si el modelo lo permite. |
| T02 | **Parcial**: cierre al salir implementado; `PortForward.start()` crea un proceso, espera puerto y no contiene bucle de retry. | `stop-port-forwards-on-quit.injectable.ts`, `port-forward.ts:62-115` | Probar limpieza al cerrar y reconexión; implementar retry solo si se elige. |
| T01 | **Parcial**: integración de sesiones de pod presente; `node-pty` sigue en `0.10.1`. | `main/shell-session/pod-shell-session/open.injectable.ts`, `open-lens/package.json:255` | Validar compilación y pruebas de terminal. |
| U03 | **Parcial**: diálogo/picker de apariencia presente. | `cluster-appearance-dialog.tsx`, `cluster-appearance-picker.tsx` | Probar guardado y visualización. |
| E05 | **Pendiente**: Secret inline llama `secretStore.update` y notificación genérica; ConfigMap inline llama `configMapStore.update`. No se verificó UX específica 409. | `config-secrets/secret-details.tsx:69-72`, `config-maps/config-map-details.tsx:63` | Agregar pruebas de concurrencia y refresco. |
| M01-M02 | **No encontrado en la búsqueda de rutas del fork**: no aparecieron paquetes o archivos con `mcp` en el nombre bajo `packages`. | Búsqueda de nombres de archivo; no equivale a prueba de ausencia total. | Diseñar servidor MCP local, alcance y permisos si se selecciona. |
| P01 | **Pendiente**: Electron 22 y node-pty 0.10.1 declarados. | `open-lens/package.json:87,255,326` | Planificar actualización por escalones. |
| P02 | **Parcial**: appId propio y `--publish never` ya presentes. | `open-lens/package.json:24,85` | Verificar rutas userData, firma y build. |
| K01 | **Parcial**: existe mapa local `packages/kubectl-versions/build/versions.json` modificado, pero no se verificó descarga por clúster ni checksum. | Git status; archivo citado. | Inspeccionar selector/descarga y pruebas. |

## Estado de cierre del inventario documental
El archivo `FEATURE_INVENTORY.md` cubre 39 entradas y áreas de trabajo. **La revisión de código no es exhaustiva**: se contrastaron rutas críticas y se marcaron explícitamente los elementos sin evidencia suficiente. No se ejecutaron tests ni se realizaron operaciones en clústeres. Para una decisión de alcance, el catálogo es utilizable como borrador; para dar por terminada la validación técnica faltan las pruebas y las comprobaciones indicadas.
