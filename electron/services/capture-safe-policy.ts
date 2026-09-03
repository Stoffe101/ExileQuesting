import { BrowserWindow } from 'electron';

let installed = false;

/**
 * ExileQuesting is an advisory overlay, not protected media. Its windows must
 * remain capturable by OBS, Discord, Game Bar and other normal capture tools.
 *
 * Older Passive Tree HUD code enabled Electron content protection to avoid
 * self-capture. The new HUD never captures the game, so there is no reason to
 * call SetWindowDisplayAffinity/WDA_EXCLUDEFROMCAPTURE on Windows. Install this
 * policy before main.ts is evaluated so legacy window setup cannot turn capture
 * exclusion back on while the old call is removed in a later main.ts cleanup.
 */
export function installCaptureSafeWindowPolicy(): void {
  if (installed) return;
  installed = true;
  const nativeSetContentProtection = BrowserWindow.prototype.setContentProtection;
  BrowserWindow.prototype.setContentProtection = function setContentProtectionCaptureSafe(_enable: boolean): void {
    nativeSetContentProtection.call(this, false);
  };
}
