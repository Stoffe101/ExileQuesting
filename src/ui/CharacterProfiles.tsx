import { useEffect, useState, type FormEvent } from 'react';
import type { RuntimeState } from '../core/types';
import './character-profiles.css';

export default function CharacterProfiles({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const tracking = state.characterTracking;
  const active = tracking.active;
  const candidates = tracking.ambiguity?.candidateProfileIds.map((id) => tracking.profiles.find((profile) => profile.id === id)).filter(Boolean) ?? [];
  const liveProfiles = tracking.profiles.filter((profile) => !profile.archived);
  const archived = tracking.profiles.filter((profile) => profile.archived);
  const [nameDraft, setNameDraft] = useState(active?.characterName ?? '');
  useEffect(() => setNameDraft(active?.characterName ?? ''), [active?.id, active?.characterName]);
  const label = (profile: typeof tracking.profiles[number]) => profile.characterName ?? (profile.provisional ? 'New character · confirm name' : 'Unnamed character');
  const switchTo = (id: string) => void window.exileQuesting.activateCharacterProfile(id).then(setState);
  const reset = (id: string, name: string) => { if (window.confirm(`Reset campaign progress for ${name}? Build linkage is kept.`)) void window.exileQuesting.resetCharacterProfile(id).then(setState); };
  const remove = (id: string, name: string) => { if (window.confirm(`Delete the ExileQuesting profile for ${name}? This does not delete anything in Path of Exile.`)) void window.exileQuesting.deleteCharacterProfile(id).then(setState); };
  const saveName = (event: FormEvent) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!active || !name) return;
    void window.exileQuesting.setCharacterProfileName(active.id, name).then(setState);
  };

  return <div className="page custom-scrollbar character-page">
    <div className="page-heading"><div><span className="eyebrow">CHARACTER CONTINUITY</span><h1>Character Profiles</h1><p>Campaign cursor, permanent rewards and build context follow the character instead of one global save.</p></div><button className="primary-button" onClick={() => void window.exileQuesting.startNewCharacterProfile().then(setState)}>Start new profile</button></div>
    {tracking.ambiguity && <section className="panel character-ambiguity"><span className="eyebrow">IDENTITY CHECK</span><h2>ExileQuesting refused to guess.</h2><p>{tracking.ambiguity.reason} Choose the character you are actually playing, or start a new profile.</p><div className="character-actions">{candidates.map((profile) => profile && <button key={profile.id} className="ghost-button" onClick={() => switchTo(profile.id)}>{label(profile)} · Act {profile.act ?? '?'}</button>)}<button className="primary-button" onClick={() => void window.exileQuesting.startNewCharacterProfile().then(setState)}>This is a new character</button></div></section>}
    {active && <section className="panel active-character-card"><div><span className="eyebrow">TRACKING NOW</span><h2>{label(active)}</h2><p>{active.characterClass ?? 'Class pending'} · Lv {active.characterLevel ?? '?'} · Act {active.act ?? '?'} · Step {active.progress + 1}</p>{!active.characterName && <form className="character-name-form" onSubmit={saveName}><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={64} spellCheck={false} placeholder="Exact Path of Exile character name" aria-label="Path of Exile character name"/><button className="primary-button" type="submit" disabled={!nameDraft.trim()}>Confirm name</button><small>Set this once. ExileQuesting will only accept named Client.txt level-ups that exactly match the confirmed character, so party members cannot steal this profile.</small></form>}</div><div className="character-proof"><span>{active.identityConfidence}</span><strong>{active.identitySource.replace('-', ' ')}</strong><small>{active.identityReason ?? 'Waiting for stronger Client.txt evidence.'}</small></div><div className="character-build"><span>Build</span><strong>{active.buildProfileName ?? 'No build linked'}</strong><small>{active.buildProfileName ? 'Switching back to this character restores this build context.' : 'Selecting/importing a build while this character is active links it here.'}</small></div></section>}
    <section className="character-grid">{liveProfiles.map((profile) => <article className={'panel character-card ' + (profile.id === tracking.activeProfileId ? 'active' : '')} key={profile.id}><header><div><span>{profile.characterClass ?? 'Unknown class'}</span><h3>{label(profile)}</h3></div>{profile.id === tracking.activeProfileId && <b>ACTIVE</b>}</header><dl><dt>Level</dt><dd>{profile.characterLevel ?? '?'}</dd><dt>Campaign</dt><dd>Act {profile.act ?? '?'} · step {profile.progress + 1}</dd><dt>Build</dt><dd>{profile.buildProfileName ?? 'None'}</dd><dt>Identity</dt><dd>{profile.identitySource} · {profile.identityConfidence}</dd><dt>Last seen</dt><dd>{new Date(profile.lastSeenAt).toLocaleString()}</dd></dl><div className="character-actions">{profile.id !== tracking.activeProfileId && <button className="primary-button" onClick={() => switchTo(profile.id)}>Switch</button>}<button className="ghost-button" onClick={() => reset(profile.id, label(profile))}>Reset campaign</button><button className="ghost-button danger" onClick={() => remove(profile.id, label(profile))}>Delete</button></div><small className="run-id">Run {profile.runId}</small></article>)}</section>
    {archived.length > 0 && <details className="panel archived-characters"><summary>Archived / superseded runs ({archived.length})</summary>{archived.map((profile) => <div key={profile.id}><span>{label(profile)}</span><small>Act {profile.act ?? '?'} · superseded character-name run · {new Date(profile.lastSeenAt).toLocaleString()}</small><button className="ghost-button danger" onClick={() => remove(profile.id, label(profile))}>Delete archived profile</button></div>)}</details>}
  </div>;
}
