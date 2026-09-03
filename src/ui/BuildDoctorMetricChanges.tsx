import {
  BUILD_DOCTOR_REVIEWED_METRIC_GROUPS,
  type BuildDoctorReviewedMetric,
  type BuildDoctorReviewedMetricGroup,
} from '../core/build-doctor-reviewed-metrics';

const GROUP_LABELS: Record<BuildDoctorReviewedMetricGroup, string> = {
  offence: 'Offence',
  survivability: 'Survivability',
  resources: 'Resources',
  mitigation: 'Mitigation',
  resistance: 'Resistance / overcap',
  recovery: 'Recovery',
};

function compactNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fixed(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatted(metric: BuildDoctorReviewedMetric, value: number | undefined): string {
  if (metric.format === 'percent') return value === undefined ? '—' : `${fixed(value)}%`;
  if (metric.format === 'rate') return fixed(value);
  return compactNumber(value);
}

function changeLabel(metric: BuildDoctorReviewedMetric): string {
  if (metric.absoluteChange === undefined || !Number.isFinite(metric.absoluteChange)) return 'not comparable';
  const sign = metric.absoluteChange > 0 ? '+' : '';
  if (metric.format === 'percent') return `${sign}${fixed(metric.absoluteChange)} pts`;
  if (metric.relativeChangePercent !== undefined && Number.isFinite(metric.relativeChangePercent)) {
    const relativeSign = metric.relativeChangePercent > 0 ? '+' : '';
    return `${relativeSign}${fixed(metric.relativeChangePercent)}%`;
  }
  return `${sign}${formatted(metric, metric.absoluteChange)}`;
}

function changedGroups(metrics: readonly BuildDoctorReviewedMetric[]): Array<{ group: BuildDoctorReviewedMetricGroup; metrics: BuildDoctorReviewedMetric[] }> {
  return BUILD_DOCTOR_REVIEWED_METRIC_GROUPS.flatMap((group) => {
    const entries = metrics.filter((metric) => metric.changed && metric.group === group);
    return entries.length ? [{ group, metrics: entries }] : [];
  });
}

export default function BuildDoctorMetricChanges({
  metrics,
  emptyMessage = 'No reviewed PoB output changed.',
}: {
  metrics: readonly BuildDoctorReviewedMetric[];
  emptyMessage?: string;
}) {
  const groups = changedGroups(metrics);
  if (!groups.length) return <p className="build-empty">{emptyMessage}</p>;

  return groups.map(({ group, metrics: entries }) => (
    <section key={group} className="build-doctor-metric-change-group">
      <div className="section-title"><h4>{GROUP_LABELS[group]}</h4><span>{entries.length} changed</span></div>
      <div className="build-doctor-metric-change-grid">
        {entries.map((metric) => (
          <article key={metric.key} className={metric.absoluteChange !== undefined && metric.absoluteChange < 0 ? 'down' : metric.absoluteChange !== undefined && metric.absoluteChange > 0 ? 'up' : ''}>
            <span>{metric.label}</span>
            <strong>{formatted(metric, metric.before)} <i>→</i> {formatted(metric, metric.after)}</strong>
            <small>{changeLabel(metric)}</small>
          </article>
        ))}
      </div>
    </section>
  ));
}
