# OpenLens DevOps — H8 MVP RC2 desde develop

Fecha: 2026-11-06
Rama de trabajo: feature/h8-mvp-rc2
Commit base de develop: 90bafad1
Alcance: reconstruir el MVP DEMO SINTETICO con los cambios H8.6.1 (baea0947); NO activar Kubernetes real ni IA externa.
Estado: PLAN PREVIO AL BUILD. Los artefactos RC2 y el QA real están pendientes.

## Preflight obligatorio (gate para lanzar compilación)

1. Leer GEMINI.md, docs/h8/H8_6_1_REMEDIACION_ENTREGA.md, docs/h8/H8_6_MVP_RC1_RELEASE_REPORT.md y este plan.
2. Comprobar que feature/h8-mvp-rc2 parte de develop=90bafad1. No reescribir historia, no push ni merge.
3. Usar NVM Node v24.22.2: el shell en el preflight mostraba v26.7.0, mientras open-lens/package.json exige ^24.0.0. Cargar nvm y verificar la versión realmente utilizada para webpack/electron-builder. Electron 45.2.0.
4. Sistema macOS Apple Silicon, arm64; nvm v24.22.2 está instalado. Memoria física: 16 GiB.
5. Espacio libre inicial aprox. 10 GiB y RC1 ocupa ~1.3 GiB. Estimar carga de build y QA. No iniciar si la proyección supera el espacio disponible; exigir margen seguro durante construcción y al menos 2 GiB libres al finalizar. Si no alcanza, documentar BLOCKED y solicitar plan de limpieza de caches compiladas claramente identificadas; NO eliminar RC1, archivos ajenos, datos SQLite personales ni node_modules de forma automática.
6. Guardar SHA256 de DMG/ZIP RC1 para comparar al terminar:
   DMG 862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678
   ZIP 55aa127382992840e4baad01b10a10e501330a58a4403e1b0ee43ebd51b9cb8c
7. Evitar builds concurrentes, uso de clusters, perfiles reales y DEV server durante QA empaquetado.

## Fuente y alcance de RC2

- RC2 se construye desde feature/h8-mvp-rc2 basado en develop H8.6.1, no desde el binario H8.6 RC1. Mantener código H7 Global Docking.
- RC1 permanece en open-lens/dist/h8-mvp-rc1/. Crear SIEMPRE nuevo output open-lens/dist/h8-mvp-rc2/.
- No modificar el número global 6.5.3-dev salvo justificación y tests de compatibilidad; distinguir candidatos por carpeta/manifest, no sobreescribir los nombres del RC1.
- Compilación production con Node 24 / Electron 45.2.0, módulos nativos arm64, better-sqlite3, node-pty, SQLite migrations y assets.
- Comprobar modo DEMO SINTETICO con cero watchers K8s reales y cero proveedores IA externos. El broker no debe introducir llamadas productivas.
- Si se requiere modificar QA o package scripts, cambios mínimos reproducibles con commits separados. No agregar funcionalidades no solicitadas.

## QA obligatoria del .app ARM64 empaquetado SIN dev server

1. Crear script nuevo open-lens/integration/h8-mvp-rc2-packaged-qa.mjs; el QA RC1 apunta a otra ruta y no debe ejecutarse por error. Usar directorio de perfil aislado y aserciones explicitas sobre app.getPath(userData) para no tocar datos locales. Directorio de QA y DB sintéticos separados de RC1.
2. Arranque real de la .app, IPC UI y persistencia con SQLite 8/8 migraciones (a diferencia de RC1 7/7). Verificar 008 en profile totalmente nuevo Y migracion 7 -> 8 en copia temporal de DB sintética pre-008 con incidentes preservados, fingerprint default, índices presentes, sin pérdida de WAL.
3. En Demo Sintético: scanner OFF por defecto, sourceType synthetic_feed, cero watchers. Activar/desactivar y comprobar filtrado de scope y reducción de duplicados.
4. Comprobar en SQLite la asignación y consulta de fingerprint, resource_uid y signal_type sobre 2 señales diferentes en un mismo pod y un pod recreado con mismo nombre/UID nuevo. Tras reiniciar, volver a detectar señal y verificar deduplicación indexada. No confundir un caso cerrado con uno abierto.
5. Acciones de alerta snooze, analyze_now y dismiss: SOLO DETECTADO -> NO CONFIRMADO, sin cierre privilegiado. Auditar actor unverified-local-operator, isVerifiedIdentity=false, claimedOperatorName solo en metadatos y ninguna afirmación de autenticación.
6. Verificar etiquetas [DEMO SINTETICO] / synthetic_feed y provenance synthetic_renderer_snapshot en timeline/metadata, sin atribuirlos a un clúster real.
7. Comprobar en aplicación empaquetada consentimiento explícito, evidencia sanitizada, contexto manual efímero, purga tras analizar/cancelar/cerrar, diagnóstico mock y cierre/reinicio. No enviar datos a APIs externas ni ejecutar comandos provenientes de adjuntos.
8. Verificar Global Docking básico (incidente y paneles), pin/acento de clúster, apertura/cierre y restauración sin regressiones visibles, sin ejecutar todos los tests H7 innecesariamente.
9. Pruebas negativas: IPC spoof/subframe, cross-incident, cross-namespace, Secret, campos adulterados, payload excesivo, cero escrituras Kubernetes, cero llamadas IA externas.
10. Capturas reales en docs/evidence/h8-mvp-rc2/ con resultados representativos. No reutilizar las capturas antiguas como evidencia RC2.

## Verificación técnica y entrega

- Antes del build ejecutar suites Jest H8 focalizadas y regresión corta de docking; baseline anterior verificado independientemente: 34 suites / 295 PASS en develop.
- Inspeccionar app real empaquetada y ejecutar codesign --verify --deep --strict, hdiutil verify.
- Generar SHASUMS para DMG/ZIP nuevos, nombre/bytes/hashes reales, version Electron y Node, fecha, branch y SHA exacto del HEAD de build. Verificar RC1 checksum inalterado.
- Reporte docs/h8/H8_MVP_RC2_RELEASE_REPORT.md con matriz PASS/PARTIAL/BLOCKED, entorno, pasos ejecutados, evidencias, resultado, LIMITACIONES Y BLOQUEOS. Separar claramente Jest de QA Electron empaquetado.
- RC2 se considera aceptable solo si QA empaquetado y migración real v7->v8 funcionan. No decir que RC1 contiene H8.6.1.
- Firma ad-hoc exclusivamente; no notarización ni distribución pública. La aplicacion demo aun NO supervisa Kubernetes real.
- Generar commits convencionales para cambios de QA/build/report y actualizar Engram.
- No borrar RC1, no fusionar la rama a develop, no push, no publicar. Tras verificar RC2, pedir autorización para limpiar binarios RC1; conservar ramas, documentos, hashes y builds necesarios de la nueva release.
