# OpenLens DevOps — H6 macOS ARM64 Build Manifest & Procedure

## 1. Build Environment

- **Architecture**: `darwin-arm64` (Apple Silicon M4)
- **Host OS**: macOS 27.2 (Darwin Kernel 27.2.0)
- **Node.js**: v24.22.2 (Build orchestrator)
- **NPM Version**: 10.x / 11.x
- **Electron**: 45.2.0
- **Electron Builder**: 23.6.0
- **Build Timestamp**: 2026-11-02

---

## 2. Reproducible Build Pipeline

To reproduce the exact Release Candidate artifacts from source:

```bash
# 1. Clean previous build artifacts
cd open-lens
npm run clean

# 2. Compile @openlens/core production bundle and link to store
cd ../packages/core
SKIP_TS_CHECK=1 npm run build

# 3. Compile open-lens production bundle (Main & Renderer)
cd ../../open-lens
npm run build

# 4. Generate Apple Silicon ARM64 Application & DMG
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never

# 5. Apply Deep Ad-hoc Entitlement Signature for Local Verification
codesign --force --deep --sign - \
  --entitlements build/entitlements.mac.plist \
  "dist/mac-arm64/OpenLens DevOps.app"

# 6. Generate Checksums
cd dist
shasum -a 256 "OpenLens DevOps-6.5.3-dev-arm64.dmg" "OpenLens DevOps-6.5.3-dev-arm64-mac.zip" > SHA256SUMS
```

---

## 3. Verified Artifact Inventory

| Artifact File | Format | Target Architecture | Location |
| :--- | :--- | :--- | :--- |
| `OpenLens DevOps.app` | macOS App Bundle | `arm64` | `open-lens/dist/mac-arm64/OpenLens DevOps.app` |
| `OpenLens DevOps-6.5.3-dev-arm64.dmg` | APFS Disk Image | `arm64` | `open-lens/dist/OpenLens DevOps-6.5.3-dev-arm64.dmg` |
| `OpenLens DevOps-6.5.3-dev-arm64-mac.zip` | Compressed Archive | `arm64` | `open-lens/dist/OpenLens DevOps-6.5.3-dev-arm64-mac.zip` |
| `SHA256SUMS` | SHA-256 Manifest | Plain text | `open-lens/dist/SHA256SUMS` |
| `builder-effective-config.yaml` | Electron-Builder Spec | YAML | `open-lens/dist/builder-effective-config.yaml` |

---

## 4. Native Modules & Dependency Audit

- **`node-pty`**: Version 1.1.0-beta34 compiled specifically for `Mach-O 64-bit bundle arm64` matching Electron 45.2.0 Node ABI.
- **Embedded Binaries**:
  - `kubectl`: v1.25.16 (`Mach-O 64-bit executable arm64`)
  - `helm`: v3.11.0 (`Mach-O 64-bit executable arm64`)
  - `lens-k8s-proxy`: v0.3.0 (`Mach-O 64-bit executable arm64`)
- All native binaries unpack outside the ASAR archive via `asarUnpack: ["**/*.node"]` to enable low-latency execution and prevent OS execution blocks.
