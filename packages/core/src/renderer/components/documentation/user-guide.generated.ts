/* AUTO-GENERATED from docs/user-guide/es by packages/core/scripts/generate-user-guide.cjs. */
/* To edit this content, change the Markdown source and run node packages/core/scripts/generate-user-guide.cjs. */
export const packagedUserGuide = [
  {
    "id": "inicio",
    "title": "Bienvenido a OpenLens DevOps",
    "section": "Primeros pasos",
    "status": "Disponible",
    "summary": "Qué incluye esta versión, cómo orientarte y cuáles son sus límites.",
    "related": [
      "primeros-pasos",
      "ventanas-flotantes",
      "diagnostico-ia"
    ],
    "markdown": "# Bienvenido a OpenLens DevOps\n\nOpenLens DevOps permite explorar clústeres, observar recursos y organizar paneles. Esta versión incorpora **Global Docking**, ventanas independientes y un **Centro de Incidentes con diagnóstico asistido de demostración**.\n\n## Elegí tu punto de partida\n\n1. Para aprender a mover y organizar paneles, abrí **Acoplar, mover y agrupar paneles**.\n2. Para abrir un panel en otra ventana, consultá **Cómo crear una ventana flotante**.\n3. Para explorar H8, consultá **Centro de Incidentes** y **Cómo usar el diagnóstico con IA**.\n4. Desde la bienvenida, podés iniciar el clúster demo sin ingresar credenciales reales.\n\n## Distinción importante\n\n- **Navegación y H7:** las funciones disponibles dependen del tipo de panel, del clúster y de la configuración. Los layouts pueden restaurarse sin reactivar automáticamente streams o sesiones sensibles.\n- **Escáner H8:** en RC2 funciona únicamente como **Demo Sintético** con cero watchers reales.\n- **IA H8:** el diagnóstico del MVP usa un **proveedor mock local**; no hace llamados reales a GPT, Claude u otros servicios.\n- **Seguridad:** las propuestas de remediación no realizan cambios automáticamente en Kubernetes.\n\nEsta guía está incluida dentro de la aplicación. No necesita conexión a internet ni un clúster conectado.\n"
  },
  {
    "id": "primeros-pasos",
    "title": "Clústeres, navegación y recursos",
    "section": "Primeros pasos",
    "status": "Disponible",
    "summary": "Abrir un clúster, usar la navegación y localizar recursos.",
    "related": [
      "acoplamiento",
      "incidentes"
    ],
    "markdown": "# Clústeres, navegación y recursos\n\n## Abrir un clúster\n\n1. Desde **Welcome/Bienvenida**, elegí **Add cluster** para importar tu kubeconfig o **Launch demo cluster** para explorar sin credenciales.\n2. Seleccioná el clúster que querés inspeccionar en Catálogo o la barra de favoritos.\n3. Verificá su nombre, el ambiente y el color de identificación **antes de operar**.\n4. Usá la navegación lateral para acceder a **Workloads**, Pods, Deployments, Events, Networking o Kubetail, según el alcance disponible.\n\nEl clúster demo usa datos simulados. No lo confundas con un clúster real.\n\n## Buscar recursos\n\nSeleccioná el namespace correcto, utilizá los filtros de la tabla y abrí el detalle de un recurso. La información que ves depende de los permisos RBAC de ese clúster. Si una pantalla queda vacía, revisá clúster, namespace, conectividad y permisos.\n\n## Kubetail y registros\n\nDentro del clúster, abrí **Kubetail** para revisar streams y detalles. Su área de trabajo admite **Swap**, guardado de una distribución personalizada y reordenamiento de paneles. Al restaurar sesiones, algunos streams quedan inertes hasta que los reactivás manualmente.\n\n**Importante:** ningún paso de esta guía implica que la IA tenga permiso para ejecutar acciones o modificar recursos.\n"
  },
  {
    "id": "ventanas-flotantes",
    "title": "Cómo crear una ventana flotante",
    "section": "Ventanas y paneles",
    "status": "Disponibilidad limitada",
    "summary": "Desacoplar un panel compatible, moverlo y volver a acoplarlo.",
    "related": [
      "acoplamiento",
      "workspaces"
    ],
    "markdown": "# Cómo crear una ventana flotante\n\nLas ventanas flotantes o **desacopladas** permiten mover un panel compatible a otra ventana del sistema, incluso a otro monitor. No son lo mismo que un panel colapsado ni una pestaña agrupada.\n\n## Crear una ventana independiente\n\n1. Abrí el clúster correcto; comprobá su nombre y el color de identificación.\n2. Abrí una vista o un panel **compatible con desacoplamiento**.\n3. Pasá el puntero por el encabezado del panel o enfocá sus controles con el teclado.\n4. Si aparece la acción **Open in a separate window** (Abrir en ventana independiente), activala.\n5. Mové la ventana resultante a la pantalla deseada. Conserva la pertenencia al clúster original.\n\n**Si el control no aparece, ese panel puede no admitir desacoplamiento en esta compilación.** No todos los tipos de panel tienen esta función; la disponibilidad puede depender de la configuración de ventanas desacopladas.\n\n## Volver a acoplar\n\nUsá **Redock** en la ventana separada o **Redock here** en el marcador/placeholder que quedó en la ventana principal. Si la ventana está minimizada o detrás de otra, buscá **Show window** cuando esté disponible.\n\n## Diferencias importantes\n\n- **Desacoplar:** cambia el contenedor visual del panel.\n- **Reacoplar:** devuelve el panel a la aplicación principal.\n- **Replegar:** oculta temporalmente el área sin borrar la distribución.\n- **Cerrar:** elimina el panel de la distribución activa si ese tipo de panel permite cerrarlo.\n\nLas ventanas desacopladas de listas de **Pods y Deployments** están limitadas a **solo lectura** en H7.5: para operaciones de edición, volvé a acoplar la vista.\n\n## Solución de problemas\n\nSi no aparece una ventana, comprobá otras pantallas y el marcador de reacoplamiento. Si perdés la distribución, revisá **Workspaces y restauración de layouts**. Nunca confundas una ventana de PROD con una de DEV: verificá la identidad de clúster antes de actuar.\n"
  },
  {
    "id": "acoplamiento",
    "title": "Acoplar, mover y agrupar paneles",
    "section": "Ventanas y paneles",
    "status": "Disponible",
    "summary": "Drag-and-drop, posiciones, pestañas y controles de teclado.",
    "related": [
      "ventanas-flotantes",
      "workspaces"
    ],
    "markdown": "# Acoplar, mover y agrupar paneles\n\n**Global Docking** permite distribuir vistas dentro de una zona de trabajo. Es distinto de crear una ventana independiente del sistema.\n\n## Organizar paneles\n\n1. Abrí un clúster y una vista que participe de Global Docking.\n2. Desde el encabezado usá **+** para agregar un panel compatible mediante el catálogo.\n3. Arrastrá el encabezado hacia uno de los bordes del destino para ubicar el panel a la **izquierda, derecha, arriba o abajo**.\n4. Arrastralo al área central o la pestaña destino para **agruparlo** en una misma zona.\n5. Ajustá el divisor para redistribuir tamaños.\n\nLa opción de movimiento por teclado abre un menú con destinos como **Left of**, **Right of**, **Above**, **Below** y **Group with**. En ese menú se puede navegar con flechas, Home/End, Enter/Espacio y cancelar con Escape.\n\n## Controles de encabezado\n\nLos controles compactos pueden aparecer al pasar el puntero o al usar Tab. **−** repliega el panel, **×** lo cierra cuando está permitido y **+** abre el catálogo. La banda de recuperación devuelve un panel replegado sin recrear todo el layout.\n\n## Restricciones\n\nLa experiencia exacta depende de la vista y del feature flag de Global Docking. No todos los paneles tienen maximizar o desacoplar, y algunos paneles de recursos solo ofrecen vistas de lectura cuando están flotantes.\n\nPara separar una vista en una **ventana del sistema operativo**, consultá el artículo **Cómo crear una ventana flotante**.\n"
  },
  {
    "id": "workspaces",
    "title": "Workspaces y restauración de layouts",
    "section": "Ventanas y paneles",
    "status": "Disponible",
    "summary": "Guardar, intercambiar, recuperar y restaurar distribuciones.",
    "related": [
      "acoplamiento",
      "ventanas-flotantes"
    ],
    "markdown": "# Workspaces y restauración de layouts\n\nUn **workspace** guarda o representa una disposición de paneles. En Kubetail se puede intercambiar el orden de las dos vistas y guardar una distribución personalizada.\n\n## Guardar la distribución\n\n1. Abrí **Kubetail** en el clúster correcto.\n2. Usá **Swap** si querés invertir las posiciones de Kubetail y detalles.\n3. Activá **Guardar / Save workspace** para persistir el layout personalizado.\n4. Volvé a abrir la aplicación y verificá que mantenga el orden y la orientación.\n\nEn las pruebas de RC2 se verificó restauración del workspace **custom** con el orden invertido y orientación horizontal. Ese resultado corresponde a Kubetail; otras vistas tienen sus propios mecanismos de persistencia.\n\n## Recuperar paneles\n\nSi un panel quedó replegado, usá la banda de recuperación. Si se cerró, agregalo desde el catálogo. Si se desacopló, buscá el marcador **Redock here**.\n\n**Seguridad al restaurar:** la persistencia guarda distribución visual; no debe volver a habilitar automáticamente terminales, permisos PROD ni streams activos. Es posible que debas reabrir una conexión o suscripción de lectura.\n\nEn una ventana secundaria verificá siempre el clúster al cual pertenece el panel.\n"
  },
  {
    "id": "incidentes",
    "title": "Centro de Incidentes",
    "section": "Incidentes e IA",
    "status": "Demo sintético",
    "summary": "Estados, evidencias, timeline y acciones de alerta.",
    "related": [
      "escaner-sintetico",
      "diagnostico-ia"
    ],
    "markdown": "# Centro de Incidentes\n\nEl Centro de Incidentes registra casos locales con estado, severidad, historial y evidencias. En RC2 su circuito de alertas automáticas funciona con **datos de demostración sintética**.\n\n## Recorrer un incidente\n\n1. Abrí **Incidentes / Incident Center** desde una vista compatible.\n2. Seleccioná un incidente de la lista y revisá clúster, namespace, tipo de recurso y severidad.\n3. Entrá al **Workbench** para examinar evidencias, línea de tiempo y diagnóstico disponible.\n4. Separá hechos observados, evidencias verificadas e hipótesis sugeridas.\n\n## Acciones de alerta\n\n- **Analizar ahora / Analyze now:** inicia el camino manual de diagnóstico, sujeto a consentimiento si corresponde.\n- **Posponer / Snooze:** difiere la atención de una señal.\n- **Descartar / Dismiss:** registra una decisión y pasa a **NO CONFIRMADO**. **No equivale a cerrar el caso con autorización privilegiada.**\n\nEl nombre enviado desde un cliente no prueba identidad: las acciones rápidas locales se registran como **unverified-local-operator**.\n\n## Evidencias y retención\n\nLos incidentes se guardan en SQLite con historial. Los archivos de contexto manual no deben persistir su contenido crudo después del flujo. Las políticas de retención y purga son distintas del cierre de un incidente; verificá su alcance en Configuración antes de eliminar registros.\n\nNo usés el Centro de Incidentes demo para tomar decisiones sobre un clúster productivo.\n"
  },
  {
    "id": "escaner-sintetico",
    "title": "Escáner Local: modo demostración",
    "section": "Incidentes e IA",
    "status": "Demo sintético",
    "summary": "Señales y deduplicación: qué detecta el prototipo y qué no.",
    "related": [
      "incidentes",
      "diagnostico-ia"
    ],
    "markdown": "# Escáner Local: modo demostración\n\nEn el MVP RC2 el escáner se muestra como **Escáner Local (Demo Sintético)**. Está **desactivado por defecto**, utiliza la fuente `synthetic_feed` y mantiene **cero watchers reales de Kubernetes**.\n\n## Qué señales representa\n\nEl motor determinístico reconoce patrones como **CrashLoopBackOff**, **ImagePullBackOff**, **OOMKilled**, reinicios anormales, **Node NotReady**, despliegues degradados y eventos **Warning**. Son criterios diseñados para señales de Kubernetes, pero la interfaz demo no está escuchando continuamente un clúster real.\n\n## Activar la demostración\n\n1. Abrí el Centro de Incidentes.\n2. Revisá el indicador de origen **Demo Sintético**.\n3. Habilitá explícitamente el escáner de demostración en su interfaz.\n4. Ingresá o reproducí datos sintéticos del entorno de prueba y observá los incidentes generados.\n5. Deshabilitá el escáner cuando termines.\n\nLa deduplicación utiliza una huella determinística asociada al clúster, namespace, tipo de recurso, señal y **UID**. Dos anomalías distintas del mismo Pod pueden producir incidentes distintos; un Pod recreado con UID nuevo no debe colisionar con el anterior.\n\n**Importante:** activar la demo no equivale a habilitar monitoreo 24/7, watchers, alertas productivas ni ejecución autónoma de IA.\n"
  },
  {
    "id": "diagnostico-ia",
    "title": "Cómo usar el diagnóstico con IA",
    "section": "Incidentes e IA",
    "status": "Demo sintético",
    "summary": "Análisis bajo demanda, consentimiento, citas y propuestas reversibles.",
    "related": [
      "contexto-efimero",
      "incidentes"
    ],
    "markdown": "# Cómo usar el diagnóstico con IA\n\nEn H8 RC2 el diagnóstico asistido se ejecuta **bajo demanda** y utiliza un **proveedor mock determinístico**. No supone conexión a una API externa ni convierte una suscripción a ChatGPT, Claude o Gemini en credenciales de API.\n\n## Iniciar un análisis\n\n1. Abrí **Centro de Incidentes** y seleccioná un incidente.\n2. Abrí el **Workbench** y revisá la pestaña **Evidencias**.\n3. Si necesitás aportar material adicional, seguí la guía **Adjuntar contexto temporal de forma segura**.\n4. Entrá a **Diagnóstico** y seleccioná **Analizar con IA / Analyze**.\n5. Revisá el **modal de consentimiento**: qué evidencias se incluyen y los límites vigentes.\n6. Confirmá solo si aceptás que esos datos sean procesados por el proveedor configurado.\n\n## Interpretar los resultados\n\nEl informe diferencia hallazgos, hipótesis y referencias. Una cita **Verificada** apunta a una evidencia asociada; otras citas deben tratarse con cautela. Un estado **CONCLUSIVE** en la demo significa que el motor mock produjo una respuesta estructurada, **no** que un especialista haya confirmado la causa real. Un resultado inconcluso no autoriza inventar una solución.\n\n## Remediación y comprobación\n\nLas propuestas de remediación son **revisables y reversibles**, con advertencias y rollback cuando corresponda. El botón de **Verificar remediación** permite un post-check con intervención humana. **Esta IA no aplica cambios ni ejecuta escrituras sobre Kubernetes automáticamente.**\n\nCancelá el análisis si las fuentes no corresponden al clúster o si el consentimiento quedó desactualizado. Nunca adjuntes credenciales reales.\n"
  },
  {
    "id": "contexto-efimero",
    "title": "Adjuntar contexto temporal de forma segura",
    "section": "Incidentes e IA",
    "status": "Demo sintético",
    "summary": "Dockerfile, Helm values, YAML, sanitización y descarte.",
    "related": [
      "diagnostico-ia",
      "incidentes"
    ],
    "markdown": "# Adjuntar contexto temporal de forma segura\n\nEl Workbench permite aportar archivos de contexto manual, por ejemplo **Dockerfile**, archivos de configuración de **Helm values** y manifiestos **YAML**, cuando el flujo y el tamaño admitido lo permiten.\n\n## Pasos\n\n1. Seleccioná un incidente y abrí **Evidencias**.\n2. Elegí **Agregar archivo de contexto**.\n3. Indicá un nombre descriptivo y el tipo de archivo.\n4. Pegá o seleccioná únicamente el fragmento necesario. Revisá el preview y su procedencia.\n5. Confirmá el agregado y volvé al diagnóstico; revisá el consentimiento antes de enviarlo al proveedor seleccionado.\n6. Eliminá el contexto cuando no haga falta o cancelá la operación si los datos son sensibles.\n\n## Privacidad y límites\n\n- **No incluyas Secrets, tokens, passwords, claves privadas, kubeconfigs ni datos personales.**\n- El sistema sanitiza contenidos antes de usarlos como evidencia; esto reduce riesgos, pero no reemplaza la revisión humana.\n- El contexto es **efímero**: el flujo diseñado elimina los buffers/handles activos al finalizar, cancelar o limpiar. No se debe prometer borrado físico absoluto de cada copia temporal en memoria administrada por JavaScript.\n- Los incidentes conservan metadatos y referencias sanitizadas según las políticas locales, no el cuerpo crudo del archivo de contexto.\n- Los archivos aportados son datos, **no instrucciones para ejecutar comandos**.\n\nPara aprender a confirmar y analizar evidencias, consultá **Cómo usar el diagnóstico con IA**.\n"
  },
  {
    "id": "faq",
    "title": "Preguntas frecuentes y solución de problemas",
    "section": "Ayuda",
    "status": "Disponible",
    "summary": "Problemas frecuentes de paneles, clústeres y diagnóstico.",
    "related": [
      "primeros-pasos",
      "ventanas-flotantes",
      "diagnostico-ia"
    ],
    "markdown": "# Preguntas frecuentes y solución de problemas\n\n## No puedo importar mi kubeconfig\n\nRevisá la ruta, estructura, contextos y permisos del archivo. La aplicación no crea acceso a un clúster si las credenciales son inválidas. No uses un kubeconfig real en pruebas automatizadas.\n\n## No aparece la opción de ventana flotante\n\nEl panel quizás no admite desacoplamiento o la función está deshabilitada. Comprobá los controles al pasar el puntero o enfocar el encabezado, y consultá **Cómo crear una ventana flotante**.\n\n## Cerré un panel y no lo encuentro\n\nSi está replegado, recuperalo desde la banda. Si fue cerrado, volvé a agregarlo desde el catálogo. Si es una ventana separada, usá **Show window** o **Redock** cuando aparezcan.\n\n## Guardé un layout pero no veo los logs\n\nEl layout puede haberse restaurado en modo inerte. Volvé a activar manualmente el stream cuando tengas permisos y conectividad. Restaurar una distribución no restaura automáticamente sesiones sensibles.\n\n## El escáner no detecta incidentes reales\n\nEs esperado en RC2: el **Escáner Local (Demo Sintético)** tiene cero watchers Kubernetes reales. No es un servicio de vigilancia 24/7.\n\n## No encuentro un proveedor de IA externo\n\nEl MVP utiliza mock local. La configuración de proveedores externos no equivale a disponer de una API conectada y autorizada. No introduzcas credenciales de producción en la demo.\n\n## ¿La IA puede modificar Kubernetes?\n\n**No.** El diagnóstico no ejecuta remediaciones autónomas. La verificación posterior y las confirmaciones humanas son pasos separados.\n\n## ¿La documentación requiere conexión?\n\nNo. El Centro de Documentación usa contenido empaquetado y puede consultarse con cero clústeres conectados.\n"
  }
] as const;
