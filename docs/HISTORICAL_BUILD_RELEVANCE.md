# Historical Build Relevance Policy

Historical build research exists to improve ExileQuesting's understanding of mechanics that remain useful in the current game. It is not an archive of every build that has ever existed.

## Core rule

A historical build is eligible only when it can teach ExileQuesting something that is still mechanically relevant to the current Path of Exile patch.

Old numerical values, removed gems, removed items, retired ascendancy effects, deleted modifiers, obsolete passive-tree interactions and other dead dependencies must never be treated as current build advice.

## Eligibility classes

### 1. Current-direct

The old archetype still exists substantially as it did historically. The historical case may be useful for progression patterns, mechanic interactions, content trade-offs or failure modes, but all current recommendations must be recalculated against current data.

### 2. Current-adapted

The archetype still exists, but one or more historical implementation details have changed. Examples include:

- a removed support gem replaced by a current support;
- a deleted unique replaced by a current enabling item;
- an ascendancy or passive interaction reworked while the underlying archetype remains viable;
- an old skill setup replaced by a modern transfigured gem or different support package;
- a historical build concept that now reaches the same mechanic through a different route.

These cases are valuable only after the current implementation is identified. The old setup itself is not a recommendation.

### 3. Mechanic-reference-only

The exact historical build no longer exists, but one of its mechanical lessons still does. Examples include trigger breakpoint behaviour, transition-package dependency, resource balancing, ramp/uptime trade-offs, recovery failure modes or an interaction pattern that is still present elsewhere in the current game.

Such a case may inform tests or mechanic assertions, but must not appear to users as a current build template.

### Rejected / obsolete

A historical case is excluded when its useful behaviour depends on mechanics that no longer have a meaningful current equivalent. This includes builds whose identity or conclusions rely on removed gems/items/modifiers/keystones with no modern analogue.

Obsolete cases may be noted during research, but they do not enter the production recommendation corpus and do not count toward coverage targets.

## Current-patch validation

Before a historical case is promoted into the corpus, research must answer:

1. Does the archetype or mechanic still exist in the current patch?
2. Which historical dependencies were removed or materially changed?
3. What is the current equivalent, if any?
4. Does current Path of Building/game data reproduce the claimed interaction?
5. Are the historical progression lesson and trade-offs still directionally valid?
6. Is the case safe to expose as a current build, or should it remain mechanic-reference-only?

If those questions cannot be answered confidently, the historical case stays research-only.

## Skill gems and items

Historical skill-gem links and item lists are never grandfathered into current knowledge merely because the build name still exists.

If an old build used a removed gem, removed item or retired interaction, ExileQuesting must map the archetype to its current implementation before using it for current recommendations. The historical source can still explain why the archetype evolved, which dependency was replaced, and what invariant survived the change.

Example:

- old build: skill A + removed support X + removed enabling item Y;
- current build: skill A or its modern replacement + support Z + current enabling item Q;
- retained knowledge: the archetype's underlying scaling/trigger/resource/defensive relationship;
- discarded knowledge: support X, item Y, their old numerical values and any obsolete breakpoint tied specifically to them.

## Historical value is about invariants

The most useful historical knowledge is often an invariant rather than a loadout:

- do not transition to crit before the build has enough base crit;
- do not cross a trigger-rate breakpoint without matching cooldown recovery;
- do not equip one half of a defensive/offensive package before the other half is ready;
- do not judge a ramping build by peak DPS alone;
- do not spend heavily on an already-saturated scaling axis while another required axis is starved;
- do not assume a mapping specialist is automatically a strong Uber build.

If the invariant still applies under current mechanics, the historical case remains valuable even when the exact gems or items changed.

## Patch handling

Every historical source retains its original patch metadata. Any current adaptation must also record the current patch used for validation.

Historical values are evidence about the historical state, not current truth. Current recommendations must be derived from current game data, current PoB calculations and currently valid expert material.

## Coverage accounting

Corpus coverage counts should distinguish current-direct, current-adapted and mechanic-reference-only cases. Obsolete/rejected cases do not count toward the 2,000+ build-profile or 5,000+ build-state targets.

This prevents corpus size from being inflated by dead builds that no longer help ExileQuesting make correct decisions today.
