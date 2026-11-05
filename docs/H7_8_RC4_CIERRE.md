# H7.8 — RC4 (internal QA) closing report

Date: 2026-11-04. Status: **RC4 PASS for internal QA**. Public distribution NOT READY (ad-hoc signature only, no Developer ID, no notarization).

## Artifact
- `open-lens/dist/rc4/OpenLens DevOps-6.5.3-dev-arm64-RC4.dmg` (245,644,088 bytes)
- SHA-256: `1a4e9979adc79f17209b9d7a9775a09683fd6ba2a4bbe76114fdb8124c35fc92`
- Code: HEAD `1639cf4` (product code identical to `6504144`); RC3 baseline untouched (`805972f6…3197`, both copies).

## Build (read from docs/H6_BUILD_MACOS_ARM64.md, adapted)
1. `cd packages/core && SKIP_TS_CHECK=1 npm run build` (a single `tsc --noEmit` gave 42 errors, 0 in global-docking; the 2 touched files only carry pre-existing ones).
2. `cd open-lens && npm run build`
3. Remove `static/build/*.hot-update.*` (45 files, 303 MB of git-ignored dev-server leftovers that RC3 also shipped).
4. `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never -c.directories.output=dist/rc4`
5. `codesign --force --deep --sign - <app>` (electron-builder's own result was linker-signed only and failed `codesign --verify --deep --strict`).
6. `electron-builder --mac dmg --arm64 --prepackaged <app> -c.directories.output=dist/rc4`, rename to RC4, `SHA256SUMS`, `RELEASE_MANIFEST.txt`.
Do not run `npm run clean`: it removes `dist/` (RC2/RC3).

## Verification
- `hdiutil verify` VALID; SHA-256 matches `SHA256SUMS`; app `codesign --verify --deep --strict` OK (adhoc, `dev.drko.openlens-devops`).
- asar content equals RC3 except 7 new `@openlens/core` entries (H7 code).
- Packaged smoke (app run from the read-only mounted DMG, QA profile, no dev server): GV01, GV02, PS01-PS09, PS15 = 13/13 PASS. Peak RSS ~1.4 GB, idle ~1.1 GB, peak CPU ~179%, 7 processes, 5 listeners. No orphans, ports free afterwards.
- Rollback: RC3 launched from its protected DMG with the same QA profile: starts, no page errors, no global panel host; RC3 DMG SHA-256 unchanged.

## Notes
- Harness: `H7_PACKAGED_APP` runs the packaged executable without a dev server and reads `appdata/OpenLens DevOps`. The first packaged run failed 10/13 only because the harness looked in the DEV directory `OpenLens DevOpsDev`; the app had saved the layouts correctly.
- The QA profile `appdata/OpenLens DevOps` kept the layouts written by the first packaged run (JSON stores backed up before the RC3 check).

## NOT VERIFIED
Multiple monitors, profile without permissions, environment change, restore with a deleted cluster, live flag-OFF rollback inside RC4, per-panel listener leaks. Full 186-scenario regression was not re-run (approved on `6504144`).
