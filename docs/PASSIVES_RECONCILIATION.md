# `/passives` reconciliation

ExileQuesting can reconcile Path of Exile's own `/passives` report against the campaign passive rewards that should already be available to the current route.

This is intentionally stronger than inferring permanent rewards from route progress. Passing a quest area does not prove that the character actually received or consumed its Book of Skill; `/passives` is the game's own account of quest passive rewards credited to the character.

## Player workflow

1. Open the **Permanent rewards audit**.
2. Press **Copy /passives** or type `/passives` yourself in Path of Exile chat.
3. Send the command in Path of Exile.
4. Press **Read latest result** in ExileQuesting.
5. Review any exact missing quest/recovery directions.

ExileQuesting never focuses the game, opens chat, types the command, presses Enter or simulates any gameplay input. The command is always sent by the player.

## Data source and security boundary

Path of Exile writes the `/passives` result to `Client.txt`. ExileQuesting already has a user-selected or automatically detected Path of Exile log for campaign observation.

The reconciliation IPC does **not** accept a file path from the renderer. It reads the persisted ExileQuesting setting from the main process and scans only that configured log. This prevents the renderer from turning the feature into a generic local-file reader.

The scanner:

- reads at most the final **512 KiB** of the configured log;
- drops a first partial line when the bounded read begins in the middle of a record;
- finds the most recent `/passives` report in that window;
- does not modify, truncate, lock or continuously monitor the log;
- keeps the scan explicit and user-triggered.

The result timestamp is shown in the UI so a stale report is visible instead of silently being treated as fresh character truth.

## Current PoE 1 campaign model

The registry contains the current passive-point campaign quests for Acts 1–10.

There are 23 quest entries. They provide:

- **24 passive points** when all three Act 2 bandits are killed;
- **23 passive points** when Alira, Kraityn or Oak is helped;
- **2 points** from `An End to Hunger`;
- **1 point** from every other applicable entry.

`Through Sacred Ground` is included as a passive-point quest for the current game. Its Book of Skill was changed in PoE 3.25 to grant one passive skill point in addition to its refund points.

The Act 2 bandit entry is conditional. When ExileQuesting is configured for an assisted bandit, `Deal with the Bandits` is not treated as a missing passive point. Conversely, if `/passives` proves the kill-all point while ExileQuesting says a bandit was helped, the audit reports a **Bandit setting mismatch** instead of quietly producing a misleading total.

## Progress-aware auditing

A full 23/24-point audit would be wrong during the campaign because later-act rewards do not exist for the character yet.

ExileQuesting therefore audits only **completed acts** during normal campaign progress:

- while playing Act 6, the missing-reward comparison covers Acts 1–5;
- later-act entries are retained as `future` rather than `missing`;
- if the player has already earned a reward beyond the audited boundary, it is visible but does not inflate the expected completed-act total;
- near the end of Act 10 / campaign completion, the audit switches to the full Acts 1–10 total.

This deliberately avoids accusing the player of missing content they have not reached yet.

## Parsing behavior

A current report contains a summary similar to:

```text
122 total Passive Skill Points (122 allocated)
8 total Ascendancy Skill Points (8 allocated)
98 Passive Skill Points from character level
24 Passive Skill Points from quests:
(1 from The Dweller of the Deep)
...
(2 from An End to Hunger)
```

ExileQuesting records:

- total and allocated passive points when present;
- total and allocated ascendancy points when present;
- character-level passive points when present;
- quest-point header total;
- individual credited quest entries.

Quest apostrophes are normalized so ordinary and typographic apostrophes do not create false misses.

## Compatibility safeguards

The game is allowed to change.

If `/passives` contains a quest name the bundled registry does not recognize, the audit keeps it visible as a compatibility warning rather than guessing what it means. If the header total and the sum of recognized entries disagree, the result also warns that the current quest registry may be stale.

A report with a plausible header but too few following quest lines is classified as incomplete and asks the player to run `/passives` again rather than marking dozens of rewards missing from a truncated log window.

## Recovery guidance

Every current registry entry contains a short recovery route. When a reward is missing, the UI shows:

- Act;
- quest name;
- missing point count;
- the practical route/turn-in needed to recover it.

This is separate from the existing route audit. Manual confirmations remain useful as a run checklist, while `/passives` reconciliation is the authoritative check for passive quest points actually credited by the game.

## Testing boundary

Automated coverage includes:

- latest-report selection when multiple `/passives` outputs exist;
- summary and individual-entry parsing;
- 24-point kill-all and 23-point assisted-bandit totals;
- Bandit profile mismatch detection;
- exact missing-quest recovery results;
- smart-apostrophe normalization;
- unknown future quest compatibility warnings;
- progress-scoped completed-act audits;
- future-act suppression;
- bounded log-tail reads and missing-file failure behavior.

Live campaign testing should capture real `/passives` output at several acts and after campaign completion so future client formatting changes become versioned regression fixtures.
