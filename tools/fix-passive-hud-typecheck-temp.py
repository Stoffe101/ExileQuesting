from pathlib import Path

path = Path('electron/main.ts')
text = path.read_text(encoding='utf-8')
before = """  nativeImage,\n  shell,\n  Tray,\n} from 'electron';"""
after = """  nativeImage,\n  screen,\n  shell,\n  Tray,\n} from 'electron';"""
count = text.count(before)
if count != 1:
    raise RuntimeError(f'electron/main.ts: expected one Electron import insertion point, found {count}')
path.write_text(text.replace(before, after, 1), encoding='utf-8')
print('Added Electron screen import for Passive Tree HUD.')
