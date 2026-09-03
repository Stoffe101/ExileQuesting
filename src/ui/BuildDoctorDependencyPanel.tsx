import { useEffect, useState } from 'react';
import type { BuildDoctorConfigurationDependency, BuildDoctorPobUptimeEvidence } from '../core/build-doctor-dependencies';
import type { PobMetricDelta } from '../core/pob-calculation';

function compactNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function signed(value: number, suffix = ''): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}

function percent(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function metricLabel(label: string, delta: PobMetricDelta): string | undefined {
  if (delta.absolute === undefined || !Number.isFinite(delta.absolute) || Math.abs(delta.absolute) < 1e-9) return undefined;
  if (delta.percent !== undefined && Number.isFinite(delta.percent)) return `${label} ${signed(delta.percent, '%')}`;
  return `${label} ${delta.absolute > 0 ? '+' : ''}${compactNumber(delta.absolute)}`;
}

function measuredLabels(dependency: Extract<BuildDoctorConfigurationDependency, { status: 'measured' }>): string[] {
  return [
    metricLabel('DPS', dependency.delta.totalDps),
    metricLabel('EHP', dependency.delta.effectiveHitPool),
    metricLabel('Phys hit', dependency.delta.maximumHit.physical),
    metricLabel('Fire hit', dependency.delta.maximumHit.fire),
    metricLabel('Cold hit', dependency.delta.maximumHit.cold),
    metricLabel('Lightning hit', dependency.delta.maximumHit.lightning),
    metricLabel('Chaos hit', dependency.delta.maximumHit.chaos),
  ].filter((value): value is string => Boolean(value));
}

function PobUptimeEvidence({ evidence }: { evidence: BuildDoctorPobUptimeEvidence }) {
  if (evidence.status === 'estimated') {
    return (
      <div className="build-doctor-uptime estimated" title={evidence.sourceLine}>
        <span>PoB uptime estimate</span>
        <strong>{percent(evidence.averagePercent)} avg · {percent(evidence.minimumPercent)} min</strong>
        <small>Items tab model · not observed encounter uptime</small>
      </div>
    );
  }
  return (
    <div className="build-doctor-uptime unsupported" title={evidence.message}>
      <span>PoB uptime estimate</span>
      <strong>unsupported</strong>
      <small>No numerical uptime is inferred.</small>
    </div>
  );
}

export default function BuildDoctorDependencyPanel({
  profileId,
  enabled,
  activeUtilityCount,
}: {
  profileId: string;
  enabled: boolean;
  activeUtilityCount: number;
}) {
  const [scan, setScan] = useState<Awaited<ReturnType<typeof window.exileQuesting.analyzeBuildDoctorDependencies>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setScan(null);
    setError('');
    setBusy(false);
  }, [profileId, enabled]);

  if (!enabled) return null;

  const run = async () => {
    if (busy || activeUtilityCount < 1) return;
    setBusy(true);
    setError('');
    try {
      setScan(await window.exileQuesting.analyzeBuildDoctorDependencies(profileId));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="build-doctor-dependencies" data-testid="build-doctor-dependencies">
      <div className="build-doctor-dependency-head">
        <div>
          <span>REVERSIBLE POB SENSITIVITY</span>
          <h3>Configuration dependencies</h3>
          <p>Measure what changes when each currently enabled utility is made unavailable in PoB. The deeper scan also shows PoB's own supported uptime estimate separately; ExileQuesting does not turn it into practical DPS/EHP.</p>
        </div>
        <button className="ghost-button" disabled={busy || activeUtilityCount < 1} onClick={() => void run()}>
          {busy ? 'Measuring in PoB…' : scan ? 'Measure again' : activeUtilityCount ? `Measure ${activeUtilityCount} active ${activeUtilityCount === 1 ? 'utility' : 'utilities'}` : 'Nothing active to measure'}
        </button>
      </div>

      {error && <div className="inline-alert"><strong>Configuration dependency scan</strong>{error}</div>}
      {scan && scan.status !== 'ready' && <div className="inline-alert"><strong>Dependency scan unavailable</strong>{scan.message}</div>}

      {scan?.status === 'ready' && (
        <>
          <p className="build-doctor-dependency-message">{scan.message}</p>
          <div className="build-doctor-dependency-list">
            {scan.dependencies.length ? scan.dependencies.map((dependency) => {
              if (dependency.status === 'unsupported') {
                return (
                  <article className="unsupported" key={dependency.slot}>
                    <div className="build-doctor-dependency-title"><span>{dependency.slot}</span><strong>{dependency.name}</strong><i>not measured</i></div>
                    <PobUptimeEvidence evidence={dependency.pobUptime} />
                    <p>{dependency.message}</p>
                  </article>
                );
              }
              const labels = measuredLabels(dependency);
              return (
                <article key={dependency.slot}>
                  <div className="build-doctor-dependency-title">
                    <span>{dependency.slot}</span>
                    <strong>{dependency.name}</strong>
                    <i>enabled → unavailable</i>
                  </div>
                  <PobUptimeEvidence evidence={dependency.pobUptime} />
                  <div className="build-doctor-dependency-chips">
                    {labels.length ? labels.map((label) => <span key={label}>{label}</span>) : <span className="neutral">No reviewed output changed</span>}
                  </div>
                </article>
              );
            }) : <p className="build-empty">No active utility configuration dependencies required measurement.</p>}
          </div>
          <small className="build-doctor-boundary">Negative values mean the reviewed PoB output fell when that utility was toggled off. Positive values mean it rose. PoB average/minimum uptime is a separate upstream estimate, not observed boss or mapping uptime, and is never multiplied into these output deltas.</small>
        </>
      )}
    </div>
  );
}
