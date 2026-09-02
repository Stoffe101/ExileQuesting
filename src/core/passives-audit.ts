export type PassiveAuditBanditChoice = 'none' | 'alira' | 'kraityn' | 'oak';

export interface PassiveQuestDefinition {
  id: string;
  name: string;
  act: number;
  /** Earliest completed-act boundary where it is safe to call this reward missing. */
  auditAct?: number;
  points: number;
  killAllOnly?: boolean;
  recovery: string;
}

export interface PassiveQuestAuditItem extends PassiveQuestDefinition {
  expectedPoints: number;
  reportedPoints: number;
  status: 'earned' | 'missing' | 'not-applicable' | 'future';
}

export interface PassivesCommandReport {
  found: boolean;
  reportedQuestPoints?: number;
  totalPassivePoints?: number;
  allocatedPassivePoints?: number;
  levelPassivePoints?: number;
  totalAscendancyPoints?: number;
  allocatedAscendancyPoints?: number;
  timestamp?: string;
  entries: Array<{ name: string; points: number }>;
  unknownEntries: Array<{ name: string; points: number }>;
}

export interface PassivesReconciliation {
  status: 'not-found' | 'complete' | 'missing' | 'profile-mismatch' | 'incomplete';
  expectedQuestPoints: number;
  reportedQuestPoints?: number;
  missingPoints: number;
  earnedPoints: number;
  bandit: PassiveAuditBanditChoice;
  auditedThroughAct: number;
  items: PassiveQuestAuditItem[];
  missing: PassiveQuestAuditItem[];
  report: PassivesCommandReport;
  message: string;
  warnings: string[];
}

