# OpenLens DevOps — Midnight Graphite Design System

## 1. Design Philosophy

`Midnight Graphite` is a professional, high-density, low-glare dark design system specifically tailored for DevOps and Kubernetes multi-window desktop workflows. Unlike generic dark themes that resort to pitch-black backgrounds (`#000000`) or overly desaturated pastels, Midnight Graphite uses a calibrated blue-grey graphite palette that reduces eye strain during prolonged operational shifts while highlighting live cluster signals with crisp, high-saturation semantic accents.

### Core Principles
1. **Calibrated Elevation**: Visual depth is expressed through subtle shifts in slate-grey lightness rather than heavy shadows or blinding borders.
2. **Intentional Contrast**: Text and icons maintain WCAG AA contrast (minimum 4.5:1 for body copy, 3:1 for large headings and active icons).
3. **Information Density**: Padding and margins are optimized for maximum visible information without visual clutter.
4. **Accessible Focus**: 2px high-visibility steel-blue focus rings with 2px offset ensure keyboard navigation is clear across all interactive controls.
5. **Fail-Safe Theming**: Implemented via CSS custom properties and SCSS mixins, enabling full isolation from alternate themes (Light, Dark, Cursor).

---

## 2. Palette Architecture

### 2.1 Surfaces & Backgrounds
| Semantic Name | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `surface` | `#121925` | Base canvas, cluster background, split container background |
| `surfaceRaised` | `#161E2A` | Panel cards, toolbars, sidebar navigation container |
| `surfaceElevated` | `#1A2433` | Modals, floating dropdowns, dialogs, drawers |
| `surfaceHover` | `#1E2A3A` | Table row hover, list item hover state |
| `surfaceActive` | `#243245` | Pressed buttons, selected table rows |

### 2.2 Typography & Foregrounds
| Semantic Name | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `textPrimary` | `#E4EBF4` | Headings, resource titles, table cell primary values |
| `textSecondary` | `#A8B4C6` | Column headers, subtitles, secondary metadata |
| `textMuted` | `#6F7D91` | Timestamps, placeholders, inactive hints |

### 2.3 Borders & Dividers
| Semantic Name | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `borderDefault` | `#2C3848` | Container outlines, panel split dividers |
| `borderSubtle` | `#1E2836` | Table row dividers, inner section separators |
| `borderStrong` | `#3D4F66` | Focused element borders, active tab indicators |

### 2.4 Interactive & Actions
| Semantic Name | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `actionPrimary` | `#5F8AD4` | Primary call-to-action buttons, active badges |
| `actionPrimaryHover` | `#9BBCF0` | Hover state for primary actions |
| `actionSecondary` | `#222D3C` | Secondary / Ghost buttons |
| `actionSecondaryHover` | `#2D3B4E` | Secondary action hover state |
| `actionDanger` | `#F05353` | Destructive actions, delete confirmation |
| `actionDisabled` | `#3A4A5E` | Inactive buttons and inputs |
| `focusRing` | `#7BA3E3` | Accessible focus outline |

### 2.5 Status & Health Indicators
| Semantic Name | Hex Value | Meaning |
| :--- | :--- | :--- |
| `statusSuccess` | `#3DBF88` | Running pods, healthy deployments, active streams |
| `statusWarning` | `#E0AE62` | Pod restarting, resource pressure, throttled |
| `statusError` | `#F05353` | CrashLoopBackOff, failed checks, connection errors |
| `statusInfo` | `#7BA3E3` | Informational messages, metadata tags |

### 2.6 Environment Tints
| Environment | Hex Value | Soft Background Tint |
| :--- | :--- | :--- |
| `Production` | `#EF4444` | `rgba(239, 68, 68, 0.16)` |
| `Staging` | `#F59E0B` | `rgba(245, 158, 11, 0.16)` |
| `Development` | `#10B981` | `rgba(16, 185, 129, 0.16)` |
| `Testing` | `#8B5CF6` | `rgba(139, 92, 246, 0.16)` |
| `Local` | `#06B6D4` | `rgba(6, 182, 212, 0.16)` |

---

## 3. Typography Hierarchy

- **Font Family**:
  - UI Copy: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
  - Code & Logs: `"Roboto Mono", "Ubuntu Mono", "Source Code Pro", Menlo, Monaco, Consolas, monospace`
- **Scale**:
  - `Display / Large Header`: 18px / 24px (Font Weight: 600)
  - `Panel Header`: 13px / 18px (Font Weight: 600)
  - `Body / Cell Text`: 12px / 16px (Font Weight: 400)
  - `Metadata / Badge`: 11px / 14px (Font Weight: 500)
  - `Terminal & Logs`: 12px / 16px (Font Weight: 400)

---

## 4. Elevation & Component Specifications

1. **Split Panels**:
   - Headers: `var(--surface-raised)` background with 1px `var(--border-subtle)` bottom border.
   - Body: `var(--surface)` background with seamless internal scrolling.
   - Resize Divider: 4px hover zone with `var(--action-primary)` indicator on hover/drag.
2. **Buttons**:
   - Height: 28px (compact) / 32px (standard).
   - Border radius: 4px.
   - Focus indicator: 2px solid `var(--focus-ring)` with 2px offset.
3. **Modals & Dialogs**:
   - Overlay: `rgba(0, 0, 0, 0.65)` backdrop blur.
   - Container: `var(--surface-elevated)` with 1px `var(--border-default)` border and `0 8px 32px rgba(0, 0, 0, 0.5)` drop shadow.
