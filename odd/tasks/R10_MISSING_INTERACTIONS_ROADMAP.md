# NovaKube — R10 Missing Interactions Roadmap

Registro de interacciones presentes en Mirantis Lens oficial que dependen de servicios propietarios/externos o licenciamiento comercial.

| ID | NOMBRE | UBICACIÓN | ACCIÓN | RESULTADO EN LENS | DEPENDENCIAS | ARQUITECTURA NECESARIA | PRIORIDAD | COMPLEJIDAD | PRUEBAS NECESARIAS | ESTADO |
|---|---|---|---|---|---|---|---|---|---|---|
| R10-MISS-01 | Lens ID / Cloud Sync | TopBar Avatar + Context Menu `Open Lens ID` | Clic en avatar / `Open Lens ID` | Abre sesión/perfil en Mirantis Lens Cloud | OAuth propietario Mirantis (`api.k8slens.dev`) | Proveedor OAuth propio o perfil local sin nube Mirantis (NovaKube usa `AI Providers` + `OAuth` propios) | Baja | Alta | Tests de login OAuth propio | EXTERNAL_DEPENDENCY |
| R10-MISS-02 | Mirantis Lens AI | TopBar `AI` dropdown | Abrir asistente AI integrado de Mirantis | Usa backend AI comercial de Mirantis | Suscripción/API Mirantis Lens AI | NovaKube provee panel `AI` propio configurable con OpenAI/Anthropic/Ollama local | Baja | Media | Tests de AI Provider local | NOVAKUBE_ALTERNATIVE |
| R10-MISS-03 | Lens Subscription / Upgrade | TopBar `UPGRADE` + Help `License` | Abrir portal de licencia comercial | Muestra estado Lens Personal / Pro | Portal de facturación Mirantis | No aplica a distribución Open Source MIT | N/A | N/A | N/A | EXTERNAL_DEPENDENCY |
| R10-MISS-04 | Toggle Hotbar Menu Item | `View -> Toggle Hotbar` | Mostrar/ocultar barra lateral Hotbar | Alterna visibilidad del Hotbar | Ninguna | Toggle en store de preferencias de UI + menú `View` | Media | Baja | Jest + CDP toggle test | BACKLOG |
