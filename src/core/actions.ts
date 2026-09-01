import type { AreaRecord, RouteAction, RouteActionType } from './types';

const ACTION_LABELS: Record<RouteActionType, string> = {
  travel: 'Travel', kill: 'Kill', talk: 'Talk', collect: 'Collect', 'quest-item': 'Quest item', reward: 'Reward',
  waypoint: 'Waypoint', passive: 'Passive point', trial: 'Trial', vendor: 'Vendor', gem: 'Gem', portal: 'Portal',
  relog: 'Relog', craft: 'Crafting recipe', build: 'Build', warning: 'Warning', context: 'Route clue',
};

function cleanToken(value: string): string {
  return value
    .replace(/\(color:[^)]+\)/gi, '')
    .replace(/\(lvl:(\d+)\)/gi, 'level $1')
    .replace(/\(ms\)/gi, 'movement speed')
    .replace(/\(img:[^)]+\)/gi, '')
    .replace(/\(hint\)_*/gi, '')
    .replace(/\b(leaguestart|twinkrun):\s*/gi, '')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
}

function sentence(value: string): string {
  const cleaned = cleanToken(value).replace(/[.;]+$/, '').trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
}

function areaNameFromLine(raw: string, areas: Map<string, AreaRecord>): string | undefined {
  const ids = [...raw.matchAll(/areaid([\w_]+)/gi)];
  const id = ids.at(-1)?.[1];
  return id ? areas.get(id)?.name : undefined;
}

function parseQuest(raw: string): RouteAction | null {
  const match = raw.match(/\(quest:([^)]+)\)/i);
  if (!match) return null;
  const token = match[1].replaceAll('_', ' ').trim();
  const lower = token.toLowerCase();
  if (lower.includes('book') || lower.includes('passive')) {
    return makeAction('passive', 'Claim the passive-point reward', raw, true);
  }
  return makeAction('reward', `Complete ${sentence(token)}`, raw);
}

function makeAction(type: RouteActionType, title: string, sourceLine: string, critical = false): RouteAction {
  return {
    id: `${type}:${sourceLine.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64)}`,
    type,
    title: sentence(title),
    priority: 'then',
    critical,
    sourceLine,
  };
}

function parseLine(raw: string, areas: Map<string, AreaRecord>): RouteAction[] {
  const lower = raw.toLowerCase();
  const cleanedRaw = cleanToken(raw);
  const destination = areaNameFromLine(raw, areas);
  const actions: RouteAction[] = [];

  if (/\(hint\)|\btip\s*:/i.test(raw)) {
    const hint = raw.replace(/.*?(?:\(hint\)_*|tip\s*:)/i, '');
    if (cleanToken(hint)) actions.push(makeAction('context', sentence(hint), raw));
    return actions;
  }

  const waypointMarker = /\(img:waypoint\)/i.test(raw);
  if (waypointMarker || /\bwaypoint\b/.test(lower)) {
    if (waypointMarker || /activate|click|take|get|grab|waypoint to/i.test(lower)) {
      actions.push(makeAction('waypoint', destination ? `Activate the waypoint in ${destination}` : 'Activate the waypoint', raw));
    }
  }

  if (lower.includes('(img:lab)') || /\btrial\b/.test(lower)) {
    actions.push(makeAction('trial', 'Complete the Ascendancy trial', raw, true));
  }

  if (lower.includes('(img:craft)') || /crafting recipe/i.test(lower)) {
    actions.push(makeAction('craft', 'Collect the crafting recipe', raw));
  }

  if (/\brelog\b|log\s*out/i.test(lower)) {
    actions.push(makeAction('relog', destination ? `Relog, then travel to ${destination}` : 'Relog to town', raw));
  }

  if (/\bportal\b/i.test(lower) && !/portal scroll/i.test(lower)) {
    actions.push(makeAction('portal', destination ? `Use a portal for ${destination}` : 'Use the planned portal', raw));
  }

  const kill = cleanedRaw.match(/\bkill\s+(?:arena:)?([^,;]+?)(?=\s+(?:for|and|then|to|level)\b|$)/i);
  if (kill) {
    const target = kill[1].replace(/\bchest\b.*$/i, '').trim();
    if (target) actions.push(makeAction('kill', `Kill ${target}`, raw));
  }

  const collectWords = /\b(?:take|collect|grab|pick up|obtain)\s+([^,;]+?)(?=\s+(?:and|then|from|before|after)\b|$)/i.exec(cleanedRaw);
  if (collectWords && !/waypoint/i.test(collectWords[1])) {
    actions.push(makeAction('collect', collectWords[0].trim(), raw));
  }

  const quest = parseQuest(raw);
  if (quest) actions.push(quest);

  const questNpc = cleanedRaw.match(/^quest\s+([a-z' -]+?)(?::|\s+-)/i);
  if (questNpc) actions.push(makeAction('talk', `Talk to ${sentence(questNpc[1])}`, raw));

  if (/\bbuy[_ ]gems\b|\bbuy\b.*\bgem/i.test(lower)) {
    actions.push(makeAction('gem', 'Buy the required gems', raw));
  }

  if (/\bvendor\b/i.test(lower) && !actions.some((action) => action.type === 'gem')) {
    actions.push(makeAction('vendor', 'Check the vendor', raw));
  }

  const explicitEnter = /\b(?:enter|go to|continue to|travel to|head to|waypoint to)\b/i.test(cleanedRaw);
  if (destination && explicitEnter && !actions.some((action) => action.type === 'relog')) {
    actions.push(makeAction('travel', `Enter ${destination}`, raw));
  }

  if (!actions.length) {
    const cleaned = sentence(raw.replace(/areaid[\w_]+/gi, destination ?? '').replace(/;;/g, ' — '));
    if (cleaned) actions.push(makeAction('context', cleaned, raw));
  }

  return dedupe(actions);
}

function dedupe(actions: RouteAction[]): RouteAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.type}|${action.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildRouteActions(rawLines: string[], areas: Map<string, AreaRecord>): RouteAction[] {
  const actions = dedupe(rawLines.flatMap((line) => parseLine(line, areas)));
  // Preserve the route author's sequence among actual actions. Context/layout
  // clues are moved behind decisive actions so “follow the wall” can never
  // become NOW when a later line on the same route page says “kill Hailrake”.
  const decisive = actions.filter((action) => action.type !== 'context');
  const context = actions.filter((action) => action.type === 'context');
  const ordered = [...decisive, ...context];

  let assignedNow = false;
  ordered.forEach((action) => {
    if (action.type === 'context') {
      action.priority = 'context';
    } else if (!assignedNow) {
      action.priority = 'now';
      assignedNow = true;
    } else {
      action.priority = 'then';
    }
  });
  return ordered;
}

export function summarizeActions(actions: RouteAction[]): { now?: RouteAction; then: RouteAction[]; context: RouteAction[] } {
  return {
    now: actions.find((action) => action.priority === 'now'),
    then: actions.filter((action) => action.priority === 'then'),
    context: actions.filter((action) => action.priority === 'context'),
  };
}

export function actionLabel(type: RouteActionType): string {
  return ACTION_LABELS[type];
}

export function looksUnhumanized(value: string): boolean {
  return /areaid|\(img:|\(quest:|\(hint\)|\bquest\s+[a-z]+:|\b[a-z]+_[a-z]+\b/i.test(value);
}
