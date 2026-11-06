# H8.7 — Aceptación independiente funcional

**Fecha:** 2026-11-06.
**Rama auditada:** feature/h8-7-documentacion-in-app.
**Commit implementado:** e0eff499.
**Dictamen:** PASS para H8.7 en Electron DEV. El release empaquetado ARM64 que contenga H8.7 aún no fue generado ni probado; RC2 permanece como rollback.

## Ejecución independiente

- Con Node v24.22.2 se reejecutó Jest para documentación, Welcome, SplitPanel, incidentes y diagnóstico IA: **54/54 suites, 443/443 tests, 3/3 snapshots PASS**, exit 0. Log: /tmp/h87-20261106-independent-e0eff499-jest.log.
- Se reejecutó el script de QA de Electron DEV con HOME, CICD y KUBECONFIG sintéticos y mock keychain; las capturas se redirigieron a un directorio temporal independiente para no modificar la evidencia Git. **Exit 0**. Log: /tmp/h87-20261106-independent-e0eff499-smoke.log.
- La prueba pulsa los botones reales de Incident List, Incident Workbench, modal de Consentimiento y SplitPanel Kubetail. Regresa a la vista del clúster entre cada paso. Usa fixtures sintéticos de incidentes, perfiles mock y un override del store en test para habilitar consentimiento: valida la **navegación documental contextual**, no un proveedor de IA real ni un diagnóstico end-to-end sin mocks.
- Nueve capturas reproducidas con hashes SHA-256 idénticos a la entrega y distintos entre sí.
- Intercepción en BrowserContext y Electron defaultSession.webRequest activa durante el recorrido instrumentado; el intento externo de prueba con dominio .invalid fue rechazado y registrado. 83 solicitudes interceptadas en contexto Playwright; cero dominios externos no autorizados tras excluir la prueba negativa controlada. No se han inferido conexiones productivas de Kubernetes.

## Alcances y restricciones de aceptación

- La instrumentación de red se instala después de electron.launch: demuestra bloqueo del tráfico observado **durante el recorrido instrumentado**, pero no una observación forense desde el primer milisegundo del proceso Main ni de cualquier sesión independiente. Esto no bloquea el gate funcional del manual offline; el nuevo release requiere un smoke de paquete y revisión de origen de recursos.
- El código incluye un cambio de carga asíncrona real (await target.loadUrl) en create-lens-window.injectable.ts; comprobar manejo de URLs lentas/fallidas en el smoke del nuevo release.
- La aplicación con H8.7 fue probada en modo DEV, no empaquetada. No afirmar que RC2 ya incluye el Centro de Documentación.
- **Sin push ni merge:** develop sigue en 83b1307f hasta autorización específica. Mantener RC2 y el control de espacio en disco.

## Siguiente paso autorizado para planificación

Crear una rama dedicada para la **identidad visual de OpenLens DevOps**, sin mezclar cambios funcionales del manual ni modificar assets de la marca hasta acordar la propuesta final. El diseño e inventario de branding se pueden preparar antes de fusionar H8.7. El próximo candidato empaquetado debería incorporar ambas etapas para evitar compilaciones duplicadas si la disponibilidad de disco lo permite.
