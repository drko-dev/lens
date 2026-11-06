# Escáner Local: modo demostración

En el MVP RC2 el escáner se muestra como **Escáner Local (Demo Sintético)**. Está **desactivado por defecto**, utiliza la fuente `synthetic_feed` y mantiene **cero watchers reales de Kubernetes**.

## Qué señales representa

El motor determinístico reconoce patrones como **CrashLoopBackOff**, **ImagePullBackOff**, **OOMKilled**, reinicios anormales, **Node NotReady**, despliegues degradados y eventos **Warning**. Son criterios diseñados para señales de Kubernetes, pero la interfaz demo no está escuchando continuamente un clúster real.

## Activar la demostración

1. Abrí el Centro de Incidentes.
2. Revisá el indicador de origen **Demo Sintético**.
3. Habilitá explícitamente el escáner de demostración en su interfaz.
4. Ingresá o reproducí datos sintéticos del entorno de prueba y observá los incidentes generados.
5. Deshabilitá el escáner cuando termines.

La deduplicación utiliza una huella determinística asociada al clúster, namespace, tipo de recurso, señal y **UID**. Dos anomalías distintas del mismo Pod pueden producir incidentes distintos; un Pod recreado con UID nuevo no debe colisionar con el anterior.

**Importante:** activar la demo no equivale a habilitar monitoreo 24/7, watchers, alertas productivas ni ejecución autónoma de IA.
