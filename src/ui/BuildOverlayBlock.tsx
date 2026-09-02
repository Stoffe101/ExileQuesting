import type { CampaignStep, RuntimeState } from '../core/types';

export default function BuildOverlayBlock({ state, step }: { state: RuntimeState; step: CampaignStep }) {
  const coach = state.buildCoach;
  const buildActions = step.actions.filter((action) => action.type === 'build');
  const first = buildActions[0];
  const passive = coach?.nextPassiveText;
  const hasContent = Boolean(first || passive || coach?.currentGemTasks.length);
  if (!hasContent) return null;

  if (state.settings.overlayMode === 'compact') {
    return (
      <div className="build-overlay compact">
        <span>BUILD</span>
        <strong>{first?.title ?? passive ?? `${coach?.currentGemTasks.length ?? 0} build task${coach?.currentGemTasks.length === 1 ? '' : 's'}`}</strong>
      </div>
    );
  }

  return (
    <div className="build-overlay">
      <div className="build-overlay-heading">
        <span className="section-kicker">BUILD</span>
        {coach?.stageTitle && <small>{coach.stageTitle}{coach.stageConfidence ? ` · ${coach.stageConfidence}` : ''}</small>}
      </div>
      {buildActions.slice(0, state.settings.overlayMode === 'focus' ? 2 : 4).map((action) => (
        <div className="build-overlay-action" key={action.id}><i>⬡</i><strong>{action.title}</strong></div>
      ))}
      {passive && <div className="build-overlay-passive"><span>Next passives</span><strong>{passive}</strong></div>}
      {state.settings.overlayMode === 'coach' && coach?.currentGemTasks.slice(0, 4).map((task) => (
        <div className="build-overlay-task" key={`${task.name}:${task.copies}`}>
          <span>{task.copies > 1 ? `${task.copies}× ` : ''}{task.name}</span>
          <small>{task.source ?? task.status}{task.timingVerified ? '' : ' · timing check'}</small>
        </div>
      ))}
    </div>
  );
}
