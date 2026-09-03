import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  readyBuildDoctorSnapshot,
  unavailableBuildDoctorSnapshot,
  type BuildDoctorSnapshot,
} from '../../src/core/build-doctor';
import type {
  PobWorkerCalculationSuccess,
  PobWorkerFlaskInspectionSuccess,
  PobWorkerResponse,
} from '../../src/core/pob-calculation';
import { loadPobCalculationPayload } from './pob-calculation-payload';
import { runPobKernelRequest } from './pob-kernel-service';
import { pobKernelBundleRoot, pobKernelRuntimeOptions, validatePobKernelBundle } from './pob-runtime';
import { StateStore } from './state-store';

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 700) || 'Unknown error.';
}

function calculationResponse(response: PobWorkerResponse): PobWorkerCalculationSuccess {
  if (!response.ok || !('result' in response)) throw new Error('PoB worker did not return the requested baseline calculation.');
  return response as PobWorkerCalculationSuccess;
}

function flaskResponse(response: PobWorkerResponse): PobWorkerFlaskInspectionSuccess {
  if (!response.ok || !('flaskInspection' in response)) throw new Error('PoB worker did not return the requested utility configuration inspection.');
  return response as PobWorkerFlaskInspectionSuccess;
}

export async function analyzeBuildDoctorProfile(profileId: string): Promise<BuildDoctorSnapshot> {
  const generatedAt = new Date().toISOString();
  const userDataPath = app.getPath('userData');
  const store = new StateStore(userDataPath);
  const profiles = await store.loadBuildProfiles();
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error('Build Doctor could not find the requested build profile.');

  if (!profile.calculation) {
    return unavailableBuildDoctorSnapshot({
      status: 'reimport-required',
      profileId: profile.id,
      profileName: profile.name,
      generatedAt,
      message: 'This profile predates persistent Build Doctor calculation inputs. Re-import the PoB once so ExileQuesting can store a verified local calculation payload.',
    });
  }

  let xml: string;
  try {
    xml = await loadPobCalculationPayload(userDataPath, profile);
  } catch (error) {
    return unavailableBuildDoctorSnapshot({
      status: 'calculation-input-invalid',
      profileId: profile.id,
      profileName: profile.name,
      generatedAt,
      message: `The stored PoB calculation input failed local integrity verification. Re-import the build before trusting a diagnosis. ${conciseError(error)}`,
    });
  }

  let runtimeOptions: ReturnType<typeof pobKernelRuntimeOptions>;
  try {
    const bundleRoot = pobKernelBundleRoot({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
      overrideRoot: process.env.EXILEQUESTING_POB_BUNDLE_ROOT,
    });
    runtimeOptions = pobKernelRuntimeOptions(await validatePobKernelBundle(bundleRoot));
  } catch (error) {
    return unavailableBuildDoctorSnapshot({
      status: 'runtime-unavailable',
      profileId: profile.id,
      profileName: profile.name,
      generatedAt,
      message: `The pinned Path of Building calculation runtime is missing or failed integrity verification. ${conciseError(error)}`,
    });
  }

  try {
    const baseline = calculationResponse(await runPobKernelRequest({
      protocolVersion: 1,
      requestId: `doctor-baseline-${randomUUID()}`,
      operation: 'load-and-calculate',
      xml,
      scenario: {
        scenario: 'imported',
        label: 'Imported PoB state',
        notes: ['No encounter-specific assumptions were added by ExileQuesting.'],
      },
    }, { ...runtimeOptions, timeoutMs: 45_000 }));

    // Keep this sequential. Two simultaneous PoB processes cost significantly more memory and
    // the first v0.3 analysis path values predictable resource use over shaving a second off a click.
    const utilityInspection = flaskResponse(await runPobKernelRequest({
      protocolVersion: 1,
      requestId: `doctor-utility-${randomUUID()}`,
      operation: 'inspect-flasks',
      xml,
      scenario: {
        scenario: 'imported',
        label: 'Imported PoB state',
        notes: ['Configuration evidence only; encounter availability has not been inferred.'],
      },
    }, { ...runtimeOptions, timeoutMs: 45_000 }));

    if (baseline.result.kernel.pobCommit !== utilityInspection.flaskInspection.kernel.pobCommit
      || baseline.result.kernel.runtimeRevision !== utilityInspection.flaskInspection.kernel.runtimeRevision
      || baseline.result.kernel.adapterVersion !== utilityInspection.flaskInspection.kernel.adapterVersion) {
      throw new Error('PoB baseline and configuration inspection reported inconsistent kernel provenance.');
    }

    return readyBuildDoctorSnapshot({
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      baseline: baseline.result,
      flaskInspection: utilityInspection.flaskInspection,
    });
  } catch (error) {
    return unavailableBuildDoctorSnapshot({
      status: 'calculation-failed',
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      message: `The verified PoB runtime could not calculate this build. Build Doctor has not produced numerical conclusions. ${conciseError(error)}`,
    });
  }
}
