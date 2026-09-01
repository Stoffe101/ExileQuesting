import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppUpdateState } from '../../src/core/types';
import { isNewerVersion, parseLatestRelease, parseSha256Digest, type ParsedAppRelease } from '../../src/core/updates';

interface AppUpdaterOptions {
  repository: string;
  currentVersion: string;
  updatesDirectory: string;
  packaged: boolean;
  onState: (state: AppUpdateState) => void;
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

export class AppUpdater {
  private state: AppUpdateState;
  private release: ParsedAppRelease | null = null;
  private downloadedPath = '';
  private activeDownload: Promise<AppUpdateState> | null = null;

  constructor(private options: AppUpdaterOptions) {
    this.state = {
      status: options.packaged ? 'idle' : 'disabled',
      currentVersion: options.currentVersion,
      message: options.packaged ? 'Update check has not run yet.' : 'Application updates are disabled in development builds.',
    };
  }

  snapshot(): AppUpdateState {
    return { ...this.state };
  }

  private setState(patch: Partial<AppUpdateState>): AppUpdateState {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.snapshot());
    return this.snapshot();
  }

  async check(): Promise<AppUpdateState> {
    if (!this.options.packaged) return this.snapshot();
    if (this.state.status === 'downloading') return this.snapshot();
    this.setState({ status: 'checking', error: undefined, message: 'Checking for ExileQuesting updates…' });
    try {
      const response = await fetch(`https://api.github.com/repos/${this.options.repository}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `ExileQuesting/${this.options.currentVersion}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const privateHint = response.status === 404
          ? ' The release repository must be public (or moved to a separate public release repository) before end-user updates can work; ExileQuesting never embeds a GitHub token.'
          : '';
        throw new Error(`GitHub release check returned HTTP ${response.status}.${privateHint}`);
      }
      const release = parseLatestRelease(await response.json());
      if (!release) throw new Error('The latest GitHub release does not contain a valid ExileQuesting setup asset.');
      this.release = release;
      this.downloadedPath = '';
      if (!isNewerVersion(release.version, this.options.currentVersion)) {
        return this.setState({
          status: 'up-to-date',
          latestVersion: release.version,
          releaseName: release.name,
          releaseNotes: release.notes,
          publishedAt: release.publishedAt,
          progress: undefined,
          downloadedBytes: undefined,
          totalBytes: undefined,
          message: `ExileQuesting ${this.options.currentVersion} is up to date.`,
        });
      }
      return this.setState({
        status: 'available',
        latestVersion: release.version,
        releaseName: release.name,
        releaseNotes: release.notes,
        publishedAt: release.publishedAt,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: release.setupAsset.size,
        message: `ExileQuesting ${release.version} is available.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.log?.warn('Application update check failed.', error);
      return this.setState({ status: 'error', error: message, message: `Update check failed. ${message}` });
    }
  }

  async download(): Promise<AppUpdateState> {
    if (!this.options.packaged) return this.snapshot();
    if (this.activeDownload) return this.activeDownload;
    if (!this.release || !isNewerVersion(this.release.version, this.options.currentVersion)) {
      const checked = await this.check();
      if (checked.status !== 'available') return checked;
    }
    this.activeDownload = this.performDownload().finally(() => { this.activeDownload = null; });
    return this.activeDownload;
  }

  private async performDownload(): Promise<AppUpdateState> {
    const release = this.release;
    if (!release) return this.setState({ status: 'error', message: 'No update release is selected.', error: 'No update release is selected.' });
    await fs.mkdir(this.options.updatesDirectory, { recursive: true });
    const finalPath = path.join(this.options.updatesDirectory, release.setupAsset.name);
    const temporaryPath = `${finalPath}.partial`;
    await fs.rm(temporaryPath, { force: true });
    this.setState({
      status: 'downloading',
      error: undefined,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: release.setupAsset.size,
      message: `Downloading ExileQuesting ${release.version}…`,
    });

    try {
      const response = await fetch(release.setupAsset.browser_download_url, {
        headers: { 'User-Agent': `ExileQuesting/${this.options.currentVersion}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok || !response.body) throw new Error(`Update download returned HTTP ${response.status}.`);
      const handle = await fs.open(temporaryPath, 'w');
      const hash = createHash('sha256');
      let downloaded = 0;
      try {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          await handle.write(chunk);
          hash.update(chunk);
          downloaded += chunk.length;
          const total = release.setupAsset.size || Number(response.headers.get('content-length') ?? 0) || undefined;
          const progress = total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
          this.setState({ status: 'downloading', downloadedBytes: downloaded, totalBytes: total, progress, message: `Downloading ExileQuesting ${release.version}…` });
        }
      } finally {
        await handle.close();
      }

      if (release.setupAsset.size > 0 && downloaded !== release.setupAsset.size) {
        throw new Error(`Downloaded ${downloaded} bytes but GitHub reported ${release.setupAsset.size}.`);
      }
      const expectedDigest = parseSha256Digest(release.setupAsset.digest);
      const actualDigest = hash.digest('hex').toLowerCase();
      if (expectedDigest && actualDigest !== expectedDigest) throw new Error('Downloaded update failed its SHA-256 integrity check.');

      await fs.rm(finalPath, { force: true });
      await fs.rename(temporaryPath, finalPath);
      this.downloadedPath = finalPath;
      this.options.log?.info(`Application update downloaded: ${finalPath}`);
      return this.setState({
        status: 'ready',
        downloadedBytes: downloaded,
        totalBytes: downloaded,
        progress: 100,
        message: `ExileQuesting ${release.version} is ready to install.`,
      });
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.options.log?.warn('Application update download failed.', error);
      return this.setState({ status: 'error', error: message, message: `Update download failed. ${message}` });
    }
  }

  async installOnExit(): Promise<boolean> {
    if (!this.downloadedPath || this.state.status !== 'ready') return false;
    try {
      await fs.access(this.downloadedPath);
      const commandProcessor = process.env.ComSpec || 'cmd.exe';
      const quotedInstaller = `"${this.downloadedPath.replace(/"/g, '""')}"`;
      const command = `timeout /t 2 /nobreak >nul & start "" ${quotedInstaller} /S`;
      const child = spawn(commandProcessor, ['/d', '/s', '/c', command], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      child.unref();
      this.options.log?.info(`Scheduled update installer after exit: ${this.downloadedPath}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.log?.warn('Failed to schedule application update installation.', error);
      this.setState({ status: 'error', error: message, message: `Could not start the update installer. ${message}` });
      return false;
    }
  }
}
