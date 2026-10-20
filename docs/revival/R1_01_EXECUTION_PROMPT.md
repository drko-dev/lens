# Prompt ejecutable — Hito R1-01 (build, ejecución real y validación visual)

Actuá como ingeniero senior de Electron/macOS ARM64 en el repositorio `/Users/gustavomarcon/Documents/lens/lens`, rama `feat/openlens-devops-revival`.

## Contexto obligatorio
Antes de actuar leé `docs/revival/R1_00_PREFLIGHT.md`, `ROADMAP_PROVISIONAL.md`, `R1_IMPLEMENTATION_CHECKLIST.md`, `TEST_RESULTS.md`. R1-00 está COMPLETADO. El usuario ha establecido una **regla obligatoria**: **cada hito funcional deberá compilar una build real, ejecutar el binario y permitirle inspeccionar y probar la interfaz**. R1-01 inaugura esta secuencia.

## Alcance R1-01
1. Revalidá espacio libre, HEAD, `git status`, herramientas, binarios y `node_modules`; no sobrescribas cambios previos ni asumas un directorio temporal en otro disco.
2. Usá explícitamente `/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin` al inicio de PATH en todos los comandos de build/test; confirmá `node -v` y `npm -v`. No uses Node 22/26 accidentalmente.
3. **Antes de borrar o reemplazar**, pedí confirmación de la limpieza de estos **únicos directorios de salida generados**: `packages/core/static/build`, `open-lens/static/build` y `open-lens/dist`. Si es útil conservar la build anterior para rollback/comparación, proponé renombrarla o copiarla, considerando el espacio de disco. No borrar `lens.js.map`, `node_modules`, cachés globales ni datos personales sin consentimiento separado.
4. Después de esa autorización, ejecutá build controlada del monorepo y empaquetado local **.app macOS arm64**; `--publish never`, sin firma/notarización de producción. Reutilizá binarios locales solo tras verificar hashes y arquitecturas; `LENS_SKIP_DOWNLOAD_BINARIES=true`; mantener `npmRebuild: false` y evitar recompilar node-pty sin diagnóstico. Capturá logs y códigos de salida reales sin pipelines que oculten fallas (`set -o pipefail`).
5. Revisá `Info.plist`, bundle ID `dev.drko.openlens-devops`, nombre **OpenLens DevOps** y que el .app no contenga `*.hot-update.*`; constatá arquitectura arm64 y separación de perfiles.
6. **Ejecutá en el escritorio de macOS el binario real del .app generado**, no solamente `npm start` ni `webpack dev-server`. Preferí ejecutar directamente `open-lens/dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` con `CICD` apuntando a un perfil nuevo de pruebas, `KUBECONFIG=/dev/null` y `--integration-testing`, solo si se comprueba que el aislamiento realmente evita fuentes de kubeconfig existentes. No contactar clústeres de producción. Si no se puede automatizar la inspección visual, dejá la app abierta para el usuario, indicá qué debería observar y solicitá su confirmación.
7. Smoke obligatorio con evidencia: abre ventana principal, carga welcome/catalog, navega a preferencias y cambia tema, prueba apertura de terminal **local** si es seguro, confirma que no alteró datos del Lens comercial ni OpenLens clásico, y cierra limpiamente. Si necesita interacción humana para validar algo, registralo como **pendiente**; nunca inventes aprobaciones.
8. Ejecutá una selección representativa de pruebas unitarias bajo Node 20 y documentá regresiones. Corregí solo bloqueos necesarios para R1-01, proponiendo primero cambios de código si son significativos.
9. Guardá `docs/revival/R1_01_VALIDATION.md` con fecha, ruta exacta del .app, checksums/commit, versiones, comandos, logs, resultados automáticos, smoke GUI, defectos y aceptación del usuario. Actualizá exclusivamente las casillas demostradas en `R1_IMPLEMENTATION_CHECKLIST.md`.

## Condiciones de cierre
**R1-01 NO está completo** hasta que haya un .app compilado, el binario se haya ejecutado efectivamente, el smoke de UI esté verificado y el usuario haya podido verlo/probarlo. Si un punto falla o hay que elegir entre alternativas, informá estado BLOQUEADO o PENDIENTE DE VALIDACIÓN VISUAL, sin avanzar a R1-02. Pedí **una sola autorización o aclaración por vez**.

No hagas commits automáticos, no borres cambios locales, no modifiques clústeres reales y no inicies R1-02.