export const CAMPAIGN_PASSIVE_QUESTS: PassiveQuestDefinition[] = [
  { id: 'a1-dweller', name: 'The Dweller of the Deep', act: 1, points: 1, recovery: 'Waypoint to The Submerged Passage, enter The Flooded Depths, kill the Dweller of the Deep, then claim the Book of Skill from Tarkleigh in Lioneye’s Watch.' },
  { id: 'a1-mariner', name: 'The Marooned Mariner', act: 1, points: 1, recovery: 'Go to The Ship Graveyard, find the Allflame in The Ship Graveyard Cave, return it to Fairgraves and kill him, then claim the Book of Skill from Bestel.' },
  { id: 'a1-way-forward', name: 'The Way Forward', act: 1, auditAct: 2, points: 1, recovery: 'From The Western Forest in Act 2, kill Captain Arteri, take the Thaumetic Emblem and break the Thaumetic Seal, then return to Bestel in Act 1.' },
  { id: 'a2-sacred-ground', name: 'Through Sacred Ground', act: 2, points: 1, recovery: 'Travel through The Crossroads and Fellshrine Ruins to The Crypt Level 2, recover the Golden Hand, then return to Yeena for the Book of Skill.' },
  { id: 'a2-bandits', name: 'Deal with the Bandits', act: 2, points: 1, killAllOnly: true, recovery: 'For the passive-point reward, kill Alira, Kraityn and Oak, then speak to Eramir in The Forest Encampment. Helping a bandit intentionally gives no passive point.' },
  { id: 'a3-victario', name: "Victario's Secrets", act: 3, points: 1, recovery: 'Collect all three Platinum Busts in The Sewers, then return to Hargan in The Sarn Encampment.' },
  { id: 'a3-piety', name: "Piety's Pets", act: 3, points: 1, recovery: 'Reach The Lunaris Temple Level 2, kill Piety in her laboratory, then return to Grigor in The Sarn Encampment for the Book of Skill.' },
  { id: 'a4-spirit', name: 'An Indomitable Spirit', act: 4, points: 1, recovery: 'In The Mines Level 2, free Deshret’s spirit, then return to Tasuni in Highgate for the Book of Skill.' },
  { id: 'a5-science', name: 'In Service to Science', act: 5, points: 1, recovery: 'Find Vilenta’s Miasmeter in The Control Blocks and return it to Vilenta in Overseer’s Tower.' },
  { id: 'a5-torments', name: "Kitava's Torments", act: 5, points: 1, recovery: 'Collect Hinekora’s Hair, Tukohama’s Tooth and Valako’s Jaw in The Reliquary, then return them to Lani.' },
  { id: 'a6-father-war', name: 'The Father of War', act: 6, points: 1, recovery: 'Enter the Karui Fortress from The Coast, defeat Tukohama in his keep, then return to Tarkleigh in Lioneye’s Watch.' },
  { id: 'a6-puppet', name: 'The Puppet Mistress', act: 6, points: 1, recovery: 'Find and defeat Ryslatha in The Wetlands, then return to Tarkleigh in Lioneye’s Watch for the Book of Skill.' },
  { id: 'a6-cloven', name: 'The Cloven One', act: 6, points: 1, recovery: 'Take the side route from Prisoner’s Gate, defeat Abberath, then return to Bestel in Lioneye’s Watch.' },
  { id: 'a7-million-faces', name: 'The Master of a Million Faces', act: 7, points: 1, recovery: 'Defeat Greust and Ralakesh in The Ashen Fields, then return to Eramir in The Bridge Encampment for the Book of Skill.' },
  { id: 'a7-despair', name: 'Queen of Despair', act: 7, points: 1, recovery: 'Enter The Dread Thicket, defeat Gruthkul, then return to Eramir in The Bridge Encampment.' },
  { id: 'a7-kishara', name: "Kishara's Star", act: 7, points: 1, recovery: 'Find Kishara’s Star in The Causeway, then return it to Weylam Roth in The Bridge Encampment.' },
  { id: 'a8-love-dead', name: 'Love is Dead', act: 8, points: 1, recovery: 'Find the Ankh of Eternity in The Quay, bring it to Clarissa in The Quay, defeat the revived Tolman, then return to Clarissa in The Sarn Encampment for the Book of Skill.' },
  { id: 'a8-reflection', name: 'Reflection of Terror', act: 8, points: 1, recovery: 'Enter The High Gardens from The Bath House, defeat Yugul, then return to Hargan in The Sarn Encampment.' },
  { id: 'a8-gemling', name: 'The Gemling Legion', act: 8, points: 1, recovery: 'Defeat the Gemling Legionnaires in The Grain Gate, then return to Maramoa in The Sarn Encampment.' },
  { id: 'a9-sands', name: 'Queen of the Sands', act: 9, points: 1, recovery: 'Complete the Vastiri Desert storm-blade route and defeat Shakari in The Oasis, then return to Irasha in Highgate.' },
  { id: 'a9-highgate', name: 'The Ruler of Highgate', act: 9, points: 1, recovery: 'Enter The Quarry, defeat Garukhan and Kira, take the Sekhema Feather, then return to Highgate and give it to Tasuni or Irasha for the Book of Skill.' },
  { id: 'a10-vilenta', name: "Vilenta's Vengeance", act: 10, points: 1, recovery: 'Enter The Control Blocks from The Ravaged Square, defeat Vilenta, then return to Lani in Oriath Docks.' },
  { id: 'a10-hunger', name: 'An End to Hunger', act: 10, points: 2, recovery: 'Defeat Kitava at the end of Act 10 and complete the campaign turn-in. This reward contributes two passive skill points.' },
];

function normalizeQuestName(value: string): string {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/^the\s+/i, 'the ')
    .replace(/[^a-z0-9']+/gi, ' ')
    .trim()
    .toLowerCase();
}

function auditActFor(quest: PassiveQuestDefinition): number {
  return quest.auditAct ?? quest.act;
}

function messagePart(line: string): string {
  const match = line.match(/\]\s*:\s*(.*)$/);
  return (match?.[1] ?? line).trim();
}

function timestampFor(line: string): string | undefined {
  return line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1];
}

