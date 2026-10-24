# R7-07 — Auditoría de cierre: Helm Intelligence

| Campo | Valor |
|---|---|
| Rama / base | `feat/r7-07-helm-intelligence` / `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` |
| Worktree | `/Users/gustavomarcon/Documents/lens/lens-r7-07-helm` |
| Estado | Checkpoint local selectivo preparado; no equivale a certificación global ni empaquetado |

## Lo existente reutilizado

El repo ya proveía `helm history`, Values de la revisión actual (`helm get values`), rutas y clientes API por clúster, gestión de kubeconfig proxy, `MonacoDiffEditor`, `EnvironmentBadge` y el editor de upgrade. R7-07 extiende el servicio existente con `--revision`, agrega los modelos/vistas que faltaban y obtiene el schema del chart por `helm pull`.

## Hallazgos corregidos

1. `parseInt("2junk")`/`parseInt("2.5")` podía convertirse en una petición de la revisión actual o en una revisión errónea. La query ahora admite solo dígitos, entero positivo safe, y responde HTTP 400 si el parámetro presente es inválido.
2. El enmascarado por nombre no podía proteger secretos bajo claves inocuas. Se reemplazó por ocultar todos los Values por defecto y revelar el diff solo ante acción explícita. Se limpia el estado al cerrar/cambiar comparación.
3. El validador propio no cubría Draft-07 completo y podía dar falsa impresión de éxito. Se reemplazó por Ajv declarado como dependencia; schemas desconocidos, inválidos o `$ref` no resolubles quedan incompletos y la UI no afirma conformidad.
4. El lector de chart rechazaba schemas raíz booleanos válidos; ahora admite `true`/`false` Draft-07.
5. El límite de recorrido del chart y un schema symlink antes podían parecer “schema ausente”. Ahora el archivo se limita a 2 MiB, el recorrido a 5.000 entradas/profundidad 64; symlinks y límites excedidos devuelven `unavailable` cuando no hay schema regular seguro que inspeccionar.

## Revisión de riesgos / límites

- Revisión A/B cubre vacío, 403, errores generales, desconexión, revisiones inexistentes, aislamiento namespace/release, cambio de clúster, cambios de selección y respuestas asíncronas tardías en los modelos.
- `sanitizeHelmOutput` cubre URL con credenciales, bearer y asignaciones comunes `token/password/passwd/apikey/api_key/secret`. No es redacción universal de cualquier formato secreto.
- `helm pull` no usa shell, rechaza opciones inyectables, limpia el temporal, no sigue symlinks, protege el realpath, limita schema/recorrido y degrada errores de red. No limita el tamaño total del paquete/extracción ni impone timeout: **riesgo pendiente de agotamiento del disco temporal**.
- Solo hay Playwright sintético del componente; no se ejecutó Electron empaquetado ni se conectó a clúster.

## Gates ejecutados en el worktree

- Jest dirigido R7-07: 10 suites / 97 tests, todos PASS.
- TypeScript `packages/core`: PASS, 0 errores.
- ESLint estricto y dirigido: PASS, 0 warnings/errores.
- Playwright synthetic component harness: PASS; alcance limitado descrito arriba.
- Regresión global comparada contra la base: 318 identidades de fallo comunes, 0 nuevas; 316 snapshots fallidos en las mismas 68 suites. El inventario y las diferencias Helm revisadas están en `R7_07_VALIDATION.md`.
