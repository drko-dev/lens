# OpenLens DevOps — H6 Security, Signing & Notarization Audit

## 1. Overview & Objective

This audit verifies the security posture, isolation boundaries, and digital signature state of OpenLens DevOps 6.5.3-dev on macOS Apple Silicon ARM64.

---

## 2. Code Signing Architecture

### 2.1 Available Identities & Toolchain Check
- Security identity inspection (`security find-identity -v -p codesigning`):
  - Local Apple Development certificate available: `Apple Development: gustavitomarcon@icloud.com (TK7A7AMKT5)`.
  - Distribution Developer ID Application certificate: **PENDING enterprise credentials**.

### 2.2 Local Ad-Hoc Entitlement Signature
For local execution, verification, and regression testing without triggering macOS Gatekeeper execution errors or requiring global security policy changes, the package is deep-signed with ad-hoc signing (`-`) embedding the official security entitlements:

```bash
codesign --force --deep --sign - \
  --entitlements build/entitlements.mac.plist \
  "dist/mac-arm64/OpenLens DevOps.app"
```

Resulting signature attributes:
- `Identifier`: `dev.drko.openlens-devops`
- `Format`: `app bundle with Mach-O thin (arm64)`
- `CodeDirectory`: `v=20400 flags=0x2(adhoc)`
- `Sealed Resources`: `version=2 rules=13 files=184`
- `Total signatures`: `1`

---

## 3. Notarization & Gatekeeper Audit

### 3.1 Status
- **Current Notarization State**: PENDING (no Apple Developer distribution credentials configured in CI/local environment).
- **Gatekeeper Assessment**:
  - The binary runs locally without quarantine.
  - When downloaded from the internet on untrusted machines, Gatekeeper requires an official Apple Developer ID Application signature and notarization ticket.

### 3.2 Required Steps for Public / Enterprise Distribution
To promote this Release Candidate from `QA INTERNO` to `RELEASE DISTRIBUIBLE`:
1. Provide Apple Developer Team ID (`APPLEID`, `APPLEIDPASS` app-specific password, `ASCPROVIDER`).
2. Run `electron-builder` with `CSC_LINK` or `CSC_NAME="Developer ID Application: ..."`
3. Verify notarization ticket staple: `xcrun stapler staple "dist/OpenLens DevOps-6.5.3-dev-arm64.dmg"`.
4. Validate with Gatekeeper: `spctl --assess --type open --context context:primary-signature "dist/OpenLens DevOps-6.5.3-dev-arm64.dmg"`.

---

## 4. Sandbox & Resource Isolation Guarantees

1. **Zero Secret Leakage**:
   - Neither the `.app` bundle nor the `.dmg` contains private developer keys, tokens, or kubeconfigs.
   - All tests execute using isolated sandboxes in `/tmp/openlens-h6-qa-*` with dummy credentials.
2. **IPC Message Validation**:
   - The Electron Main process strictly validates all incoming IPC messages against an allowlist.
   - Detached tool windows operate with single-session isolation, preventing cross-window stream leakage.
3. **No Background Process Leaks**:
   - Verified that terminating OpenLens DevOps cleans up all child helper processes, `node-pty` workers, and cluster proxies.
