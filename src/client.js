/**
 * dsh-codex-ui-classic — Client half.
 *
 * Why this package exists
 * -----------------------
 * @michengai/dsh-codex-ui replaces DSH's official sidebar with its own session
 * rows and its own "⋯" menu. That menu is built from `sessionMenuItems()`, and
 * it appends the "删除会话" row only when a service named
 * `remote.workspaceRegistry` exists on the Client and carries a
 * `deleteSession` method (see its `hasArchiveSessionDelete` guard). Nothing in
 * this profile provides that namespace, so the row never appears — which is
 * exactly the report this package answers.
 *
 * better-dsh-session-deletetool, meanwhile, registers its own row in
 * `sidebar.workspaces.session.menu.item`, a slot Codex UI never renders. Its
 * delete engine, however, is Host-side and reachable over same-origin HTTP
 * routes; nothing about it depends on which sidebar is on screen.
 *
 * So this package does one job: it provides `remote.workspaceRegistry` with a
 * `deleteSession(sessionId)` method, and implements that method against a Host
 * half that ships in this same package — the delete engine derived from
 * better-dsh-session-deletetool (see host.js). Codex UI's menu therefore grows
 * its real delete row again, and the delete itself keeps the deletetool's
 * semantics — activity admission, the whole descendant family, workspace
 * detach, projection cache — without requiring that plugin to be installed.
 *
 * The confirmation
 * ----------------
 * Codex UI runs its own confirmation modal before it calls `deleteSession`, so
 * a plain conversation is deleted with exactly one confirmation and no extra
 * window. When the conversation is more than itself — it has subagent sessions,
 * forked conversations, or unfinished work — this package opens the
 * family-tree dialog instead of deleting blind. That dialog is
 * opened only after Codex UI's own modal has closed (the call resolves first),
 * so the two dialogs never stack and never fight over pointer events.
 */
