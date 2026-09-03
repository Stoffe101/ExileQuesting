import type {
  PobCalculationResult,
  PobConstraintMetrics,
  PobFlaskInspectionResult,
  PobCalculationWarning,
} from './pob-calculation';
import {
  baselineConstraintFindings,
  type PobBaselineConstraintFinding,
} from './pob-constraints';

export const BUILD_DOCTOR_SCHEMA_VERSION = 2;

export type BuildDoctorStatus =
  | 'ready'
  | 'reimport-required'
  | 'calculation-input-invalid'
  | 'runtime-unavailable'
  | 'calculation-failed';

export type BuildDoctorFindingKind = 'calculation-warning' | 'configuration-evidence' | 'provenance';
export type BuildDoctorFindingSeverity = 'info' | 'warning';

export interface BuildDoctorFinding {
  code: string;
  kind: BuildDoctorFindingKind;
  severity: BuildDoctorFindingSeverity;
  title: string;
  detail: string;
  source: 'pob' | 'exilequesting';
}

export interface BuildDoctorKernelProvenance {
  pobRepository: string;
  pobCommit: string;
  runtime: string;
  runtimeRevision: string;
  adapterVersion: string;
}

export type BuildDoctorIntegrityStatus = 'attention-required' | 'supported-checks-clear' | 'unavailable';

export interface BuildDoctorIntegrityVerified {
  status: 'attention-required' | 'supported-checks-clear';
  kernel: BuildDoctorKernelProvenance;
  findings: PobBaselineConstraintFinding[];
  warningCount: number;
  infoCount: number;
  message: string;
}

export interface BuildDoctorIntegrityUnavailable {
  status: 'unavailable';
  findings: [];
  warningCount: 0;
  infoCount: 0;
  message: string;
}

export type BuildDoctorIntegrityEvidence = BuildDoctorIntegrityVerified | BuildDoctorIntegrityUnavailable;

export interface BuildDoctorSnapshot {
  schemaVersion: number;
  status: BuildDoctorStatus;
  profileId: string;
  profileName: string;
  generatedAt: string;
  message: string;
  kernel?: BuildDoctorKernelProvenance;
  baseline?: PobCalculationResult;
  flaskInspection?: PobFlaskInspectionResult;
  integrity?: BuildDoctorIntegrityEvidence;
  findings: BuildDoctorFinding[];
}

export interface BuildDoctorReadyInput {
  profileId: string;
  profileName: string;
  generatedAt: string;
  baseline: PobCalculationResult;
  flaskInspection?: PobFlaskInspectionResult;
  integrity?: {
    metrics: PobConstraintMetrics;
    kernel: BuildDoctorKernelProvenance;
  };
  integrityUnavailableMessage?: string;
}

function warningFinding(warning: PobCalculationWarning): BuildDoctorFinding {
  return {
    code: warning.code,
    kind: 'calculation-warning',
    severity: 'warning',
    title: warning.code === 'guard-skill-active' ? 'Guard skill is included in this PoB state' : 'Path of Building calculation warning',
    detail: warning.message,
    source: 'pob',
  };
}

function normalizeMessage(value: string, fallback: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 700) || fallback;
}

export function buildDoctorIntegrityEvidence(input: {
  metrics?: PobConstraintMetrics;
  kernel?: BuildDoctorKernelProvenance;
  unavailableMessage?: string;
}): BuildDoctorIntegrityEvidence {
  if (!input.metrics || !input.kernel) {
    return {
      status: 'unavailable',
      findings: [],
      warningCount: 0,
      infoCount: 0,
      message: normalizeMessage(
        input.unavailableMessage ?? 'Current-state hard-constraint inspection was unavailable.',
        'Current-state hard-constraint inspection was unavailable.',
      ),
    };
  }

  const findings = baselineConstraintFindings(input.metrics);
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = findings.filter((finding) => finding.severity === 'info').length;
  const status: BuildDoctorIntegrityVerified['status'] = warningCount > 0 ? 'attention-required' : 'supported-checks-clear';
  return {
    status,
    kernel: input.kernel,
    findings,
    warningCount,
    infoCount,
    message: warningCount > 0
      ? `${warningCount} proven current-state requirement or elemental-resistance gap${warningCount === 1 ? '' : 's'} need attention under the supported checks.`
      : infoCount > 0
        ? `No proven requirement or elemental-resistance failure was found; ${infoCount} contextual defensive posture note${infoCount === 1 ? '' : 's'} remain.`
        : 'No proven requirement or elemental-resistance failure was found in the currently supported baseline checks.',
  };
}

export function unavailableBuildDoctorSnapshot(input: {
  status: Exclude<BuildDoctorStatus, 'ready'>;
  profileId: string;
  profileName: string;
  message: string;
  generatedAt?: string;
}): BuildDoctorSnapshot {
  return {
    schemaVersion: BUILD_DOCTOR_SCHEMA_VERSION,
    status: input.status,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    message: input.message,
    findings: [],
  };
}

export function readyBuildDoctorSnapshot(input: BuildDoctorReadyInput): BuildDoctorSnapshot {
  const findings = input.baseline.warnings.map(warningFinding);
  const equippedFlasks = input.flaskInspection?.flasks.length ?? 0;
  const activeFlasks = input.flaskInspection?.flasks.filter((entry) => entry.active).length ?? 0;

  if (input.flaskInspection && equippedFlasks > 0) {
    findings.push({
      code: 'imported-flask-configuration',
      kind: 'configuration-evidence',
      severity: 'info',
      title: 'Imported utility configuration is visible',
      detail: `${equippedFlasks} equipped flask${equippedFlasks === 1 ? '' : 's'} were read from PoB; ${activeFlasks} ${activeFlasks === 1 ? 'is' : 'are'} enabled in the imported calculation state. This is configuration evidence, not a claim that the same availability can be sustained in every encounter.`,
      source: 'pob',
    });
  }

  findings.push({
    code: 'verified-pob-kernel',
    kind: 'provenance',
    severity: 'info',
    title: 'Numbers come from the pinned Path of Building kernel',
    detail: `PoB ${input.baseline.kernel.pobCommit.slice(0, 12)} · adapter ${input.baseline.kernel.adapterVersion} · runtime ${input.baseline.kernel.runtimeRevision.slice(0, 12)}.`,
    source: 'exilequesting',
  });

  const integrity = buildDoctorIntegrityEvidence({
    metrics: input.integrity?.metrics,
    kernel: input.integrity?.kernel,
    unavailableMessage: input.integrityUnavailableMessage,
  });

  return {
    schemaVersion: BUILD_DOCTOR_SCHEMA_VERSION,
    status: 'ready',
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    message: integrity.status === 'attention-required'
      ? 'Build Doctor calculated the imported state and found proven baseline integrity gaps that should be resolved before treating upgrade deltas as safe.'
      : 'Build Doctor calculated a verified imported-state baseline. Recommendations remain conservative until mechanic and content evidence are available.',
    kernel: {
      pobRepository: input.baseline.kernel.pobRepository,
      pobCommit: input.baseline.kernel.pobCommit,
      runtime: input.baseline.kernel.runtime,
      runtimeRevision: input.baseline.kernel.runtimeRevision,
      adapterVersion: input.baseline.kernel.adapterVersion,
    },
    baseline: input.baseline,
    flaskInspection: input.flaskInspection,
    integrity,
    findings,
  };
}
