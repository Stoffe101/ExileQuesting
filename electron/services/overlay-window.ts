import { BrowserWindow, screen } from 'electron';
import type { AppSettings, OverlayMode, OverlayPosition } from '../../src/core/types';

const MODE_WIDTHS: Record<OverlayMode, number> = { compact: 350, focus: 430, coach: 480 };
const MIN_HEIGHT = 118;
const MAX_HEIGHT_RATIO = 0.86;
const EDGE = 18;

function displayFor(position: OverlayPosition): Electron.Display {
  const displays = screen.getAllDisplays();
  return displays.find((display) => display.id === position.displayId) ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ?? screen.getPrimaryDisplay();
}

export function widthForMode(mode: OverlayMode, scale = 1): number {
  return Math.round(MODE_WIDTHS[mode] * Math.max(0.75, Math.min(scale, 1.5)));
}

export function applyOverlayPosition(window: BrowserWindow, position: OverlayPosition): OverlayPosition {
  const display = displayFor(position);
  const work = display.workArea;
  const bounds = window.getBounds();
  let x = position.x;
  let y = position.y;

  const positions: Record<Exclude<OverlayPosition['preset'], 'custom'>, [number, number]> = {
    'top-left': [work.x + EDGE, work.y + EDGE],
    'top-center': [work.x + Math.round((work.width - bounds.width) / 2), work.y + EDGE],
    'top-right': [work.x + work.width - bounds.width - EDGE, work.y + EDGE],
    'middle-left': [work.x + EDGE, work.y + Math.round((work.height - bounds.height) / 2)],
    'middle-right': [work.x + work.width - bounds.width - EDGE, work.y + Math.round((work.height - bounds.height) / 2)],
    'bottom-left': [work.x + EDGE, work.y + work.height - bounds.height - EDGE],
    'bottom-center': [work.x + Math.round((work.width - bounds.width) / 2), work.y + work.height - bounds.height - EDGE],
    'bottom-right': [work.x + work.width - bounds.width - EDGE, work.y + work.height - bounds.height - EDGE],
  };
  if (position.preset !== 'custom') [x, y] = positions[position.preset];
  x ??= work.x + work.width - bounds.width - EDGE;
  y ??= work.y + EDGE;
  x = Math.max(work.x, Math.min(x, work.x + work.width - bounds.width));
  y = Math.max(work.y, Math.min(y, work.y + work.height - bounds.height));
  window.setPosition(Math.round(x), Math.round(y), false);
  return { ...position, x: Math.round(x), y: Math.round(y), displayId: display.id };
}

export function resizeOverlayToContent(window: BrowserWindow, contentHeight: number, settings: AppSettings): OverlayPosition {
  const display = screen.getDisplayMatching(window.getBounds());
  const width = widthForMode(settings.overlayMode, settings.overlayScale);
  const maxHeight = Math.round(display.workArea.height * MAX_HEIGHT_RATIO);
  const requested = Math.round(contentHeight * Math.max(0.75, Math.min(settings.overlayScale, 1.5)));
  const height = Math.max(MIN_HEIGHT, Math.min(requested, maxHeight));
  const before = window.getBounds();
  window.setBounds({ ...before, width, height }, true);
  return applyOverlayPosition(window, settings.overlayPosition);
}

export function snapCustomPosition(window: BrowserWindow, position: OverlayPosition): OverlayPosition {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const work = display.workArea;
  let { x, y } = bounds;
  if (position.snapToEdges) {
    const threshold = 24;
    if (Math.abs(x - work.x) < threshold) x = work.x;
    if (Math.abs(y - work.y) < threshold) y = work.y;
    if (Math.abs(x + bounds.width - (work.x + work.width)) < threshold) x = work.x + work.width - bounds.width;
    if (Math.abs(y + bounds.height - (work.y + work.height)) < threshold) y = work.y + work.height - bounds.height;
    window.setPosition(x, y, false);
  }
  return { ...position, preset: 'custom', x, y, displayId: display.id };
}
