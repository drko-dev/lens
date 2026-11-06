# H8 — Limpieza de disco previa a H8.7

**Fecha:** 2026-11-06
**Contexto:** petición expresa de liberar espacio antes de continuar; ejecución local en Mac ARM64.
**Proyecto canónico:** `lens-v6-ui-corrections`.

## Resultados verificados

| Métrica | Resultado |
|---|---|
| Espacio disponible al comenzar | 8.983.318.528 bytes (~8,37 GiB) |
| Tras eliminar cachés y 9 perfiles de QA RC2 | 11.234.897.920 bytes (~10,46 GiB) |
| Tras retirar trazas/videos H7 antiguos | 12.905.250.816 bytes (~12,02 GiB) |
| Recuperación neta aproximada | 3,65 GiB (puede fluctuar por el SO) |
| Porcentaje ocupado según `df -h` al terminar | 94 % |

## Eliminación selectiva realizada

1. Cachés **regenerables** de `open-lens/node_modules/.cache` (~1,1 GiB) y `packages/core/node_modules/.cache` (~304 MiB). No se borraron los módulos instalados.
2. **Nueve perfiles temporales** con prefijo `openlens-h8-mvp-rc2-qa-` bajo el directorio temporal del usuario (~670 MiB), tras verificar que no había procesos OpenLens/QA/build activos.
3. Solo subcarpetas `traces/` y `video/` de **74 corridas históricas H7 no citadas en documentos H7 ni comprendidas entre las últimas cinco**. Ahorro adicional medido: 1.693.749.248 bytes (~1,58 GiB). No se eliminaron directorios de corrida completos.

## Material preservado y comprobado

- Las **91 corridas históricas H7** mantienen `results.json`, `report.html`, capturas, evidencias y `profile-backup`. Las 12 corridas citadas por los documentos H7 y las 5 últimas conservan también videos y trazas.
- Instaladores `open-lens/dist/h8-mvp-rc1/` y `open-lens/dist/h8-mvp-rc2/` (~1,3 GiB cada uno), sin modificaciones.
- Comprobación posterior de los hashes DMG: RC1 `862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678`; RC2 `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1`.
- Todo Git, worktrees, cambios versionados, archivos sin seguimiento, kubeconfigs, Keychains, bases de datos personales y perfiles reales.

## Pendientes y restricciones

- RC2 conserva un pendiente de QA para comparar la **distribución guardada y restaurada** del SplitPanel (no solamente su existencia). No hacer merge hasta revisarlo.
- H8.7 — Centro de Documentación integrado es obligatorio y aún no está implementado. El paquete RC2 no lo contiene.
- **No generar un build nuevo sin medir de nuevo el disco**: las cachés regeneradas y el uso de swap pueden volver a ocupar espacio.
- Para limpiar RC1 se requerirá confirmar aprobación del reemplazo y preservar el rollback.
- Registros operativos adicionales en `/tmp/openlens-h8-selective-cleanup-report.txt` y `/tmp/openlens-h8-selective-cleanup-h7-traces.txt` (temporales, pueden desaparecer al reiniciar).

**No se hizo push ni merge y no se reconstruyeron aplicaciones.**

## Actualización posterior a la aceptación RC2 — 06/11/2026

- Se ejecutó el **fast-forward local a develop** hasta `83b1307f`, conservando los checkpoints y ramas originales.
- Se creó `feature/h8-7-documentacion-in-app` desde ese commit, sin push remoto.
- **Retiro del compilado obsoleto RC1:** ya aceptado RC2 y conservadas las evidencias e informes, se eliminó exclusivamente `open-lens/dist/h8-mvp-rc1/` (DMG, ZIP, blockmaps, mac-arm64 y manifiestos de compilación). Antes se verificaron los SHA-256 de RC1 y RC2.
- **Espacio realmente recuperado:** 1.362.571.264 bytes (~1,27 GiB). Espacio disponible justo después: 13.292.347.392 bytes (~12,38 GiB); `df -h` informa 94 % ocupado.
- **Se conserva intacto RC2** en `open-lens/dist/h8-mvp-rc2/`: DMG SHA-256 `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1`; ZIP SHA-256 `209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681`.
- **El instalador RC1 ya no está en el disco**, pero sus commits, checkpoint, informes y hashes históricos permanecen disponibles para reconstrucción.
- Antes del siguiente empaquetado H8.7, medir nuevamente el disco y estimar el tamaño de los nuevos artefactos. No borrar RC2 ni materiales personales.
