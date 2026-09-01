import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RecoveryState } from '../../src/core/types';

interface SessionMarker {
  startedAt: string;
  appVersion: string;
  progress: number;
}

export class SessionGuard {
  private markerPath: string;
  private currentStartedAt = new Date().toISOString();

  constructor(userDataPath: string) {
    this.markerPath = path.join(userDataPath, 'session-active.json');
  }

  begin(appVersion: string, progress: number): RecoveryState {
    let previous: SessionMarker | undefined;
    if (existsSync(this.markerPath)) {
      try {
        previous = JSON.parse(readFileSync(this.markerPath, 'utf8')) as SessionMarker;
      } catch {
        previous = undefined;
      }
    }
    this.currentStartedAt = new Date().toISOString();
    this.write({ startedAt: this.currentStartedAt, appVersion, progress });
    return {
      previousSessionUnclean: Boolean(previous),
      previousStartedAt: previous?.startedAt,
      previousAppVersion: previous?.appVersion,
      previousProgress: previous?.progress,
      acknowledged: !previous,
    };
  }

  update(progress: number, appVersion: string): void {
    this.write({ startedAt: this.currentStartedAt, appVersion, progress });
  }

  private write(marker: SessionMarker): void {
    try {
      writeFileSync(this.markerPath, JSON.stringify(marker, null, 2), 'utf8');
    } catch {
      // A recovery marker is useful but must never block startup or progress persistence.
    }
  }

  clean(): void {
    try {
      rmSync(this.markerPath, { force: true });
    } catch {
      // Shutdown should continue even if antivirus temporarily locks the marker.
    }
  }
}
