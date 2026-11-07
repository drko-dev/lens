# Cómo crear una ventana flotante

Las ventanas flotantes o **desacopladas** permiten mover un panel compatible a otra ventana del sistema, incluso a otro monitor. No son lo mismo que un panel colapsado ni una pestaña agrupada.

## Crear una ventana independiente

1. Abrí el clúster correcto; comprobá su nombre y el color de identificación.
2. Abrí una vista o un panel **compatible con desacoplamiento**.
3. Pasá el puntero por el encabezado del panel o enfocá sus controles con el teclado.
4. Si aparece la acción **Open in a separate window** (Abrir en ventana independiente), activala.
5. Mové la ventana resultante a la pantalla deseada. Conserva la pertenencia al clúster original.

**Si el control no aparece, ese panel puede no admitir desacoplamiento en esta compilación.** No todos los tipos de panel tienen esta función; la disponibilidad puede depender de la configuración de ventanas desacopladas.

## Volver a acoplar

Usá **Redock** en la ventana separada o **Redock here** en el marcador/placeholder que quedó en la ventana principal. Si la ventana está minimizada o detrás de otra, buscá **Show window** cuando esté disponible.

## Diferencias importantes

- **Desacoplar:** cambia el contenedor visual del panel.
- **Reacoplar:** devuelve el panel a la aplicación principal.
- **Replegar:** oculta temporalmente el área sin borrar la distribución.
- **Cerrar:** elimina el panel de la distribución activa si ese tipo de panel permite cerrarlo.

Las ventanas desacopladas de listas de **Pods y Deployments** están limitadas a **solo lectura** en H7.5: para operaciones de edición, volvé a acoplar la vista.

## Solución de problemas

Si no aparece una ventana, comprobá otras pantallas y el marcador de reacoplamiento. Si perdés la distribución, revisá **Workspaces y restauración de layouts**. Nunca confundas una ventana de PROD con una de DEV: verificá la identidad de clúster antes de actuar.
