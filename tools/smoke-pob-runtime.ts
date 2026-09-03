import path from 'node:path';
import { POB_CALCULATION_PROTOCOL_VERSION } from '../src/core/pob-calculation';
import { runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_KERNEL_COMMIT,
  POB_KERNEL_LUAJIT_COMMIT,
  pobKernelRuntimeOptions,
  validatePobKernelBundle,
} from '../electron/services/pob-runtime';

async function main(): Promise<void> {
  const rootInput = process.argv[2];
  if (!rootInput?.trim()) throw new Error('Usage: smoke-pob-runtime <pob-kernel-bundle-root>');
  const root = path.resolve(rootInput);
  const bundle = await validatePobKernelBundle(root);
  const requestId = `packaged-health-${process.pid}`;
  const response = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    operation: 'health',
  }, pobKernelRuntimeOptions(bundle));

  if (!response.ok || !('health' in response)) throw new Error('PoB runtime health smoke did not return a health response.');
  const kernel = response.health.kernel;
  if (kernel.pobCommit !== POB_KERNEL_COMMIT) throw new Error(`Packaged PoB commit mismatch: ${kernel.pobCommit}.`);
  if (kernel.runtimeRevision !== POB_KERNEL_LUAJIT_COMMIT) throw new Error(`Packaged LuaJIT revision mismatch: ${kernel.runtimeRevision}.`);
  if (kernel.adapterVersion !== bundle.manifest.workerAdapterVersion) {
    throw new Error(`Packaged worker adapter mismatch: manifest=${bundle.manifest.workerAdapterVersion}, worker=${kernel.adapterVersion}.`);
  }
  if (kernel.protocolVersion !== POB_CALCULATION_PROTOCOL_VERSION) throw new Error(`Packaged protocol mismatch: ${kernel.protocolVersion}.`);

  console.log(`PoB runtime health PASS: PoB=${kernel.pobCommit.slice(0, 12)}, LuaJIT=${kernel.runtimeRevision.slice(0, 12)}, adapter=${kernel.adapterVersion}.`);
  console.log(`Bundle provenance: files=${bundle.manifest.fileCount}, bytes=${bundle.manifest.totalBytes}, tree=${bundle.manifest.treeSha256}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
