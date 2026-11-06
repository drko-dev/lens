# H8.7 — Revisión independiente del Centro de Documentación

**Fecha:** 2026-11-06
**Rama:** `feature/h8-7-documentacion-in-app`
**Commit de implementación auditado:** `0680a7d2`
**Veredicto:** **PASS funcional de la documentación en Electron DEV; PARTIAL en regresión ampliada y aceptación de release.** No hacer merge a develop ni publicar binario nuevo todavía.

## Pruebas independientes — Confirmadas

- Código registrado en tres commits: `0b3c7d70`, `f22d5e75` y `0680a7d2`. No quedan dos implementaciones competidoras registradas en Git.
- `docs/user-guide/es/manifest.json`: 10 artículos técnicos en español. `node packages/core/scripts/generate-user-guide.cjs --check`: PASS, bundle de contenido actualizado y reproducible.
- Hashes SHA-256 de las cinco capturas originales idénticos a los documentados; los cinco hashes son distintos.
- Jest focalizado con NVM Node v24.22.2: **4 suites, 30/30 tests PASS**, incluyendo Documentación, Welcome y H7 dynamic composition.
- Se reejecutó `open-lens/integration/h8-7-documentation-smoke.mjs` sobre Electron real de DEV, con HOME/CICD/KUBECONFIG sintéticos y `--use-mock-keychain`, cambiando solo la carpeta de capturas a un directorio temporal. **Exit 0 en 11,23 s.** Botón de Bienvenida, índice, búsqueda y artículos de ventana flotante e IA, botón Atrás y regreso a Bienvenida: PASS. Capturas reproducidas con hashes iguales a las cinco originales. Log: `/tmp/openlens-h87-independent-smoke-20261106.log`.
- Prueba independiente adicional lanzada sobre Electron DEV real, también con perfil sintético: menú nativo Help > **Documentación** presente con acelerador **F1**, opción separada **Documentación de Lens (externa)**. Ejecutar directamente la acción real del menú abrió `https://lens.app:<puerto>/documentation`. Después, clúster demo sintético, abrir Kubetail real y pulsar su botón `docking-help-button` navegó la ventana raíz a `/documentation/ventanas-flotantes?article=ventanas-flotantes`, manteniendo el frame del clúster en Kubetail. **Exit 0 en 7,81 s.** Log: `/tmp/h87-menu-context-independent-audit.log`.
- Se verifica que el renderer registra `__LENS_RENDERER_DI__` e `injectById`; la navegación contextual de Docking está probada real, no solo inferida desde código.
- El bundle incluye las precauciones de H8: scanner synthetic_feed, 0 watchers reales, IA mock, sin escrituras Kubernetes, límites de ventanas desacopladas.
- Firma ni DMG H8.7 no fueron creados; RC2 permanece intacto como rollback. Espacio libre alrededor de **15 GiB** al medir después de las pruebas.

## H87-QA-01 — Regresión ampliada: 16 fallos en tres suites de Welcome (BLOCKER de merge)

Se ejecutó Jest con filtro `(documentation|welcome|split-panel|incident|ai-diagnostics)`, Node 24.22.2, sin coverage:

- **54 suites: 51 PASS, 3 FAIL**.
- **443 tests: 427 PASS, 16 FAIL**.
- Fallos concentrados en:
  1. `src/features/welcome/setting-welcome-page.test.tsx` — 4.
  2. `src/features/welcome/banners-from-extension.test.tsx` — 6.
  3. `src/features/welcome/navigation-using-application-menu.test.ts` — 6.

Todos muestran el mismo fallo del harness de DI antes de las aserciones: `Tried to inject "main" -> "application:start-application" -> "on-load-of-application" -> "schedule-automatic-purge" when side-effects are prevented.`

El injectable `packages/core/src/main/incident-storage/schedule-automatic-purge.injectable.ts` y estas suites están presentes en `develop` y **no se modificaron por H8.7**. Esto sugiere deuda de tests previa, pero **no demuestra que las suites fallen en develop**: debe verificarse contra un baseline reproducible o corregirse el aislamiento/overrides en el test harness. No desactivar el purger productivo, no convertir fallos en skips, no permitir escrituras en SQLite personal ni permitir side effects reales en tests. Repetir las tres suites y después la regresión ampliada.

Log local: `/tmp/openlens-h87-independent-regression-20261106.log`.

## H87-QA-02 — Cobertura de aceptación pendiente

- El smoke de DEV usa flag `--offline` y contenidos empaquetados localmente, pero no tiene interceptación o auditoría exhaustiva de solicitudes de red. El requisito de «cero conexiones externas» no queda demostrado por el flag por sí solo. Para aceptarlo como offline estricto, ejecutar con red explícitamente restringida y/o registro de solicitudes que falle ante dominios externos.
- La navegación de los botones de ayuda contextual de **Incidentes, Workbench y consentimiento** está registrada en código pero no fue ejercitada de punta a punta de forma independiente. El botón de Docking sí se probó.
- El smoke prueba Electron DEV, **no un .app empaquetado desde este commit**. Un release con documentación H8.7 requiere verificar el bundle y los accesos en un binario ARM64 nuevo; RC2 corresponde a la versión anterior.

## Acciones concretas

1. Validar o corregir H87-QA-01 sin debilitar el contrato de seguridad del purger ni cambiar producción solo para hacer pasar tests viejos.
2. Agregar pruebas confiables de ayuda contextual Incidentes/Workbench/consentimiento y offline con red bloqueada o interceptada; conservar evidencia sin fabricar nodos DOM.
3. Actualizar `docs/h8/H8_7_DOCUMENTACION_ENTREGA.md` con hallazgos y estado real PASS/PARTIAL/BLOCKED por componente.
4. Después de cerrar el gate, crear checkpoint limpio de H8.7, pedir autorización antes de fast-forward a develop. El próximo empaquetado ARM64 puede planificarse junto con la identidad de marca para evitar builds duplicados, **pero no etiquetar RC2 como portador de H8.7**.
5. Preservar todos los untracked, RC2, worktrees, checkpoints, datos reales de Kubernetes y Keychain. No push/merge automático. Engram canónico `lens-v6-ui-corrections`.

**Criterio final:** El centro de documentación ya funciona en DEV; lo pendiente es la limpieza de regresiones heredadas y la evidencia adicional necesaria antes del release.
