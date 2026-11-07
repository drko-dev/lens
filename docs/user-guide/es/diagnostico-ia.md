# Cómo usar el diagnóstico con IA

En H8 RC2 el diagnóstico asistido se ejecuta **bajo demanda** y utiliza un **proveedor mock determinístico**. No supone conexión a una API externa ni convierte una suscripción a ChatGPT, Claude o Gemini en credenciales de API.

## Iniciar un análisis

1. Abrí **Centro de Incidentes** y seleccioná un incidente.
2. Abrí el **Workbench** y revisá la pestaña **Evidencias**.
3. Si necesitás aportar material adicional, seguí la guía **Adjuntar contexto temporal de forma segura**.
4. Entrá a **Diagnóstico** y seleccioná **Analizar con IA / Analyze**.
5. Revisá el **modal de consentimiento**: qué evidencias se incluyen y los límites vigentes.
6. Confirmá solo si aceptás que esos datos sean procesados por el proveedor configurado.

## Interpretar los resultados

El informe diferencia hallazgos, hipótesis y referencias. Una cita **Verificada** apunta a una evidencia asociada; otras citas deben tratarse con cautela. Un estado **CONCLUSIVE** en la demo significa que el motor mock produjo una respuesta estructurada, **no** que un especialista haya confirmado la causa real. Un resultado inconcluso no autoriza inventar una solución.

## Remediación y comprobación

Las propuestas de remediación son **revisables y reversibles**, con advertencias y rollback cuando corresponda. El botón de **Verificar remediación** permite un post-check con intervención humana. **Esta IA no aplica cambios ni ejecuta escrituras sobre Kubernetes automáticamente.**

Cancelá el análisis si las fuentes no corresponden al clúster o si el consentimiento quedó desactualizado. Nunca adjuntes credenciales reales.
