# Centro de Incidentes

El Centro de Incidentes registra casos locales con estado, severidad, historial y evidencias. En RC2 su circuito de alertas automáticas funciona con **datos de demostración sintética**.

## Recorrer un incidente

1. Abrí **Incidentes / Incident Center** desde una vista compatible.
2. Seleccioná un incidente de la lista y revisá clúster, namespace, tipo de recurso y severidad.
3. Entrá al **Workbench** para examinar evidencias, línea de tiempo y diagnóstico disponible.
4. Separá hechos observados, evidencias verificadas e hipótesis sugeridas.

## Acciones de alerta

- **Analizar ahora / Analyze now:** inicia el camino manual de diagnóstico, sujeto a consentimiento si corresponde.
- **Posponer / Snooze:** difiere la atención de una señal.
- **Descartar / Dismiss:** registra una decisión y pasa a **NO CONFIRMADO**. **No equivale a cerrar el caso con autorización privilegiada.**

El nombre enviado desde un cliente no prueba identidad: las acciones rápidas locales se registran como **unverified-local-operator**.

## Evidencias y retención

Los incidentes se guardan en SQLite con historial. Los archivos de contexto manual no deben persistir su contenido crudo después del flujo. Las políticas de retención y purga son distintas del cierre de un incidente; verificá su alcance en Configuración antes de eliminar registros.

No usés el Centro de Incidentes demo para tomar decisiones sobre un clúster productivo.
