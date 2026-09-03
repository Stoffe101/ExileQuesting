import { app } from 'electron';
import type { BuildProfile } from '../../src/core/build-profiles';
import { loadPobCalculationPayload } from './pob-calculation-payload';
import { pobConstraintRuntimeOptions, pobKernelBundleRoot, pobKernelRuntimeOptions, validatePobKernelBundle } from './pob-runtime';
import { StateStore } from './state-store';

export type BuildDoctorContextFailureStatus = 'reimport-required' | 'calculation-input-invalid' | 'runtime-unavailable';

export interface BuildDoctorCalculationContext {
  ok: true;
  profile: BuildProfile;
  xml: string;
  runtimeOptions: ReturnType<typeof pobKernelRuntimeOptions>;
  constraintRuntimeOptions: ReturnType<typeof pobConstraintRuntimeOptions>;
}

export interface BuildDoctorCalculationContextFailure {
  ok: false;
  profileId: string;
  profileName: string;
  status: BuildDoctorContextFailureStatus;
  message: string;
}

export type BuildDoctorCalculationContextResult = BuildDoctorCalculationContext | BuildDoctorCalculationContextFailure;

export function conciseBuildDoctorError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 700) || 'Unknown error.';
}

export async function resolveBuildDoctorCalculationContext(profileId: string): Promise<BuildDoctorCalculationContextResult> {
  const userDataPath = app.getPath('userData');
  const store = new StateStore(userDataPath);
  const profiles = await store.loadBuildProfiles();
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error('Build Doctor could not find the requested build profile.');

  if (!profile.calculation) {
    return {
      ok: false,
      status: 'reimport-required',
      profileId: profile.id,
      profileName: profile.name,
      message: 'This profile predates persistent Build Doctor calculation inputs. Re-import the PoB once so ExileQuesting can store a verified local calculation payload.',
    };
  }

  let xml: string;
  try {
    xml = await loadPobCalculationPayload(userDataPath, profile);
  } catch (error) {
    return {
      ok: false,
      status: 'calculation-input-invalid',
      profileId: profile.id,
      profileName: profile.name,
      message: `The stored PoB calculation input failed local integrity verification. Re-import the build before trusting a diagnosis. ${conciseBuildDoctorError(error)}`,
    };
  }

  try {
    const bundleRoot = pobKernelBundleRoot({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
      overrideRoot: process.env.EXILEQUESTING_POB_BUNDLE_ROOT,
    });
    const bundle = await validatePobKernelBundle(bundleRoot);
    return {
      ok: true,
      profile,
      xml,
      runtimeOptions: pobKernelRuntimeOptions(bundle),
      constraintRuntimeOptions: pobConstraintRuntimeOptions(bundle),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'runtime-unavailable',
      profileId: profile.id,
      profileName: profile.name,
      message: `The pinned Path of Building calculation runtime is missing or failed integrity verification. ${conciseBuildDoctorError(error)}`,
    };
  }
}
