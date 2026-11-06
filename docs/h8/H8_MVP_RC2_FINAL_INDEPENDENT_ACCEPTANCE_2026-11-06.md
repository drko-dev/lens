# H8 MVP RC2 — Aceptación independiente final

**Fecha:** 2026-11-06.
**Commit auditado:** 3f796964 (QA, sin cambios en runtime empaquetado).
**Rama:** feature/h8-mvp-rc2-acceptance-gate.
**Dictamen:** PASS como candidato interno de demostración sintética; apto para fast-forward local a develop, sujeto a autorización del usuario. No es autorización de Kubernetes real, IA externa ni release público.

## Verificación realmente ejecutada

- Inspección directa del diff de 3f796964: obtiene puerto proxy local disponible y lo conserva entre las dos sesiones para permitir restauración del origen web de localStorage. Inspecciona store/DOM reales, realiza Swap y Guardar con los controles de Kubetail, y compara orientación, orden de paneles, workspace custom y almacenamiento tras reinicio con aserciones fail-closed.
- Se reejecutó de forma independiente el script empaquetado en Node v24.22.2 usando una copia temporal que redirigió evidencias a /tmp, sin sobrescribir las imágenes versionadas. Salida: exit=0, duración 33,46 segundos. Log temporal: /tmp/h8-rc2-independent-final-review-20261106.log.
- Estado original: h1-default, horizontal, kubetail -> resource-details. Post-Swap: resource-details -> kubetail. Guardado: custom, horizontal, resource-details -> kubetail. Restaurado post-reinicio: custom, horizontal, resource-details -> kubetail. Las comparaciones obligatorias PASS.
- El QA confirmó adicionalmente: migración SQLite v7 a v8, incidentes con deduplicación UID/tipo, consentimiento y diagnóstico mock CONCLUSIVE, citas verificadas, verificación de remediación, auditoría de identidad no verificada, ausencia del marcador sintético en SQLite y logs, seis capturas independientes con checksums distintos.
- El QA se ejecutó con HOME/CICD/KUBECONFIG sintéticos y --use-mock-keychain, sin conexión declarada a clústeres reales ni proveedor de IA externo. No se observó ruta de kubeconfig real en logs. Esto no equivale a una auditoría syscall/forense que demuestre absolutamente cero accesos a cualquier archivo del usuario.
- El QA de Kubetail inspecciona SplitPanelLayout real; no repite el conjunto integral de E2E de GlobalPanelHost H7. Las pruebas del Centro de Incidentes montan su componente real mediante inyección DI en un overlay de prueba; no constituyen comprobación de una ruta de navegación nativa hacia Incidentes.
- El test registra geometría; las aserciones estrictas cubren orden, orientación, workspace y storage, no píxeles exactos en otras resoluciones. Esto no bloquea el gate definido.
- Durante la app empaquetada hubo avisos de macOS sobre no poder configurar login item (Operation not permitted) en QA aislado, sin fallar el smoke.
- Los checksums RC2 de DMG/ZIP previamente verificados permanecen: b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1 y 209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681. El código del ejecutable RC2 no se alteró.

## Siguiente etapa

1. Con autorización explícita, checkpoint y merge fast-forward local de feature/h8-mvp-rc2-acceptance-gate hacia develop, sin push remoto.
2. Implementar H8.7 Centro de Documentación In-App como hito P0 obligatorio en una nueva rama después del merge. Plan: docs/h8/H8_7_CENTRO_DOCUMENTACION_EN_APP_PLAN.md.
3. El siguiente build (RC3 o candidato acordado) deberá incluir realmente H8.7 y pasar QA empaquetado; RC2 no tiene todavía el nuevo menú/manual.
4. Antes de empaquetar, revisar disco: tras el smoke quedaban aproximadamente 9,8 GiB libres. No borrar RC1/RC2 ni trabajo personal automáticamente.

**Alcance de la aceptación:** RC2 DEMO SINTETICO para QA interno; no conectividad productiva ni firma pública notarizada.
