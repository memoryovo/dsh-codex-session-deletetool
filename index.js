/**
 * dsh-codex-session-deletetool — Host half.
 *
 * Two Host halves are mounted from this one row:
 *
 * 1. `./host.js` — this package's delete engine, derived from
 *    better-dsh-session-deletetool (MIT, see host.js): `GET
 *    /dsh-codex-session-deletetool/inspect` reports a Session's state and its
 *    descendant family, `POST /dsh-codex-session-deletetool/delete` removes the
 *    Session and the descendants the user ticked.
 * 2. `./vendor/codex-ui/host.mjs` — the frozen @michengai/dsh-codex-ui 1.1.49
 *    Host half (Apache-2.0, see vendor/codex-ui/NOTICE.md), which serves the
 *    explorer / preferences / session-move / connector routes the frozen
 *    sidebar talks to.
 *
 * Freezing the upstream Host half here is what makes the package self-contained:
 * the Client half carries the 1.1.49 sidebar (see scripts/build-client.mjs) and
 * needs its own Host routes, so the two halves always travel together and an
 * upstream release cannot break the pairing.
 *
 * This row also has to exist in the profile's layer stack so the bundle patch
 * can insert it and the Client manifest of this package is loaded.
 */
import { apply as applyCodexUi, inject as codexUiInject } from './vendor/codex-ui/host.mjs'
import { apply as applyDelete, inject as deleteInject } from './host.js'

/** Everything either half asks for, declared once. */
export const inject = [...new Set([...(deleteInject ?? []), ...(codexUiInject ?? [])])]

export async function apply(ctx) {
  // The delete routes go up first: the frozen sidebar offers its 删除会话 row as
  // soon as the Client provides the service, and that call lands here.
  await applyDelete(ctx)
  await applyCodexUi(ctx)
}
