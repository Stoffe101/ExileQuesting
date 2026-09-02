import { useEffect, useMemo, useRef, useState } from 'react';
import type { OverlayMode, RuntimeState } from '../core/types';
import type { ReplayResult, SimulationResult } from '../../electron/preload';

interface Props {
  state: RuntimeState;
  setState: (state: RuntimeState) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : min));
}

function ResultPill({ passed }: { passed: boolean }) {
  return <span className={`lab-result-pill ${passed ? 'pass' : 'fail'}`}>{passed ? 'PASS' : 'FAIL'}</span>;
}

export default function PreplaytestLab({ state, setState }: Props) {
  const maxIndex = Math.max(0, state.dataset.steps.length - 1);
  const [page, setPage] = useState(() => clamp(state.progress, 0, maxIndex));
  const [mode, setMode] = useState<OverlayMode>('focus');
  const initialAreaLevel = state.dataset.steps[page]?.areaLevel ?? 1;
  const [characterLevel, setCharacterLevel] = useState(Math.max(1, initialAreaLevel - 2));
  const [areaLevel, setAreaLevel] = useState(Math.max(1, initialAreaLevel));
  const [walking, setWalking] = useState(false);
  const [demoMessage, setDemoMessage] = useState('Demo mode never writes campaign progress.');
  const [simulation, setSimulation] = useState<SimulationResult[] | null>(null);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState('Run the same Acts 1–10 progression simulator used by CI.');
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const walkTimer = useRef<number | null>(null);

  const step = state.dataset.steps[page];
  const simulationPassed = simulation?.every((scenario) => scenario.report.passed) ?? false;
  const simulationTotals = useMemo(() => {
    if (!simulation) return null;
    return simulation.reduce((totals, scenario) => ({
      enabledPages: totals.enabledPages + scenario.report.enabledPages,
      automaticAdvances: totals.automaticAdvances + scenario.report.automaticAdvances,
      manualAdvances: totals.manualAdvances + scenario.report.manualAdvances,
      duplicateEvents: totals.duplicateEvents + scenario.report.duplicateEvents,
      backtrackProbes: totals.backtrackProbes + scenario.report.backtrackProbes,
      errors: totals.errors + scenario.report.issues.filter((issue) => issue.severity === 'error').length,
      warnings: totals.warnings + scenario.report.issues.filter((issue) => issue.severity === 'warning').length,
    }), { enabledPages: 0, automaticAdvances: 0, manualAdvances: 0, duplicateEvents: 0, backtrackProbes: 0, errors: 0, warnings: 0 });
  }, [simulation]);

  const stopWalk = () => {
    if (walkTimer.current !== null) window.clearInterval(walkTimer.current);
    walkTimer.current = null;
    setWalking(false);
  };

  const preview = async (target = page) => {
    const nextPage = clamp(target, 0, maxIndex);
    const nextState = await window.exileQuesting.previewOverlay({
      progress: nextPage,
      mode,
      characterLevel: clamp(characterLevel, 1, 100),
      areaLevel: clamp(areaLevel, 1, 100),
    });
    setPage(nextPage);
    setState(nextState);
    setDemoMessage(`Previewing route page ${nextPage + 1}. Saved campaign progress remains page ${state.progress + 1}.`);
  };

  useEffect(() => {
    const nextLevel = state.dataset.steps[page]?.areaLevel;
    if (nextLevel) setAreaLevel(nextLevel);
  }, [page, state.dataset.steps]);

  useEffect(() => () => {
    if (walkTimer.current !== null) window.clearInterval(walkTimer.current);
    void window.exileQuesting.stopOverlayPreview();
  }, []);

  const toggleWalk = () => {
    if (walking) {
      stopWalk();
      setDemoMessage('Auto walk paused.');
      return;
    }
    setWalking(true);
    setDemoMessage('Auto walk is running through the real overlay.');
    void preview(page);
    walkTimer.current = window.setInterval(() => {
      setPage((current) => {
        if (current >= maxIndex) {
          window.setTimeout(stopWalk, 0);
          return current;
        }
        const next = current + 1;
        void preview(next);
        return next;
      });
    }, 1800);
  };

  const stopDemo = async () => {
    stopWalk();
    const nextState = await window.exileQuesting.stopOverlayPreview();
    setState(nextState);
    setDemoMessage('Demo stopped. Overlay returned to the live campaign state.');
  };

  const runSimulation = async () => {
    setSimulationBusy(true);
    setSimulationMessage('Running six full campaign profiles through the progression engine…');
    try {
      const results = await window.exileQuesting.runCampaignSimulation();
      setSimulation(results);
      const failed = results.filter((scenario) => !scenario.report.passed);
      setSimulationMessage(failed.length ? `${failed.length} scenario(s) failed. Inspect the issue rows below.` : `All ${results.length} campaign profiles passed.`);
    } catch (error) {
      setSimulationMessage(`Simulator failed to run: ${String(error)}`);
    } finally {
      setSimulationBusy(false);
    }
  };

  const replayLog = async () => {
    setReplayBusy(true);
    try {
      const result = await window.exileQuesting.replayDiagnostics();
      if (result) setReplay(result);
    } finally {
      setReplayBusy(false);
    }
  };

  return (
    <main className="lab-shell" data-testid="lab-ready">
      <header className="lab-header">
        <div>
          <span className="eyebrow">OFFLINE VERIFICATION</span>
          <h1>Pre-playtest Lab</h1>
          <p>Exercise the real overlay, full campaign simulator and captured Client.txt replay without changing saved campaign progress.</p>
        </div>
        <div className="lab-version">v{state.appVersion}<small>{state.dataset.steps.length} route pages</small></div>
      </header>

      <section className="lab-grid">
        <article className="lab-card">
          <div className="lab-card-title"><div><span>VISUAL WALKTHROUGH</span><h2>Overlay Demo</h2></div><b>LIVE RENDERER</b></div>
          <label className="lab-field">Campaign page
            <input type="range" min={0} max={maxIndex} value={page} onChange={(event) => setPage(clamp(Number(event.target.value), 0, maxIndex))} />
            <input type="number" min={1} max={state.dataset.steps.length} value={page + 1} onChange={(event) => setPage(clamp(Number(event.target.value) - 1, 0, maxIndex))} />
          </label>
          <div className="lab-step"><strong>Act {step.act} · {step.title}</strong><span>{step.targetArea ?? 'No target area'} · {step.id}</span></div>
          <div className="lab-field-row">
            <label className="lab-field">Presentation
              <select value={mode} onChange={(event) => setMode(event.target.value as OverlayMode)}>
                <option value="focus">Focus</option><option value="compact">Compact</option><option value="coach">Coach</option>
              </select>
            </label>
            <label className="lab-field">Character level<input type="number" min={1} max={100} value={characterLevel} onChange={(event) => setCharacterLevel(clamp(Number(event.target.value), 1, 100))} /></label>
            <label className="lab-field">Area level<input type="number" min={1} max={100} value={areaLevel} onChange={(event) => setAreaLevel(clamp(Number(event.target.value), 1, 100))} /></label>
          </div>
          <div className="lab-buttons">
            <button onClick={() => void preview(page - 1)}>← Previous</button>
            <button className="primary-button" data-testid="lab-preview" onClick={() => void preview()}>Preview overlay</button>
            <button onClick={() => void preview(page + 1)}>Next →</button>
            <button className={walking ? 'lab-active-button' : ''} data-testid="lab-autowalk" onClick={toggleWalk}>{walking ? 'Pause walk' : 'Auto walk'}</button>
            <button onClick={() => void stopDemo()}>Stop demo</button>
          </div>
          <div className="lab-status">{demoMessage}</div>
        </article>

        <article className="lab-card lab-simulator-card">
          <div className="lab-card-title"><div><span>MECHANICAL TORTURE TEST</span><h2>Full Acts 1–10 Simulator</h2></div>{simulation && <ResultPill passed={simulationPassed} />}</div>
          <p className="lab-copy">Runs the actual campaign progression engine across league-start, twink, optional-content and every bandit route while injecting duplicates, display-name events and backtracks.</p>
          <div className="lab-buttons"><button className="primary-button" data-testid="lab-simulate" disabled={simulationBusy} onClick={() => void runSimulation()}>{simulationBusy ? 'Running…' : 'Run full simulator'}</button>{simulation && <button onClick={() => void window.exileQuesting.exportCampaignSimulation()}>Export report</button>}</div>
          <div className={`lab-status ${simulation && !simulationPassed ? 'bad' : simulation ? 'good' : ''}`}>{simulationMessage}</div>
          {simulationTotals && <div className="lab-metrics">
            <div><span>Profiles</span><strong>{simulation?.length}</strong></div><div><span>Errors</span><strong>{simulationTotals.errors}</strong></div><div><span>Backtracks</span><strong>{simulationTotals.backtrackProbes}</strong></div><div><span>Duplicates</span><strong>{simulationTotals.duplicateEvents}</strong></div>
          </div>}
          {simulation && <div className="lab-scenario-list">{simulation.map((scenario) => <div key={scenario.name} className="lab-scenario"><ResultPill passed={scenario.report.passed} /><div><strong>{scenario.name}</strong><small>{scenario.report.enabledPages} enabled pages · {scenario.report.automaticAdvances} automatic · {scenario.report.backtrackProbes} backtrack probes · {scenario.report.issues.filter((issue) => issue.severity === 'error').length} errors</small></div></div>)}</div>}
        </article>

        <article className="lab-card lab-replay-card">
          <div className="lab-card-title"><div><span>REAL LOG REPRODUCTION</span><h2>Captured Client.txt Replay</h2></div></div>
          <p className="lab-copy">Replay any saved PoE log through the real line buffer, parser and route decision engine in memory only.</p>
          <div className="lab-buttons"><button className="primary-button" disabled={replayBusy} onClick={() => void replayLog()}>{replayBusy ? 'Replaying…' : 'Select & replay log'}</button>{replay && <button onClick={() => void window.exileQuesting.exportReplayBundle()}>Export replay bundle</button>}</div>
          <div className={`lab-status ${replay?.errors.length ? 'bad' : replay ? 'good' : ''}`}>{replay ? `${replay.errors.length ? 'Replay found errors' : 'Replay completed'} · ${replay.parsedEvents} parsed events · ${replay.lines} lines · final page ${replay.finalProgress + 1}` : 'No captured log replayed yet.'}</div>
          {replay && <div className="lab-trace">{replay.decisions.slice(-30).reverse().map((decision, index) => <div key={`${decision.progressBefore}-${decision.progressAfter}-${index}`}><strong>{decision.event.areaName ?? decision.event.areaId ?? decision.event.type}</strong><span>Page {decision.progressBefore + 1} → {decision.progressAfter + 1}</span><small>{decision.reason}</small></div>)}</div>}
        </article>
      </section>
    </main>
  );
}
