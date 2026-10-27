/**
 * dsh-codex-session-deletetool — Host half.
 *
 * Registers this package's own delete engine on the Host web server, the same
 * one better-dsh-session-deletetool ships (derived from it, MIT, see host.js):
 * `GET /dsh-codex-session-deletetool/inspect` reports a Session's state and its
 * descendant family, `POST /dsh-codex-session-deletetool/delete` removes the
 * Session and the descendants the user ticked.
 *
 * The Client half of this package provides `remote.workspaceRegistry` — the
 * service @michengai/dsh-codex-ui probes before it shows its own 删除会话 row —
 * and implements `deleteSession(sessionId)` by calling these two routes. Keeping
 * the engine here means the feature works whether or not
 * better-dsh-session-deletetool is installed, and the route prefix is this
 * package's own, so enabling both plugins at once does not collide.
 *
 * This row also has to exist in the profile's layer stack so the bundle patch
 * can insert it and the Client manifest of this package is loaded.
 */
export { apply, inject } from './host.js'
