import { useEffect, useState } from 'react';
import { POB_REPLACEABLE_ITEM_SLOTS, type PobReplaceableItemSlot } from '../core/pob-calculation';
import type { PobConstraintFindingState } from '../core/pob-constraints';
import BuildDoctorMetricChanges from './BuildDoctorMetricChanges';

const FINDING_LABELS: Record<PobConstraintFindingState, string> = {
  broken: 'Broken',
  repaired: 'Repaired',
  'weakened-buffer': 'Weaker buffer',
  'improved-buffer': 'Stronger buffer',
};

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

          <section className={`build-doctor-drop-in ${analysis.dropIn.status}`} data-testid="candidate-drop-in-verdict">
            <div className="build-doctor-drop-in-head">
              <div>
                <span>DROP-IN COMPATIBILITY</span>
                <strong>{analysis.dropIn.title}</strong>
              </div>
              <div className="build-doctor-drop-in-counts">
                {analysis.dropIn.brokenCount > 0 && <i>{analysis.dropIn.brokenCount} broken</i>}
                {analysis.dropIn.weakenedBufferCount > 0 && <i>{analysis.dropIn.weakenedBufferCount} weaker buffer</i>}
              </div>
            </div>
            <p>{analysis.dropIn.message}</p>
          </section>

          <section className={`build-doctor-constraint-evidence ${analysis.constraints.status}`} data-testid="candidate-constraint-evidence">
            <div className="build-doctor-constraint-head">
              <div>
                <span>HARD CONSTRAINT CHECK</span>
                <strong>{analysis.constraints.status === 'verified' ? 'Pinned PoB transition evidence' : 'Constraint verification unavailable'}</strong>
              </div>
              {analysis.constraints.status === 'verified' && (
                <i>{analysis.constraints.findings.filter((finding) => finding.state === 'broken').length} broken</i>
              )}
            </div>
            <p>{analysis.constraints.message}</p>
            {analysis.constraints.status === 'verified' && analysis.constraints.findings.length > 0 && (
              <div className="build-doctor-constraint-list">
                {analysis.constraints.findings.map((finding) => (
                  <article key={finding.key} className={finding.state}>
                    <div className="build-doctor-constraint-title">
                      <strong>{finding.label}</strong>
                      <span>{FINDING_LABELS[finding.state]}</span>
                    </div>
                    <div className="build-doctor-constraint-transition">
                      <code>{finding.before}</code><i>→</i><code>{finding.after}</code>
                    </div>
                    <p>{finding.detail}</p>
                  </article>
                ))}
              </div>
            )}
            {analysis.constraints.status === 'verified' && (
              <small>Constraint adapter {analysis.constraints.kernel.adapterVersion} · PoB {analysis.constraints.kernel.pobCommit.slice(0, 12)}</small>
            )}
          </section>

          <BuildDoctorMetricChanges
            metrics={analysis.changedMetrics}
            emptyMessage="The candidate did not change any reviewed PoB output exposed to Build Doctor."
          />

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
