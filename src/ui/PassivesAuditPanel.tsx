import { useMemo, useState } from 'react';
import type { PassivesReconciliation } from '../core/passives-audit';
import type { RuntimeState } from '../core/types';
import { copyText } from './clipboard';
import './passives-audit.css';

function auditThroughAct(state: RuntimeState): number {
  if (state.rewardAudit.needsFinalPassivesAudit || state.progress >= Math.max(0, state.dataset.steps.length - 3)) return 10;
  const currentAct = state.dataset.steps[state.progress]?.act ?? 1;
  return Math.max(0, Math.min(10, currentAct - 1));
}

function reportTime(value?: string): string {
  if (!value) return 'time unavailable';
  const parsed = Date.parse(value.replace(/\//g, '-'));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export default function PassivesAuditPanel({ state, compact = false }: { state: RuntimeState; compact?: boolean }) {
  const [result, setResult] = useState<PassivesReconciliation | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const throughAct = auditThroughAct(state);
  const missing = useMemo(() => result?.missing ?? [], [result]);
  const visibleMissing = compact ? missing.slice(0, 2) : missing;
  const canScan = Boolean(state.settings.logPath && state.logDiagnostics.fileExists);

  const copyCommand = async () => {
    setError('');
    try {
      await copyText('/passives', 'Clipboard access was blocked. Type /passives manually in Path of Exile.');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const scan = async () => {
    setScanning(true);
    setError('');
    try {
      setResult(await window.exileQuesting.scanPassivesAudit(throughAct));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setScanning(false);
    }
  };

  const tone = result?.status === 'complete'
    ? 'complete'
    : result?.status === 'missing' || result?.status === 'profile-mismatch'
      ? 'warning'
      : result?.status === 'incomplete'
        ? 'caution'
        : 'idle';

  return (
    <section className={`passives-audit ${tone} ${compact ? 'compact' : ''}`}>
      <div className="passives-audit-head">
        <div>
          <span>/PASSIVES RECONCILIATION</span>
          <strong>{result?.message ?? (throughAct > 0 ? `Verify permanent passive rewards through Act ${throughAct}` : 'Passive audit becomes actionable after Act 1')}</strong>
          <small>Run the command yourself in PoE. ExileQuesting only reads the resulting lines from your configured Client.txt.</small>
        </div>
        <div className="passives-audit-actions">
          <button className="ghost-button" onClick={() => void copyCommand()}>{copied ? 'Copied ✓' : 'Copy /passives'}</button>
          <button className="primary-button" disabled={!canScan || scanning} onClick={() => void scan()}>{scanning ? 'Scanning…' : 'Read latest result'}</button>
        </div>
      </div>

      {!canScan && <div className="passives-audit-note"><strong>Client.txt is not available.</strong><span>Choose the Path of Exile log in Settings before scanning. The audit never asks the renderer for an arbitrary file path.</span></div>}

      {result?.report.found && (
        <div className="passives-audit-summary">
          <div><span>Expected</span><strong>{result.expectedQuestPoints}</strong><small>{result.auditedThroughAct >= 10 ? 'full campaign' : `through Act ${result.auditedThroughAct}`}</small></div>
          <div><span>Accounted</span><strong>{result.earnedPoints}</strong><small>{result.missingPoints ? `${result.missingPoints} missing` : 'audited scope complete'}</small></div>
          <div><span>/passives total</span><strong>{result.report.reportedQuestPoints ?? '—'}</strong><small>{reportTime(result.report.timestamp)}</small></div>
          {!compact && <div><span>Passive allocation</span><strong>{result.report.allocatedPassivePoints ?? '—'} / {result.report.totalPassivePoints ?? '—'}</strong><small>{result.report.totalAscendancyPoints !== undefined ? `${result.report.allocatedAscendancyPoints ?? 0}/${result.report.totalAscendancyPoints} ascendancy` : 'ascendancy unavailable'}</small></div>}
        </div>
      )}

      {visibleMissing.length > 0 && (
        <div className="passives-missing-list">
          {visibleMissing.map((item) => (
            <article className="passives-missing-item" key={item.id}>
              <div className="passives-missing-badge">+{item.expectedPoints - item.reportedPoints}</div>
              <div><span>ACT {item.act}</span><strong>{item.name}</strong><p>{item.recovery}</p></div>
            </article>
          ))}
          {compact && missing.length > visibleMissing.length && <small className="more-copy">+{missing.length - visibleMissing.length} more missing quest{missing.length - visibleMissing.length === 1 ? '' : 's'} in the full audit.</small>}
        </div>
      )}

      {result?.status === 'complete' && <div className="passives-audit-success"><b>✓</b><span>No passive quest reward is missing in the audited campaign scope.</span></div>}
      {result?.status === 'profile-mismatch' && <div className="passives-audit-note important"><strong>Bandit setting mismatch</strong><span>The log proves the kill-all passive reward, while Settings says you helped {state.settings.bandit}. Fix the route profile before relying on conditional guidance.</span></div>}
      {result?.status === 'not-found' && <div className="passives-audit-note"><strong>No recent report found.</strong><span>Type /passives in chat now, then click Read latest result. Only the bounded tail of Client.txt is scanned.</span></div>}
      {result?.status === 'incomplete' && <div className="passives-audit-note"><strong>Report looks truncated.</strong><span>Run /passives again and rescan so the quest lines are adjacent in the log tail.</span></div>}
      {result?.warnings.map((warning) => <div className="passives-audit-warning" key={warning}>{warning}</div>)}
      {error && <div className="inline-alert"><strong>/passives audit</strong>{error}</div>}
    </section>
  );
}
