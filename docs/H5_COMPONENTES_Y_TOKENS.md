# OpenLens DevOps — H5 Component Inventory & Design Tokens

## 1. Design Token Catalog

The following tokens are globally available on the `:root` element in both kebab-case and camelCase:

### 1.1 Surface & Elevation Tokens
```css
:root {
  --surface: #121925;
  --surface-raised: #161E2A;
  --surface-elevated: #1A2433;
  --surface-hover: #1E2A3A;
  --surface-active: #243245;

  /* CamelCase aliases */
  --surfaceRaised: #161E2A;
  --surfaceElevated: #1A2433;
  --surfaceHover: #1E2A3A;
  --surfaceActive: #243245;
}
```

### 1.2 Text & Typography Tokens
```css
:root {
  --text-primary: #E4EBF4;
  --text-secondary: #A8B4C6;
  --text-muted: #6F7D91;

  /* CamelCase aliases */
  --textPrimary: #E4EBF4;
  --textSecondary: #A8B4C6;
  --textMuted: #6F7D91;
}
```

### 1.3 Border Tokens
```css
:root {
  --border-default: #2C3848;
  --border-subtle: #1E2836;
  --border-strong: #3D4F66;

  /* CamelCase aliases */
  --borderDefault: #2C3848;
  --borderSubtle: #1E2836;
  --borderStrong: #3D4F66;
}
```

### 1.4 Interactive & Focus Tokens
```css
:root {
  --action-primary: #5F8AD4;
  --action-primary-hover: #9BBCF0;
  --action-secondary: #222D3C;
  --action-secondary-hover: #2D3B4E;
  --action-danger: #F05353;
  --action-disabled: #3A4A5E;
  --focus-ring: #7BA3E3;
  --focus-ring-soft: rgba(123, 163, 227, 0.35);

  /* CamelCase aliases */
  --actionPrimary: #5F8AD4;
  --actionPrimaryHover: #9BBCF0;
  --actionSecondary: #222D3C;
  --actionSecondaryHover: #2D3B4E;
  --actionDanger: #F05353;
  --actionDisabled: #3A4A5E;
  --focusRing: #7BA3E3;
  --focusRingSoft: rgba(123, 163, 227, 0.35);
}
```

### 1.5 Status & Health Tokens
```css
:root {
  --status-success: #3DBF88;
  --status-warning: #E0AE62;
  --status-error: #F05353;
  --status-info: #7BA3E3;

  /* CamelCase aliases */
  --statusSuccess: #3DBF88;
  --statusWarning: #E0AE62;
  --statusError: #F05353;
  --statusInfo: #7BA3E3;
}
```

### 1.6 Environment Tokens
```css
:root {
  --environment-production: #EF4444;
  --environment-production-soft: rgba(239, 68, 68, 0.16);
  --environment-staging: #F59E0B;
  --environment-development: #10B981;

  /* CamelCase aliases */
  --environmentProduction: #EF4444;
  --environmentProductionSoft: rgba(239, 68, 68, 0.16);
  --environmentStaging: #F59E0B;
  --environmentDevelopment: #10B981;
}
```

---

## 2. Component Inventory

### 2.1 Split Panel Header (`.panelHeader`)
- **Background**: `var(--surface-raised, #161E2A)`
- **Border Bottom**: `1px solid var(--border-subtle, #1E2836)`
- **Height**: 32px
- **Elements**:
  - Title & Kind Badge (`.panelBadge`): Blue pill with `rgba(123, 163, 227, 0.15)` bg and `var(--action-primary, #7BA3E3)` text.
  - Action Buttons (Detach, Maximize, Close): Hover `var(--surface-hover, #1E2A3A)`, color `var(--text-secondary, #A8B4C6)`.

### 2.2 Workspace Selector Bar (`.workspaceBar`)
- **Background**: `var(--surface, #121925)`
- **Border Bottom**: `1px solid var(--border-default, #2C3848)`
- **Controls**: Template select dropdown, reset button, classic mode toggle, custom workspace save indicator.

### 2.3 Group Tab Bar (`.groupTabBar`)
- **Active Tab**: Background `var(--surface-raised, #161E2A)`, border bottom `2px solid var(--action-primary, #7BA3E3)`, text `var(--text-primary, #E4EBF4)`.
- **Inactive Tab**: Background `transparent`, text `var(--text-muted, #6F7D91)`, hover `var(--text-secondary, #A8B4C6)`.

### 2.4 Panel Catalog Modal (`.catalogModal`)
- **Container**: Background `var(--surface-raised, #161E2A)`, border `1px solid var(--border-default, #2C3848)`, border radius `8px`.
- **Cards**: Background `var(--surface, #121925)`, border `1px solid var(--border-subtle, #1E2836)`, hover border `var(--action-primary, #7BA3E3)`.

### 2.5 Detached Window Placeholder (`.detachedPlaceholder`)
- **Background**: `var(--surface, #121925)`
- **Border**: `1px dashed var(--border-default, #2C3848)`
- **Content**: Session key, cluster id, and prominent "Volver a Acoplar" button (`.redockButton`).
