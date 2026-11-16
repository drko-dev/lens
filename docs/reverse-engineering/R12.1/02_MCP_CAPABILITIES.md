# R12.1 — Inventario de Capacidades MCP (`rea-agents@6.5.0` y complementarios)

- **Servidor principal de Reverse Engineering**: `rea` (`rea-agents@6.5.0`, `207` herramientas MCP + `instructions.md`, `protocolVersion: 2024-11-05`).
- **Servidores MCP complementarios activos en sesión**: `playwright`, `engram`, `codebase-memory-mcp`, `codegraph`, `context7`, `atlassian-mcp-server`.

## 1. Clasificación de Herramientas Reales de `rea`

| Categoría | Herramientas Verificadas | Prueba / Estado en macOS ARM64 | Restricciones / Alternativa |
|---|---|---|---|
| **Bundle / Electron Estático** | `open_binary`, `close_binary`, `binary_session`, `inspect_artifact`, `inspect_electron_fuses`, `inspect_plist`, `inspect_signature`, `inspect_macho`, `inspect_binary_layout`, `inspect_analysis_view` | `PASS` sobre `/Applications/Lens.app` y `app.asar` | `inspect_artifact` con `integrity_policy: "record-and-continue"` requerido por 16 `.node`/`.dylib` unpacked firmados post-ASAR. |
| **Análisis JS / AST** | `analyze_javascript_application`, `trace_javascript_semantics`, `analyze_web_bundle`, `trace_web_module_imports`, `trace_web_source_location`, `compare_javascript_export_shapes`, `reconcile_javascript_runtime`, `recover_javascript_sources` | `PASS` en entrypoints chicos; `OOM` en `main.js` (18 MB) | `analyze_javascript_application` agota heap 2 GB en bundles >15 MB -> mitigar segmentando módulos por límites sintácticos (`<= 256 KiB`). `recover_javascript_sources` requiere Linux x64 (`util-linux prlimit`). |
| **Electron / Web CDP** | `list_electron_targets`, `inspect_electron_page`, `capture_electron_scenario`, `list_browser_targets`, `inspect_web_page`, `observe_web_session`, `observe_web_execution`, `inspect_web_event_listeners`, `capture_browser_scenario`, `capture_web_screenshot`, `list_javascript_runtime_targets`, `observe_javascript_runtime` | `list_electron_targets` probada en `:9224` | `list_electron_targets` filtra solo páginas `file://` (`splash.html`); para `https://lens.app:<port>/` usar `list_browser_targets` / Playwright CDP directo. |
| **macOS UI / Procesos** | `observe_native_ui`, `trace_native_ui_action`, `capture_native_ui_scenario`, `capture_process_scenario`, `observe_native_calls`, `list_frida_devices`, `list_frida_processes`, `trace_dylib_resolution` | Disponibles en esquema | `observe_native_ui` requiere PID + `window_id` y permisos Accessibility macOS; alternativa probada: `osascript` / `System Events` sobre PID específico. |
| **Storage / Evidencia** | `inspect_sqlite_database`, `export_evidence_bundle`, `import_evidence_bundle`, `get_evidence_bundle`, `list_unknowns`, `record_unknown` | Disponibles en esquema | Usar solo sobre bases de perfil QA aislado (nunca perfiles reales con tokens). |
