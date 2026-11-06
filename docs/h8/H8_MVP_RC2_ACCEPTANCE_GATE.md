# OpenLens DevOps — H8 MVP RC2: gate final de aceptación independiente

Fecha: 2026-11-06
RC2 original: commit 146adb9e, checkpoint/h8-mvp-rc2-2026-11-06.
Rama correctiva: feature/h8-mvp-rc2-acceptance-gate.
**Dictamen: paquete y smoke de flujos sintéticos PASS; aceptación funcional/visual integral PARTIAL. No fusionar todavía con develop ni borrar RC1.**

## Confirmado de manera independiente

- RC2 empaquetado presente en open-lens/dist/h8-mvp-rc2, RC1 en h8-mvp-rc1; SHA256 recalculados coinciden:
  - RC2 DMG b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1
  - RC2 ZIP 209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681
  - RC1 DMG 862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678
  - RC1 ZIP 55aa127382992840e4baad01b10a10e501330a58a4403e1b0ee43ebd51b9cb8c
- codesign --verify --deep --strict de RC2: PASS.
- hdiutil verify DMG RC2: VALID.
- Jest independiente con NVM Node v24.22.2: 34 suites, 295/295 PASS (reporte Gemini: 34 suites, 294/294; distinto filtro o selección).
- Se ejecutó de nuevo el smoke de la aplicación empaquetada con perfil SQLite de prueba y capturas en un directorio temporal en vez de modificar evidencia versionada. Log: /tmp/openlens-h8-rc2-independent-packaged-qa.log; resultado de script: "H8 MVP RC2 PACKAGED APPLICATION QA COMPLETADA EXITOSAMENTE (PASS)".
- Confirmó migración SQLite v7->v8, tres incidentes diferenciados por resourceUid/signalType y deduplicación indexada tras reiniciar; acciones snooze y dismiss con actor unverified-local-operator.
- Las seis capturas históricas y las seis capturas de la repetición son byte a byte IDENTICAS entre sí, SHA256 22dfc05b394554e9fc244b4f811597cf421b44ff14771b64e77235c31ca52990; todas muestran el mismo fotograma y no evidencian la UI de las seis etapas. No reutilizarlas como evidencia de distintas pantallas.

## Bloqueantes QA-01..03

### QA-01: Evidencia visual sin navegación funcional

El script h8-mvp-rc2-packaged-qa.mjs emite IPC desde window.require('electron') sin navegar de modo verificable a Centro de Incidentes, Workbench, diagnóstico y paneles de docking. Hace screenshots repetidas de la misma ventana. Corregir capturas: usar navegación real de Playwright y aserciones por componentes/test IDs de cada pantalla; si la app no permite esa navegación por defecto, reportar BLOCADO en vez de renombrar capturas. Las 6 capturas nuevas deben diferenciar contenido visible en las fases que dicen mostrar. Validar comportamientos con UI visible, no solo respuestas IPC.

### QA-02: Pruebas declaradas pero no realmente ejecutadas sobre el paquete

El paso 7 "Contexto Efímero, Diagnóstico Mock y Global Docking" solo comprueba ausencia de dos tablas SQLite y si existe un elemento generic #app (fallback que no demuestra docking). No ejecuta adjuntar contexto, sanitización, preview y consentimiento, diagnóstico mock, citas, purga/cancelación ni docking/re-docking. Implementar un E2E real con datos sintéticos para estos flujos y afirmar PASS únicamente de los pasos efectivamente ejecutados; si una UI está bloqueada, marcar PARTIAL con justificación y no reclamar cobertura.

### QA-03: Aislamiento de usuario incompleto

El QA crea directorio userData sintético mediante CICD pero pasa HOME:process.env.HOME al empaquetado. En la re-ejecución, el log de Electron muestra KUBECONFIG-SYNC iniciando watch tanto de directorio sintético como de /Users/gustavomarcon/.kube y leyendo un config.bak. No se observó conexión real a Kubernetes, pero se consultó configuración de usuario, por lo que el QA no es totalmente aislado. NO repetir este comportamiento deliberadamente.

Corregir: lanzar app con HOME y KUBECONFIG confinados a directorio temporal con kubeconfig sintético sin endpoints verdaderos. Revisar si la app usa os.homedir(), rutas del sistema o Settings que puedan acceder a la carpeta real; probar con perfil HOME íntegramente aislado y una aserción de log que falle si aparece /Users/gustavomarcon/.kube o cualquier ruta real de usuario. Cero lectura de kubeconfig real, cero conexión externa. Mantener separados los perfiles y bases RC1/RC2.

## Aceptación e integración final

1. Corregir solamente QA, fixtures, tests e informe; evitar recompilar DMG/ZIP si no cambia runtime. Si cambia runtime, reconstruir en una carpeta versionada NUEVA (no sobrescribir RC2 validado) y volver a firmar/calcular hashes.
2. Ejecutar el smoke corregido en app empaquetada con HOME totalmente aislado. Corregir la evidencia de las distintas pantallas con capturas genuinas. No borrar evidencias previas sin preservar su historial Git; actualizar con nuevo commit de capturas y reporte honesto.
3. No utilizar kubeconfig de usuario, clústeres reales, proveedores IA remotos ni credenciales de producción.
4. Repetir regresión focalizada Jest solo si cambia código ejecutable o fixtures y comprobar que no hay cambios versionados no intencionales.
5. Registrar informe docs/h8/H8_MVP_RC2_ACCEPTANCE_REPORT.md con PASS/PARTIAL/BLOCKED por cada feature; distinguir paquete, migración y demo UI.
6. Tras aprobación independiente, integrar la rama por fast-forward en develop. No realizar push.
7. Solo entonces, y previa comprobación de que RC2 está intacto y aceptado, el usuario ya expresó intención de borrar builds compilados anteriores; conservar ramas, documentación, hashes y todo material de usuario. No limpiar RC1 ahora.
