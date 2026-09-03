import { useEffect, useMemo, useState } from 'react';
import BuildDoctorMetricChanges from './BuildDoctorMetricChanges';

function kindLabel(kind: 'normal' | 'notable' | 'keystone'): string {
  if (kind === 'keystone') return 'Keystone';
  if (kind === 'notable') return 'Notable';
  return 'Normal';
}

export default function BuildDoctorPassiveContributionPanel({ profileId, enabled }: { profileId: string; enabled: boolean }) {
  const [candidateList, setCandidateList] = useState<Awaited<ReturnType<typeof window.exileQuesting.listBuildDoctorPassiveCandidates>> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof window.exileQuesting.analyzeBuildDoctorPassiveContribution>> | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCandidateList(null);
    setSelectedNodeId(null);
    setAnalysis(null);
    setError('');
    setBusy(false);
    if (!enabled) return;

    let cancelled = false;
    setLoadingCandidates(true);
    void window.exileQuesting.listBuildDoctorPassiveCandidates(profileId)
      .then((result) => {
        if (cancelled) return;
        setCandidateList(result);
        setSelectedNodeId(result.status === 'ready' && result.candidates.length ? result.candidates[0].nodeId : null);
      })
      .catch((value) => {
        if (!cancelled) setError(value instanceof Error ? value.message : String(value));
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidates(false);
      });
    return () => { cancelled = true; };
  }, [profileId, enabled]);

  const selected = useMemo(() => candidateList?.status === 'ready'
    ? candidateList.candidates.find((candidate) => candidate.nodeId === selectedNodeId)
    : undefined, [candidateList, selectedNodeId]);

  if (!enabled) return null;

  const run = async () => {
    if (busy || !selected) return;
    setBusy(true);
    setError('');
    setAnalysis(null);
    try {
      setAnalysis(await window.exileQuesting.analyzeBuildDoctorPassiveContribution(profileId, selected.nodeId));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="build-doctor-passive-contribution" data-testid="build-doctor-passive-contribution">
      <div className="build-doctor-passive-head">
        <div>
          <span>PASSIVE CONTRIBUTION DOCTOR · REVERSIBLE POB</span>
          <h3>Measure what one allocated point actually contributes</h3>
          <p>Choose an allocated normal, notable, or keystone from the active imported tree. PoB recalculates the build with that one point isolated as unavailable; ExileQuesting reports the measured output delta without pretending the result is a legal respec or an efficiency ranking.</p>
        </div>
        <div className="build-doctor-passive-count">
          <strong>{candidateList?.status === 'ready' ? candidateList.candidates.length : '—'}</strong>
          <span>eligible allocated points</span>
        </div>
      </div>

      {loadingCandidates && <p className="build-doctor-passive-loading">Loading verified 3.29 passive metadata…</p>}
      {error && <div className="inline-alert"><strong>Passive Contribution Doctor</strong>{error}</div>}
      {candidateList?.status === 'unavailable' && <div className="inline-alert"><strong>Passive contribution unavailable</strong>{candidateList.message}</div>}

      {candidateList?.status === 'ready' && (
        <>
          <div className="build-doctor-passive-controls">
            <label htmlFor="build-doctor-passive-node">
              <span>Allocated point</span>
              <select
                id="build-doctor-passive-node"
                value={selectedNodeId ?? ''}
                disabled={!candidateList.candidates.length || busy}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setSelectedNodeId(Number.isSafeInteger(next) ? next : null);
                  setAnalysis(null);
                }}
              >
                {candidateList.candidates.map((candidate) => (
                  <option key={candidate.nodeId} value={candidate.nodeId}>{kindLabel(candidate.kind)} · {candidate.name} · #{candidate.nodeId}</option>
                ))}
              </select>
            </label>
            <div>
              <small>{candidateList.message}</small>
              <button className="primary-button" disabled={busy || !selected} onClick={() => void run()}>
                {busy ? 'Measuring contribution…' : 'Measure selected point in PoB'}
              </button>
            </div>
          </div>

          {analysis && analysis.status !== 'ready' && <div className="inline-alert"><strong>Passive point not calculated</strong>{analysis.message}</div>}

          {analysis?.status === 'ready' && (
            <div className="build-doctor-passive-result">
              <div className="build-doctor-passive-result-head">
                <div>
                  <span>{kindLabel(analysis.node.kind)} · node #{analysis.node.nodeId}</span>
                  <strong>{analysis.node.name}</strong>
                </div>
                <i>{analysis.changedMetrics.length} reviewed metric{analysis.changedMetrics.length === 1 ? '' : 's'} changed</i>
              </div>

              <BuildDoctorMetricChanges
                metrics={analysis.changedMetrics}
                emptyMessage="Removing this point in isolation did not change any reviewed PoB output exposed to Build Doctor."
              />

              {(analysis.afterWarnings.length > 0 || analysis.beforeWarnings.length > 0) && (
                <details className="build-doctor-passive-warnings">
                  <summary>PoB calculation warnings</summary>
                  {[...new Set([...analysis.beforeWarnings, ...analysis.afterWarnings])].map((warning) => <p key={warning}>{warning}</p>)}
                </details>
              )}
              <small className="build-doctor-boundary">{analysis.boundary}</small>
            </div>
          )}
        </>
      )}
    </div>
  );
}
