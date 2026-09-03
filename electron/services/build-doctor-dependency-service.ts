import { randomUUID } from 'node:crypto';
import {
  measuredConfigurationDependency,
  readyDependencyScan,
  unavailableDependencyScan,
  unsupportedConfigurationDependency,
  type BuildDoctorDependencyScan,
} from '../../src/core/build-doctor-dependencies';
import type { BuildDoctorKernelProvenance } from '../../src/core/build-doctor';
import type {
  PobCalculationKernelVersion,
  PobCalculationResult,
  PobWorkerFlaskInspectionSuccess,
  PobWorkerPerturbationSuccess,
  PobWorkerResponse,
} from '../../src/core/pob-calculation';
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { runPobKernelRequest } from './pob-kernel-service';

function flaskResponse(response: PobWorkerResponse): PobWorkerFlaskInspectionSuccess {
  if (!response.ok || !('flaskInspection' in response)) throw new Error('PoB worker did not return the requested utility configuration inspection.');
  return response as PobWorkerFlaskInspectionSuccess;
}

function perturbationResponse(response: PobWorkerResponse): PobWorkerPerturbationSuccess {
  if (!response.ok || !('comparison' in response)) throw new Error('PoB worker did not return the requested reversible configuration comparison.');
  return response as PobWorkerPerturbationSuccess;
}

function sameKernel(left: PobCalculationKernelVersion, right: PobCalculationKernelVersion): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtimeRevision === right.runtimeRevision
    && left.adapterVersion === right.adapterVersion;
}

function kernelProvenance(kernel: PobCalculationKernelVersion): BuildDoctorKernelProvenance {
  return {
    pobRepository: kernel.pobRepository,
    pobCommit: kernel.pobCommit,
    runtime: kernel.runtime,
    runtimeRevision: kernel.runtimeRevision,
    adapterVersion: kernel.adapterVersion,
  };
}

function reviewedBaselineSignature(result: PobCalculationResult): string {
  return JSON.stringify([
    result.offence.totalDps ?? null,
    result.offence.fullDps ?? null,
    result.offence.combinedDps ?? null,
    result.offence.hitDps ?? null,
    result.offence.dotDps ?? null,
    result.defence.effectiveHitPool ?? null,
    result.defence.maximumHit?.physical ?? null,
    result.defence.maximumHit?.fire ?? null,
    result.defence.maximumHit?.cold ?? null,
    result.defence.maximumHit?.lightning ?? null,
    result.defence.maximumHit?.chaos ?? null,
  ]);
}

export async function analyzeBuildDoctorConfigurationDependencies(profileId: string): Promise<BuildDoctorDependencyScan> {
  const context = await resolveBuildDoctorCalculationContext(profileId);
  if (!context.ok) {
    return unavailableDependencyScan({
      profileId: context.profileId,
      profileName: context.profileName,
      status: 'unavailable',
      message: context.message,
    });
  }

  const { profile, xml, runtimeOptions } = context;
  try {
    const inspection = flaskResponse(await runPobKernelRequest({
      protocolVersion: 1,
      requestId: `doctor-dependency-inspection-${randomUUID()}`,
      operation: 'inspect-flasks',
      xml,
      scenario: {
        scenario: 'imported',
        label: 'Imported PoB state',
        notes: ['Dependency scan discovers only active utility configuration before reversible measurement.'],
      },
    }, { ...runtimeOptions, timeoutMs: 45_000 })).flaskInspection;

    const activeUtilities = inspection.flasks.filter((entry) => entry.active && entry.utility).slice(0, 5);
    if (!activeUtilities.length) {
      return readyDependencyScan({
        profileId: profile.id,
        profileName: profile.name,
        generatedAt: new Date().toISOString(),
        kernel: kernelProvenance(inspection.kernel),
        dependencies: [],
      });
    }

    const dependencies = [];
    let baselineSignature: string | undefined;
    for (const utility of activeUtilities) {
      let comparison;
      try {
        comparison = perturbationResponse(await runPobKernelRequest({
          protocolVersion: 1,
          requestId: `doctor-dependency-${utility.slot.replace(/\s+/g, '-').toLowerCase()}-${randomUUID()}`,
          operation: 'calculate-with-perturbations',
          xml,
          scenario: {
            scenario: 'imported',
            label: `Imported PoB state without ${utility.slot}`,
            notes: ['Measured reversible configuration sensitivity only; no encounter availability is inferred.'],
          },
          perturbations: [{ kind: 'toggle-flask', slot: utility.slot }],
        }, { ...runtimeOptions, timeoutMs: 45_000 })).comparison;
      } catch (error) {
        dependencies.push(unsupportedConfigurationDependency(
          utility,
          `PoB could not measure this reversible availability change. ${conciseBuildDoctorError(error)}`,
        ));
        continue;
      }

      if (!sameKernel(inspection.kernel, comparison.before.kernel) || !sameKernel(inspection.kernel, comparison.after.kernel)) {
        throw new Error(`Configuration dependency for ${utility.slot} reported inconsistent PoB kernel provenance.`);
      }
      const signature = reviewedBaselineSignature(comparison.before);
      if (baselineSignature === undefined) baselineSignature = signature;
      else if (signature !== baselineSignature) {
        throw new Error('Configuration dependency calculations did not agree on the imported-state baseline for the reviewed outputs.');
      }

      dependencies.push(measuredConfigurationDependency(utility, comparison));
    }

    return readyDependencyScan({
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      kernel: kernelProvenance(inspection.kernel),
      dependencies,
    });
  } catch (error) {
    return unavailableDependencyScan({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      message: `Build Doctor could not complete the configuration dependency scan. No missing numerical results were inferred. ${conciseBuildDoctorError(error)}`,
    });
  }
}
