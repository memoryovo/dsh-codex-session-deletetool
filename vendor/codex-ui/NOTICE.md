# Bundled third-party code

## @michengai/dsh-codex-ui 1.1.49

- Upstream: <https://github.com/michengai/dsh-codex-ui>
- Version frozen here: **1.1.49** (the build this package's sidebar integration was
  written against; the 2.0.x line rewrote the sidebar and dropped every hook the
  delete feature needs).
- License: Apache License 2.0 — the full text is `LICENSE` in this directory.
- Files copied verbatim from the published package:

  | this repo | upstream |
  | --- | --- |
  | `vendor/codex-ui/client.js` | `lib/client.js` |
  | `vendor/codex-ui/host.mjs` | `lib/index.mjs` |
  | `vendor/codex-ui/LICENSE` | `LICENSE` |
  | `vendor/codex-ui/upstream-package.json` | `package.json` (unmodified, for provenance) |

- `scripts/build-client.mjs` concatenates `vendor/codex-ui/client.js` in front of
  this package's own `src/client.js` to produce the shipped `client.js`; the
  vendored file itself is never edited.
- `index.js` re-exports the vendored Host half next to this package's own Host
  half, so both Client halves always find the routes they expect.

## Changes made to the bundled code

The vendored files on disk stay byte-identical to the published 1.1.49 package.
The shipped bundle differs from upstream in exactly two ways, both applied by
`scripts/build-client.mjs` and both reversible by deleting the corresponding
step from that script:

1. **Unused navigation removed.** 专家 / 技能 / 连接器 / 定时任务 / IM 助理 are
   hard-coded buttons in the 扩展管理 panel and in the collapsed rail, not
   slot-driven, so the only way to take them out is to drop them. The build
   deletes those JSX entries (lines 8301–8316, 8325–8346, 8456–8473, 8483–8507
   of the vendored file, pinned by range and anchored by a text check that fails
   the build if the file ever shifts).
2. **The empty 最近 section is marked, not deleted.** 最近 only lists sessions
   that belong to no project; the build adds `data-empty` to that section and
   this package's stylesheet hides it while it holds no row, so an empty
   placeholder stays out of the sidebar without ever hiding a real session.

Everything else this repository adds lives in `src/`, `host.js`, `index.js` and
`scripts/`, and reaches the frozen UI only through its public seams: the
`remote.workspaceRegistry.deleteSession` Client service it probes for, and a
small style override that un-hides the per-session `⋯` button.

## Not bundled

The upstream `@michengai/dsh-codex-ui/session-title` sub-path plugin is not
included. DSH resolves one Client bundle per package, so a second row pointing at
the same package could not load a separate bundle; session titles therefore come
from the official provider. The sidebar itself is unaffected.

## This package's own code

MIT — see `LICENSE` at the repository root. The Host delete engine in `host.js`
is derived from `better-dsh-session-deletetool` (MIT, © its author) and carries
its own attribution header.
