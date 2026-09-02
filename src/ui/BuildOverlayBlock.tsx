import type { CampaignStep, RuntimeState } from '../core/types';

export default function BuildOverlayBlock({ state, step }: { state: RuntimeState; step: CampaignStep }) {
  const coach = state.buildCoach;
  const maxroll = coach?.maxroll;
  const exactPassive = maxroll?.nextPassive;
  const stageNeedsReview = !maxroll && coach?.stageConfidence === 'ambiguous';
  const buildActions = step.actions.filter((action) => action.type === 'build');
  const first = buildActions[0];
  const passive = coach?.nextPassiveText;
  const gearHint = coach?.gearHints[0];
  const hasContent = Boolean(first || passive || coach?.currentGemTasks.length || maxroll || gearHint || stageNeedsReview);
  if (!hasContent) return null;

  if (state.settings.overlayMode === 'compact') {
    return (
      <div className={`build-overlay compact ${exactPassive ? 'maxroll-active' : ''}`}>
        <span>{stageNeedsReview ? 'BUILD REVIEW' : exactPassive ? 'NEXT PASSIVE' : 'BUILD'}</span>
        <strong>{stageNeedsReview ? coach?.stageTitle ?? 'Stage alignment needs review' : exactPassive?.nodeName ?? first?.title ?? passive ?? gearHint?.label ?? `${coach?.currentGemTasks.length ?? 0} build task${coach?.currentGemTasks.length === 1 ? '' : 's'}`}</strong>
      </div>
    );
  }

  return (
    <div className="build-overlay">
      <div className="build-overlay-heading">
        <span className="section-kicker">BUILD</span>
        {coach?.stageTitle && <small>{coach.stageTitle}{coach.stageConfidence ? ` · ${coach.stageConfidence}` : ''}</small>}
      </div>

      {stageNeedsReview && (
        <div className="maxroll-passive-warning">
          <span>BUILD STAGE REVIEW</span>
          <strong>PoB sets could not be reconciled safely</strong>
          <small>ExileQuesting kept the uncertain sets separate. Review this stage in Build Planner before relying on build-specific guidance.</small>
        </div>
      )}

      {exactPassive && (
        <div className={`maxroll-passive-overlay ${exactPassive.type}`}>
          <div>
            <span>{exactPassive.type === 'refund' ? 'REFUND PASSIVE' : 'NEXT PASSIVE'}{state.characterLevel ? ` · LEVEL ${state.characterLevel}` : ''}</span>
            <strong>{exactPassive.nodeName}</strong>
            <small>{exactPassive.nodeKind ?? 'passive'} · step {exactPassive.index}/{exactPassive.total} · Maxroll {maxroll?.mode === 'twink' ? 'Twink' : 'leveling'}</small>
          </div>
          <button onClick={() => void window.exileQuesting.stepBuildPassive(coach!.profileId, 1)}>
            {exactPassive.type === 'refund' ? 'Refunded ✓' : 'Taken ✓'}
          </button>
        </div>
      )}

      {!exactPassive && maxroll && !maxroll.passiveComplete && (
        <div className="maxroll-passive-warning">
          <span>MAXROLL PASSIVES</span>
          <strong>Exact passive coaching unavailable</strong>
          <small>{maxroll.compatibilityMessage}</small>
        </div>
      )}

      {maxroll?.passiveComplete && (
        <div className="maxroll-passive-complete"><span>PASSIVES</span><strong>Maxroll leveling path complete ✓</strong></div>
      )}

      {buildActions.slice(0, state.settings.overlayMode === 'focus' ? 2 : 4).map((action) => (
        <div className="build-overlay-action" key={action.id}><i>⬡</i><strong>{action.title}</strong></div>
      ))}
      {!maxroll && passive && <div className="build-overlay-passive"><span>Next passives</span><strong>{passive}</strong></div>}
      {gearHint && (
        <div className="build-overlay-passive build-overlay-look-for">
          <span>LOOK FOR</span>
          <strong>{gearHint.label}</strong>
        </div>
      )}
      {state.settings.overlayMode === 'coach' && coach?.currentGemTasks.slice(0, 4).map((task) => (
        <div className="build-overlay-task" key={`${task.name}:${task.copies}`}>
          <span>{task.copies > 1 ? `${task.copies}× ` : ''}{task.name}</span>
          <small>{task.source ?? task.status}{task.timingVerified ? '' : ' · timing check'}</small>
        </div>
      ))}
    </div>
  );
}
