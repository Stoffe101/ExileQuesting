import { useState } from 'react';

type Workspace = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;
type Analysis = Awaited<ReturnType<typeof window.exileQuesting.analyzeGearItem>>;

function verdictLabel(verdict: Analysis['verdict']): string {
  if (verdict === 'excellent') return 'EQUIP-WORTHY';
  if (verdict === 'good') return 'GOOD FIT';
  if (verdict === 'situational') return 'SITUATIONAL';
  if (verdict === 'future') return 'SAVE FOR LATER';
  return 'LOW PRIORITY';
}

function statValue(value: number, suffix = ''): string {
  return value ? `${value}${suffix}` : '—';
}

export default function GearCoachPanel({ workspace }: { workspace: Workspace }) {
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = workspace.planner.profiles.find((entry) => entry.profile.id === workspace.planner.activeProfileId);

  const run = async (source: 'text' | 'clipboard') => {
    if (!active || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = source === 'clipboard'
        ? await window.exileQuesting.analyzeClipboardGearItem()
        : await window.exileQuesting.analyzeGearItem(input);
      setAnalysis(result);
      if (source === 'clipboard') setInput(result.item.raw);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel gear-coach-panel">
      <div className="section-title">
        <div>
          <h2>Gear Coach</h2>
          <p>Copy an item from PoE and score it against the active build stage.</p>
        </div>
        <span>{active ? active.profile.name : 'No active build'}</span>
      </div>

      <div className="gear-coach-layout">
        <div className="gear-coach-input">
          <div className="gear-coach-callout">
            <strong>Fast path</strong>
            <span>Hover an item in Path of Exile, press <kbd>Ctrl+C</kbd>, then click Analyze copied item.</span>
          </div>
          <textarea
            className="gear-coach-textarea custom-scrollbar"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'Item Class: Boots\nRarity: Rare\n…'}
          />
          <div className="gear-coach-actions">
            <button className="primary-button" disabled={!active || busy} onClick={() => void run('clipboard')}>{busy ? 'Analyzing…' : 'Analyze copied item'}</button>
            <button className="ghost-button" disabled={!active || !input.trim() || busy} onClick={() => void run('text')}>Analyze pasted text</button>
            {analysis && <button className="ghost-button" onClick={() => { setAnalysis(null); setInput(''); setError(''); }}>Clear</button>}
          </div>
          {error && <div className="inline-alert"><strong>Gear Coach</strong>{error}</div>}
          {!active && <p className="build-empty">Import and select a build first. Gear Coach is deliberately stage-aware rather than a generic rare-item rater.</p>}
        </div>

        <div className="gear-coach-result">
          {analysis ? (
            <>
              <div className={`gear-score-card ${analysis.verdict}`}>
                <div className="gear-score-number"><strong>{analysis.score}</strong><span>/100</span></div>
                <div>
                  <span>{verdictLabel(analysis.verdict)}</span>
                  <h3>{analysis.item.name}</h3>
                  <p>{analysis.item.baseType} · {analysis.item.rarity ?? 'Unknown rarity'}{analysis.stageTitle ? ` · ${analysis.stageTitle}` : ''}</p>
                  <strong>{analysis.headline}</strong>
                </div>
              </div>

              <div className="gear-stat-grid">
                <div><span>Life</span><strong>{statValue(analysis.item.stats.maximumLife)}</strong></div>
                <div><span>Elemental res</span><strong>{statValue(analysis.item.stats.fireResistance + analysis.item.stats.coldResistance + analysis.item.stats.lightningResistance + analysis.item.stats.allElementalResistance * 3, '%')}</strong></div>
                <div><span>Move speed</span><strong>{statValue(analysis.item.stats.movementSpeed, '%')}</strong></div>
                <div><span>Links</span><strong>{analysis.item.maxLinks || '—'}{analysis.desiredLinks ? ` / ${analysis.desiredLinks} target` : ''}</strong></div>
                <div><span>Item level</span><strong>{analysis.item.itemLevel ?? '—'}</strong></div>
                <div><span>Requires</span><strong>{analysis.item.requirements.level ? `Lv ${analysis.item.requirements.level}` : '—'}</strong></div>
              </div>

              {analysis.target && (
                <div className="gear-target-strip">
                  <span>BUILD TARGET</span>
                  <strong>{analysis.target.slotName}: {analysis.target.name ?? analysis.target.baseType ?? 'Stage target'}</strong>
                  <small>{analysis.target.stageTitle}{analysis.target.rarity ? ` · ${analysis.target.rarity}` : ''}</small>
                </div>
              )}

              <div className="gear-reasons">
                <h3>Why</h3>
                {analysis.reasons.map((reason, index) => <p className={reason.tone} key={`${reason.label}:${index}`}><i />{reason.label}</p>)}
              </div>

              {analysis.repairHints.length > 0 && (
                <div className="gear-repair">
                  <h3>Cheap repair</h3>
                  {analysis.repairHints.map((hint) => <p key={hint}>{hint}</p>)}
                </div>
              )}
            </>
          ) : (
            <div className="gear-coach-empty">
              <span>GEAR COACH · v0.2</span>
              <h3>Stop staring at rares wondering if they are trash.</h3>
              <p>The score uses visible copied-item stats, your active skill/link target, detected character level, and stage-specific PoB gear when the guide provides it.</p>
              {workspace.coach?.gearHints.length ? (
                <div className="gear-look-for-preview">
                  <strong>Current LOOK FOR</strong>
                  {workspace.coach.gearHints.slice(0, 5).map((hint) => <small key={hint.label}>{hint.label}</small>)}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
