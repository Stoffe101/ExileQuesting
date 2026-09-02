# Personal route analytics

ExileQuesting's campaign timer also records a bounded local trace of area visits so a completed run can explain where time was spent without reading process memory, sending gameplay input, or requiring an online account.

## What is recorded

While the run timer is active, a new visit begins when Client.txt reports a different internal area ID. Each visit stores only:

- internal area ID;
- optional display name/Act context when available;
- entry timestamp;
- active duration;
- whether the area is a town;
- whether the same area was already visited earlier in that run.

Duplicate events for the same current area do not create extra visits.

The trace is bounded to 800 visits per run and the normal run history remains bounded to 20 completed runs.

## Pause-safe timing

Visit time is accumulated only while the run is actively running.

Pausing settles the active visit and town timer. Resuming begins a new active timing segment for the same area without creating a fake revisit. Time spent paused is therefore excluded from:

- total run time;
- town time;
- zone time;
- revisit time.

## Revisit semantics

A revisit means the player entered an area that already appeared earlier in the same run after visiting another area.

A revisit is **not automatically a mistake**. The campaign intentionally routes through some areas more than once. ExileQuesting therefore presents revisit time as a review signal rather than labeling it as an error or guaranteed backtracking.

## Comparisons

When historical visit data exists, ExileQuesting compares the current run's aggregated area time against:

- the previous completed run;
- the previous personal-best reference.

Older `run.json` files that predate visit tracing remain valid. They load with an empty visit trace, so total-run/PB history still works while per-area comparison simply becomes available after new runs are recorded.

After finishing a run, the just-finished entry is excluded from the `Previous` reference. This prevents the dashboard from comparing a run against itself.

## Coaching signals

The dashboard can surface bounded, conservative signals such as:

- biggest comparable zone regression versus the previous run;
- accumulated revisit time;
- unusually large town-time share;
- a new personal best;
- clean routing when a sufficiently long trace has no non-town revisits.

Slow-zone and revisit coaching intentionally avoids pretending every delay has one known cause. The purpose is to tell the player where to review their run, not to fabricate certainty from timing alone.

## Privacy and gameplay boundary

Route analytics is local-only. It is derived from the same user-configured Client.txt observation and run state already used by campaign tracking.

It does not:

- inspect Path of Exile process memory;
- read arbitrary game files;
- automate clicks or key presses;
- send gameplay input;
- upload run history to a remote service.
