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
| Schema | `helm pull --untar` hacia directorio temporal | No |

No se añadió `install`, `upgrade` ni `rollback`. Los servicios de historial/Values existentes conservan el kubeconfig proxy asociado al clúster. `helm pull` usa el repo local de Helm y puede requerir red; no se conectó a un clúster real.

## Secrets y credenciales

- El diff no renderiza Values hasta el clic explícito **Reveal values**; no se afirma que los Values estén redactados.
- Este control cubre el diff nuevo, no el editor de upgrade existente: ese editor sigue mostrando el YAML editable sin redacción al operador, como antes de R7-07. No se afirma redacción universal de Values en toda la aplicación.
- Cierre del drawer y cambio de selección/modo limpian la memoria observable del diff y descartan respuestas pendientes.
- Al revelar se muestra el YAML original completo, incluidos secretos bajo nombres arbitrarios. No se puede garantizar prevención de captura, copia o lectura por procesos que ya acceden a la memoria del renderer.
- Errores de Helm pasan por redacción de URL `user:password@`, bearer y claves habituales (`token`, `password`, `passwd`, `apikey`, `api_key`, `secret`). Es un filtro heurístico, no un scrubber universal.
- El validador no devuelve valores de instancia en los errores; referencias remotas no se resuelven ni se descargan.

## `helm pull` y archivo no confiable

Controles comprobados: `execFile` con argumentos separados; rechazo de referencia/versión vacía o que inicie con `-`; temp nuevo con limpieza `finally`; lectura con `lstat`, sin seguir symlinks, y `realpath` dentro del directorio; schema limitado a 2 MiB; búsqueda limitada a 5.000 entradas y profundidad 64. Si hay symlinks y no se puede inspeccionar un schema regular, o se excede un límite, devuelve `unavailable`, no “sin schema”.

**Riesgo abierto/bloqueante para certificación:** Helm descarga y extrae con `--untar` antes del chequeo de schema/recorrido. No hay límite del tamaño del paquete ni de la extracción completa, ni timeout por descarga. Un chart grande/malicioso puede consumir disco temporal. El directorio se elimina al completar/fallar, pero eso no previene agotamiento durante la operación. No se declara este riesgo corregido.

Ajv evalúa `pattern`/`patternProperties` con la RegExp nativa, sin timeout; tampoco se limita el tamaño de Values antes del diff/validación. No se mitiga ReDoS o payloads grandes en este hito. Considerar schemas de charts como datos no confiables y bloquear release hasta acordar un límite/aislamiento de validación.

La selección de versiones/chart se prueba con mocks; no se verificó contra un Helm 3.11 empaquetado ni contra repos remotos/offline. El Helm local es v4 y no representa el binario bundlado.
El release no garantiza almacenar el alias original del repo; el nombre/version derivados pueden no resolver unívocamente el chart que se instaló.

## Gates de seguridad observados

- Unit tests dirigidos: validación de flags, symlink, límite schema/recorrido, cleanup y sanitización.
- Playwright sintético del componente real: confirma no renderizar valores antes de revelación y re-ocultarlos al cambiar modo; no prueba network/CLI ni app empaquetada.
- No hubo cluster real, empaquetado Electron, análisis de dependencia transitive/security scan específico para release ni verificación de riesgos heredados R4-09. Esos gates siguen pendientes en R7-09.
- R7-07 no corrige los riesgos heredados de `R4_09_VALIDATION.md`: el binario stock `lens-k8s-proxy` 0.3.0 mantiene acceso local sin mTLS (riesgo aceptado en R4-09) y el aislamiento de renderer/Electron está diferido. No se consideran resueltos.
