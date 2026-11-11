# Timeline freezes the tab ("Page Unresponsive") when filters change while loading

- Fixed: 2026-11-11 22:18:12 CET (+0100)
- Commit before the fix: `e91aa913cb86b43d5f1f3f5a48470e18f1f98d16`

## Symptom

On the deployed site the timeline sometimes hung: the spinner next to the tweet count never
stopped and Chrome offered "Page Unresponsive". It never happened against a local server.

## Root cause

The timeline read its data with `$derived(await Promise.all([listTweets(...), ...]))`, keyed on the
filters in the URL. With Svelte 5.57.3 (the latest release at the time), a second filter change
that arrives while the first one's requests are still in flight leaves the async batch scheduler
flushing forever in a microtask loop, which blocks the main thread.

Reproduced with `node build` behind a proxy that delays `/_app/remote` responses by 0.4–1.2 s:
typing "d", "de", "der" 350 ms apart (each past the 300 ms debounce) froze the tab every time.
A debugger pause showed the stack inside Svelte's `Batch` `flush` → `apply` loop, not in
application code. Without latency the requests finish before the next change, which is why it
only appeared in production. Scrolling, media and the database were not involved.

## Changes

- `src/routes/(app)/+page.svelte` no longer awaits filter-dependent queries in a `$derived`. It
  loads in `afterNavigate` into `$state.raw`, discards responses that a newer load has superseded,
  and shows its own loading and error states.
- The new stats page uses the same pattern for its account filter.
- A search still waiting for its debounce is now included when another filter changes.
- `AGENTS.md` records the rule.

Verified with the same delayed proxy: overlapping searches and filter changes complete and the
tab stays responsive.