function nearbyNumber(lines: string[], headerIndex: number, pattern: RegExp): number | undefined {
  for (let index = headerIndex; index >= Math.max(0, headerIndex - 8); index -= 1) {
    const match = messagePart(lines[index] ?? '').match(pattern);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function nearbyPair(lines: string[], headerIndex: number, pattern: RegExp): [number, number] | undefined {
  for (let index = headerIndex; index >= Math.max(0, headerIndex - 8); index -= 1) {
    const match = messagePart(lines[index] ?? '').match(pattern);
    if (match) return [Number(match[1]), Number(match[2])];
  }
  return undefined;
}

export function parseLatestPassivesCommand(content: string): PassivesCommandReport {
  const lines = content.split(/\r?\n/);
  let headerIndex = -1;
  let reportedQuestPoints: number | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = messagePart(lines[index] ?? '').match(/^(\d+)\s+Passive Skill Points from quests\s*:/i);
    if (!match) continue;
    headerIndex = index;
    reportedQuestPoints = Number(match[1]);
    break;
  }

  if (headerIndex < 0) return { found: false, entries: [], unknownEntries: [] };

  const entries: Array<{ name: string; points: number }> = [];
  for (let index = headerIndex + 1; index < Math.min(lines.length, headerIndex + 45); index += 1) {
    const message = messagePart(lines[index] ?? '');
    const match = message.match(/^\(?\s*(\d+)\s+from\s+(.+?)\s*\)?\s*$/i);
    if (!match) {
      if (entries.length > 0 && message) break;
      continue;
    }
    entries.push({ points: Number(match[1]), name: match[2].trim() });
  }

  const passivePair = nearbyPair(lines, headerIndex, /^(\d+)\s+total Passive Skill Points\s*\((\d+) allocated\)/i);
  const ascendancyPair = nearbyPair(lines, headerIndex, /^(\d+)\s+total Ascendancy Skill Points\s*\((\d+) allocated\)/i);
  const known = new Set(CAMPAIGN_PASSIVE_QUESTS.map((quest) => normalizeQuestName(quest.name)));
  const unknownEntries = entries.filter((entry) => !known.has(normalizeQuestName(entry.name)));

  return {
    found: true,
    reportedQuestPoints,
    totalPassivePoints: passivePair?.[0],
    allocatedPassivePoints: passivePair?.[1],
    totalAscendancyPoints: ascendancyPair?.[0],
    allocatedAscendancyPoints: ascendancyPair?.[1],
    levelPassivePoints: nearbyNumber(lines, headerIndex, /^(\d+)\s+Passive Skill Points from character level/i),
    timestamp: timestampFor(lines[headerIndex] ?? ''),
    entries,
    unknownEntries,
  };
}

function normalizedThroughAct(value = 10): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.min(10, Math.trunc(value)));
}

export function expectedCampaignPassivePoints(bandit: PassiveAuditBanditChoice, throughAct = 10): number {
  const maximumAct = normalizedThroughAct(throughAct);
  return CAMPAIGN_PASSIVE_QUESTS.reduce((total, quest) => {
    if (auditActFor(quest) > maximumAct) return total;
    if (quest.killAllOnly && bandit !== 'none') return total;
    return total + quest.points;
  }, 0);
}

