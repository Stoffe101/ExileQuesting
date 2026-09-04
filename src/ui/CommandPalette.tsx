import { useEffect, useMemo, useRef, useState } from 'react';
import { guideCalloutsForStep, passivePlanSummary } from '../core/guide-experience';
import { summarizeActions } from '../core/actions';
import type { RuntimeState } from '../core/types';
import PassivePlanModal from './PassivePlanModal';
import './command-palette.css';

export type AppTab = 'overview' | 'guide' | 'build' | 'knowledge' | 'settings' | 'diagnostics';

interface Command {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  run: () => void;
}

export default function CommandPalette({ state, onNavigate }: { state: RuntimeState; onNavigate: (tab: AppTab) => void }) {
  const [open, setOpen] = useState(false);
  const [passiveOpen, setPassiveOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const passive = passivePlanSummary(state.buildCoach);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPassiveOpen(false);
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        if (passiveOpen) setPassiveOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [passiveOpen]);

  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 0); else setQuery(''); }, [open]);

  const commands = useMemo<Command[]>(() => {
    const current = state.dataset.steps[state.progress];
    const objective = current ? summarizeActions(current.actions).now?.title ?? current.title : 'Current route';
    const important = current ? guideCalloutsForStep(current).map((callout) => callout.title).join(' ') : '';
    const base: Command[] = [
      { id: 'overview', label: 'Open Overview', detail: 'Current campaign and build status', keywords: 'home dashboard status', run: () => onNavigate('overview') },
      { id: 'campaign', label: 'Open Campaign Guide', detail: objective, keywords: `route acts guide lost objective ${important}`, run: () => onNavigate('guide') },
      { id: 'build', label: 'Open Build & Build Doctor', detail: state.buildCoach?.profileName ?? 'Import or inspect a build', keywords: 'pob maxroll doctor gear upgrade passive gems', run: () => onNavigate('build') },
      { id: 'passive', label: 'Open Passive Plan', detail: passive.title, keywords: 'tree passive next node allocate refund skill point pob maxroll', run: () => setPassiveOpen(true) },
      { id: 'rewards', label: 'Permanent reward audit', detail: `${state.rewardAudit.passive.confirmed}/${state.rewardAudit.passive.knownTotal} passives · ${state.rewardAudit.trials.confirmed}/${state.rewardAudit.trials.knownTotal} trials`, keywords: 'passives trials labyrinth ascendancy book skill reward missing', run: () => onNavigate('guide') },
      { id: 'knowledge', label: 'Open Knowledge', detail: 'Campaign habits and route concepts', keywords: 'help learn tips layout speedrun', run: () => onNavigate('knowledge') },
      { id: 'settings', label: 'Open Settings', detail: 'Guide, overlay, accessibility and updates', keywords: 'preferences minimal standard teach me overlay font size', run: () => onNavigate('settings') },
      { id: 'diagnostics', label: 'Open Diagnostics', detail: 'Client.txt, route and application health', keywords: 'logs error tracking debug client', run: () => onNavigate('diagnostics') },
      { id: 'overlay', label: 'Open campaign overlay', detail: 'Show the normal campaign HUD', keywords: 'hud overlay show', run: () => void window.exileQuesting.showOverlay() },
    ];
    const vendor = state.buildCoach?.vendorSearch;
    if (vendor?.equipment) base.push({ id: 'vendor-gear', label: 'Build-aware vendor gear search', detail: vendor.equipment.included.join(' · '), keywords: 'vendor regex gear boots links bases', run: () => onNavigate('build') });
    if (vendor?.gems) base.push({ id: 'vendor-gems', label: 'Build-aware gem vendor search', detail: vendor.gems.included.join(' · '), keywords: 'vendor regex gems buy', run: () => onNavigate('build') });
    return base;
  }, [state, passive.title, onNavigate]);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return commands;
    return commands.filter((command) => words.every((word) => `${command.label} ${command.detail} ${command.keywords}`.toLowerCase().includes(word)));
  }, [commands, query]);

  return <>
    {open && <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="command-palette">
        <header><span>⌕</span><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ExileQuesting…" /><kbd>ESC</kbd></header>
        <div className="command-results">{filtered.map((command, index) => <button key={command.id} autoFocus={false} onClick={() => { command.run(); setOpen(false); }}><i>{index === 0 ? '↵' : '·'}</i><div><strong>{command.label}</strong><small>{command.detail}</small></div></button>)}{!filtered.length && <p>No matching command. Try “passive”, “lab”, “vendor”, “build”, or “settings”.</p>}</div>
        <footer><span><kbd>Ctrl</kbd> <kbd>K</kbd> toggle</span><span>Search stays inside ExileQuesting. It never types into Path of Exile.</span></footer>
      </section>
    </div>}
    {passiveOpen && <PassivePlanModal state={state} onClose={() => setPassiveOpen(false)} />}
  </>;
}
