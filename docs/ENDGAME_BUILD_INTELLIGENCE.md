# Endgame Build Intelligence

## North star

ExileQuesting should become **the application that understands a Path of Exile character**.

The endgame target is not an expanded checklist and not an LLM paraphrasing Path of Building numbers. A useful diagnosis must answer questions such as:

- Why does this build work?
- What are its real damage and defence scaling axes?
- Which conditions and breakpoints must remain valid?
- What is the build designed to farm, and what content is hostile to it?
- Is a death likely to expose a build-level weakness, a map/encounter interaction, an uptime/configuration problem, or simply player execution?
- What is the next meaningful upgrade at the player's budget?
- Is that upgrade still good after attribute, resistance, suppression, reservation, trigger, socket/gem and other whole-build constraints are re-solved?
- Is buying or crafting the upgrade more sensible, and what target affixes are essential versus merely desirable?

The quality bar is an experienced build reviewer, not a res-cap checker. ExileQuesting must be willing to say that it does not understand an interaction well enough to recommend a change.

## Architectural rule: deterministic evidence first

Recommendations must originate from structured evidence. Natural-language explanation comes last.

The intended stack is:

1. **PoB calculation kernel** — a pinned, tested Path of Building Community calculation worker provides authoritative build recalculation for damage, defence and configuration-sensitive outputs.
2. **Character state** — imported PoB/build-guide state today, with an optional official GGG OAuth character snapshot when approved and implemented.
3. **Mechanic graph** — normalized relationships between skills, supports, items, passives, resources, conditions, scaling axes, defensive layers and mechanical breakpoints.
4. **Sensitivity engine** — controlled perturbations answer how strongly the current build responds to gem levels, attack/cast speed, crit, penetration, attributes, max resistance, armour, recovery and other dimensions.
5. **Practical combat model** — separates peak spreadsheet states from mapping uptime, sustained boss uptime, ramp, mobility, range, coverage and defensive cooldown availability.
6. **Content model** — applies map, Nightmare Map, pinnacle/Uber and other encounter conditions to the same character rather than assigning a context-free tankiness score.
7. **Whole-build optimiser** — evaluates coordinated item/passive/gem/flask/configuration packages, not only one candidate item against one equipped item.
8. **Crafting/economy layer** — converts an optimised target into essential/important/luxury affixes, feasible craft paths, expected attempts/cost and stop conditions.
9. **Evidence-backed explanation** — explains the recommendation, assumptions and trade-offs with confidence labels.

No language model is allowed to invent the numerical result of a build change. If the calculation engine cannot verify a numerical claim, it must be presented as an inference or omitted.

## Why Path of Building is the calculation kernel

Reimplementing PoE calculation semantics independently would create years of parity work and a permanent correctness liability. Path of Building Community already models the interactions ExileQuesting needs and exposes recalculation machinery used by its own item/trade tooling.

The integration should be isolated behind a narrow worker protocol so the Electron main process does not become a second PoB implementation. The worker must be pinned to a reviewed upstream commit, have deterministic fixture parity tests, and be upgradeable independently from the rest of the UI.

Before redistribution, every included PoB and third-party component must have its license and notice requirements audited and recorded in `THIRD_PARTY_NOTICES.md`.

## Research corpus: coverage, not a magic PoB count

A corpus of 200 PoBs is useful for an early spike but is not a serious endgame knowledge base. The production corpus should grow continuously and be measured by **mechanical coverage and diversity**, not a single total.

Initial long-term targets:

- **2,000+ distinct public or contributed build profiles** across current and historical patches;
- **5,000+ build states** after progression/budget variants are separated;
- **1,000+ deliberately mutated negative cases** where a known dependency, breakpoint, defence, support, passive or gear constraint is broken;
- broad representation of current meta, historically important archetypes, niche-but-mechanically-distinct archetypes, hardcore/SSF perspectives and high-investment softcore trade builds;
- multiple creators for important archetypes so one author's preferences do not become universal truth;
- multiple investment bands: league start, early maps, established mapping, high investment and near-BiS where source material exists;
- multiple content intents: general mapping, high-density/8-mod mapping, Nightmare/T17-style content, pinnacle/Uber bossing, Delve, Simulacrum and other mechanically distinct content.

These are coverage goals, not release claims. The corpus audit must make missing dimensions visible.

## Required corpus dimensions

Every normalized build case can carry several values in each dimension.

### Damage delivery

- direct hit
- ailment DoT
- non-ailment DoT
- trigger
- minion
- totem
- brand
- trap
- mine
- secondary explosion/proliferation
- self-damage/self-hit interaction

### Scaling axes

Examples include weapon/base damage, gem level, crit, attack/cast speed, trigger rate, cooldown recovery, ailment duration, DoT multiplier, poison stack rate, penetration/resistance reduction, conversion, projectile count/behaviour, charges, attributes, mana, life, ES, armour, reservation/aura effect, flask effect, corpse scaling and minion-specific scaling.

### Defensive layers

