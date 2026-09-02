import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PASSIVE_QUESTS, expectedCampaignPassivePoints, parseLatestPassivesCommand, reconcilePassivesCommand } from './passives-audit';

function logLine(message: string, second = 10): string {
  return `2026/09/02 21:10:${String(second).padStart(2, '0')} 123456789 abc [INFO Client 12345] : ${message}`;
}

function fullReport(overrides: Record<string, number> = {}, total = 24): string {
  const lines = [
    logLine('123 total Passive Skill Points (120 allocated)', 1),
    logLine('8 total Ascendancy Skill Points (8 allocated)', 2),
    logLine('99 Passive Skill Points from character level', 3),
    logLine(`${total} Passive Skill Points from quests:`, 4),
  ];
  for (const quest of CAMPAIGN_PASSIVE_QUESTS) {
    const points = overrides[quest.name] ?? quest.points;
    lines.push(logLine(`(${points} from ${quest.name})`, 5));
  }
  return lines.join('\n');
}

describe('/passives parser', () => {
  it('parses the latest complete Client.txt report and totals', () => {
    const content = [
      logLine('23 Passive Skill Points from quests:', 1),
      logLine('(1 from The Dweller of the Deep)', 2),
      'some later unrelated line',
      fullReport(),
    ].join('\n');
    const report = parseLatestPassivesCommand(content);
    expect(report.found).toBe(true);
    expect(report.reportedQuestPoints).toBe(24);
    expect(report.totalPassivePoints).toBe(123);
    expect(report.allocatedPassivePoints).toBe(120);
    expect(report.totalAscendancyPoints).toBe(8);
    expect(report.levelPassivePoints).toBe(99);
    expect(report.entries).toHaveLength(23);
    expect(report.entries.find((entry) => entry.name === 'An End to Hunger')?.points).toBe(2);
  });

  it('returns not found when the scanned tail predates any /passives command', () => {
    expect(reconcilePassivesCommand(logLine('You have entered The Coast.'), 'none').status).toBe('not-found');
  });
});

describe('/passives reconciliation', () => {
  it('expects 24 points for kill-all and 23 when a bandit is helped', () => {
    expect(expectedCampaignPassivePoints('none')).toBe(24);
    expect(expectedCampaignPassivePoints('alira')).toBe(23);
    expect(expectedCampaignPassivePoints('kraityn')).toBe(23);
    expect(expectedCampaignPassivePoints('oak')).toBe(23);
  });

  it('scopes expectations to completed acts during the campaign', () => {
    expect(expectedCampaignPassivePoints('none', 1)).toBe(3);
    expect(expectedCampaignPassivePoints('none', 2)).toBe(5);
    expect(expectedCampaignPassivePoints('alira', 2)).toBe(4);
    expect(expectedCampaignPassivePoints('none', 5)).toBe(10);
  });

  it('accepts a complete kill-all report', () => {
    const result = reconcilePassivesCommand(fullReport(), 'none');
    expect(result.status).toBe('complete');
    expect(result.missingPoints).toBe(0);
    expect(result.earnedPoints).toBe(24);
    expect(result.missing).toEqual([]);
  });

  it('does not mark future-act quests missing in a mid-campaign audit', () => {
    const throughActFive = CAMPAIGN_PASSIVE_QUESTS.filter((quest) => quest.act <= 5);
    const content = [
      logLine('10 Passive Skill Points from quests:', 4),
      ...throughActFive.map((quest) => logLine(`(${quest.points} from ${quest.name})`, 5)),
    ].join('\n');
    const result = reconcilePassivesCommand(content, 'none', 5);
    expect(result.status).toBe('complete');
    expect(result.expectedQuestPoints).toBe(10);
    expect(result.missing).toEqual([]);
    expect(result.items.find((item) => item.name === 'The Father of War')?.status).toBe('future');
    expect(result.message).toContain('Later-act rewards');
  });

  it('accepts already-earned later rewards without raising the completed-act expectation', () => {
    const throughActFive = CAMPAIGN_PASSIVE_QUESTS.filter((quest) => quest.act <= 5);
    const content = [
      logLine('11 Passive Skill Points from quests:', 4),
      ...throughActFive.map((quest) => logLine(`(${quest.points} from ${quest.name})`, 5)),
      logLine('(1 from The Father of War)', 6),
    ].join('\n');
    const result = reconcilePassivesCommand(content, 'none', 5);
    expect(result.status).toBe('complete');
    expect(result.expectedQuestPoints).toBe(10);
    expect(result.items.find((item) => item.name === 'The Father of War')?.status).toBe('future');
  });

  it('identifies the exact missing quest and recovery instructions', () => {
    const result = reconcilePassivesCommand(fullReport({ 'Through Sacred Ground': 0 }, 23), 'none');
    expect(result.status).toBe('missing');
    expect(result.missingPoints).toBe(1);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].name).toBe('Through Sacred Ground');
    expect(result.missing[0].act).toBe(2);
    expect(result.missing[0].recovery).toContain('The Crypt Level 2');
  });

  it('treats an omitted quest entry as zero, matching Client.txt reports that list only earned quests', () => {
    const content = fullReport({}, 24)
      .split('\n')
      .filter((line) => !line.includes('The Gemling Legion'))
      .map((line) => line.includes('24 Passive Skill Points from quests:') ? line.replace('24 Passive', '23 Passive') : line)
      .join('\n');
    const result = reconcilePassivesCommand(content, 'none');
    expect(result.status).toBe('missing');
    expect(result.missing.map((item) => item.name)).toContain('The Gemling Legion');
  });

  it('does not demand the Bandit passive point when the route is configured to help a bandit', () => {
    const result = reconcilePassivesCommand(fullReport({ 'Deal with the Bandits': 0 }, 23), 'alira');
    expect(result.status).toBe('complete');
    const bandits = result.items.find((item) => item.name === 'Deal with the Bandits');
    expect(bandits?.status).toBe('not-applicable');
    expect(bandits?.expectedPoints).toBe(0);
  });

  it('flags a route-profile mismatch when /passives proves the kill-all reward but settings say a bandit was helped', () => {
    const result = reconcilePassivesCommand(fullReport({}, 24), 'alira');
    expect(result.status).toBe('profile-mismatch');
    expect(result.message).toContain('Bandit');
  });

  it('normalizes smart apostrophes from localized/copied log text', () => {
    const content = fullReport().replace("Victario's Secrets", 'Victario’s Secrets');
    const result = reconcilePassivesCommand(content, 'none');
    expect(result.status).toBe('complete');
  });

  it('keeps unknown future quest names visible as compatibility warnings', () => {
    const lines = fullReport().split('\n');
    lines.push(logLine('(1 from A Totally New Quest)', 9));
    lines[3] = logLine('25 Passive Skill Points from quests:', 4);
    const result = reconcilePassivesCommand(lines.join('\n'), 'none');
    expect(result.report.unknownEntries.map((entry) => entry.name)).toContain('A Totally New Quest');
    expect(result.warnings.some((warning) => warning.includes('unrecognized'))).toBe(true);
  });
});
