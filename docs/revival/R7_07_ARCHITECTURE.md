# R7-07 — Helm Intelligence: Arquitectura

| Campo | Valor |
|---|---|
| Worktree | `/Users/gustavomarcon/Documents/lens/lens-r7-07-helm` |
| Rama / base | `feat/r7-07-helm-intelligence` / `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` |
| Estado | Implementado; Jest dirigido, TypeScript y ESLint pasan; checkpoint local selectivo, sin certificación global |

## Contratos y capas

- La plumbing existente de `helm history`, `helm get values`, rutas por clúster, kubeconfig del proxy y `MonacoDiffEditor` se reutiliza.
- `revision?: number` se agrega al final del cliente renderer y llega a `helm get values --revision N`. El endpoint rechaza un parámetro `revision` presente que no sea decimal positivo y safe integer; no lo degrada silenciosamente a la revisión actual.
- `RevisionHistoryModel` y `ValuesDiffModel` son keyed singleton por `namespace/name` dentro de su DI de frame. Asocian las cargas al `clusterId`, selección y token de petición; descartan respuestas obsoletas. History se ordena en forma descendente y distingue 403.
- Las rutas se declaran como injectables (`*.injectable.ts`) y el `registerLensCore` las descubre mediante `require.context`; `Router` las recibe por `routeInjectionToken`. No se agregó un registro manual paralelo.
- La pantalla existente de release integra historial A/B, diff de Values y `EnvironmentBadge`. `UpgradeChart` integra validación del editor YAML.
- El endpoint `GET /v2/charts/schema` llama a `helm pull` en el proceso main, devuelve `present/absent/unavailable/invalid`, y elimina el temporal en `finally`. No instala, actualiza ni escribe en un clúster.

## Values y privacidad

El diff completo permanece oculto hasta que el operador selecciona **Reveal values**. Se ocultan también claves inocuas: no hay heurística que pueda detectar un secreto universalmente. La revelación expone los Values sin redacción; el texto continúa existiendo en memoria del renderer mientras la vista está activa. Al cambiar revisión/modo o desmontar el drawer, se oculta el diff y se limpian los valores/modelos.

Este control aplica solo al diff de historial. El editor de upgrade existente sigue mostrando el YAML editable sin redacción; R7-07 no cambia esa superficie previa.

## Validación de esquema

Se usa Ajv 8 (dependencia directa del paquete de aplicación y peer de `@openlens/core`) con Draft-07 por defecto, `strictSchema: true`, sin carga remota de `$ref`, y `format` como anotación (`validateFormats: false`). Keywords desconocidas, schemas inválidos y referencias no resolubles producen resultado `complete: false`; la UI dice que no hubo validación completa, nunca que los Values conforman el esquema. Los errores no incorporan valores de instancia. Esquemas booleanos Draft-07 están soportados.

## Límites de `helm pull`

- Los argumentos van separados por `execFile`, no por shell; referencias y versión vacías o iniciadas con `-` se rechazan.
- El temporal es exclusivo y se elimina incluso si Helm falla; se sanitizan patrones comunes de credenciales en errores.
- La búsqueda de `values.schema.json` no sigue symlinks y verifica contención por `realpath`. Si encuentra symlinks y no un schema regular inspeccionable, devuelve `unavailable`, no `absent`. El archivo del schema se limita a 2 MiB; el recorrido a 5.000 entradas y profundidad 64.
- **Límite pendiente:** `helm pull --untar` puede descargar y extraer un chart antes de que se apliquen esos límites. No hay cuota o límite de tamaño total del archivo/extracción ni timeout por operación. Un chart remoto/local malicioso todavía puede consumir espacio temporal; requiere decisión o hardening adicional antes de certificación global.
- Los charts requieren un repositorio/versión resoluble. El flujo offline no se certificó; un error de red o chart no resoluble queda `unavailable`.
- El release instalado no siempre conserva el alias del repositorio original: la UI deriva chart/versión de los metadatos Helm existentes. Repos renombrados o charts homónimos pueden hacer que el schema resulte `unavailable`; no hay una resolución de origen garantizada.
- No hay límite de tamaño de los dos Values obtenidos para el diff. Ajv ejecuta `pattern` con la RegExp nativa de JavaScript y sin timeout; un schema/valor adversarial podría bloquear el renderer. No se declara protección contra ReDoS.

## Verificación UI

Playwright ejecuta un harness sintético Electron sobre el `ValuesDiff` real; Monaco, DI, Icon y Spinner son stubs. Verifica que los valores no entren al DOM antes de la revelación y que el cambio de modo vuelve a ocultarlos. No prueba la aplicación empaquetada, operaciones Kubernetes, navegación completa ni compatibilidad visual global.
