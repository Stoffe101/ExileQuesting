// Temporary guarded patch helper. Delete before final PR acceptance.
import fs from 'node:fs';

const file = 'electron/main.ts';
let text = fs.readFileSync(file, 'utf8');
const before = "    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor)\n";
const after = "    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor, characterLevel)\n";
const count = text.split(before).length - 1;
if (count !== 1) throw new Error(`Expected exactly one Build Coach runtime call, found ${count}.`);
text = text.replace(before, after);
fs.writeFileSync(file, text);
