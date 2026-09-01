# Application update channel

ExileQuesting uses the public `Stoffe101/ExileQuesting` GitHub Releases feed for installed-application updates.

## Architecture

- Source and release repository: `Stoffe101/ExileQuesting`
- Installed applications read the public GitHub Releases API anonymously.
- No GitHub token, PAT, repository credential, or Actions secret is embedded in ExileQuesting.
- The tagged release workflow builds, verifies, installs, smoke-tests, hashes, and then publishes the Windows setup executable and checksum as a normal GitHub Release.

## Publishing an application release

The application version in `package.json` should match the pushed version tag. `package-lock.json` is kept in sync as repository metadata.

For example, version `0.1.3` is released from tag `v0.1.3`.

The release workflow gates publication on:

- production dependency audit;
- TypeScript typecheck;
- full automated test suite;
- campaign structural audit and semantic lint;
- full Acts 1–10 offline simulation;
- desktop-manager responsive visual regression;
- overlay visual regression;
- Electron overlay lifecycle soak;
- NSIS build;
- clean install, installed-app startup smoke test, and uninstall;
- SHA-256 checksum generation.

Only after those checks pass does the workflow publish the setup executable and checksum to the repository's GitHub Releases page using the built-in GitHub Actions token.

## Installed update flow

1. ExileQuesting checks `https://api.github.com/repos/Stoffe101/ExileQuesting/releases/latest`.
2. Release metadata is validated and prereleases/drafts are rejected.
3. The setup asset must have the exact expected name `ExileQuesting-<version>-setup.exe` and use a GitHub Releases download URL.
4. The installer is downloaded to the local updates directory.
5. File size and GitHub-provided SHA-256 digest are verified when available.
6. The user explicitly chooses **Restart & install**. ExileQuesting never silently installs an update while the user is playing.

## Failure behavior

A missing release or release-feed outage never blocks ExileQuesting startup or campaign tracking. The application shows one calm, retryable update status, leaves the current installed build untouched, and continues operating normally.
