import { describe, expect, it } from 'vitest';
import { windowsUpdateLauncherScript } from './update-handoff';

describe('Windows update handoff', () => {
  it('waits for ExileQuesting to exit before starting the installer', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain('Wait-Process -Id $ParentPid');
    expect(script.indexOf('Wait-Process -Id $ParentPid')).toBeLessThan(script.indexOf('Start-Process -FilePath $Installer'));
  });

  it('runs the NSIS installer silently and relaunches the installed executable', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain("-ArgumentList '/S'");
    expect(script).toContain('-Wait -PassThru');
    expect(script).toContain('Start-Process -FilePath $AppExe');
    expect(script).toContain('$result.relaunched = $true');
  });

  it('records installer failures for diagnostics instead of using cmd.exe', () => {
    const script = windowsUpdateLauncherScript();
    expect(script).toContain("$result.status = 'failed'");
    expect(script).toContain('Set-Content -LiteralPath $ResultFile');
    expect(script.toLowerCase()).not.toContain('cmd.exe');
    expect(script.toLowerCase()).not.toContain('timeout /t');
  });
});
