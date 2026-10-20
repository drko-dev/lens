# R1-01 — Build ejecutable y validación de interfaz
**Fecha:** 2026-10-19  
**Rama:** `feat/openlens-devops-revival`  
**HEAD de base:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`  
**Estado:** **build y smoke automatizado aprobados; terminal y tema visual requieren validación adicional**. Sin autorización necesaria para continuar trabajos que no contacten clústeres reales.

## Binario generado y verificaciones
- **App:** `open-lens/dist/mac-arm64/OpenLens DevOps.app`
- **Ejecutable:** `open-lens/dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`
- **Tamaño:** 760 MiB (último empaquetado).
- **SHA-256 de `Contents/Resources/app.asar`:** `23e49ab4dc450b5cb409b5feb53f384a3746f94a7279d824efb0138cca5aedff`.
- **Arquitectura:** Mach-O arm64.
- **Identidad:** `CFBundleIdentifier=dev.drko.openlens-devops`, `CFBundleName=OpenLens DevOps`, protocolo `openlens-devops://`.
- **CLI integradas:** kubectl 1.25.16, Helm 3.11.0, lens-k8s-proxy 0.3.0; comprobaron versión, permisos y hash antes del primer build.
- **Contenido:** no se hallaron archivos `*hot-update*` dentro del paquete.
- **Toolchain:** Node 20.20.2/npm 10.8.2; Electron 22.3.3; empaquetado sin publicación, firma de distribución ni notarización.
- **Build monorepo:** `npm run build` terminó código 0; 40 proyectos, 36 desde cache. Registro: `/tmp/openlens-r1-01-build-isolation2.log`. Hubo una iteración fallida por tipado del test de aislamiento, corregida; luego build exitoso.
- **Empaquetado:** `npm run build:app -- --mac dir --arm64` terminó código 0. Registro: `/tmp/openlens-r1-01-package-isolation.log`.

## Hallazgo crítico surgido durante el smoke
En el primer arranque con `CICD` temporal y `KUBECONFIG=/dev/null`, el catálogo enumeró referencias a kubeconfigs del perfil real porque `homeDirectoryPathInjectable` dependía de `os.userInfo().homedir`, cuyo valor en macOS ignora `HOME`. Los clústeres encontrados estaban **desconectados**; no se realizaron consultas ni mutaciones Kubernetes. No se considera ese arranque como seguro.

**Corrección acotada al modo de pruebas:** `packages/core/src/common/vars/user-info.injectable.ts` usa `process.env.HOME` únicamente cuando `CICD` y `HOME` están definidos. En uso normal sigue usando `os.userInfo()` sin cambios. Test agregado: `packages/core/src/common/vars/user-info.test.ts`, pruebas de modo normal y modo aislado. Jest: 2 suites / 6 pruebas aprobadas al combinarlo con `app-paths.test.ts`. Luego se recompiló y empaquetó el .app.

## Smoke de aplicación empaquetada (Playwright + Electron)
**Script de regresión reutilizable:** `docs/revival/scripts/smoke-r1-01.cjs`. Ejecutar bajo Node 20 desde la raíz con:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
node docs/revival/scripts/smoke-r1-01.cjs
```
El test crea perfil de usuario aislado `HOME` y `CICD` en una carpeta temporal, configura `KUBECONFIG=/dev/null`, ejecuta el binario empaquetado real con `--integration-testing`, y cierra la aplicación.

| Comprobación | Resultado |
|---|---|
| Electron lanza el .app real | **PASS** |
| `app.isPackaged=true` y nombre OpenLens DevOps | **PASS** |
| `app.getPath('userData')` dentro de carpeta temporal | **PASS** |
| Ventana Welcome visible | **PASS** |
| Navegar a catálogo desde Welcome | **PASS** |
| Catálogo con **0** recursos y sin referencias a kubeconfigs reales | **PASS** |
| Preferencias desde menú nativo OpenLens DevOps > Preferences | **PASS**, ruta `/preferences` |
| Cierre limpio del proceso vía Playwright | **PASS** |
| Prueba de terminal local en GUI | **PENDIENTE:** sin contexto de clúster en el perfil de prueba |
| Alternar tema claro/oscuro desde Preferencias | **PENDIENTE:** navegación comprobada, cambio de tema no automatizado aún |
| Comprobación de invariancia de mtimes de perfiles oficiales | **NO CONCLUYENTE:** se detectaron cambios en tiempos de modificación de dos directorios entre mediciones; no es posible atribuirlos a nuestra ejecución frente a otras apps/servicios. No declarar perfiles inmutados por esa métrica. |

**Capturas guardadas bajo control del repositorio:**
- `docs/revival/evidence/R1_01_WELCOME.png`
- `docs/revival/evidence/R1_01_EMPTY_CATALOG.png`

## Entorno y residuos
- Los bundles anteriores a R1-01 se preservaron como `packages/core/static/build.r1-00-backup`, `open-lens/static/build.r1-00-backup` y `open-lens/dist.r1-00-backup`, sin borrado.
- No se hizo `git clean`, `git reset --hard`, instalación global ni actualización masiva.
- No se conectó a ningún clúster; la app se ejecutó mediante proceso Electron temporal, con captura de pantalla.
- El uso de disco del build puede fluctuar por APFS y caches; verificar `df -h /System/Volumes/Data` antes de builds posteriores.

## Paso siguiente
La base para trabajo offline está **verificada por build + smoke real**. El usuario pidió avanzar sin aprobaciones rutinarias entre hitos: se puede preparar R1-02 con pruebas unitarias y UI offline. **No tratar como completada la prueba de terminal ni la seguridad de conexión contra Kubernetes real** hasta usar un laboratorio autorizado y comprobable. El test de perfil aislado debe repetirse tras cada build.
