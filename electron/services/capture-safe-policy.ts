import { BrowserWindow } from 'electron';

let installed = false;

/**
 * ExileQuesting is an advisory overlay, not protected media. Its windows must
 * remain capturable by OBS, Discord, Game Bar and other normal capture tools.
 *
 * Older Passive Tree HUD code enabled Electron content protection to avoid
 * self-capture. The replacement HUD captures only Path of Exile's own window
 * for a tiny static UI check, so excluding ExileQuesting windows from capture
 * is both unnecessary and actively breaks recording software. Install this
 * policy before main.ts is evaluated so the legacy window setup cannot enable
 * SetWindowDisplayAffinity/WDA_EXCLUDEFROMCAPTURE.
 */
export function installCaptureSafeWindowPolicy(): void {
  if (installed) return;
  installed = true;
  const nativeSetContentProtection = BrowserWindow.prototype.setContentProtection;
  BrowserWindow.prototype.setContentProtection = function setContentProtectionCaptureSafe(_enable: boolean): void {
    nativeSetContentProtection.call(this, false);
  };
}
