import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { POB_CALCULATION_PROTOCOL_VERSION } from '../src/core/pob-calculation';
import { POB_CONSTRAINT_PROTOCOL_VERSION } from '../src/core/pob-constraints';
import { runPobConstraintRequest } from '../electron/services/pob-constraint-service';
import { runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_KERNEL_COMMIT,
  POB_KERNEL_LUAJIT_COMMIT,
  pobConstraintRuntimeOptions,
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

  const constraintRequestId = `packaged-constraint-health-${process.pid}`;
  const constraintResponse = await runPobConstraintRequest({
    protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
    requestId: constraintRequestId,
    operation: 'health',
  }, pobConstraintRuntimeOptions(bundle));
  if (!constraintResponse.ok || !('health' in constraintResponse)) throw new Error('PoB constraint runtime health smoke did not return a health response.');
  const constraintKernel = constraintResponse.health.kernel;
  if (constraintKernel.pobCommit !== POB_KERNEL_COMMIT) throw new Error(`Packaged constraint PoB commit mismatch: ${constraintKernel.pobCommit}.`);
  if (constraintKernel.runtimeRevision !== POB_KERNEL_LUAJIT_COMMIT) throw new Error(`Packaged constraint LuaJIT revision mismatch: ${constraintKernel.runtimeRevision}.`);
  if (constraintKernel.adapterVersion !== bundle.manifest.constraintAdapterVersion) {
    throw new Error(`Packaged constraint adapter mismatch: manifest=${bundle.manifest.constraintAdapterVersion}, worker=${constraintKernel.adapterVersion}.`);
  }
  if (constraintKernel.protocolVersion !== POB_CONSTRAINT_PROTOCOL_VERSION) throw new Error(`Packaged constraint protocol mismatch: ${constraintKernel.protocolVersion}.`);

  const smokeXml = await readFile(path.join(root, 'smoke', 'OccVortex.xml'), 'utf8');
  const calculationResponse = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: `packaged-calculation-${process.pid}`,
    operation: 'load-and-calculate',
    xml: smokeXml,
    scenario: { scenario: 'imported', label: 'Headless bundle calculation smoke' },
  }, pobKernelRuntimeOptions(bundle));
  if (!calculationResponse.ok || !('result' in calculationResponse)) throw new Error('Headless PoB bundle initialized but failed a real load-and-calculate smoke.');
  const result = calculationResponse.result;
  if (!Number.isFinite(result.defence.life) || (result.defence.life ?? 0) <= 0) throw new Error('Headless PoB calculation smoke returned no valid life value.');

  console.log(`PoB runtime health PASS: PoB=${kernel.pobCommit.slice(0, 12)}, LuaJIT=${kernel.runtimeRevision.slice(0, 12)}, adapter=${kernel.adapterVersion}.`);
  console.log(`PoB constraint health PASS: adapter=${constraintKernel.adapterVersion}.`);
  console.log(`PoB real calculation PASS: life=${result.defence.life}, DPS=${result.offence.totalDps ?? 'n/a'}.`);
  console.log(`Bundle provenance: files=${bundle.manifest.fileCount}, bytes=${bundle.manifest.totalBytes}, tree=${bundle.manifest.treeSha256}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
