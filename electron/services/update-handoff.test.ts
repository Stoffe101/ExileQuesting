import { describe, expect, it } from 'vitest';
import { windowsUpdateLauncherScript } from './update-handoff';

describe('Windows update handoff', () => {
  it('waits for ExileQuesting to exit before starting the installer', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain(':wait_parent');
    expect(script).toContain('tasklist /FI "PID eq %PARENT_PID%"');
    expect(script.indexOf(':wait_parent')).toBeLessThan(script.indexOf('start "" /wait "%INSTALLER%" /S'));
  });

  it('runs the verified NSIS installer silently and relaunches the existing installation', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain('start "" /wait "%INSTALLER%" /S');
    expect(script).toContain('if not "%INSTALL_EXIT%"=="0"');
    expect(script).toContain('if not exist "%APP_EXE%"');
    expect(script).toContain('start "" "%APP_EXE%"');
    expect(script).toContain('"relaunched":true');
  });

  it('records failures and stage trace without the fragile timeout/start one-liner', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain('>>"%TRACE_FILE%" echo');
    expect(script).toContain('"status":"failed"');
    expect(script).toContain('call :trace "Relaunching ExileQuesting."');
    expect(script.toLowerCase()).not.toContain('timeout /t');
    expect(script).not.toContain(' & start ');
  });
});
