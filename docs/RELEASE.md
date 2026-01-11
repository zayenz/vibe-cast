# Release Process

Vibe Cast uses GitHub Actions to automate releases for macOS and Windows.

## Triggering a Release

To create a new release, use the automated script:

```bash
# Create a patch release (e.g., 0.1.0 -> 0.1.1)
node scripts/create_release.mjs patch

# Or minor/major
node scripts/create_release.mjs minor

# Or specific version
node scripts/create_release.mjs 1.2.3
```

The script will:
1.  Bump version in `package.json` and `package-lock.json`.
2.  Bump version in `src-tauri/crates/app/tauri.conf.json`.
3.  Bump version in `src-tauri/crates/app/Cargo.toml`.
4.  Create a git commit and tag.

Finally, push the changes to trigger the release workflow:

```bash
git push && git push --tags
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
