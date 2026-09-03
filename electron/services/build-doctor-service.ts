import { randomUUID } from 'node:crypto';
import {
  readyBuildDoctorSnapshot,
  unavailableBuildDoctorSnapshot,
  type BuildDoctorKernelProvenance,
  type BuildDoctorSnapshot,
} from '../../src/core/build-doctor';
import type {
  PobCalculationKernelVersion,
  PobWorkerCalculationSuccess,
  PobWorkerFlaskInspectionSuccess,
  PobWorkerResponse,
} from '../../src/core/pob-calculation';
import {
  POB_CONSTRAINT_PROTOCOL_VERSION,
  type PobConstraintWorkerInspectionSuccess,
  type PobConstraintWorkerResponse,
} from '../../src/core/pob-constraints';
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { runPobConstraintRequest } from './pob-constraint-service';
import { runPobKernelRequest } from './pob-kernel-service';

function calculationResponse(response: PobWorkerResponse): PobWorkerCalculationSuccess {
  if (!response.ok || !('result' in response)) throw new Error('PoB worker did not return the requested baseline calculation.');
  return response as PobWorkerCalculationSuccess;
}

function flaskResponse(response: PobWorkerResponse): PobWorkerFlaskInspectionSuccess {
  if (!response.ok || !('flaskInspection' in response)) throw new Error('PoB worker did not return the requested utility configuration inspection.');
  return response as PobWorkerFlaskInspectionSuccess;
}

function integrityResponse(response: PobConstraintWorkerResponse): PobConstraintWorkerInspectionSuccess {
  if (!response.ok || !('inspection' in response)) throw new Error('PoB constraint worker did not return the requested current-state inspection.');
  return response as PobConstraintWorkerInspectionSuccess;
}

function samePinnedRuntime(left: PobCalculationKernelVersion, right: PobCalculationKernelVersion): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtime === right.runtime
    && left.runtimeRevision === right.runtimeRevision;
}

function provenance(kernel: PobCalculationKernelVersion): BuildDoctorKernelProvenance {
  return {
    pobRepository: kernel.pobRepository,
    pobCommit: kernel.pobCommit,
    runtime: kernel.runtime,
    runtimeRevision: kernel.runtimeRevision,
    adapterVersion: kernel.adapterVersion,
  };
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

  const { profile, xml, runtimeOptions, constraintRuntimeOptions } = context;
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

    // Keep these sequential. Multiple simultaneous PoB processes cost significantly more memory and
    // the v0.3 analysis path values predictable resource use over shaving seconds off one click.
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

    let integrity: { metrics: PobConstraintWorkerInspectionSuccess['inspection']['metrics']; kernel: BuildDoctorKernelProvenance } | undefined;
    let integrityUnavailableMessage: string | undefined;
    try {
      const inspected = integrityResponse(await runPobConstraintRequest({
        protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
        requestId: `doctor-baseline-integrity-${randomUUID()}`,
        operation: 'inspect-build-constraints',
        xml,
      }, { ...constraintRuntimeOptions, timeoutMs: 45_000 }));

      if (!samePinnedRuntime(baseline.result.kernel, inspected.kernel)) {
        throw new Error('PoB baseline and current-state constraint inspection reported inconsistent pinned runtime provenance.');
      }
      integrity = { metrics: inspected.inspection.metrics, kernel: provenance(inspected.kernel) };
    } catch (error) {
      const message = conciseBuildDoctorError(error);
      if (/inconsistent pinned runtime provenance/i.test(message)) throw error;
      integrityUnavailableMessage = `Current-state hard-constraint inspection was unavailable. Baseline PoB numbers remain valid, but Build Doctor will not infer requirement or cap validity from them. ${message}`;
    }

    return readyBuildDoctorSnapshot({
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      baseline: baseline.result,
      flaskInspection: utilityInspection.flaskInspection,
      integrity,
      integrityUnavailableMessage,
    });
  } catch (error) {
    return unavailableBuildDoctorSnapshot({
      status: 'calculation-failed',
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      message: `The verified PoB runtime could not calculate this build consistently. Build Doctor has not produced a trusted diagnosis. ${conciseBuildDoctorError(error)}`,
    });
  }
}
