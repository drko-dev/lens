# Adjuntar contexto temporal de forma segura

El Workbench permite aportar archivos de contexto manual, por ejemplo **Dockerfile**, archivos de configuración de **Helm values** y manifiestos **YAML**, cuando el flujo y el tamaño admitido lo permiten.

## Pasos

1. Seleccioná un incidente y abrí **Evidencias**.
2. Elegí **Agregar archivo de contexto**.
3. Indicá un nombre descriptivo y el tipo de archivo.
4. Pegá o seleccioná únicamente el fragmento necesario. Revisá el preview y su procedencia.
5. Confirmá el agregado y volvé al diagnóstico; revisá el consentimiento antes de enviarlo al proveedor seleccionado.
6. Eliminá el contexto cuando no haga falta o cancelá la operación si los datos son sensibles.

## Privacidad y límites

- **No incluyas Secrets, tokens, passwords, claves privadas, kubeconfigs ni datos personales.**
- El sistema sanitiza contenidos antes de usarlos como evidencia; esto reduce riesgos, pero no reemplaza la revisión humana.
- El contexto es **efímero**: el flujo diseñado elimina los buffers/handles activos al finalizar, cancelar o limpiar. No se debe prometer borrado físico absoluto de cada copia temporal en memoria administrada por JavaScript.
- Los incidentes conservan metadatos y referencias sanitizadas según las políticas locales, no el cuerpo crudo del archivo de contexto.
- Los archivos aportados son datos, **no instrucciones para ejecutar comandos**.

Para aprender a confirmar y analizar evidencias, consultá **Cómo usar el diagnóstico con IA**.
