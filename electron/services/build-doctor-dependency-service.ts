import { randomUUID } from 'node:crypto';
import {
  measuredConfigurationDependency,
  pobUptimeEvidence,
  readyDependencyScan,
  unavailableDependencyScan,
  unsupportedConfigurationDependency,
  type BuildDoctorConfigurationDependency,
  type BuildDoctorDependencyScan,
  type BuildDoctorPobUptimeEvidence,
} from '../../src/core/build-doctor-dependencies';
import type { BuildDoctorKernelProvenance } from '../../src/core/build-doctor';
import type {
  PobCalculationKernelVersion,
  PobCalculationResult,
  PobFlaskProfile,
  PobFlaskUptimeEntry,
  PobPerturbationComparison,
  PobWorkerFlaskInspectionSuccess,
  PobWorkerFlaskUptimeInspectionSuccess,
  PobWorkerPerturbationSuccess,
  PobWorkerResponse,
} from '../../src/core/pob-calculation';
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { runPobKernelRequest } from './pob-kernel-service';

function flaskResponse(response: PobWorkerResponse): PobWorkerFlaskInspectionSuccess {
  if (!response.ok || !('flaskInspection' in response)) throw new Error('PoB worker did not return the requested utility configuration inspection.');
  return response as PobWorkerFlaskInspectionSuccess;
}

function flaskUptimeResponse(response: PobWorkerResponse): PobWorkerFlaskUptimeInspectionSuccess {
  if (!response.ok || !('flaskUptimeInspection' in response)) throw new Error('PoB worker did not return the requested utility uptime inspection.');
  return response as PobWorkerFlaskUptimeInspectionSuccess;
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

function uptimeEvidenceForUtility(
  utility: PobFlaskProfile,
  uptimeBySlot: ReadonlyMap<string, PobFlaskUptimeEntry>,
  inspectionFailure?: string,
): BuildDoctorPobUptimeEvidence {
  if (inspectionFailure) {
    return pobUptimeEvidence(undefined, `PoB uptime inspection was unavailable. ${inspectionFailure}`);
  }
  const entry = uptimeBySlot.get(utility.slot);
  if (!entry) {
    return pobUptimeEvidence(undefined, `PoB uptime inspection did not return ${utility.slot}.`);
  }
  if (entry.slot !== utility.slot
    || entry.name !== utility.name
    || entry.baseName !== utility.baseName
    || entry.active !== utility.active) {
    return pobUptimeEvidence(undefined, `PoB uptime evidence for ${utility.slot} did not match the independently inspected equipped utility identity/state.`);
  }
  return pobUptimeEvidence(entry);
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

    const uptimeBySlot = new Map<string, PobFlaskUptimeEntry>();
    let uptimeInspectionFailure: string | undefined;
    let uptimeInspectionKernel: PobCalculationKernelVersion | undefined;
    try {
      const uptimeInspection = flaskUptimeResponse(await runPobKernelRequest({
        protocolVersion: 1,
        requestId: `doctor-dependency-uptime-${randomUUID()}`,
        operation: 'inspect-flask-uptime',
        xml,
        scenario: {
          scenario: 'imported',
          label: 'Imported PoB utility uptime evidence',
          notes: ['PoB-owned Items tab estimate only; ExileQuesting does not convert this into practical DPS/EHP.'],
        },
      }, { ...runtimeOptions, timeoutMs: 45_000 })).flaskUptimeInspection;
      uptimeInspectionKernel = uptimeInspection.kernel;
      for (const entry of uptimeInspection.flasks) {
        if (uptimeBySlot.has(entry.slot)) throw new Error(`PoB uptime inspection returned duplicate ${entry.slot} entries.`);
        uptimeBySlot.set(entry.slot, entry);
      }
    } catch (error) {
      uptimeInspectionFailure = conciseBuildDoctorError(error);
    }

    if (uptimeInspectionKernel && !sameKernel(inspection.kernel, uptimeInspectionKernel)) {
      throw new Error('PoB utility configuration and uptime inspections reported inconsistent kernel provenance.');
    }

    const dependencies: BuildDoctorConfigurationDependency[] = [];
    let baselineSignature: string | undefined;
    for (const utility of activeUtilities) {
      const uptime = uptimeEvidenceForUtility(utility, uptimeBySlot, uptimeInspectionFailure);
      let comparison: PobPerturbationComparison;
      try {
        comparison = perturbationResponse(await runPobKernelRequest({
          protocolVersion: 1,
          requestId: `doctor-dependency-${utility.slot.replace(/\s+/g, '-').toLowerCase()}-${randomUUID()}`,
          operation: 'calculate-with-perturbations',
          xml,
          scenario: {
            scenario: 'imported',
            label: `Imported PoB state without ${utility.slot}`,
            notes: ['Measured reversible configuration sensitivity only; PoB uptime evidence is kept separate from output deltas.'],
          },
          perturbations: [{ kind: 'toggle-flask', slot: utility.slot }],
        }, { ...runtimeOptions, timeoutMs: 45_000 })).comparison;
      } catch (error) {
        dependencies.push(unsupportedConfigurationDependency(
          utility,
          `PoB could not measure this reversible availability change. ${conciseBuildDoctorError(error)}`,
          uptime,
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

      dependencies.push(measuredConfigurationDependency(utility, comparison, uptime));
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
