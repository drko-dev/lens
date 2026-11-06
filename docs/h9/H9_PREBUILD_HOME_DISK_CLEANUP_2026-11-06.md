# H9 — Limpieza selectiva de Home y temporales, previa al build

**Fecha:** 2026-11-06, horario local de Argentina.
**Mac:** Macbook-air-M4-de-Gustavo.local.
**Proyecto:** lens-v6-ui-corrections, rama feature/h9-brand-identity.
**Estado:** limpieza ejecutada y verificada. No se ejecutó build, push, merge ni modificación de código.

## Recuperación comprobada

| Grupo verificado | Bytes netos liberados |
|---|---:|
| Cachés QA H7, uv, npm _cacache, Electron y node-gyp | 2.114.945.024 |
| Cachés de distribuciones Gradle y Raspberry Pi | 1.179.410.432 |
| Stages empaquetados y perfiles del QA OpenLens de 28/10 | 5.624.418.304 |
| Caché de Minikube y perfiles sintéticos UIUX antiguos | 2.068.385.792 |
| **Total de bytes liberados por estas operaciones** | **10.987.159.552 (~10,23 GiB)** |

Las cifras son diferencias medidas entre el espacio libre antes y después de cada eliminación, NO una medida de espacio libre final desde el comienzo de la sesión.

**Estado dinámico:** el sistema varió fuertemente durante la inspección, desde 36 GiB libres al comienzo hasta ~8,5 GiB en el mínimo observado, aun mientras se limpiaba. Tras retirar los temporales de 28/10, quedó en ~15 GiB. No se identificó una causa confirmada del consumo paralelo. Time Machine reportó `Running = 0`; no se detectaron snapshots APFS del volumen Data; la swap observada fue ~2–3 GiB. **No atribuir la variación de espacio a los archivos borrados. Medir de nuevo ANTES de cada build.**

## Qué se eliminó, y qué NO

- Solo las cachés `Cache`, `Code Cache`, `GPUCache`, `Dawn/Graphite` de dos perfiles sintéticos H7 en `~/Documents/lens/qa-profiles/h7-dev/appdata/`. Se preservaron las bases SQLite, estado, preferencias y configuraciones.
- Solo `~/.cache/uv`, `~/.npm/_cacache`, `~/Library/Caches/electron`, `~/Library/Caches/node-gyp`, `~/.gradle/wrapper/dists` y `~/Library/Caches/Raspberry Pi`, todos regenerables. **No borrar `~/.npm/_npx`**: el agente Desktop Commander se ejecuta desde allí. Algunas herramientas deberán volver a descargar dependencias en usos futuros.
- Se eliminaron `/private/var/tmp/om-uiux-20261028/profiles`, `.../mk/cache`, `/private/var/tmp/openlens-safe-qa-20261028.6Ykc6F/stage` y dos directorios de tests `/private/var/tmp/ol-validate03-static.XQDtzY/v2` y `v3`. Se conservaron logs, PNG históricos y scripts del nivel superior.
- Se eliminaron solo subdirectorios `home`, `profiles`, `appdata`, `cicd` de 102 tests UIUX históricos del 28/10, y la subcarpeta `/private/var/tmp/om-uiux-20261028/mk/.minikube/cache`. Se preservaron los scripts, logs y el directorio `.minikube/machines` de ese test por prudencia.
- Se preservaron en su totalidad: instalador `open-lens/dist/h8-mvp-rc2/`, historial Git/checkpoints, archivos sin seguimiento, datos reales de `~/Library/Application Support/OpenLens DevOps`, kubeconfigs, Keychains, historiales Gemini/Claude/OpenCode y proyectos externos.

## Inventario de Home, para revisión con autorización adicional

- `~/Desktop/.venv`: ~2,2 GiB. Entorno virtual Python; no borrar sin saber si está en uso.
- `~/Documents/lens-out-of-repo-20261030`: ~1,8 GiB; contiene ~1,3 GiB de releases antiguas y ~456 MiB de backups. Preservar hasta autorizar retiro.
- `/private/var/tmp/om-uiux-20261028/mk/.minikube/machines`: ~1,4 GiB. Máquina local de test antiguo; no tocar sin autorizar eliminación de ese estado.
- `~/Library/Caches/Google`: ~2 GiB, Google Chrome estaba activo. Evitar limpiar en caliente.
- `~/Library/Caches/orca-updater`: ~533 MiB, Orca estaba activa. Evitar limpiar en caliente.
- `~/.gemini/antigravity-cli`: ~4,2 GiB, con `brain` (~2,9 GiB) y `conversations` (~1,3 GiB). **Historial de agente, no cache**. No borrar automáticamente.
- `~/deploys`: ~5,4 GiB y `~/Documents/lens`: ~5,2 GiB: proyectos/código, no borrar.

## Reglas de preflight para H9

1. Medir `df -h` ahora y unos minutos después para comprobar estabilidad; no iniciar empaquetado si el espacio libre continúa cayendo.
2. Confirmar que RC2 DMG/ZIP estén disponibles como rollback y no sobreescribirlos.
3. Reusar dependencias existentes y evitar regenerar builds múltiples; crear un único RC con H8.7 + H9 cuando los assets de marca aprobados estén disponibles.
4. Si se necesita retirar el venv oculto de Desktop, copias de release 20261030 o Minikube test VM, pedir autorización explícita indicando la ruta exacta y los GB por recuperar.
5. Respetar sin excepción kubeconfigs, Keychains, datos del usuario, repositorios y archivos no rastreados.

Logs de operaciones selectivas en:
- `/tmp/openlens-home-selective-cleanup-2026-11-06.json`
- `/tmp/h9-prebuild-old-qa-temp-clean-2026-11-06.json`
- `/tmp/h9-prebuild-old-uiux-temp-clean-2026-11-06.json`
