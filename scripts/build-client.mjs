#!/usr/bin/env node
/**
 * Builds `client.js` — the one Client bundle this package ships.
 *
 * DSH loads exactly one Client bundle per package (the `./client` export), and a
 * bundle may register more than one module factory: that is how the platform
 * ships batched packages, and `client-modules` keys factories by the `id` passed
 * to `window.__ModuleLoader__.load`. So the frozen Codex UI bundle and this
 * package's own module are concatenated into a single file:
 *
 *     client.js = banner + vendor/codex-ui/client.js + src/client.js
 *
 * The vendored bundle registers itself as `@michengai/dsh-codex-ui`; the module
 * after it registers as `dsh-codex-session-deletetool` and materializes the
 * former with a plain `require('@michengai/dsh-codex-ui')`, then hands it the
 * same Client context in `apply`. The result is the 1.1.49 sidebar and this
 * package's delete feature in one plugin, with no dependency on the upstream
 * package at install time.
 *
 * Run with `node scripts/build-client.mjs`. The output is committed because the
 * Host serves the file as-is; there is no bundler step at install time.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const vendorPath = join(root, 'vendor', 'codex-ui', 'client.js')
const ownPath = join(root, 'src', 'client.js')
const outPath = join(root, 'client.js')

/**
 * Navigation this profile does not use, removed from the frozen Codex UI.
 *
 * 专家 / 技能 / 连接器 / 定时任务 / IM 助理 are hard-coded buttons in the 扩展管理
 * panel and in the collapsed rail — they are not slot-driven, so the only way to
 * take them out is to drop them from the vendored source. Each entry pins the
 * exact line range it occupies so that a change to the vendored file makes the
 * build fail loudly instead of silently shipping the wrong bundle.
 */
const TRIMS = [
  { note: '扩展管理：专家 / 技能', from: 8301, to: 8316, anchor: 'selectExternalSection(t("sidebar.skills"))', first: '/* @__PURE__ */', last: '}),' },
  { note: '扩展管理：连接器 / 定时任务 / IM 助理', from: 8325, to: 8346, anchor: 'onClick: openImSettings', first: '/* @__PURE__ */', last: '}),' },
  { note: '折叠栏：专家 / 技能', from: 8456, to: 8473, anchor: 'selectExternalSection(t("sidebar.skills"))', first: '/* @__PURE__ */', last: '}),' },
  { note: '折叠栏：连接器 / 定时任务 / IM 助理', from: 8483, to: 8507, anchor: 'onClick: openImSettings', first: '/* @__PURE__ */', last: '}),' },
  { note: '搜索面板：专家 / 技能', from: 7713, to: 7732, anchor: 'selectExternalSection(t("sidebar.skills"))', first: '{', last: '},' },
  { note: '搜索面板：连接器 / 定时任务 / IM 助理', from: 7753, to: 7782, anchor: 'openImSettings', first: '{', last: '},' },
]

/**
 * Drop the line ranges listed in {@link TRIMS}.
 * @param {string} source - the vendored bundle.
 * @returns {string} the bundle without those entries.
 */
function trimUnusedNavigation(source) {
  const lines = source.split('\n')
  const drop = new Set()
  for (const trim of TRIMS) {
    const slice = lines.slice(trim.from - 1, trim.to)
    const first = (slice[0] ?? '').trim()
    const last = (slice[slice.length - 1] ?? '').trim()
    if (!slice.join('\n').includes(trim.anchor)) {
      throw new Error(`${trim.note}: anchor ${trim.anchor} not found in lines ${trim.from}-${trim.to}`)
    }
    if (!first.startsWith(trim.first)) {
      throw new Error(`${trim.note}: line ${trim.from} does not start with ${trim.first}`)
    }
    if (last !== trim.last) {
      throw new Error(`${trim.note}: line ${trim.to} does not end with ${trim.last}`)
    }
    for (let line = trim.from; line <= trim.to; line += 1) drop.add(line)
  }
  return lines.filter((_, index) => !drop.has(index + 1)).join('\n')
}

/**
 * Mark the 最近 section with `data-empty` so the stylesheet can keep it out of
 * the sidebar while it has nothing to list.
 *
 * 最近 only holds sessions that belong to no project. Removing the section
 * outright would hide those sessions for good; hiding it while it is empty
 * leaves the placeholder out of the way and still shows every real row.
 * @param {string} source - the vendored bundle.
 * @returns {string} the bundle with the marker added.
 */
function markEmptyRecentSection(source) {
  const lines = source.split('\n')
  const index = lines.findIndex((line) => line.trim() === '"aria-label": t("workspace.recent"),')
  if (index < 0) throw new Error('最近 section: aria-label anchor not found')
  const line = lines[index]
  const indent = line.slice(0, line.length - line.trimStart().length)
  lines.splice(index, 0, `${indent}"data-empty": recentIds.length === 0,`)
  return lines.join('\n')
}

const vendor = markEmptyRecentSection(trimUnusedNavigation(readFileSync(vendorPath, 'utf8')))
const own = readFileSync(ownPath, 'utf8')

const upstreamVersion = JSON.parse(
  readFileSync(join(root, 'vendor', 'codex-ui', 'upstream-package.json'), 'utf8'),
).version

const banner = `/*!
 * dsh-codex-session-deletetool — generated Client bundle. Do not edit.
 *
 * Built by scripts/build-client.mjs from:
 *   vendor/codex-ui/client.js  — @michengai/dsh-codex-ui ${upstreamVersion} (Apache-2.0, see vendor/codex-ui/NOTICE.md),
 *                                minus the 专家 / 技能 / 连接器 / 定时任务 / IM 助理 navigation
 *   src/client.js              — this package's own Client module
 *
 * The first bundle registers itself as "@michengai/dsh-codex-ui" so that the
 * second one can require it; both are served from this single file because DSH
 * loads one Client bundle per package.
 */`

const parts = [banner, vendor.trimEnd(), '', own.trimEnd(), '']
writeFileSync(outPath, parts.join('\n'), 'utf8')

const bytes = Buffer.byteLength(readFileSync(outPath))
console.log(`built client.js: ${bytes} bytes (vendor ${upstreamVersion} + own module)`)
