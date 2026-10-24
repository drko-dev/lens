# R7-07 — Security Review

| Campo | Valor |
|---|---|
| Estado | Revisión dirigida completada; no certificación global |
| Base | `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` |

## Operaciones y contexto

| Operación | Comando/flujo | Mutación de clúster |
|---|---|---|
| Historial | `helm history` con kubeconfig/contexto del cluster | No |
| Values de revisión | `helm get values [--all] [--revision N]` | No |
| Schema | `helm pull --destination <dir>` con extracción por streaming tar en memoria y límites estrictos | No |

No se añadió `install`, `upgrade` ni `rollback`. Los servicios de historial/Values existentes conservan el kubeconfig proxy asociado al clúster. `helm pull` descarga el archivo comprimido sin extracción automática, y el análisis del schema se realiza por streaming en memoria con límites estrictos.

## Secrets y credenciales

- El diff no renderiza Values hasta el clic explícito **Reveal values**; no se afirma que los Values estén redactados.
- Este control cubre el diff nuevo, no el editor de upgrade existente: ese editor sigue mostrando el YAML editable sin redacción al operador, como antes de R7-07. No se afirma redacción universal de Values en toda la aplicación.
- Cierre del drawer y cambio de selección/modo limpian la memoria observable del diff y descartan respuestas pendientes.
- Al revelar se muestra el YAML original completo, incluidos secretos bajo nombres arbitrarios. No se puede garantizar prevención de captura, copia o lectura por procesos que ya acceden a la memoria del renderer.
- Errores de Helm pasan por redacción de URL `user:password@`, bearer y claves habituales (`token`, `password`, `passwd`, `apikey`, `api_key`, `secret`). Es un filtro heurístico, no un scrubber universal.
- El validador no devuelve valores de instancia en los errores; referencias remotas no se resuelven ni se descargan.
- Se implementó mitigación de ReDoS limitando la longitud de expresiones regulares en esquemas a 256 caracteres y limitando el tamaño del documento de Values a 1 MiB.

## `helm pull`, `execHelm` y mitigación de archivos no confiables

Se corrigieron de forma integral los hallazgos bloqueantes de seguridad:

1. **Extracción segura por streaming sin materialización en disco:**
   - Se eliminó el uso de `--untar` y `--untardir` en `helm pull`.
   - Se descarga el paquete `.tgz` a un directorio temporal exclusivo mediante `--destination`.
   - Límite de tamaño del archivo descargado: máximo 15 MiB (`MAX_DOWNLOAD_ARCHIVE_BYTES`). Archivos mayores se rechazan antes de iniciar descompresión.
   - Descompresión e inspección en streaming en memoria vía `zlib.createGunzip()` y `tar-stream`:
     - Límite total de descompresión: 30 MiB (`MAX_TOTAL_UNCOMPRESSED_BYTES`) para abortar de inmediato cualquier bomba de descompresión (tar bomb / zip bomb).
     - Límite de entradas: máximo 1.000 entradas (`MAX_VISITED_ENTRIES`).
     - Límite de profundidad de directorios: máximo 16 niveles (`MAX_DIRECTORY_DEPTH`).
     - Límite de tamaño por archivo individual: 5 MiB (`MAX_INDIVIDUAL_FILE_BYTES`).
     - Límite de `values.schema.json`: 2 MiB (`MAX_SCHEMA_BYTES`).
     - Rechazo categórico de rutas absolutas (`/` o `\\`), path traversal (`..`), symlinks (`header.type === "symlink"`) y hardlinks (`header.type === "link"`).
     - Cero escrituras de archivos no-schema a disco.
   - Semáforo de concurrencia: máximo 2 operaciones simultáneas de extracción con cola acotada a 10 peticiones.
   - Limpieza garantizada en bloque `finally` con `rm(dir, { recursive: true, force: true })` ante éxito, rechazo, timeout o error.

2. **Blindaje de `execHelm` y corrección de `maxBuffer`:**
   - Se corrigió el valor de `maxBuffer` de 32 GiB (`32 * 1024 * 1024 * 1024`) al valor previsto de 32 MiB (`32 * 1024 * 1024`).
   - Se incorporó soporte para `ExecHelmOptions` (`maxBuffer`, `timeout`, `killSignal`, `signal`).
   - Timeout real por defecto de 60 segundos con señal de terminación forzosa `SIGKILL` para garantizar que ningún proceso hijo de Helm quede huérfano.
   - En la obtención de schema, `execHelm` opera con límites reducidos de 4 MiB de buffer y 30 segundos de timeout.

3. **Mitigaciones complementarias:**
   - Mitigación ReDoS en validador de esquemas: rechaza esquemas con patrones de regex superiores a 256 caracteres.
   - Límite de tamaño de Values: 1 MiB máximo para validación contra esquemas.
   - Redacción heurística de credenciales en errores de Helm (`sanitizeHelmOutput`).

## Gates de seguridad observados

- Unit tests dirigidos (11 suites / 113 tests PASS): validación exhaustiva de los 17 casos adversariales requeridos (bombas de descompresión, archivos sobredimensionados, miles de entradas, profundidad excesiva, path traversal, rutas absolutas, symlinks, hardlinks, timeout de procesos, concurrencia, cleanup y ausencia de mutaciones en clúster).
- Playwright sintético del componente real: confirma no renderizar valores antes de revelación y re-ocultarlos al cambiar modo; no prueba network/CLI ni app empaquetada.
- No hubo cluster real, empaquetado Electron, análisis de dependencia transitive/security scan específico para release ni verificación de riesgos heredados R4-09. Esos gates siguen pendientes en R7-09.
- R7-07 no corrige los riesgos heredados de `R4_09_VALIDATION.md`: el binario stock `lens-k8s-proxy` 0.3.0 mantiene acceso local sin mTLS (riesgo aceptado en R4-09) y el aislamiento de renderer/Electron está diferido. No se consideran resueltos.
