import { BrowserWindow } from 'electron';

export function createPreplaytestLab(preloadPath: string, devTools = false): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 820,
    minHeight: 620,
    show: false,
    backgroundColor: '#0b0e13',
    title: 'ExileQuesting · Pre-playtest Lab',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  return window;
}
