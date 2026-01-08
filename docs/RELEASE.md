# Release Process

Vibe Cast uses GitHub Actions to automate releases for macOS and Windows.

## Triggering a Release

To create a new release:

1.  **Update Version**: Bump the version in `package.json` and `src-tauri/tauri.conf.json`.
2.  **Tag**: Create and push a git tag starting with `v` (e.g., `v0.1.0`).

```bash
npm version patch # or minor/major - this updates package.json
# Manually update tauri.conf.json version to match!
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.1.0"
git tag v0.1.0
git push origin main --tags
```

3.  **Action**: The `Release` workflow will start automatically.
4.  **Draft Release**: A draft release will be created on GitHub with the built artifacts (`.dmg`, `.exe` / `.msi`).
5.  **Publish**: Review the draft and publish it when ready.

## Secrets

For signed builds (recommended for macOS to avoid security warnings), configure these secrets in GitHub Repository Settings:

- `APPLE_CERTIFICATE`: Base64 encoded `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: Password for the certificate.
- `APPLE_SIGNING_IDENTITY`: Identity name.
- `APPLE_API_ISSUER`: App Store Connect Issuer ID (for notarization).
- `APPLE_API_KEY`: App Store Connect Key ID.
- `APPLE_API_KEY_PATH`: Path or content of the private key.

Without these, the macOS app will be unsigned and may require users to right-click -> Open to run.
