# OpenLens DevOps — H6: Documento de Release Candidate (RC1)

**Producto:** OpenLens DevOps  
**Versión de Release:** 6.5.3-dev (Release Candidate 1)  
**Canal de Distribución:** Staging / QA Interno / Apple Silicon  
**Arquitectura Primaria:** macOS Apple Silicon (`arm64`)  
**Fecha de Emisión:** 2 de Noviembre de 2026  

---

## 1. Declaración de Release Candidate

El presente documento declara formalmente a la compilación actual de OpenLens DevOps como **Release Candidate 1 (RC1)** para la arquitectura macOS ARM64. Esta versión incluye la culminación de los seis hitos del roadmap de modernización arquitectónica (H1 a H6), proporcionando:

1. **Motor de Paneles Acoplables (H1):** Espacio de trabajo flexible con soporte de divisiones múltiples y redimensionamiento dinámico.
2. **Catálogo de Paneles y Workspaces Configurables (H2):** Agregación de paneles bajo demanda para Pods, Deployments, Eventos, Nodos y Logs de Kubetail.
3. **Desacoplamiento Nativo y Multimonitor (H3):** Extracción de paneles a instancias dedicadas de `BrowserWindow` con transferencia atómica de streams y reacoplamiento limpio.
4. **Persistencia Segura v1 (H4):** Almacenamiento versionado de la topología de ventanas sin autoconexión a streams de Kubernetes en el arranque.
5. **Estabilidad y Midnight Graphite (H5):** Cero fugas de memoria, eliminación de observadores huérfanos y unificación visual profunda en gris grafito de media noche.
6. **Empaquetado Nativo macOS ARM64 (H6):** Binario Mach-O independiente con binarios de Kubernetes integrados y distribución en DMG/ZIP.

---

## 2. Inventario de Artefactos de Distribución

Todos los artefactos fueron generados en la ruta `open-lens/dist/`:

| Artefacto | Tipo | Arquitectura | Descripción |
|---|---|---|---|
| `OpenLens DevOps-6.5.3-dev-arm64.dmg` | Imagen de Disco APFS | Apple Silicon (`arm64`) | Instalador drag-and-drop con enlace a `/Applications` |
| `OpenLens DevOps-6.5.3-dev-arm64-mac.zip` | Archivo Comprimido | Apple Silicon (`arm64`) | Paquete portable para distribución directa o CI/CD |
| `mac-arm64/OpenLens DevOps.app` | Bundle de Aplicación | Apple Silicon (`arm64`) | Estructura ejecutable de macOS |
| `SHA256SUMS` | Manifiesto Criptográfico | N/A | Sumas de verificación SHA-256 de todos los artefactos |

---

## 3. Niveles de Distribución y Estado de Seguridad

Es fundamental diferenciar los tres estados de madurez y seguridad del binario:

### Nivel 1: QA Interno y Validación Local (Estado Actual Aprobado)
- **Firma:** Ad-hoc con entitlements completos (`codesign --force --deep --sign - --entitlements ...`).
- **Uso:** Pruebas internas de ingeniería, bancos de prueba E2E automatizados y validación en la máquina del desarrollador/arquitecto (Mac M4).
- **Gatekeeper:** Al ejecutarse localmente en la máquina donde fue compilado, macOS permite la ejecución inmediata. En máquinas remotas sin notarización, requiere eliminar el atributo de cuarentena.

### Nivel 2: Release Candidate (RC)
- **Firma:** Ad-hoc estructurada con `BundleId: dev.drko.openlens-devops`.
- **Uso:** Evaluación visual por parte del usuario y validación funcional en entornos aislados.
- **Instalación:** Se distribuye el archivo `.dmg` generado.

### Nivel 3: Release de Distribución Pública / Corporativa (Paso Siguiente)
- **Firma:** Requiere certificado oficial *Developer ID Application: [Nombre de Organización] (ID)* emitido por Apple.
- **Notarización:** Envío a los servidores de Apple mediante `xcrun notarytool submit` y posterior grapado (`xcrun stapler staple`).
- **Gatekeeper:** Reconocimiento global instantáneo en cualquier Mac sin advertencias de desarrollador no identificado.

---

## 4. Guía de Instalación y Validación en macOS

### Instalación mediante DMG:
1. Hacer doble clic sobre `OpenLens DevOps-6.5.3-dev-arm64.dmg`.
2. Arrastrar el icono de **OpenLens DevOps** hacia la carpeta **Applications**.
3. Expulsar la imagen de disco montada.

### Ejecución y Tratamiento de Gatekeeper (para binarios no notarizados):
Si el binario se transfiere entre diferentes equipos mediante internet o mensajería, macOS asigna el atributo `com.apple.quarantine`. Para ejecutar el Release Candidate localmente:

```bash
# Eliminar atributo de cuarentena de Gatekeeper
xattr -cr "/Applications/OpenLens DevOps.app"

# Verificar firma ad-hoc y entitlements
codesign -dvv --entitlements - "/Applications/OpenLens DevOps.app"

# Lanzar la aplicación
open "/Applications/OpenLens DevOps.app"
```

---

## 5. Preparación Multiplataforma (Linux y Windows)

De acuerdo con el roadmap de modernización, la prioridad P1 fue la entrega completa y validada de **macOS Apple Silicon (Mac M4)**. La arquitectura del proyecto queda desacoplada y lista para las siguientes etapas:

1. **Linux (ARM64 y x86_64):**
   - El código fuente no depende de APIs exclusivas de macOS en el renderer.
   - Las dependencias nativas (`node-pty`) y binarios embebidos (`kubectl`, `helm`, `lens-k8s-proxy`) cuentan con rutas estructuradas en `binaries/client/linux/`.
   - Etapa futura: Validación en VM Linux ARM64 (Fedora/Ubuntu en Wayland/X11).
2. **Windows (x64 / arm64):**
   - Estructura de empaquetado preparada en `electron-builder` para `target: nsis` o `portable`.

---

## 6. Dictamen de Aprobación

Se recomienda proceder a la revisión visual del usuario sobre el binario empaquetado y, tras su conformidad, promover la versión al pipeline de firmado con certificado Apple Developer ID.
