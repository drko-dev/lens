# Preguntas frecuentes y solución de problemas

## No puedo importar mi kubeconfig

Revisá la ruta, estructura, contextos y permisos del archivo. La aplicación no crea acceso a un clúster si las credenciales son inválidas. No uses un kubeconfig real en pruebas automatizadas.

## No aparece la opción de ventana flotante

El panel quizás no admite desacoplamiento o la función está deshabilitada. Comprobá los controles al pasar el puntero o enfocar el encabezado, y consultá **Cómo crear una ventana flotante**.

## Cerré un panel y no lo encuentro

Si está replegado, recuperalo desde la banda. Si fue cerrado, volvé a agregarlo desde el catálogo. Si es una ventana separada, usá **Show window** o **Redock** cuando aparezcan.

## Guardé un layout pero no veo los logs

El layout puede haberse restaurado en modo inerte. Volvé a activar manualmente el stream cuando tengas permisos y conectividad. Restaurar una distribución no restaura automáticamente sesiones sensibles.

## El escáner no detecta incidentes reales

Es esperado en RC2: el **Escáner Local (Demo Sintético)** tiene cero watchers Kubernetes reales. No es un servicio de vigilancia 24/7.

## No encuentro un proveedor de IA externo

El MVP utiliza mock local. La configuración de proveedores externos no equivale a disponer de una API conectada y autorizada. No introduzcas credenciales de producción en la demo.

## ¿La IA puede modificar Kubernetes?

**No.** El diagnóstico no ejecuta remediaciones autónomas. La verificación posterior y las confirmaciones humanas son pasos separados.

## ¿La documentación requiere conexión?

No. El Centro de Documentación usa contenido empaquetado y puede consultarse con cero clústeres conectados.
