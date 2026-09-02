# Path of Building stage alignment

Path of Building stores passive trees, skills, item sets, and configuration sets as independent families. Their numeric IDs are not a reliable cross-family relationship, so ExileQuesting never assumes that tree set `2` belongs with skill set `2` merely because the IDs look similar.

The stage aligner instead builds one campaign-facing progression model from explicit evidence.

## Confidence ladder

ExileQuesting uses the following evidence in order:

1. **High confidence: linked-title token.** Modern PoB supports linked loadout titles such as `Tree {mapping}` and `Gear {mapping}`. Matching tokens are treated as explicit author intent.
2. **High confidence: exact normalized title.** Formatting codes, separators, and harmless display noise are normalized before comparing titles across families.
3. **Medium confidence: unique semantic milestone.** Equivalent labels such as `Level 28 tree`, `Lvl 28 gems`, and `28 gear` can align on the same level. Acts, leveling phases, and level ranges use the same rule.
4. **Low confidence: guarded ordinal fallback.** Ordinal pairing is allowed only when every multi-stage family has the same number of sets and the sets at that ordinal do not contain conflicting explicit milestones or linked-title tokens.
5. **Ambiguous: keep sets separate.** When the evidence conflicts or is insufficient, ExileQuesting does not guess.

A family with exactly one set is treated as globally applicable and can be attached to every otherwise aligned stage. It is not used as evidence that unrelated multi-stage families belong together.

## Level ranges and transitions

Current leveling guides frequently use ranges and transition labels rather than only point milestones. ExileQuesting therefore keeps these concepts distinct:

- `Lvl 1-12` -> Levels 1 through 12
- `12-32 Static Strike` -> Levels 12 through 32
- `Lvl 56 (Minor Respec)` -> an exact Level 56 transition
- `Lvl 56-67` -> the Level 56 through 67 state that follows it

The same-start respec and range are not collapsed into one stage.

For level-driven Maxroll progression:

- a one-level transition wins at its exact level;
- on the next level, a containing range takes over;
- the newest applicable level/range wins after that;
- if the character is below every known milestone, ExileQuesting selects the earliest future stage rather than the latest future stage.

Passive-tree cursor progress remains explicit and is not advanced by character-level detection.

## Mixed Act and Level labels

A build may mix labels such as `Act 1`, `Level 28`, and `Act 6`. Sorting all numeric levels before every Act would destroy the author's progression order, so aligned stages preserve the source sequence as the primary ordering signal. Semantic milestone ordering is used only as a tie-breaker.

## Failure behavior

Ambiguity is player-visible in Build Planner. A profile reports how many sets need review, the selected stage exposes the reasons behind its alignment confidence, and conflicting sets remain independent.

Examples of reasons include:

- family set counts differ, so ordinal pairing is disabled;
- multiple sets in one family share the same milestone;
- the same ordinal contains conflicting explicit levels or tokens;
- a linked-title token has no counterpart in another family.

This is intentionally conservative. A temporarily incomplete build-specific recommendation is preferable to confidently applying gems, gear, passive targets, vendor searches, or loot rules from the wrong stage.

## Regression corpus

Automated tests cover current real-world naming patterns including:

- `Lvl 1-12`
- `12-32 Static Strike`
- `Lvl 56 (Minor Respec)`
- `Lvl 56-67`
- per-Act stage families
- mixed Act/Level stage ordering
- PoB `{token}` linked titles
- equal-count ordinal fallback
- unequal-count families
- explicit level conflicts at the same ordinal
- explicit token conflicts at the same ordinal

The corpus is intentionally extended as new public PoBs expose additional naming conventions. Full real-world PoB corpus validation remains an ongoing roadmap item rather than a one-time checkbox.