Life/ES/MoM-style pools, armour, evasion, suppression, block, max resistance, endurance charges, physical taken-as/conversion, generic damage reduction, avoidance, leech, regeneration, recoup, recovery on block/hit, guard skills, flask-dependent mitigation, ailment immunity, curse mitigation, crit mitigation and recovery-rate constraints must be represented independently. A build can rely on several at once.

### Playstyle

The model must distinguish melee/ranged, stationary/mobile, instant/ramping, active/passive damage delivery, screen coverage, off-screen potential, boss uptime, button/rotation burden, flask/charge dependence and whether defence relies materially on range, movement or killing enemies first.

### Content intent

A build that is excellent at fast mapping can be a bad Uber recommendation without being a bad build. Corpus records therefore need intended content, not merely a global power score.

## Research sources and provenance

### Tier A: deterministic/official/open calculation sources

Preferred foundations include:

- Grinding Gear Games documented APIs and data exports;
- Path of Building Community calculation/data code, pinned by commit;
- appropriately licensed/open PoE data projects where their provenance and redistribution terms are acceptable;
- ExileQuesting's own deterministic fixtures and calculation experiments.

### Tier B: expert-authored public material

Research should continuously review current and historical material from sources such as:

- Maxroll build guides and planners;
- Mobalytics verified/creator builds;
- public PoB/pobb.in exports;
- creator videos, written guides and streams/VODs where practical;
- specialists such as Fubgun, Carn/Carnarius, Pohx, Zizaran, Jungroan, Ruetoo, CaptainLance9, Palsteron, Goratha and other creators relevant to a mechanic/archetype;
- specialist community resources where they add unique mechanic knowledge.

Creator popularity alone is not evidence. The goal is to capture *mechanical claims, playstyle assumptions, progression transitions, constraints and trade-offs* and then corroborate them against deterministic calculations and other sources when possible.

### Historical material

Previous-league guides matter because archetypes disappear and return. Historical cases teach mechanic families, progression patterns and failure modes that a current-meta-only corpus would miss. Every historical assertion must retain its patch applicability so stale balance values are never silently treated as current.

## Copyright and source-use policy

The knowledge base should store normalized facts, labels, derived relationships, source URLs, hashes/identifiers and short review notes. It should not mirror guide prose, video transcripts or entire third-party datasets merely because they are publicly reachable.

Each source record declares a use policy such as `official`, `redistributable`, `derived-facts-only` or `link-only`.

If a source does not grant redistribution rights, ExileQuesting stores derived factual assertions and provenance rather than copied content. Exact third-party PoB exports should only be committed as fixtures when redistribution is acceptable; otherwise store a URL/hash and keep the research artefact outside the distributed application.

Unsupported/internal APIs are not a corpus source. In particular, a public website exposing an internal endpoint in browser devtools is not permission to build a dependency on it.

## Source freshness

Every source and assertion has patch/freshness metadata. Research automation should re-check:

- PoB upstream calculation/data changes;
- GGG API/data-export changes;
- current Maxroll/Mobalytics build surfaces;
- current creator/meta source registry;
- balance changes affecting known mechanic assertions.

Changes create review work. They do not directly mutate production recommendations.

## Mechanic graph

A build is represented as a graph rather than a flat list of stats.

Nodes can include:

- active skill and skill parts;
- support gems;
- item modifiers and unique mechanics;
- passive/notable/keystone/mastery effects;
- ascendancy effects;
- resources such as charges, rage, mana, life, ES and flask state;
- offensive/defensive conditions;
- breakpoints;
- content modifiers.

Edges describe relationships such as:

- scales;
- enables;
- converts;
- triggers;
- consumes;
- requires;
- caps;
- conflicts with;
- provides uptime for;
- protects against.

The graph is partly structural, partly derived from PoB sensitivity experiments, and partly enriched by reviewed expert knowledge.

## Sensitivity analysis

For an imported build, the calculation worker should be able to apply bounded hypothetical perturbations and report deltas. Examples:

- +1 main-skill gem level;
- increased/more damage classes where mechanically legal;
- attack/cast speed;
- crit chance/multiplier;
- penetration/resistance reduction;
- projectile count or behaviour where supported;
- charges/attributes;
- life/ES/mana;
- armour/evasion/suppression/block/max resistance;
- recovery changes;
- removal of a support, passive, flask or configuration condition.

The output is a local response surface for the *actual build*. This prevents generic rules such as “crit multi is good” from being applied when crit is not a meaningful scaling axis.

Discontinuities are especially important. Trigger breakpoints, caps and threshold mechanics need explicit breakpoint detection rather than smooth stat weighting.

## Configuration Doctor

Imported PoBs can overstate practical power when temporary or mutually unreliable conditions are enabled. Conditions should be classified into states such as:

- permanent;
- normal mapping uptime;
- sustainable boss uptime;
- burst-only;
- conditional/unproven.

Where evidence permits, ExileQuesting should calculate several configurations instead of one headline number:

