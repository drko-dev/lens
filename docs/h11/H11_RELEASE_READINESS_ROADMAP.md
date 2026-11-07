# H11 — Preparación de distribución, firma y recuperación de NovaKube

**Inicio:** 2026-11-07  
**Rama:** `feature/h11-release-readiness`  
**Base:** `feature/h10-packaged-multicluster-qa@0ef4fda9` (H10 aún no integrado a develop)  
**Estado:** ROADMAP / PREFLIGHT; ninguna publicación autorizada.

## Propósito

Pasar del candidato macOS ARM64 **H9 NovaKube RC1 — QA interno** a una futura entrega técnicamente distribuible, con rollback real, firma Apple Developer ID Application, notarización y pruebas Gatekeeper. No asumir que la firma Apple Development del RC1 habilita publicación.

**Referencias:** `docs/h10/H10_PACKAGED_MULTICLUSTER_QA_DELIVERY.md`; `docs/h10/H10_INDEPENDENT_INTEGRITY_AUDIT_2026-11-07.md`; `docs/h9/H9_RC2_RISK_ACCEPTANCE_LOCAL_INTEGRATION_2026-11-06.md`; documentación oficial de Apple: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution

## H11-00 — Inventario y seguridad (PRELIMINAR PASS; sin efectos productivos)
- Confirmado H10 auditado en `0ef4fda9` y binarios RC1 preservados byte a byte.
- DMG/ZIP RC1: hashes válidos; app `codesign --verify --deep --strict` PASS; DMG `hdiutil verify` PASS.
- La firma actual es **Apple Development**, Hardened Runtime presente, **no** Developer ID ni notarización.
- Directorios RC2 `open-lens/dist/h8-mvp-rc2` y RC3 `~/Documents/lens/releases/rc3-pre-h7-2026-11-02`: contienen manifiestos pero NO instaladores DMG en las rutas revisadas. No afirmar que son rollback instalable.
- `open-lens/build/notarize.js` importa `electron-notarize` antiguo y usa variables `APPLEID`, `APPLEIDPASS`, `ASCPROVIDER`; requiere modernización/validación contra notarytool antes de distribución.
- Aproximadamente 33 GiB libres durante revisión. H11 no ejecutó build ni borró caches.
- GitHub `origin/develop` está atrás del `develop` local; push bloqueado hasta autorización. Conservar todos los untracked.

## H11-01 — Recuperación de rollback instalable (PENDIENTE / GATE BLOQUEANTE)
1. Inventariar candidatos históricos de solo lectura y verificar contenido real, arquitectura, firma, `hdiutil verify`, checksum esperado y arranque aislado. Un manifiesto por sí solo **no** es backup.
2. Si se encuentra RC2/RC3 original, aceptar únicamente si coincide exactamente con SHA conocido; registrar path e integridad.
3. Si no existe copia original, construir **otro candidato de respaldo separado** desde commit histórico identificado, con nombre y hash nuevos; jamás etiquetarlo falsamente como «RC2 restaurado».
4. Probar instalación y vuelta atrás sobre un perfil QA desechable; proteger preferencias y sesiones del usuario. Si no hay rollback comprobable, el gate de publicación permanece BLOCKED.
5. No borrar ni sobrescribir H9 RC1, H8/RC2, manifiestos o cualquier evidencia de QA.

## H11-02 — Pipeline de firma y notarización (PENDIENTE)
1. Revisar compatibilidad de `electron-builder` actual, su `afterSign` y `electron-notarize`; migrar el flujo a `notarytool` (por ejemplo a una versión compatible de `@electron/notarize`) sin romper builds QA internos.
2. Distinguir modos **QA interno sin notarización** y **distribución firmada/notarizada**. En modo distribución, fallar cerrado si falta Developer ID, Hardened Runtime, timestamp seguro, entitlements o credenciales.
3. Nunca registrar ni escribir tokens privados, Apple ID passwords, claves API o certificados en Git, artefactos, reportes o salida verbosa; usar almacén seguro/inyección controlada.
4. Crear pruebas unitarias del gate y fallos de notarización con mocks, sin usar cuenta Apple real.
5. No intentar notarizar RC1 firmado con Apple Development; Apple exige Developer ID Application para distribución directa.
6. La ejecución real de firma/notarización requiere identidad Developer ID autorizada y un paso explícito posterior; no acceder al Keychain del usuario durante QA.

## H11-03 — Nuevo candidato aislado (PENDIENTE / requiere preflight)
- Antes de compilar, medir espacio dos veces y exigir como mínimo 18 GiB libres más reserva calculada del pico del build; congelar commit SHA y dependencias.
- Un único candidato por intento, en `open-lens/dist/h11-<release-id>/`, jamás en `h9-novakube-rc1/`.
- Generar DMG/ZIP, SHA256SUMS, builder config, firma/verificación, `hdiutil verify`, `spctl` (si corresponde) y manifiesto de origen.
- Ejecutar smoke sobre el .app real, fuera del dev server. Preservar evidencia en `docs/evidence/h11` sin modificar H9/H10.
- No reutilizar el número «RC2» si no se está restaurando el artefacto histórico idéntico.

## H11-04 — Aceptación funcional y seguridad (PENDIENTE)
- Repetir escenarios H10 focalizados sobre el nuevo paquete, dos APIs sintéticas en 127.0.0.1 y perfil temporal; Keychain simulado, offline, cero tráfico a clúster real.
- Validar apertura, NovaKube, Production, 2 px, dos ventanas detached, Redock, IPC aislado, cold restart, persistencia del tema y ausencia de streams reactivados de forma automática.
- Comprobar Gatekeeper en instalación limpia/cuarentena después de notarización; sin desactivar seguridad del sistema para simular un PASS.
- Controlar licencias, avisos, iconos, nombre, actualización y referencias a marca antes de distribución pública.

## H11-05 — Auditoría independiente y decisión (PENDIENTE)
- Registrar matriz de pruebas, versiones, hashes, firma, ticket y `stapler validate` cuando aplique; conservar rollback verificado.
- Resultado **PASS** únicamente si los gates funcionales, de firma/notarización y recuperación cumplen; si no, **QA INTERNO/PARTIAL/BLOCKED**, nunca «release público».
- Integrar H10 y H11, publicar en GitHub, crear release, distribuir, limpiar builds o firmar con identidad productiva **solo con autorización explícita**.

## Lo realizado en este arranque de H11
- Se creó la rama local y este roadmap desde el H10 auditado.
- No se alteró el código productivo, no se instalaron dependencias, no se hicieron builds, no se accedió a Keychain real, no se publicó ni se eliminó nada.
- El próximo trabajo implementable sin credenciales es H11-01 (inventario y validación de rollback) y H11-02 (modernización del hook con mocks).
