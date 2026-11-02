# OpenLens DevOps — H6: Estrategia y Procedimientos de Reversión (Rollback)

**Proyecto:** OpenLens DevOps  
**Versión:** 6.5.3-dev  
**Hito:** H6 — Empaquetado macOS ARM64, QA integral de producto, Release Candidate y preparación multiplataforma  
**Fecha:** 2 de Noviembre de 2026  

---

## 1. Propósito y Alcance

Este documento describe los protocolos formales de reversión (rollback) ante cualquier eventualidad crítica, regresión no detectada o incompatibilidad durante la distribución del **Release Candidate 1 (RC1)** de OpenLens DevOps.

Se establecen tres niveles de reversión:
1. **Nivel de Usuario / Operador:** Reversión de estado y configuración corrupta sin reinstalar.
2. **Nivel de Binario / Distribución:** Desinstalación y reinstalación de la versión estable previa.
3. **Nivel de Código / Git:** Reversión del árbol de commits hacia checkpoints auditados anteriores.

---

## 2. Checkpoints de Git y Puntos de Restauración

El desarrollo de los seis hitos se encuentra organizado de forma estrictamente trazable mediante commits convencionales en el repositorio local:

| Hito | Hash de Commit | Mensaje Convencional | Estado Auditado |
|---|---|---|---|
| **H6** | *(HEAD actual)* | `feat(openlens): complete H6 macOS ARM64 packaging and Release Candidate verification` | Release Candidate |
| **H5** | `64e0560` | `feat(openlens): complete H5 stability hardening and Midnight Graphite design system` | Hardening & Theme |
| **H4** | `cf2f0ea` | `feat(openlens): complete H4 persistence and workspace recovery` | Persistencia v1 |
| **H3** | `5e14bbf` | `feat(openlens): complete H3 independent windows, detaching and multimonitor support` | Ventanas Nativas |
| **H2/H1**| `6680af2` | `feat(openlens): complete H1 and H2 dockable panels` | Motor de Docks |

---

## 3. Procedimientos de Reversión

### 3.1. Reversión de Configuración y Layout del Usuario (Safe Mode)
Si la aplicación no inicia debido a un estado corrupto en `localStorage` o migraciones incompletas:

```bash
# 1. Detener cualquier instancia en ejecución
pkill -9 -f "OpenLens DevOps"

# 2. Respaldar la configuración actual del usuario
cp -r "$HOME/Library/Application Support/OpenLens DevOps" "$HOME/Library/Application Support/OpenLens DevOps.bak"

# 3. Eliminar únicamente los archivos de persistencia de paneles y layout (sin tocar Kubeconfig ni extensiones)
rm -rf "$HOME/Library/Application Support/OpenLens DevOps/dockable-panels"*
rm -rf "$HOME/Library/Application Support/OpenLens DevOps/Local Storage"

# 4. Iniciar OpenLens DevOps en modo limpio
open -a "OpenLens DevOps"
```

### 3.2. Reversión de Binario Distribuible
Si el Release Candidate actual presenta problemas de compatibilidad con alguna versión de macOS:
1. Mover `/Applications/OpenLens DevOps.app` a la papelera.
2. Instalar el paquete anterior estable (ej. build de H5 o v6.5.2).
3. La configuración base es 100% retrocompatible ya que el esquema de persistencia H4 mantiene las estructuras previas intactas.

### 3.3. Reversión de Código en el Repositorio (Desarrollo / CI/CD)
Si se requiere volver el código base a un hito previo sin alterar archivos sin seguimiento:

```bash
# 1. Asegurar que no hay procesos de Webpack o Electron en ejecución
pkill -9 -f "openlens"

# 2. Para volver al cierre de H5 (Hardening estable):
git checkout feature/floating-panels-h5

# O revertir cambios de H6 en la rama actual:
git revert --no-edit HEAD
```

---

## 4. Garantía de Inviolabilidad de Recursos de Producción

Los procedimientos de reversión descritos garantizan que:
- **No se modifican archivos de configuración de Kubernetes (`~/.kube/config`).**
- **No se interactúa con APIs de clústeres remotos.**
- **No se pierden credenciales de clúster ni certificados de autenticación.**
- Los datos de usuario respaldados en `.bak` pueden ser inspeccionados y restaurados selectivamente.