- peak;
- normal mapping;
- sustained boss;
- cold-start/low-uptime;
- guard/flask unavailable defensive state.

The application must show which assumptions changed.

## Practical combat model

PoB outputs are necessary but not sufficient. Practical performance also depends on:

- time to ramp;
- range and positioning requirement;
- damage while moving;
- clear coverage and secondary explosions/proliferation;
- projectile/return/chain behaviour;
- target acquisition;
- boss damage uptime;
- defensive uptime;
- recovery between hits;
- button/rotation burden.

These attributes are evidence-backed qualitative/quantitative dimensions, not fabricated DPS multipliers. Estimated practical-DPS figures must clearly identify modelling assumptions.

## Content-aware diagnosis

The same character is evaluated under a content profile. For a copied map or supported encounter profile, ExileQuesting should identify which modifiers attack the build's actual defensive/offensive dependencies.

A high-end diagnosis should be able to say, with evidence, that a map is disproportionately dangerous because two modifiers simultaneously weaken the build's armour and recovery, rather than merely reporting that the map has “more monster damage”.

Player execution remains an uncertainty unless GGG exposes reliable event evidence. The tool must not pretend to know the exact cause of a death when it only knows build/content state.

## Whole-build upgrade optimiser

The optimisation unit is a **transition package**, not a single item.

A candidate package can include:

- one or more item replacements;
- passive refunds/reallocation;
- gem/support changes;
- flask changes;
- anoint/implicit/jewel changes;
- configuration changes required by the new setup.

The solver must re-check hard constraints after every package:

- attributes/requirements;
- resists/max res;
- suppression/block/caps;
- reservation/resources;
- sockets/links/gem enablement;
- trigger/cooldown/attack-rate breakpoints;
- required unique interactions;
- build-specific invariants discovered by the mechanic graph.

Optimisation is multi-objective. ExileQuesting should expose Pareto-efficient choices instead of collapsing every player into one DPS score.

## Crafting Coach handoff

The optimiser outputs target affixes grouped as:

- **essential** — removing one breaks the intended transition or a hard constraint;
- **important** — high marginal value for the build/content goal;
- **flexible** — several equivalent solutions exist;
- **luxury** — valuable only after higher-priority constraints are solved.

Crafting Coach then searches supported craft methods and estimates expected attempts/cost. It must have explicit stop conditions and re-validate an item after a user-triggered copy. It must not automate crafting input.

## Confidence model

Every recommendation should expose a confidence class:

- **VERIFIED** — direct deterministic calculation or documented game rule;
- **HIGH** — deterministic result combined with a reviewed mechanic interpretation;
- **MEDIUM** — strongly supported inference with material gameplay/configuration dependence;
- **EXPERIMENTAL** — unusual, newly changed or incompletely modelled interaction.

The UI must distinguish “calculated” from “inferred”.

## Expert benchmark

Endgame Build Doctor is not considered expert-ready because it can reproduce PoB outputs. It must pass a review corpus.

Benchmark construction should include:

1. healthy reference builds across the required coverage dimensions;
2. progression/investment variants;
3. deliberately broken variants;
4. content-specific scenarios;
5. expected diagnoses and unacceptable recommendations reviewed against strong community expertise and deterministic calculations.

Negative mutations should include examples such as:

- break a CoC/trigger breakpoint;
- remove an enabling unique/jewel;
- lose a critical support or gem level;
- create an attribute/reservation failure;
- overcap an already-saturated scaling axis while starving another;
- remove recovery while leaving headline EHP apparently high;
- break suppression/block/ailment immunity;
- swap a stat that appears offensive but is dead for the archetype;
- create a high-PoB-peak/low-real-uptime configuration;
- replace a mapping-oriented mechanic with a bossing-oriented one and vice versa.

Success is measured by whether ExileQuesting identifies the important failure and proposes a valid transition for the right reason, not by matching one human's exact item choice.

## Research loop

Research is a permanent product subsystem:

1. discover/update sources;
2. normalize provenance;
3. extract candidate mechanic assertions and build cases;
4. corroborate against PoB/GGG/other experts;
5. run corpus coverage audit;
6. add or update benchmark cases;
7. run calculation/diagnosis regressions;
8. promote reviewed knowledge into production only after validation.

Upstream/source monitors should create review signals, never silently rewrite the expert model.

## Immediate implementation sequence

1. Introduce a typed source/corpus/assertion schema and coverage audit.
2. Build a current + historical source registry and begin accumulating public/contributed build cases well beyond the old 200-PoB idea.
3. Spike a pinned headless PoB worker and prove output parity on representative builds.
4. Add mutation/sensitivity experiments and breakpoint-aware result types.
5. Add mechanic graph extraction and Configuration Doctor.
6. Add content profiles and whole-build transition optimisation.
7. Layer Crafting Coach and supported economy data onto optimiser targets.
8. Benchmark continuously against diverse expert-reviewed build cases before presenting high-confidence endgame recommendations.
