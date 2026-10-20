# R1-04 — Fidelidad de kubeconfig, aislamiento de errores y matriz `exec`
**Fecha:** 2026-10-19  
**Rama:** `feat/openlens-devops-revival`  
**Base:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a` (working tree con cambios no confirmados)  
**Estado:** **código, unit tests, typecheck, build del monorepo, empaquetado ARM64 y smoke GUI aislado aprobados**.

## Cambios implementados
1. **Fidelidad de serialización y round-trip (`packages/core/src/common/kube-helpers.ts`):**
   - `loadToOptions` y `dumpConfigYaml` preservan de punta a punta (`loadConfigFromString` → `splitConfig` → `dumpConfigYaml` → `loadConfigFromString`) los campos de clúster que `@kubernetes/client-node` descartaba al construir `Cluster`:
     - `tls-server-name` (`tlsServerName`)
     - `proxy-url` (`proxyUrl`, validando esquemas `http:`, `https:`, `socks:`, `socks4:`, `socks4a:`, `socks5:`, `socks5h:`)
     - `disable-compression` (`disableCompression`)
     - `extensions` (en `cluster`, `user` y `context`)
   - Preservación de `token-file` (`tokenFile`) e impersonación (`as`, `as-uid`, `as-groups`, `as-user-extra`) en `users`, evitando que la ausencia del archivo `token-file` en el momento de parsear lance `ENOENT` o reemplace `token-file` por un `token` estático al volcar YAML.
2. **Fidelidad y validación de `exec` (`packages/core/src/common/kube-helpers.ts`):**
   - Clonación profunda y preservación de `user.exec` (`apiVersion`, `command`, `args`, `env`, `interactiveMode`, `provideClusterInfo`, `installHint` y propiedades extendidas).
   - Nueva función `validateExecConfig(exec, userName)` integrada en `validateKubeConfig(config, contextName)` que comprueba que `command` sea un string no vacío, `args` sea un arreglo de strings, `env` contenga pares `{ name, value }` válidos, `interactiveMode` sea `Never | IfAvailable | Always` y `provideClusterInfo` sea booleano.
3. **Aislamiento de entradas defectuosas y redacción de secretos (`packages/core/src/common/kube-helpers.ts` y `packages/core/src/main/catalog-sources/kubeconfig-sync/compute-diff.injectable.ts`):**
   - Uso de `ActionOnInvalid.FILTER` junto con `stripUnknown: { arrays: true }` para conservar `clusters`, `users` y `contexts` válidos aunque existan entradas hermanas malformadas en el mismo archivo.
   - `loadValidatedConfig(content, contextName)` evalúa la validez del contexto solicitado sin bloquearlo por errores de esquema en entradas ajenas del mismo archivo.
   - `sanitizeKubeConfigValidationDetails` y `sanitizeValidationError` eliminan `error._original` y `detail.context.value` (donde Joi adjunta el objeto original con `token`, `password`, `client-key-data` o `exec.env`), evitando fugas de credenciales en `compute-diff.injectable.ts` y en la UI.
4. **Watcher de sincronización (`watch-file-changes.injectable.ts`):**
   - Confirmada sin reimplementación innecesaria la configuración existente (`awaitWriteFinish`, `atomic: 150`, límites `2 MiB` / `32 MiB`, filtros `.lock`/`.swp`/`.DS_Store`) y permisos `0o600` en `kubeconfig-manager.ts` y `add-cluster.tsx`.

## Pruebas y validación ejecutadas
- **Jest (`kube-helpers.test.ts`, `kubeconfig-sync.test.ts`, `kubeconfig-manager.test.ts`, `kube-auth-proxy.test.ts`):** **4 suites / 50 pruebas aprobadas** bajo Node `v20.20.2`.
  - Incluye prueba de round-trip completo (`tls-server-name`, `proxy-url`, `disable-compression`, `token-file`, `as*`, `exec`), aislamiento de entradas defectuosas sin fuga de secretos en logs, validación de `exec`/`proxy-url` y matriz sintética de autenticación `ExecAuth` (`env`, expiración/renovación de token y binario inexistente).
- **Typecheck (`npx tsc -p packages/core/tsconfig.json --noEmit`):** **exit 0**.
- **Build del monorepo (`npm run build`):** **exit 0** (40 proyectos compilados con Node `v20.20.2`; log en `/tmp/openlens-r1-04-build.log`).
- **Empaquetado macOS ARM64 (`npm --workspace open-lens run build:app -- --mac dir --arm64 -c.directories.output=dist-stage`):** **exit 0** sin firma ni publicación; log en `/tmp/openlens-r1-04-package.log`.
- **Smoke GUI con Playwright (`node docs/revival/scripts/smoke-r1-01.cjs`):** **exit 0** contra `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` con `HOME` y `CICD` aislados (`/tmp/openlens-r1-01-safe-FAWkxJ`) y `KUBECONFIG=/dev/null`.

## Binario y evidencias
- Aplicación generada: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
- `Contents/Resources/app.asar` SHA-256: `93646c48f7e55ce951488ea0bf0f4f5f65931f3d9be027e5e34739e69357c0af`
- Capturas de pantalla:
  - `docs/revival/evidence/R1_04_EMPTY_CATALOG.png`
  - `docs/revival/evidence/R1_04_PREFERENCES.png`
