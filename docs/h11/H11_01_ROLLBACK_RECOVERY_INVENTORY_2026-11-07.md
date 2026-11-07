# H11-01 — Inventario inicial de rollback instalable

**Fecha:** 2026-11-07  
**Rama:** `feature/h11-release-readiness`  
**Estado:** **BLOCKED para distribución general** (no se encontró un instalador de rollback histórico verificable).

## Evidencia observada

- `open-lens/dist/h8-mvp-rc2/`: solo checksum, manifiestos, blockmaps y directorio `mac-arm64` vacío de .app. **NO** contiene DMG/ZIP RC2 recuperables.
- `~/Documents/lens/releases/rc3-pre-h7-2026-11-02/`: solo `SHA256SUMS` y `RELEASE_MANIFEST.txt`. El DMG RC3 documentado no está en su ruta protegida.
- `open-lens/dist/`: actualmente se enumeran `h8-mvp-rc2/` sin instaladores y `h9-novakube-rc1/` con DMG/ZIP completos.
- Consultas Spotlight (`mdfind -name`) para `OpenLens DevOps-6.5.3-dev-arm64-RC2.dmg`, `-RC3.dmg`, `-RC4.dmg`: **sin rutas devueltas**. Spotlight puede omitir ubicaciones no indexadas: no es búsqueda exhaustiva de todos los volúmenes.
- `mdfind` del nombre genérico sin sufijo RC mostró únicamente el DMG H9 RC1 y archivos blockmap.
- GitHub `drko-dev/lens`: endpoint de releases devuelve **0 releases**; no se descubrió instalador histórico publicado por ese canal.

## SHA256 históricos esperados (no equivalen a archivos recuperados)
- RC2 DMG: `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1`.
- RC3 DMG: `805972f6e58e476a840536e3ae4bb1a9817d6f27d33af27ae97131f7206c3197`.
- H9 RC1 DMG presente y verificado: `5b0b79ae91c4cddab56c0820854e9d7d650962ccdf655736d92c92831fa4fc46`.

## Decisión técnica

H9 RC1 permanece utilizable como **candidato de QA interno** y debe conservarse intacto. No afirmar que RC2 o RC3 están restaurados; una reconstrucción futura desde un commit histórico debe recibir una identidad de artefacto nueva y verificaciones completas. Antes de distribución externa se exige rollback instalable comprobado, y una firma Developer ID Application más notarización para el candidato a publicar.

**Acciones realizadas:** inventario de solo lectura; cero builds, cero limpieza, cero operaciones de Apple Keychain y cero push.
