<!--
Title: a Conventional Commit header, e.g. `feat: color the privacy module`.
PRs are squash-merged and the title becomes the commit on main: lowercase,
imperative, 72 characters at most (aim for 50).

Keep every heading. Tick a box only for a command you ran on this branch;
otherwise leave it unticked and say why below it.
-->

## What and why

<!-- What changes and the problem it solves. Link the issue: `Closes #123`. -->

## Checks

- [ ] `pnpm lint && pnpm typecheck`
- [ ] `pnpm check` (`themes/` and `examples/` match the generator, `src/` and the spec)
- [ ] `pnpm verify` (Waybar 0.9.24 and 0.15; CI runs it too)

## Theme

- [ ] `themes/` and `examples/` come from `pnpm generate`, not edits by hand
- [ ] Style changes are in `src/style.css`, with colors only by palette name
- [ ] Selectors and properties work in Waybar 0.9.24 (GTK 3), or the README says which version needs them

## Screenshots

<!-- Before and after for any visible change. `pnpm render` regenerates the
README screenshots. Delete if nothing visible changed. -->
