import type {
  PobCalculationResult,
  PobFlaskInspectionResult,
  PobCalculationWarning,
} from './pob-calculation';

export const BUILD_DOCTOR_SCHEMA_VERSION = 1;

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
  findings: BuildDoctorFinding[];
}

export interface BuildDoctorReadyInput {
  profileId: string;
  profileName: string;
  generatedAt: string;
  baseline: PobCalculationResult;
  flaskInspection?: PobFlaskInspectionResult;
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

  return {
    schemaVersion: BUILD_DOCTOR_SCHEMA_VERSION,
    status: 'ready',
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    message: 'Build Doctor calculated a verified imported-state baseline. Recommendations remain conservative until mechanic and content evidence are available.',
    kernel: {
      pobRepository: input.baseline.kernel.pobRepository,
      pobCommit: input.baseline.kernel.pobCommit,
      runtime: input.baseline.kernel.runtime,
      runtimeRevision: input.baseline.kernel.runtimeRevision,
      adapterVersion: input.baseline.kernel.adapterVersion,
    },
    baseline: input.baseline,
    flaskInspection: input.flaskInspection,
    findings,
  };
}
