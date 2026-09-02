import { simulateCanonicalCampaign, type CampaignSimulationOptions, type CampaignSimulationReport } from './simulator';
import type { CampaignDataset } from './types';

export interface CampaignSimulationScenarioResult {
  name: string;
  report: CampaignSimulationReport;
}

export const CAMPAIGN_SIMULATION_SCENARIOS: Array<{ name: string; options: CampaignSimulationOptions }> = [
  { name: 'League start · all optional · kill all bandits', options: { leagueStart: true, showOptional: true, bandit: 'none' } },
  { name: 'League start · optional hidden', options: { leagueStart: true, showOptional: false, bandit: 'none' } },
  { name: 'Twink/non-league-start · all optional', options: { leagueStart: false, showOptional: true, bandit: 'none' } },
  { name: 'Bandit · Alira', options: { leagueStart: true, showOptional: true, bandit: 'alira' } },
  { name: 'Bandit · Kraityn', options: { leagueStart: true, showOptional: true, bandit: 'kraityn' } },
  { name: 'Bandit · Oak', options: { leagueStart: true, showOptional: true, bandit: 'oak' } },
];

export function runCampaignSimulationSuite(dataset: CampaignDataset): CampaignSimulationScenarioResult[] {
  return CAMPAIGN_SIMULATION_SCENARIOS.map((scenario) => ({
    name: scenario.name,
    report: simulateCanonicalCampaign(dataset, scenario.options),
  }));
}
