# Application update channel

ExileQuesting keeps its source repository private while allowing installed applications to check for updates anonymously.

## Architecture

- Private source repository: `Stoffe101/ExileQuesting`
- Public release-only repository: `Stoffe101/ExileQuesting-Releases`
- Installed applications read only the public GitHub Releases API.
- No GitHub token, PAT, repository credential, or Actions secret is ever embedded in ExileQuesting.
- The source repository's tagged release workflow builds, verifies, installs, smoke-tests, hashes, and then publishes the Windows setup executable to the public release repository.

## One-time GitHub setup

1. Create a **public** GitHub repository named `ExileQuesting-Releases` under `Stoffe101`.
2. Initialize it with a README so the repository has a `main` branch.
3. Create a fine-grained personal access token limited to **only** `Stoffe101/ExileQuesting-Releases`.
4. Give that token repository permission **Contents: Read and write**. No other repository permission is required by the release workflow.
5. In the private `Stoffe101/ExileQuesting` repository, open **Settings → Secrets and variables → Actions**.
6. Add a repository secret named `RELEASE_REPO_TOKEN` containing that fine-grained token.

## Publishing an application release

The application version in `package.json` and `package-lock.json` must match the pushed version tag.

For example, for version `0.1.3`, push tag `v0.1.3`.

The release workflow then gates publication on:

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

Only after those checks pass does the workflow use `RELEASE_REPO_TOKEN` to publish the setup executable and checksum to `Stoffe101/ExileQuesting-Releases`.

## Installed update flow

1. ExileQuesting checks `https://api.github.com/repos/Stoffe101/ExileQuesting-Releases/releases/latest`.
2. Release metadata is validated and prereleases/drafts are rejected.
3. The setup asset must have the exact expected name `ExileQuesting-<version>-setup.exe` and use a GitHub Releases download URL.
4. The installer is downloaded to the local updates directory.
5. File size and GitHub-provided SHA-256 digest are verified when available.
6. The user explicitly chooses **Restart & install**. ExileQuesting never silently installs an update while the user is playing.

## Failure behavior

A release-feed outage never blocks ExileQuesting startup or campaign tracking. The application records the update error, leaves the current installed build untouched, and allows the user to retry later.
