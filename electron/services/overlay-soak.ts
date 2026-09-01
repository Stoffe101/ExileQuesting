import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface OverlaySoakReport {
  generatedAt: string;
  iterations: number;
  durationMs: number;
  mainHeapBefore: number;
  mainHeapAfter: number;
  mainRssBefore: number;
  mainRssAfter: number;
  rendererWorkingSetBefore?: number;
  rendererWorkingSetAfter?: number;
  rendererCpuBefore?: number;
  rendererCpuAfter?: number;
  successfulRendererProbes: number;
}

function rendererMetric(window: BrowserWindow) {
  const pid = window.webContents.getOSProcessId();
  return app.getAppMetrics().find((metric) => metric.pid === pid);
}

export async function runOverlayWindowSoak(window: BrowserWindow, outputDirectory: string, iterations = 180): Promise<OverlaySoakReport> {
  const count = Math.max(20, Math.min(1000, Math.trunc(iterations)));
  const beforeMemory = process.memoryUsage();
  const beforeRenderer = rendererMetric(window);
  const started = Date.now();
  let probes = 0;

  for (let index = 0; index < count; index += 1) {
    if (window.isDestroyed() || window.webContents.isCrashed()) throw new Error(`Overlay renderer died during soak iteration ${index + 1}.`);

    const width = 330 + (index % 5) * 45;
    const height = 130 + (index % 9) * 55;
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width, height }, false);
    if (index % 3 === 0) window.hide();
    else window.showInactive();

    if (index % 12 === 0) {
      const ready = await window.webContents.executeJavaScript('document.readyState', true) as string;
      if (!['interactive', 'complete'].includes(ready)) throw new Error(`Overlay renderer was not ready during soak iteration ${index + 1}: ${ready}`);
      probes += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 8));
  }

  window.showInactive();
  const afterMemory = process.memoryUsage();
  const afterRenderer = rendererMetric(window);
  const report: OverlaySoakReport = {
    generatedAt: new Date().toISOString(),
    iterations: count,
    durationMs: Date.now() - started,
    mainHeapBefore: beforeMemory.heapUsed,
    mainHeapAfter: afterMemory.heapUsed,
    mainRssBefore: beforeMemory.rss,
    mainRssAfter: afterMemory.rss,
    rendererWorkingSetBefore: beforeRenderer?.memory.workingSetSize,
    rendererWorkingSetAfter: afterRenderer?.memory.workingSetSize,
    rendererCpuBefore: beforeRenderer?.cpu.percentCPUUsage,
    rendererCpuAfter: afterRenderer?.cpu.percentCPUUsage,
    successfulRendererProbes: probes,
  };

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'overlay-soak.json'), JSON.stringify(report, null, 2), 'utf8');
  return report;
}
