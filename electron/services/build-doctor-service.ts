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
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { runPobKernelRequest } from './pob-kernel-service';

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
  const context = await resolveBuildDoctorCalculationContext(profileId);
  if (!context.ok) {
    return unavailableBuildDoctorSnapshot({
      status: context.status,
      profileId: context.profileId,
      profileName: context.profileName,
      generatedAt,
      message: context.message,
    });
  }

  const { profile, xml, runtimeOptions } = context;
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
      message: `The verified PoB runtime could not calculate this build. Build Doctor has not produced numerical conclusions. ${conciseBuildDoctorError(error)}`,
    });
  }
}
