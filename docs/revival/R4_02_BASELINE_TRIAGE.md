# OpenLens DevOps Revival — R4-02 / Comparación inicial de regresión con R3

**Fecha:** 2026-10-20, verificación independiente  
**Estado:** TRIAGE PARCIAL; no certifica el conjunto de 269 suites.  
**Baseline:** `/Users/gustavomarcon/Documents/lens/lens` — `feat/openlens-devops-revival`, HEAD `22fbe98`.  
**Worktree R4:** `/Users/gustavomarcon/Documents/lens/lens-r4` — `feat/r4-workspace-security`, HEAD `22fbe98` con cambios locales R4-01/R4-02 sin commit.

## Motivación

`R4_02_VALIDATION.md` informa que `packages/core` tiene **269 suites: 242 PASS, 27 FAIL**, 2702 tests: 2548 PASS, 145 FAIL, 9 skipped y **135 snapshots fallidos**. Ese resultado no fue comparado con un baseline limpio. El objetivo de este archivo es documentar una **primera comparación controlada de tres suites representativas**, no atribuir los demás fallos a R3 ni a R4.

## Entorno y procedimientos

- Compatibilidad declarada en `packages/core/package.json`: Node `>=16 <=20`. Al iniciar la auditoría el `node` por defecto del sistema era **v26.7.0 (fuera de rango)**. Se encontró disponible `/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin/node` y se ejecutó la comparación real con **Node v20.20.2** en ambos árboles.
- Para cada árbol, en `packages/core`, se ejecutó Jest con los **mismos paths**, `--runInBand --no-cache --ci --silent --watch=false --json`. No se usó `--updateSnapshot`. No se construyeron paquetes ni se alteraron `dist`, `dist-stage`, el índice Git o el código base.
- Suites:
  1. `src/common/k8s-api/__tests__/api-manager.test.ts`.
  2. `src/features/namespaces/route-with-sub-namespaces.test.tsx`.
  3. `src/features/helm-charts/installing-chart/opening-dock-tab-for-installing-helm-chart.test.ts`.
- Archivos de prueba guardados temporalmente en `/tmp/lens-r4-node20-triage.json` (baseline), `/tmp/lens-r4-r4-node20-triage.json` (R4) y sus logs `.log`. No confiar en su persistencia tras reiniciar; reproducir con el comando de abajo.

## Resultados de comparación

| Suite | R3 baseline (Node20) | R4 worktree (Node20) | Dictamen limitado |
|---|---:|---:|---|
| `api-manager.test.ts` | 2 fallos | 2 fallos | **Mismos nombres de pruebas fallidas en ambos** |
| `route-with-sub-namespaces.test.tsx` | 3 fallos de snapshots | 3 fallos de snapshots | **Mismos nombres de pruebas fallidas en ambos** |
| `opening-dock-tab-for-installing-helm-chart.test.ts` | 9 fallos de snapshots | 9 fallos de snapshots | **Mismos nombres de pruebas fallidas en ambos** |
| **TOTAL** | **14 FAIL / 42 tests** | **14 FAIL / 42 tests** | **Los 14 nombres de prueba fallida son idénticos** |

- En `api-manager.test.ts`, las expectativas de un `KubeApi` y `KubeObjectStore` registrados en la prueba chocan con `VulnerabilityReportApi` / `VulnerabilityReportStore` que están presentes en la plataforma consolidada R3. Determinar causa real y corregir inyección/aislamiento de test o el contrato antes de cambiar producción.
- Los snapshots de Helm y namespaces ya diferían en el baseline. No actualizar snapshots masivamente sin **revisar diferencias por cambios legítimos de UI** y aprobar los cambios esperados.
- La suite `sidebar-cluster.test.tsx`, ejecutada adicionalmente con Node v26 en ambos, **pasó**, pero no forma parte de la comparación de Node20 resumida arriba.

**Alcance de la conclusión:** Los mismos 14 fallos se reproducen en R3 y R4 usando Node20. Esto demuestra que no fueron introducidos exclusivamente por el delta local de R4-02. **NO** permite afirmar que los restantes **131 fallos** ni las otras suites sean heredados. Tampoco explica automáticamente todas las diferencias de snapshots. El baseline R3 no había sido certificado con estas 269 suites completas.

## Reproducción controlada

```bash
export PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"
node --version
# v20.20.2
for repo in /Users/gustavomarcon/Documents/lens/lens /Users/gustavomarcon/Documents/lens/lens-r4; do
  cd "$repo/packages/core" || exit 1
  npx jest \
    src/common/k8s-api/__tests__/api-manager.test.ts \
    src/features/namespaces/route-with-sub-namespaces.test.tsx \
    src/features/helm-charts/installing-chart/opening-dock-tab-for-installing-helm-chart.test.ts \
    --runInBand --no-cache --ci --silent --watch=false
done
```

## Siguiente triage para el agente

1. Obtener **lista exacta de las 27 suites fallidas en R4** de la salida/log JSON de la ejecución integral (si no se conservó el reporte, ejecutar `--json --outputFile=...` de forma controlada solo cuando sea imprescindible). No repetir las 269 suites a ciegas sin primero recopilar evidencia.
2. Reejecutar las **27 suites por path** en R3 consolidada con Node20 idéntico y configuración igual, `--no-cache --ci`, sin editar archivos base, ni `-u`. Agrupar las suites en lotes si conviene. Categorizar: idénticas en baseline, exclusivas de R4, flaky / dependientes de ambiente.
3. Para diferencias reales de R4, hacer pruebas A/B más acotadas con y sin feature flag, revisar imports DI y nuevas rutas globales. Para fallos presentes en R3, crear deuda técnica separada y corregir causas con tests.
4. Estudiar snapshots caso por caso, evitando regeneración masiva. Separar discrepancias puramente visuales de expectativas de comportamiento/routing/API.
5. Ejecutar regresión completa al final del triage bajo Node20, registrando un baseline verificable y comparando suites por nombre, no solo totales.
6. Mantener **R4-02 PARCIAL** y **R4-01 PARCIAL** hasta cerrar sus respectivos gates. Se permite **diseño en modo lectura de R4-03**, sin introducir persistencia mientras no esté evaluado el riesgo de sesión/routing.
7. Disco libre al auditar: ~11GiB. No crear nuevos dist/paquetes ni borrar anteriores sin presupuestar espacio/recibir autorización.

**Estado de seguridad:** Checkout R3 continúa en HEAD `22fbe98` con tracked limpio. No hubo commits, push, cambios de producción, conexiones a clúster real, ni modificaciones de snapshots.
