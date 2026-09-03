import { app } from 'electron';

let installed = false;

/**
 * ExileQuesting is an advisory overlay, not protected media. Every window must
 * remain capturable by OBS, Discord, Game Bar and normal screenshot tools.
 *
 * v0.2.4's Passive Tree HUD enables Electron content protection during window
 * construction. The release entrypoint installs this listener before main.ts
 * is evaluated and clears that flag immediately after each BrowserWindow has
 * finished its synchronous setup. This avoids invasive edits to the old main
 * bootstrap while guaranteeing the packaged v0.2.5 windows are capture-safe.
 */
export function installCaptureSafeWindowPolicy(): void {
  if (installed) return;
  installed = true;
  app.on('browser-window-created', (_event, window) => {
    queueMicrotask(() => {
      if (!window.isDestroyed()) window.setContentProtection(false);
    });
  });
}
