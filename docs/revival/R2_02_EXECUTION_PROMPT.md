# OpenLens DevOps Revival — R2-02: Editor avanzado, Diff/Revert y validación YAML

**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens`  
**Rama:** `feat/openlens-devops-revival`  
**Objetivo:** mejorar de forma concreta la seguridad y experiencia de edición de manifiestos sin romper la persistencia, los controles de concurrencia y la identidad visual de R1/R2-01.

## Preflight obligatorio
1. Leer `docs/revival/R1_06_VALIDATION.md`, `R2_01_VALIDATION.md`, `R2_IMPLEMENTATION_CHECKLIST.md`, `ROADMAP_PROVISIONAL.md`, el código y tests del editor. Verificar estado Git y respetar absolutamente cambios sin commit.
2. Revisar `packages/core/src/renderer/components/dock/edit-resource/view.tsx`, `edit-resource-model/edit-resource-model.injectable.tsx`, `monaco-editor/monaco-editor.tsx`, `monaco-editor/monaco-validators.ts`, los componentes `EditorPanel` y `InfoPanel`, `config-secrets/secret-details.tsx`, `config-maps/config-map-details.tsx` y `kube-object-details/inline-resource-save-helper.ts`.
3. No duplicar el manejo de 409/422, PUT con resourceVersion, PATCH con precondición `test` o relectura verificada existentes; tomar R1 como baseline. Ya existe `yamlValidator` básico: ampliar donde haga falta.

## Funciones exigidas — R2-02
A. **Monaco Split Diff:** modo normal y comparador lado a lado con paneles claramente identificados. Permitir comparar (1) manifiesto originalmente cargado vs borrador local y (2) versión actual obtenida del API server vs borrador local, **solo tras pedir/refrescar explícitamente el estado remoto**. Indicar resourceVersion, actualización y riesgo de conflicto. No confundir la versión original con la remota actual; lectura remota fallida no debe fingir que está actualizada. Preservar scroll, foco y borrador al alternar vista.

B. **Revert seguro:** acciones separadas y explícitas: 'Descartar cambios y volver al borrador originalmente cargado' y, si hay remoto disponible, 'Recargar desde el clúster'. Ambas deben exigir confirmación cuando haya cambios no guardados. Nunca sobrescribir edición local con un watch o GET automático. Deshabilitar Save durante operación de recarga/revert; permitir cancelar sin perder cambios.

C. **Validación YAML mejorada:** mostrar errores sintácticos útiles antes de guardar (línea/columna y mensaje), marcadores en Monaco y estado válido/inválido; mantener validación de un único documento de recurso y forma esperada (`apiVersion`, `kind`, `metadata.name`) sin confundirla con validación del schema real del clúster. Asegurar guardado bloqueado para YAML inválido. Evitar validaciones costosas a cada pulsación (debounce). La validación estructural o Kubernetes OpenAPI avanzada puede dejarse como extensión opcional bien marcada si el coste/compatibilidad supera el hito.

D. **Edición segura de Secret/ConfigMap:** conservar la UX de R1-03 (borradores intactos, manejo de 409, recarga y rebase explícito, PUT/GET verificable). Integrar acciones y estados visuales coherentes para sus editores inline cuando sea razonable sin duplicar un nuevo motor de edición. En Secrets **nunca mostrar valores decodificados en un diff genérico sin una decisión explícita del usuario**: por defecto, comparar solo claves y estados; evitar exponer texto/base64 en logs, snapshots, notificaciones o capturas de pruebas. Para ConfigMaps, permitir comparar contenido cuando no haya secreto involucrado.

E. **UX e identidad del proyecto:** controles intuitivos y accesibles (botones etiquetados Diff, Normal, Revert, Refresh; estados guardando, conflicto y error), buenos contrastes y teclado, alineados con el rediseño R2-01. Mantener el trabajo original y evitar adoptar código propietario de Lens 2026.

## Pruebas obligatorias
- Unitarias para cambios locales/remotos, conflictos, lectura remota fallida, revert con confirmación/cancelación, estados dirty, YAML inválido/varios documentos y prevención de guardados, diferencias de resourceVersion y visualización protegida de secretos.
- Regresión R1: JSON Patch con precondiciones, PUT de Secrets y ConfigMaps, GET de verificación, 409 y rebase, no mutación silenciosa y ausencia de fuga de valores.
- Typecheck con Node v20.20.2; build `npm run build`, empaquetado macOS ARM64 ad hoc sin publicación y **en salida independiente `dist-stage`**. Existe una instancia del `OpenLens DevOps.app` de `dist` abierta con perfil habitual: **no cerrarla ni sobrescribirla**.
- Ejecutar el **.app recién empaquetado** con perfiles `HOME`/`CICD` aislados, `KUBECONFIG=/dev/null`; Playwright de arranque/navegación/tema y, para comprobar Diff/Revert, usar fake API o clúster sintético/local autorizado. No acreditar funcionalidad del editor por el mero smoke offline de bienvenida.
- Guardar capturas útiles **sin secretos** y resultados separados de unit tests, GUI automatizada y comprobación manual del usuario. Si no puede probarse el editor real sin clúster, informar pendiente; nunca dar como verificado lo no probado.

## Entregable y continuidad
Crear `docs/revival/R2_02_VALIDATION.md` con resumen de cambios, tests, pasos de reproducción, hashes/ruta de build, capturas redactadas, limitaciones y criterios de aceptación comprobados. Actualizar solo las casillas demostradas en `docs/revival/R2_IMPLEMENTATION_CHECKLIST.md`.

**No realizar operaciones contra clústeres de producción, no borrar datos del usuario, no hacer commits automáticos ni modificar perfiles de Lens.** Tras concluir R2-02, continuar con R2-03 según la regla de avance continuo acordada **si no hay bloqueos de seguridad ni pruebas críticas sin resolver**.

**Empezar directamente por R2-02.**