window.__ModuleLoader__.load({
  id: 'dsh-codex-ui-classic',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    /**
     * The Codex UI this package carries inside itself.
     *
     * `scripts/build-client.mjs` concatenates the frozen 1.1.49 bundle
     * (vendor/codex-ui/client.js) in front of this file, so the upstream factory
     * is already registered under its own module id by the time this factory
     * materializes. Requiring it here is the same `require` a separately
     * installed Codex UI would hand out — except the code now travels with this
     * package, so an upstream release can never change the sidebar underfoot.
     */
    const codexUi = require('@michengai/dsh-codex-ui')

    const NS = 'dsh-codex-ui-classic'
    /** The Client service Codex UI probes before it shows its delete row. */
    const SERVICE_KEY = 'remote.workspaceRegistry'
    /** This package's own Host routes (same origin, same page). */
    const DELETE_PATH = '/dsh-codex-ui-classic/delete'
    const INSPECT_PATH = '/dsh-codex-ui-classic/inspect'
    /**
     * How long to wait before opening the family-tree dialog.
     *
     * Codex UI keeps its own confirmation modal mounted until the promise this
     * package returns settles. Resolving first and opening the dialog on the
     * next macrotask is what keeps the two dialogs from being on screen at the
     * same time.
     */
    const DIALOG_DELAY = 60

    const DICT = {
      zh: {
        'dialog.title': '删除会话',
        'dialog.desc': '将永久删除“{title}”：会话日志、工程记录与投影缓存都会被移除，无法撤销。',
        'dialog.untitled': '未命名会话',
        'dialog.cancel': '取消',
        'dialog.checking': '检查中…',
        'dialog.deleting': '正在删除…',
        'dialog.failed': '删除失败',
        'dialog.running': '这个会话还有未结束的工作：',
        'dialog.runningHint': '确认后会先停掉这些工作，再删除这个会话。',
        'dialog.open': '它当前仍被 Harness 占用（可能开在某个窗口或标签里）。删除后它会立刻从列表消失。',
        'dialog.unstored': '这个会话还没有写入磁盘（没有持久化记录），删除功能找不到可移除的文件。先在会话里发一条消息让它落盘，再回来删除。',
        'dialog.unknown': '读不到它的当前状态，仍可直接删除。',
        'dialog.group.subagentsCount': '子智能体（{n}）',
        'dialog.group.derivedCount': '派生对话（{n}）',
        'dialog.mainRow': '本对话：{title}',
        'dialog.truncated': '共 {n} 个，下面只列出前 {shown} 个。',
        'dialog.maxDeletable': '一次最多删除 {max} 个，请分批选择。',
        'dialog.itemRunning': '运行中',
        'dialog.itemOpen': '已打开',
        'dialog.warnings': '下面这些线索没读到，家族可能不完整：',
        'dialog.untitledItem': '未命名',
        'dialog.confirmCount': '删除 {n} 个会话',
        'dialog.confirmStopCount': '停止并删除 {n} 个会话',
        'dialog.family': '这个会话还带着 {n} 个由它产生的会话，勾选后一并删除。',
      },
      en: {
        'dialog.title': 'Delete conversation',
        'dialog.desc': '“{title}” will be deleted permanently: its session log, workspace account and projection cache are removed. This cannot be undone.',
        'dialog.untitled': 'Untitled conversation',
        'dialog.cancel': 'Cancel',
        'dialog.checking': 'Checking…',
        'dialog.deleting': 'Deleting…',
        'dialog.failed': 'Delete failed',
        'dialog.running': 'This conversation still has unfinished work:',
        'dialog.runningHint': 'Confirming stops that work first, then deletes the conversation.',
        'dialog.open': 'The Harness still holds it open (it may be showing in a window or tab). Deleting removes it from the list at once.',
        'dialog.unstored': 'This conversation has not been written to disk yet, so the deleter has no record to remove. Send one message in it first, then delete it again.',
        'dialog.unknown': 'Its current state could not be read; deleting is still possible.',
        'dialog.group.subagentsCount': 'Subagents ({n})',
        'dialog.group.derivedCount': 'Forked conversations ({n})',
        'dialog.mainRow': 'This conversation: {title}',
        'dialog.truncated': 'There are {n}; only the first {shown} are listed.',
        'dialog.maxDeletable': 'At most {max} can be deleted at once — select in batches.',
        'dialog.itemRunning': 'running',
        'dialog.itemOpen': 'open',
        'dialog.warnings': 'These leads could not be read, so the family may be incomplete:',
        'dialog.untitledItem': 'Untitled',
        'dialog.confirmCount': 'Delete {n} conversations',
        'dialog.confirmStopCount': 'Stop and delete {n} conversations',
        'dialog.family': 'This conversation still carries {n} conversation(s) born from it; tick the ones to delete with it.',
      },
    }

    /** Fill one `{name}` placeholder set in a dictionary string. */
    function interpolate(text, params) {
      if (params === undefined) return text
      return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** Translate through the registered locale when there is one, else the zh table. */
    let translate = null
    function t(key, params) {
      if (translate !== null) {
        try {
          const value = translate(key, params)
          if (typeof value === 'string' && value !== '') return value
        } catch {
          // A missing key falls through to the local table below.
        }
      }
      const fallback = DICT.zh[key]
      return typeof fallback === 'string' ? interpolate(fallback, params) : key
    }

    // ---- the Host routes ----------------------------------------------------

    /** One failed Host answer, carrying its stable code and details. */
    function failureOf(payload, response) {
      const error = new Error(payload?.message ?? `HTTP ${response.status}`)
      error.code = payload?.code
      error.activeSessions = Array.isArray(payload?.activeSessions) ? payload.activeSessions : null
      return error
    }

    /** Ask this package's Host what this Session's state actually is. */
    async function inspectSession(sessionId) {
      const response = await fetch(`${INSPECT_PATH}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw failureOf(payload, response)
      return payload
    }

    /** Inspect without failing the flow: an unreadable state is not a refusal. */
    async function inspectQuietly(sessionId) {
      try {
        return await inspectSession(sessionId)
      } catch {
        return null
      }
    }

    /**
     * Ask this package's Host to delete one Session.
     * @param sessionId - the Session the user acted on.
     * @param stop - whether running work may be stopped first.
     * @param descendants - the descendant ids the user ticked; always sent, so
     *   the Host deletes exactly what the dialog showed.
     */
    async function deleteViaHost(sessionId, stop, descendants) {
      const response = await fetch(DELETE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, stop: stop === true, descendants }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) throw failureOf(payload, response)
      return payload
    }

    // ---- reading the Session's own title ------------------------------------

    /**
     * The title Codex UI shows for this Session.
     *
     * `deleteSession(sessionId)` carries no title, so the dialog reads it from
     * the Client's session snapshot — the same place Codex UI reads it from.
     * An unknown Session simply falls back to the untitled label.
     */
    function titleOf(ctx, sessionId) {
      try {
        const sessions = ctx.get('sessions')
        const snapshot = sessions?.list?.getSnapshot?.()
        const entry = snapshot?.byId?.[sessionId]
        const title = entry?.displayTitle ?? entry?.title
        if (typeof title === 'string' && title.trim() !== '') return title
      } catch {
        // A snapshot that cannot answer leaves the title unknown.
      }
      return undefined
    }

    // ---- the dialog queue ---------------------------------------------------

    /**
     * One pending family-tree confirmation.
     *
     * Requests are served one at a time: Codex UI can only start a delete from
     * a menu the user just clicked, but two of them can arrive before the first
     * dialog is answered, and the second must not steal the first one's slot.
     */
    const queue = []
    const listeners = new Set()

    function notify() {
      for (const listener of [...listeners]) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function activeRequest() {
      return queue.length === 0 ? null : queue[0]
    }

    function enqueue(request) {
      queue.push(request)
      notify()
    }

    function settle(request) {
      const index = queue.indexOf(request)
      if (index >= 0) queue.splice(index, 1)
      notify()
    }

    // ---- the family tree ----------------------------------------------------

    /** The activity families reported for one Session, or an empty list. */
    function activityOf(entity) {
      return Array.isArray(entity?.activity) ? entity.activity : []
    }

    /** The tail of an id, so two same-titled Sessions stay distinguishable. */
    function shortId(id) {
      return typeof id === 'string' && id.length > 6 ? `…${id.slice(-6)}` : id
    }

    /** The indent one tree level adds, in CSS pixels. */
    const INDENT = 18

    /** The 16px outline glyphs the family tree draws. */
    const TREE_GLYPHS = {
      session: [
        ['path', { d: 'M3.5 2.5H9L12.5 6v7.5h-9z' }],
        ['path', { d: 'M9 2.5V6h3.5' }],
        ['path', { d: 'M5.75 8.75h4.5' }],
        ['path', { d: 'M5.75 11.25h2.75' }],
      ],
      subagent: [
        ['path', { d: 'M4.5 6.5h7A1.5 1.5 0 0 1 13 8v3.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5V8a1.5 1.5 0 0 1 1.5-1.5z' }],
        ['path', { d: 'M8 6.5V3.75' }],
        ['path', { d: 'M6.5 3.75h3' }],
        ['circle', { cx: 6.35, cy: 9.3, r: 0.7 }],
        ['circle', { cx: 9.65, cy: 9.3, r: 0.7 }],
      ],
      member: [
        ['path', { d: 'M8 7.75A2.125 2.125 0 1 0 8 3.5a2.125 2.125 0 0 0 0 4.25z' }],
        ['path', { d: 'M3.75 13.5c0-2.35 1.9-3.75 4.25-3.75s4.25 1.4 4.25 3.75' }],
      ],
      chat: [
        ['path', { d: 'M14 10a1.33 1.33 0 0 1-1.33 1.33H4.67L2 14V3.33A1.33 1.33 0 0 1 3.33 2h9.34A1.33 1.33 0 0 1 14 3.33z' }],
      ],
      linked: [
        ['path', { d: 'M6.67 8.67a3.33 3.33 0 0 0 5.03.36l2-2a3.33 3.33 0 0 0-4.71-4.71l-1.15 1.14' }],
        ['path', { d: 'M9.33 7.33a3.33 3.33 0 0 0-5.03-.36l-2 2a3.33 3.33 0 0 0 4.71 4.71l1.14-1.14' }],
      ],
    }

    /** One outline glyph, drawn at the given box size. */
    function treeGlyph(name, size) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': true,
        focusable: 'false',
        style: { display: 'block' },
      }, TREE_GLYPHS[name].map((entry, index) => h(entry[0], { key: index, ...entry[1] })))
    }

    /**
     * The family as a forest: one node per Session, its children hanging under it.
     *
     * A row whose `parentId` names another listed row hangs under that row. A
     * row whose parent is not listed — because it is the Session the dialog is
     * about, because it belongs to another Workspace, or because its parent is
     * simply not in this list — is a root. A hand-edited header cycle is cut
     * rather than followed, so the drawing can never recurse forever.
     * @param {object[]} entries - the family rows, in the Host's order.
     * @param {string|null} implicitParent - the id whose children are the roots.
     * @returns {object[]} the roots, each { id, entry, children }.
     */
    function buildForest(entries, implicitParent) {
      const nodes = new Map()
      for (const entry of entries) {
        const id = entry === null || typeof entry !== 'object' ? null : entry.id
        if (typeof id !== 'string' || id === '' || nodes.has(id)) continue
        nodes.set(id, { id, entry, children: [] })
      }
      const parentOf = (node) => {
        const parentId = typeof node.entry.parentId === 'string' ? node.entry.parentId : null
        if (parentId === null || parentId === node.id) return undefined
        return nodes.get(parentId)
      }
      /** Whether hanging one node under another would close a loop. */
      const loops = (node, candidate) => {
        const guard = new Set([node.id])
        let current = candidate
        while (current !== undefined) {
          if (guard.has(current.id)) return true
          guard.add(current.id)
          current = parentOf(current)
        }
        return false
      }
      const roots = []
      for (const node of nodes.values()) {
        const parentId = typeof node.entry.parentId === 'string' ? node.entry.parentId : null
        const parent = parentId === implicitParent ? undefined : parentOf(node)
        if (parent === undefined || loops(node, parent)) roots.push(node)
        else parent.children.push(node)
      }
      return roots
    }

    /**
     * One node's whole subtree, itself first.
     * @param {object} node - a forest node.
     * @returns {string[]} the ids.
     */
    function subtreeIds(node) {
      const ids = []
      const walk = (current) => {
        ids.push(current.id)
        for (const child of current.children) walk(child)
      }
      walk(node)
      return ids
    }

    /**
     * The family tree the dialog draws.
     *
     * One row per Session, and under every row two collapsible blocks: its
     * direct subagents, then its direct forked conversations. A row's checkbox
     * covers that row's whole subtree, and a block's covers every row the block
     * lists; both report the same two states, ticked when everything below them
     * is ticked and mixed when only part of it is.
     */
    function FamilyTree(props) {
      const { items, implicitParent, main, selected, onToggle, collapsed, setCollapsed, disabled, leafName } = props
      const forest = buildForest(items, implicitParent === undefined ? null : implicitParent)

      /** A set of ids read as a checkbox state. */
      const stateOf = (ids) => {
        let on = ids.length > 0
        let some = false
        for (const id of ids) {
          if (selected.has(id)) some = true
          else on = false
        }
        return { on, partial: some && !on }
      }

      /** One checkbox: ticked when every id it covers is ticked, mixed when only some are. */
      const box = (ids) => {
        const state = stateOf(ids)
        return h('input', {
          type: 'checkbox',
          key: 'box',
          className: 'dcsd-check',
          checked: state.on,
          disabled: disabled === true,
          ref: (input) => {
            if (input !== null) input.indeterminate = state.partial
          },
          onChange: () => onToggle(ids, !state.on),
        })
      }

      /** The caret of one row or block, or the empty column a leaf keeps. */
      const caret = (collapseKey, hasChildren, isCollapsed) => (hasChildren
        ? h('button', {
          type: 'button',
          key: 'caret',
          className: 'dcsd-caret',
          'aria-expanded': !isCollapsed,
          onClick: () => setCollapsed((previous) => ({ ...previous, [collapseKey]: !isCollapsed })),
          children: isCollapsed ? '▸' : '▾',
        })
        : h('span', { className: 'dcsd-caret dcsd-caretLeaf', key: 'caret', 'aria-hidden': true }))

      /** The badges one row carries: what that Session is doing right now. */
      const badgesOf = (entry) => {
        const busy = activityOf(entry)
        return [
          ...busy.map((item) => item.label),
          ...(busy.length === 0 && entry.running === true ? [t('dialog.itemRunning')] : []),
          ...(entry.open === true ? [t('dialog.itemOpen')] : []),
        ]
      }

      /** One collapsible block: the direct children of one row that share one kind. */
      const drawBlock = (collapseKey, label, glyphName, members, depth) => {
        const isCollapsed = collapsed[collapseKey] === true
        const ids = members.flatMap((member) => subtreeIds(member))
        return h('div', { className: 'dcsd-block', key: collapseKey }, [
          h('div', {
            className: 'dcsd-node dcsd-nodeBranch',
            key: 'head',
            style: { paddingInlineStart: (depth * INDENT) + 'px' },
          }, [
            caret(collapseKey, true, isCollapsed),
            h('label', { className: 'dcsd-nodeLabel', key: 'label' }, [
              box(ids),
              h('span', { className: 'dcsd-rowIcon', key: 'glyph', children: treeGlyph(glyphName, 14) }),
              h('span', { className: 'dcsd-rowText', key: 'text' }, [
                h('span', { className: 'dcsd-blockTitle', key: 'name', children: label }),
              ]),
            ]),
          ]),
          isCollapsed
            ? null
            : h('div', { className: 'dcsd-children', key: 'rows' }, members.map((member) => drawNode(member, depth + 1, member.id))),
        ])
      }

      /** One Session row, then the blocks holding its own direct children. */
      const drawNode = (node, depth, key) => {
        const entry = node.entry
        const isCollapsed = collapsed[node.id] === true
        const subagents = node.children.filter((child) => child.entry.kind === 'subagent')
        const forks = node.children.filter((child) => child.entry.kind !== 'subagent')
        const hints = badgesOf(entry)
        const glyphName = entry.kind === 'subagent' ? 'member' : entry.kind === 'root' ? 'session' : 'chat'
        return h('div', { className: 'dcsd-branch', key }, [
          h('div', {
            className: 'dcsd-node',
            key: 'row',
            style: { paddingInlineStart: (depth * INDENT) + 'px' },
          }, [
            caret(node.id, node.children.length > 0, isCollapsed),
            h('label', { className: 'dcsd-nodeLabel', key: 'label' }, [
              box(subtreeIds(node)),
              h('span', { className: 'dcsd-rowIcon', key: 'glyph', children: treeGlyph(glyphName, 14) }),
              h('span', { className: 'dcsd-rowText', key: 'text' }, [
                h('span', {
                  className: 'dcsd-rowTitle',
                  key: 'name',
                  children: entry.title === undefined || entry.title === '' ? leafName : entry.title,
                }),
                h('span', { className: 'dcsd-rowId', key: 'id', children: shortId(entry.id) }),
              ]),
            ]),
            hints.length === 0
              ? null
              : h('span', { className: 'dcsd-badge', key: 'badge', children: hints.join(' · ') }),
          ]),
          isCollapsed || node.children.length === 0
            ? null
            : h('div', { className: 'dcsd-children', key: 'children' }, [
              subagents.length === 0
                ? null
                : drawBlock('sub:' + node.id, t('dialog.group.subagentsCount', { n: subagents.length }), 'subagent', subagents, depth + 1),
              forks.length === 0
                ? null
                : drawBlock('fork:' + node.id, t('dialog.group.derivedCount', { n: forks.length }), 'linked', forks, depth + 1),
            ]),
        ])
      }

      const mainIds = items.map((entry) => entry.id)
      const hasMain = main !== null && main !== undefined
      const mainCollapsed = collapsed['__main__'] === true
      return h('div', { className: 'dcsd-tree' }, [
        hasMain
          ? h('div', { className: 'dcsd-node dcsd-nodeMain', key: 'main' }, [
            caret('__main__', forest.length > 0, mainCollapsed),
            h('label', { className: 'dcsd-nodeLabel', key: 'label' }, [
              box(mainIds),
              h('span', { className: 'dcsd-rowIcon', key: 'glyph', children: treeGlyph('session', 14) }),
              h('span', { className: 'dcsd-rowText', key: 'text' }, [
                h('span', {
                  className: 'dcsd-rowTitle dcsd-mainTitle',
                  key: 'name',
                  children: t('dialog.mainRow', { title: main }),
                }),
              ]),
            ]),
          ])
          : null,
        hasMain && mainCollapsed
          ? null
          : forest.map((node) => drawNode(node, hasMain ? 1 : 0, node.id)),
      ])
    }

    // ---- the confirmation dialog -------------------------------------------

    const IDLE = { phase: 'idle', info: null, error: null, stop: false, busy: false }

    /** The `shell.overlay` seat: one family-tree confirmation at a time. */
    function DeleteSessionDialog() {
      const request = useSyncExternalStore(subscribe, activeRequest)
      const [state, setState] = useState(IDLE)
      const [selected, setSelected] = useState(null)
      const [collapsed, setCollapsed] = useState({})
      const dialog = useRef(null)

      const close = useCallback(() => {
        const current = activeRequest()
        setState((previous) => {
          if (previous.busy) return previous
          if (current !== null) settle(current)
          return IDLE
        })
        setSelected(null)
      }, [])

      // Every open re-reads the Host's state: the answer is only true for the
      // moment the dialog opened, and a Session can start working in between.
      // Nobody is selected until that answer arrives, so a Session whose family
      // is still being walked can never be deleted by accident.
      useEffect(() => {
        if (request === null) {
          setState(IDLE)
          setSelected(null)
          return undefined
        }
        let cancelled = false
        setState({ phase: 'checking', info: null, error: null, stop: false, busy: false })
        setSelected(null)
        inspectSession(request.sessionId).then(
          (info) => {
            if (cancelled) return
            const items = Array.isArray(info?.descendants?.items) ? info.descendants.items : []
            setSelected(new Set(items.map((item) => item.id)))
            setState({
              phase: 'ready',
              info,
              error: null,
              // Default to stopping work, but only when something is running.
              stop: activityOf(info).length > 0 || items.some((item) => activityOf(item).length > 0),
              busy: false,
            })
          },
          () => {
            if (!cancelled) setState({ phase: 'ready', info: null, error: null, stop: false, busy: false })
          },
        )
        return () => {
          cancelled = true
        }
      }, [request])

      useEffect(() => {
        if (request === null) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') close()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [request, close])

      useEffect(() => {
        if (request !== null) dialog.current?.focus()
      }, [request])

      if (request === null) return null

      const info = state.info
      const items = Array.isArray(info?.descendants?.items) ? info.descendants.items : []
      const picked = selected ?? new Set(items.map((item) => item.id))
      const selectedCount = items.filter((item) => picked.has(item.id)).length

      const toggleMany = (ids, on) => {
        setSelected(() => {
          const next = new Set(picked)
          for (const id of ids) {
            if (on) next.add(id)
            else next.delete(id)
          }
          return next
        })
      }

      const confirm = () => {
        if (state.busy || state.phase !== 'ready') return
        const chosen = items.filter((item) => picked.has(item.id)).map((item) => item.id)
        setState((previous) => ({ ...previous, busy: true, error: null }))
        deleteViaHost(request.sessionId, state.stop, chosen).then(
          () => {
            settle(request)
            setSelected(null)
            setState(IDLE)
          },
          (reason) => {
            // A Session that started working between the check and the write
            // answers with its activity, so the next press stops it and the rows
            // that are busy say so.
            const active = Array.isArray(reason?.activeSessions) ? reason.activeSessions : null
            setState((previous) => ({
              ...previous,
              busy: false,
              error: reason instanceof Error ? reason.message : String(reason),
              stop: previous.stop || reason?.code === 'session-active' || active !== null,
              info: active === null ? previous.info : mergeActivity(previous.info, active),
            }))
          },
        )
      }

      const title = request.title === undefined || request.title === '' ? t('dialog.untitled') : request.title
      const activity = activityOf(info)
      // Nothing on disk means nothing to remove: the Host answers 404 for this
      // state, so the dialog explains it and holds the confirm button instead.
      const unstored = info !== null && info.stored === false
      const checking = state.phase === 'checking'
      const deletedCount = selectedCount + 1
      const confirmLabel = state.busy || checking
        ? (checking ? t('dialog.checking') : t('dialog.deleting'))
        : state.stop
          ? t('dialog.confirmStopCount', { n: deletedCount })
          : t('dialog.confirmCount', { n: deletedCount })

      return h('div', {
        className: 'dcsd-overlay',
        role: 'presentation',
        onKeyDownCapture: (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        },
      }, [
        h('div', { className: 'dcsd-mask', key: 'mask', 'aria-hidden': true, onClick: close }),
        h('div', {
          className: 'dcsd-dialog',
          key: 'dialog',
          ref: dialog,
          tabIndex: -1,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('dialog.title'),
        }, [
          h('h2', { className: 'dcsd-title', key: 'title', children: t('dialog.title') }),
          h('p', { className: 'dcsd-desc', key: 'desc', children: t('dialog.desc', { title }) }),
          activity.length === 0
            ? null
            : h('div', { className: 'dcsd-note dcsd-warn', key: 'running' }, [
              h('p', { className: 'dcsd-noteTitle', key: 'head', children: t('dialog.running') }),
              h('ul', { className: 'dcsd-list', key: 'list' }, activity.map((entry, index) => {
                const names = Array.isArray(entry.items)
                  ? entry.items.map((item) => (item.label === '' ? item.id : item.label)).filter((name) => name !== '')
                  : []
                return h('li', { key: `${entry.kind}-${index}` }, names.length === 0 ? entry.label : `${entry.label}：${names.join('、')}`)
              })),
              h('p', { className: 'dcsd-noteHint', key: 'hint', children: t('dialog.runningHint') }),
            ]),
          info !== null && info.open === true && activity.length === 0
            ? h('p', { className: 'dcsd-note', key: 'open', children: t('dialog.open') })
            : null,
          unstored
            ? h('p', { className: 'dcsd-note dcsd-warn', key: 'unstored', children: t('dialog.unstored') })
            : null,
          state.phase === 'ready' && info === null
            ? h('p', { className: 'dcsd-note', key: 'unknown', children: t('dialog.unknown') })
            : null,
          items.length === 0
            ? null
            : h('p', { className: 'dcsd-note', key: 'family', children: t('dialog.family', { n: items.length }) }),
          h(FamilyTree, {
            key: 'tree',
            items,
            implicitParent: request.sessionId,
            main: title,
            selected: picked,
            onToggle: toggleMany,
            collapsed,
            setCollapsed,
            disabled: state.busy,
            leafName: t('dialog.untitledItem'),
          }),
          info?.descendants?.truncated === true
            ? h('p', {
              className: 'dcsd-note dcsd-hint',
              key: 'truncated',
              children: t('dialog.truncated', { n: info.descendants.count, shown: items.length }),
            })
            : null,
          typeof info?.descendants?.maxDeletable === 'number' && info.descendants.count > info.descendants.maxDeletable
            ? h('p', {
              className: 'dcsd-note dcsd-hint',
              key: 'cap',
              children: t('dialog.maxDeletable', { max: info.descendants.maxDeletable }),
            })
            : null,
          // A source that failed leaves rows missing, which no row can say for
          // itself: this is where the family's own report of that lands.
          ...(Array.isArray(info?.warnings) && info.warnings.length > 0
            ? [h('div', { className: 'dcsd-note dcsd-warn', key: 'warnings' }, [
              h('p', { className: 'dcsd-noteTitle', key: 'head', children: t('dialog.warnings') }),
              h('ul', { className: 'dcsd-list', key: 'list' }, info.warnings.map((warning, index) => h('li', { key: index }, String(warning)))),
            ])]
            : []),
          state.error === null
            ? null
            : h('p', { className: 'dcsd-error', key: 'error', children: `${t('dialog.failed')}：${state.error}` }),
          h('div', { className: 'dcsd-footer', key: 'footer' }, [
            h('button', {
              type: 'button',
              className: 'dcsd-button dcsd-outline',
              key: 'cancel',
              disabled: state.busy,
              onClick: close,
              children: t('dialog.cancel'),
            }),
            h('button', {
              type: 'button',
              className: 'dcsd-button dcsd-outline dcsd-dangerText',
              key: 'confirm',
              disabled: state.busy || checking || unstored,
              onClick: confirm,
              children: confirmLabel,
            }),
          ]),
        ]),
      ])
    }

    /**
     * Fold the per-Session activity a refusal reported back into the state the
     * dialog is showing, so the rows that are busy say so on the next render.
     */
    function mergeActivity(info, activeSessions) {
      if (info === null || info === undefined) return info
      const byId = new Map()
      for (const entry of activeSessions) {
        if (typeof entry?.sessionId !== 'string') continue
        byId.set(entry.sessionId, Array.isArray(entry.activity) ? entry.activity : [])
      }
      const descendants = info.descendants === undefined
        ? undefined
        : {
          ...info.descendants,
          items: Array.isArray(info.descendants.items)
            ? info.descendants.items.map((item) => (byId.has(item.id) ? { ...item, activity: byId.get(item.id) } : item))
            : info.descendants.items,
        }
      return {
        ...info,
        activity: byId.get(info.sessionId) ?? activityOf(info),
        ...(descendants === undefined ? {} : { descendants }),
      }
    }

    // ---- styles -------------------------------------------------------------

    const CSS = `
.dcsd-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.dcsd-mask{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.dcsd-dialog{position:relative;z-index:1;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;width:min(420px,100%);max-height:100%;overflow:auto;padding:22px 24px 20px;border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-alias-bg-layer-2,#1b1d21);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.34))}
.dcsd-dialog:focus{outline:none}
.dcsd-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary,#e6e6e6)}
.dcsd-desc{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary,#a8adb7);word-break:break-word}
.dcsd-note{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#a8adb7);word-break:break-word}
.dcsd-warn{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:var(--dsw-radius-md,8px);border:.5px solid var(--dsw-alias-state-warn-primary,#d9a03a);color:var(--dsw-alias-label-primary,#e6e6e6)}
.dcsd-noteTitle{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-state-warn-primary,#d9a03a)}
.dcsd-noteHint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#a8adb7)}
.dcsd-list{margin:0;padding-inline-start:18px;font-size:13px;line-height:20px}
.dcsd-tree{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-block:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}
.dcsd-check{flex:none;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-error-primary,#e5484d);cursor:pointer}
.dcsd-badge{flex:none;font-size:11px;line-height:16px;padding:1px 6px;border-radius:999px;border:.5px solid var(--dsw-alias-state-warn-primary,#d9a03a);color:var(--dsw-alias-state-warn-primary,#d9a03a)}
.dcsd-group{display:flex;flex-direction:column}
.dcsd-caret{flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,#a8adb7);cursor:pointer;font:inherit;font-size:11px;line-height:1}
.dcsd-caret:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dcsd-branch{display:flex;flex-direction:column}
.dcsd-node{position:relative;box-sizing:border-box;display:flex;align-items:center;gap:2px;min-height:28px}
.dcsd-nodeLabel{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}
.dcsd-nodeLabel:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dcsd-nodeMain>.dcsd-nodeLabel{font-weight:500}
.dcsd-nodeBranch>.dcsd-nodeLabel{color:var(--dsw-alias-label-secondary,#a8adb7);font-weight:500}
.dcsd-rowIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-tertiary,#8b909a)}
.dcsd-nodeMain .dcsd-rowIcon{color:var(--dsw-alias-label-secondary,#a8adb7)}
.dcsd-rowText{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#e6e6e6)}
.dcsd-rowTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcsd-rowId{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#a8adb7)}
.dcsd-mainTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcsd-blockTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcsd-caretLeaf{cursor:default}
.dcsd-caretLeaf:hover{background:transparent}
.dcsd-children{display:flex;flex-direction:column}
.dcsd-hint{margin:4px 0 0;font-size:12px;line-height:18px}
.dcsd-error{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary,#e5484d);word-break:break-word}
.dcsd-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:8px}
.dcsd-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,#e6e6e6);background:transparent}
.dcsd-button:disabled{cursor:not-allowed;opacity:.4}
.dcsd-outline{border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32))}
.dcsd-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dcsd-dangerText{color:var(--dsw-alias-state-error-primary,#e5484d)}

/* Codex UI deliberately makes a session row's ⋯ button unusable: it ships
   \`.dcu-wb-actions{display:none}\` (revealed only for a project header on hover,
   or a row whose menu is already open) AND
   \`.dcu-wb-context-anchor{opacity:0;pointer-events:none}\` — so the button has a
   box but cannot be seen or clicked, leaving right-click as the only way in.
   Restore both, with a higher-specificity selector so the order of the injected
   stylesheets cannot matter, and the menu (which now carries 删除会话) opens
   from the three dots as well. */
.dcu-wb-session:hover .dcu-wb-actions,
.dcu-wb-session:focus-within .dcu-wb-actions,
.dcu-wb-session.dcu-wb-menu-open .dcu-wb-actions{display:flex}
.dcu-wb-session .dcu-wb-actions .dcu-wb-more.dcu-wb-context-anchor{opacity:1;pointer-events:auto}

/* 最近 only lists sessions that belong to no project. While it has none it
   renders just an empty 无聊天 placeholder, so the build marks the section and
   it stays out of the sidebar until it actually holds a row. */
.dcu-wb-section[data-empty="true"]{display:none}
`

    /** Mount this package's stylesheet with its component. */
    function Styles() {
      return h('style', { 'data-dsh-plugin': NS, children: CSS })
    }

    /** The dialog, wrapped so the stylesheet travels with it. */
    function WithStyles(Component) {
      function StyledComponent(props) {
        return h(React.Fragment, null, h(Styles, { key: 'style' }), h(Component, { ...props, key: 'body' }))
      }
      StyledComponent.displayName = `CodexSessionDeletetool(${Component.name})`
      return StyledComponent
    }

    // ---- the service Codex UI probes ---------------------------------------

    /**
     * The service Codex UI calls once the user confirmed its own modal.
     *
     * Contract (from Codex UI's own client):
     *   `deleteSession(sessionId): Promise<{ ok: true } | { ok: false, error? }>`
     *
     * A plain conversation is deleted here and now, so Codex UI's modal keeps
     * its busy state until the Host has really removed it and a failure is
     * reported back into that modal. A conversation that carries a family (or
     * unfinished work) resolves at once — which closes Codex UI's modal — and
     * then opens the family-tree dialog, so the user still chooses what goes.
     */
    function createRegistry(ctx) {
      const registry = {
        /**
         * Permanently delete one conversation.
         * @param {string} sessionId - the Session Codex UI's row addressed.
         * @returns {Promise<{ok: boolean, error?: Error}>} the Remote result.
         */
        async deleteSession(sessionId) {
          if (typeof sessionId !== 'string' || sessionId === '') {
            return { ok: false, error: new Error('sessionId is missing or malformed') }
          }
          const info = await inspectQuietly(sessionId)
          const items = Array.isArray(info?.descendants?.items) ? info.descendants.items : []
          // `stored === false` is the one state the Host refuses outright: there
          // is no artifact to remove yet, so deleting would answer 404. That
          // needs saying in the dialog, not a generic "try again later".
          const unstored = info !== null && info.stored === false
          const carriesFamily = items.length > 0
            || activityOf(info).length > 0
            || unstored

          if (!carriesFamily) {
            try {
              await deleteViaHost(sessionId, true, undefined)
              return { ok: true }
            } catch (error) {
              return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
            }
          }

          // Resolve first: Codex UI closes its own confirmation modal only after
          // this promise settles, and two dialogs must not share the screen.
          const title = titleOf(ctx, sessionId)
          setTimeout(() => {
            enqueue({ sessionId, title, resolve: () => {} })
          }, DIALOG_DELAY)
          return { ok: true }
        },
      }
      return registry
    }

    return {
      // The union of both halves: this package's delete dialog needs `slots`,
      // and the frozen Codex UI needs the rest before it may render.
      inject: ['slots', 'sessions', 'workspaces', 'layout', 'locale', 'connection', 'inputTriggers', 'conversation'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined && typeof locale.register === 'function' && typeof locale.bind === 'function') {
          ctx.effect(() => locale.register(NS, { zh: DICT.zh, en: DICT.en }), `${NS}: locale`)
          translate = locale.bind(NS)
        }

        // Codex UI asks the Client for this service before it shows its own
        // "删除会话" row. Provide it unless a real Remote namespace (the archive
        // manager plugin) already owns the name: that one would be better than
        // this one and must not be shadowed.
        const existing = typeof ctx.get === 'function' ? ctx.get(SERVICE_KEY) : undefined
        const alreadyUsable = existing !== null
          && typeof existing === 'object'
          && typeof existing.deleteSession === 'function'
        if (!alreadyUsable) {
          const registry = createRegistry(ctx)
          if (typeof ctx.provide === 'function') {
            ctx.provide(SERVICE_KEY, registry)
          } else if (ctx.reflect !== undefined && typeof ctx.reflect.provide === 'function') {
            ctx.reflect.provide(SERVICE_KEY, registry)
          } else {
            console.error(`[${NS}] this Client exposes no ctx.provide, so ${SERVICE_KEY} cannot be provided`)
          }
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: `${NS}-dialog`, order: 62, locale: NS },
            WithStyles(DeleteSessionDialog),
          ),
        )

        // The frozen Codex UI goes last on purpose: by now this package's delete
        // service is already provided, so the very first sidebar render already
        // offers 删除会话 instead of needing a re-render to notice it.
        codexUi.apply(ctx)
      },
    }
  },
})
