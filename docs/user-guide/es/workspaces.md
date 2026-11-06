# Workspaces y restauración de layouts

Un **workspace** guarda o representa una disposición de paneles. En Kubetail se puede intercambiar el orden de las dos vistas y guardar una distribución personalizada.

## Guardar la distribución

1. Abrí **Kubetail** en el clúster correcto.
2. Usá **Swap** si querés invertir las posiciones de Kubetail y detalles.
3. Activá **Guardar / Save workspace** para persistir el layout personalizado.
4. Volvé a abrir la aplicación y verificá que mantenga el orden y la orientación.

En las pruebas de RC2 se verificó restauración del workspace **custom** con el orden invertido y orientación horizontal. Ese resultado corresponde a Kubetail; otras vistas tienen sus propios mecanismos de persistencia.

## Recuperar paneles

Si un panel quedó replegado, usá la banda de recuperación. Si se cerró, agregalo desde el catálogo. Si se desacopló, buscá el marcador **Redock here**.

**Seguridad al restaurar:** la persistencia guarda distribución visual; no debe volver a habilitar automáticamente terminales, permisos PROD ni streams activos. Es posible que debas reabrir una conexión o suscripción de lectura.

En una ventana secundaria verificá siempre el clúster al cual pertenece el panel.
