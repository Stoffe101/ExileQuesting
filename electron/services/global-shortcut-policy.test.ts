import { describe, expect, it } from 'vitest';
import { protectGlobalShortcuts, TARGET_LOCK_RESERVED_HOTKEYS } from './global-shortcut-policy';

function fakeShortcuts() {
  const registered = new Set<string>();
  const callbacks = new Map<string, () => void>();
  return {
    registered,
    api: {
      register(accelerator: string, callback: () => void) {
        if (registered.has(accelerator)) return false;
        registered.add(accelerator);
        callbacks.set(accelerator, callback);
        return true;
      },
      unregister(accelerator: string) {
        registered.delete(accelerator);
        callbacks.delete(accelerator);
      },
      unregisterAll() {
        registered.clear();
        callbacks.clear();
      },
      isRegistered(accelerator: string) { return registered.has(accelerator); },
    },
  };
}

describe('Target Lock global shortcut policy', () => {
  it('preserves Target Lock shortcuts when the old app refresh calls unregisterAll', () => {
    const fake = fakeShortcuts();
    protectGlobalShortcuts(fake.api, TARGET_LOCK_RESERVED_HOTKEYS);
    expect(fake.api.register('CommandOrControl+Shift+C', () => {})).toBe(true);
    expect(fake.api.register('CommandOrControl+Shift+0', () => {})).toBe(true);
    expect(fake.api.register('Alt+Shift+Right', () => {})).toBe(true);

    fake.api.unregisterAll();
    expect(fake.registered.has('CommandOrControl+Shift+C')).toBe(true);
    expect(fake.registered.has('CommandOrControl+Shift+0')).toBe(true);
    expect(fake.registered.has('Alt+Shift+Right')).toBe(false);
  });

  it('still allows the HUD service to explicitly unregister reserved shortcuts on shutdown', () => {
    const fake = fakeShortcuts();
    protectGlobalShortcuts(fake.api, TARGET_LOCK_RESERVED_HOTKEYS);
    fake.api.register('CommandOrControl+Shift+C', () => {});
    fake.api.unregister('CommandOrControl+Shift+C');
    expect(fake.registered.has('CommandOrControl+Shift+C')).toBe(false);
  });
});