export function reconcilePassivesCommand(content: string, bandit: PassiveAuditBanditChoice, throughAct = 10): PassivesReconciliation {
  const auditedThroughAct = normalizedThroughAct(throughAct);
  const report = parseLatestPassivesCommand(content);
  const expectedQuestPoints = expectedCampaignPassivePoints(bandit, auditedThroughAct);
  if (!report.found) {
    return {
      status: 'not-found', expectedQuestPoints, missingPoints: expectedQuestPoints, earnedPoints: 0, bandit, auditedThroughAct,
      items: [], missing: [], report,
      message: 'No /passives report was found in the scanned Client.txt window. Run /passives in Path of Exile, then scan again.',
      warnings: [],
    };
  }

  const reported = new Map<string, number>();
  for (const entry of report.entries) {
    const key = normalizeQuestName(entry.name);
    reported.set(key, Math.max(reported.get(key) ?? 0, entry.points));
  }

  const items = CAMPAIGN_PASSIVE_QUESTS.map((quest): PassiveQuestAuditItem => {
    const reportedPoints = reported.get(normalizeQuestName(quest.name)) ?? 0;
    if (auditActFor(quest) > auditedThroughAct) return { ...quest, expectedPoints: 0, reportedPoints, status: 'future' };
    const expectedPoints = quest.killAllOnly && bandit !== 'none' ? 0 : quest.points;
    return {
      ...quest,
      expectedPoints,
      reportedPoints,
      status: expectedPoints === 0 ? 'not-applicable' : reportedPoints >= expectedPoints ? 'earned' : 'missing',
    };
  });
  const missing = items.filter((item) => item.status === 'missing');
  const auditedItems = items.filter((item) => item.status !== 'future');
  const earnedPoints = auditedItems.reduce((total, item) => total + Math.min(item.reportedPoints, item.expectedPoints), 0);
  const missingPoints = auditedItems.reduce((total, item) => total + Math.max(0, item.expectedPoints - item.reportedPoints), 0);
  const warnings: string[] = [];

  if (report.unknownEntries.length) warnings.push(`${report.unknownEntries.length} unrecognized /passives entr${report.unknownEntries.length === 1 ? 'y was' : 'ies were'} ignored. The game or quest naming may have changed.`);
  const canonicalReported = items.reduce((total, item) => total + item.reportedPoints, 0);
  if (report.reportedQuestPoints !== undefined && canonicalReported !== report.reportedQuestPoints) {
    warnings.push(`The /passives header reports ${report.reportedQuestPoints} quest point${report.reportedQuestPoints === 1 ? '' : 's'}, while ${canonicalReported} point${canonicalReported === 1 ? '' : 's'} mapped to the current quest registry.`);
  }

  const profileMismatch = bandit !== 'none'
    && (reported.get(normalizeQuestName('Deal with the Bandits')) ?? 0) > 0;
  if (profileMismatch) {
    return {
      status: 'profile-mismatch', expectedQuestPoints, reportedQuestPoints: report.reportedQuestPoints,
      missingPoints, earnedPoints, bandit, auditedThroughAct, items, missing, report,
      message: 'Your /passives result contains the kill-all Bandit passive point, but ExileQuesting is configured to help a bandit. Update the Bandit setting before trusting route branches or passive totals.',
      warnings,
    };
  }

  const hasUsefulEntries = report.entries.length >= 3 || (report.reportedQuestPoints ?? 0) <= 2;
  if (!hasUsefulEntries && (report.reportedQuestPoints ?? 0) > 2) {
    return {
      status: 'incomplete', expectedQuestPoints, reportedQuestPoints: report.reportedQuestPoints,
      missingPoints, earnedPoints, bandit, auditedThroughAct, items, missing, report,
      message: 'A /passives header was found, but too few quest lines followed it. The scanned log window may be truncated; run /passives again and rescan.',
      warnings,
    };
  }

  const fullCampaignAudit = auditedThroughAct >= 10;
  const headerMatchesFullCampaign = report.reportedQuestPoints === expectedCampaignPassivePoints(bandit, 10);
  if (missingPoints === 0 && (!fullCampaignAudit || headerMatchesFullCampaign)) {
    return {
      status: 'complete', expectedQuestPoints, reportedQuestPoints: report.reportedQuestPoints,
      missingPoints: 0, earnedPoints: expectedQuestPoints, bandit, auditedThroughAct, items, missing: [], report,
      message: fullCampaignAudit
        ? `All ${expectedQuestPoints} expected campaign passive quest points are accounted for.`
        : `All passive quest rewards expected through Act ${auditedThroughAct} are accounted for. Later-act rewards are intentionally not treated as missing yet.`,
      warnings,
    };
  }

  return {
    status: 'missing', expectedQuestPoints, reportedQuestPoints: report.reportedQuestPoints,
    missingPoints, earnedPoints, bandit, auditedThroughAct, items, missing, report,
    message: missing.length
      ? `${missingPoints} passive point${missingPoints === 1 ? '' : 's'} expected through Act ${auditedThroughAct} appear to be missing across ${missing.length} quest${missing.length === 1 ? '' : 's'}.`
      : `The mapped quests look complete, but the full /passives total does not match the expected ${expectedCampaignPassivePoints(bandit, 10)}. Review the warnings before changing your route.`,
    warnings,
  };
}
