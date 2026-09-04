import { globalShortcut } from 'electron';

interface GlobalShortcutApi {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
  unregisterAll: () => void;
  isRegistered: (accelerator: string) => boolean;
}

export const TARGET_LOCK_RESERVED_HOTKEYS = new Set([
  'CommandOrControl+Shift+C',
  'CommandOrControl+Shift+0',
]);

let installed = false;

/**
 * main.ts predates Target Lock and refreshes configurable app hotkeys with
 * globalShortcut.unregisterAll(). That must never steal Target Lock's recovery
 * shortcuts mid-session. Wrap the Electron singleton before main.ts loads so
 * unregisterAll means "all non-reserved shortcuts" while the HUD is alive.
 * Explicit unregister() still works, therefore PassiveTreeHudService.stop()
 * cleanly releases the reserved shortcuts during shutdown.
 */
export function protectGlobalShortcuts(
  api: GlobalShortcutApi,
  protectedAccelerators: ReadonlySet<string>,
): () => void {
  const originalRegister = api.register.bind(api);
  const originalUnregister = api.unregister.bind(api);
  const originalUnregisterAll = api.unregisterAll.bind(api);
  const tracked = new Set<string>();

  api.register = (accelerator, callback) => {
    const registered = originalRegister(accelerator, callback);
    if (registered) tracked.add(accelerator);
    return registered;
  };
  api.unregister = (accelerator) => {
    tracked.delete(accelerator);
    originalUnregister(accelerator);
  };
  api.unregisterAll = () => {
    for (const accelerator of [...tracked]) {
      if (protectedAccelerators.has(accelerator) && api.isRegistered(accelerator)) continue;
      tracked.delete(accelerator);
      originalUnregister(accelerator);
    }
  };

  return () => {
    api.register = originalRegister;
    api.unregister = originalUnregister;
    api.unregisterAll = originalUnregisterAll;
  };
}

export function installTargetLockGlobalShortcutPolicy(): void {
  if (installed) return;
  installed = true;
  protectGlobalShortcuts(globalShortcut, TARGET_LOCK_RESERVED_HOTKEYS);
}
