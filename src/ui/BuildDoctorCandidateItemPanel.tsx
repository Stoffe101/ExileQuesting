import { useEffect, useMemo, useState } from 'react';
import type { BuildDoctorCandidateItemReady } from '../core/build-doctor-candidate-item';
import {
  BUILD_DOCTOR_REVIEWED_METRIC_GROUPS,
  type BuildDoctorReviewedMetric,
  type BuildDoctorReviewedMetricGroup,
} from '../core/build-doctor-reviewed-metrics';
import { POB_REPLACEABLE_ITEM_SLOTS, type PobReplaceableItemSlot } from '../core/pob-calculation';

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

function changedGroups(analysis: BuildDoctorCandidateItemReady): Array<{ group: BuildDoctorReviewedMetricGroup; metrics: BuildDoctorReviewedMetric[] }> {
  return BUILD_DOCTOR_REVIEWED_METRIC_GROUPS.flatMap((group) => {
    const metrics = analysis.changedMetrics.filter((metric) => metric.group === group);
    return metrics.length ? [{ group, metrics }] : [];
  });
}

export default function BuildDoctorCandidateItemPanel({ profileId, enabled }: { profileId: string; enabled: boolean }) {
  const [slot, setSlot] = useState<PobReplaceableItemSlot>('Boots');
  const [itemText, setItemText] = useState('');
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof window.exileQuesting.analyzeBuildDoctorCandidateItem>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAnalysis(null);
    setError('');
    setBusy(false);
  }, [profileId, enabled]);

  const groups = useMemo(() => analysis?.status === 'ready' ? changedGroups(analysis) : [], [analysis]);

  if (!enabled) return null;

  const run = async () => {
    if (busy || !itemText.trim()) return;
    setBusy(true);
    setError('');
    try {
      setAnalysis(await window.exileQuesting.analyzeBuildDoctorCandidateItem(profileId, slot, itemText));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="build-doctor-candidate" data-testid="build-doctor-candidate-item">
      <div className="build-doctor-candidate-head">
        <div>
          <span>CANDIDATE UPGRADE DOCTOR · DETERMINISTIC POB</span>
          <h3>Check an actual item before you buy or craft around it</h3>
          <p>Copy an item in Path of Exile, paste its text here, choose the slot, and calculate the exact reviewed PoB outputs before and after the replacement. ExileQuesting never sends input to the game.</p>
        </div>
        <div className="build-doctor-candidate-slot">
          <label htmlFor="build-doctor-candidate-slot">Replace slot</label>
          <select id="build-doctor-candidate-slot" value={slot} onChange={(event) => { setSlot(event.target.value as PobReplaceableItemSlot); setAnalysis(null); }}>
            {POB_REPLACEABLE_ITEM_SLOTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </div>
      </div>

      <textarea
        className="build-doctor-candidate-text custom-scrollbar"
        value={itemText}
        onChange={(event) => { setItemText(event.target.value); setAnalysis(null); }}
        placeholder={'Paste copied PoE item text here…\nExample: Rarity: Rare / item name / base type / modifiers'}
        spellCheck={false}
      />
      <div className="build-doctor-candidate-actions">
        <small>Single-slot simulation · {slot}</small>
        <button className="primary-button" disabled={busy || !itemText.trim()} onClick={() => void run()}>{busy ? 'Calculating replacement…' : 'Check candidate in PoB'}</button>
      </div>

      {error && <div className="inline-alert"><strong>Candidate Upgrade Doctor</strong>{error}</div>}
      {analysis && analysis.status !== 'ready' && <div className="inline-alert"><strong>Candidate item not calculated</strong>{analysis.message}</div>}

      {analysis?.status === 'ready' && (
        <div className="build-doctor-candidate-result">
          <div className="build-doctor-candidate-result-head">
            <div><span>{analysis.slot}</span><strong>{analysis.candidateLabel}</strong></div>
            <i>{analysis.changedMetrics.length} reviewed metric{analysis.changedMetrics.length === 1 ? '' : 's'} changed</i>
          </div>

          {groups.length ? groups.map(({ group, metrics }) => (
            <section key={group} className="build-doctor-candidate-group">
              <div className="section-title"><h4>{GROUP_LABELS[group]}</h4><span>{metrics.length} changed</span></div>
              <div className="build-doctor-candidate-metrics">
                {metrics.map((metric) => (
                  <article key={metric.key} className={metric.absoluteChange !== undefined && metric.absoluteChange < 0 ? 'down' : metric.absoluteChange !== undefined && metric.absoluteChange > 0 ? 'up' : ''}>
                    <span>{metric.label}</span>
                    <strong>{formatted(metric, metric.before)} <i>→</i> {formatted(metric, metric.after)}</strong>
                    <small>{changeLabel(metric)}</small>
                  </article>
                ))}
              </div>
            </section>
          )) : <p className="build-empty">The candidate did not change any reviewed PoB output exposed to Build Doctor.</p>}

          {(analysis.afterWarnings.length > 0 || analysis.beforeWarnings.length > 0) && (
            <details className="build-doctor-candidate-warnings">
              <summary>PoB calculation warnings</summary>
              {[...new Set([...analysis.beforeWarnings, ...analysis.afterWarnings])].map((warning) => <p key={warning}>{warning}</p>)}
            </details>
          )}
          <small className="build-doctor-boundary">{analysis.boundary}</small>
        </div>
      )}
    </div>
  );
}
