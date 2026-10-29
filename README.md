# dsh-codex-session-deletetool

**一个插件，两件事：把 Codex UI 1.1.49 的侧边栏冻结进来，并补上真正能用的「删除会话」。**

界面代码就在这个包里，装好之后不再依赖 `@michengai/dsh-codex-ui`；上游发什么新版都换不掉你现在的样子。
删除也不是归档隐藏——删掉的是会话日志、工程记录与投影缓存。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bundled UI](https://img.shields.io/badge/bundled%20UI-Codex%20UI%201.1.49-blue)](vendor/codex-ui/NOTICE.md)

---

## 界面截图

| 会话菜单里多出「删除会话」 | 有未结束工作时的确认框 | 带家族时按层级勾选 |
|---|---|---|
| ![](docs/screenshots/01-menu.png) | ![](docs/screenshots/02-dialog.png) | ![](docs/screenshots/03-family.png) |

三张图都来自真实运行：菜单里多出的红色「删除会话」是侧边栏自己渲染的，本插件只负责让守卫通过；中间那张展示「还有未结束的工作」的提示与「停止并删除」按钮；右边那张是一个带 3 个后代会话的家族树，子智能体（👤 图标）与派生对话（🔗 图标）按层级缩进、逐项勾选。

---

## 为什么要把界面搬进来

`@michengai/dsh-codex-ui` 用自己的一套侧边栏替换了 DSH 官方侧边栏，会话行上的菜单也是它自己渲染的。这带来两个连锁问题：

**一、删除入口被守卫挡住。** Codex UI 的菜单里其实**有**删除项，但被一个守卫挡着：

```js
// @michengai/dsh-codex-ui
function hasArchiveSessionDelete(value) {
  return value !== null && typeof value === "object"
    && typeof value.deleteSession === "function"
}
canDeleteSession: () => hasArchiveSessionDelete(ctx.get("remote.workspaceRegistry"))
```

源码注释写得很清楚：「永久删除会话由归档管理插件通过 `remote.workspaceRegistry.deleteSession` 提供」。而默认安装里没有任何插件提供这个命名空间，所以那一行永远不出现。

**二、上游一升级，界面就换了。** Codex UI 2.0.x 是一次重写：`dcu-wb-actions`、`dcu-wb-more`、`dcu-wb-context-anchor`、`remote.workspaceRegistry`、`canDeleteSession` 这些钩子在新版里**一个都不剩**（在 2.0.3 的 `lib/client.js` 里逐个搜索，命中数都是 0）。也就是说，任何依赖这些接缝的插件都会被一次更新打成废纸。

所以这个包干脆把 **1.1.49 的客户端整份内置**，自己就是那套界面：上游再怎么改，你看到的还是这一版。

## 这个插件做什么

**1. 内置 1.1.49 的侧边栏（Apache-2.0，见 [`vendor/codex-ui/NOTICE.md`](vendor/codex-ui/NOTICE.md)）。**

`vendor/codex-ui/` 里是原封不动拷过来的 `lib/client.js`、`lib/index.mjs`、`LICENSE` 与 `package.json`。DSH 一个包只加载一个 Client bundle，所以 `scripts/build-client.mjs` 把内置的 bundle 拼在自有模块前面：前者仍然以 `@michengai/dsh-codex-ui` 注册自己，后者用一句 `require('@michengai/dsh-codex-ui')` 把它取出来，在 `apply` 里交给同一个 Client context。结果是**一个包同时跑起 1.1.49 的界面和本插件的删除功能**。

**2. 提供 Codex UI 在等的那个服务。**

在 Client 端 `provide('remote.workspaceRegistry', { deleteSession })`，`hasArchiveSessionDelete` 守卫随之通过，会话菜单重新长出「删除会话」。如果这个命名空间已经被别的插件（例如归档管理插件）以可用的 `deleteSession` 占用，本插件**不会覆盖**它——别人那套更完整，不该被遮蔽。

**3. 把被藏掉的「⋯」按钮放出来。**

会话行本来就有 `⋯` 按钮，但上游自己用样式把它藏了：

```css
.dcu-wb-actions{display:none}                          /* 只在项目标题悬停、或该行菜单已打开时显示 */
.dcu-wb-context-anchor{opacity:0;pointer-events:none}  /* 有盒子，但看不见也点不到 */
```

原状下只能靠**右键**唤出菜单。本插件注入一条优先级更高的规则，悬停会话行时 `⋯` 正常显示、可点击，于是**右键和三个小点两条路都能调出同一个菜单**。

**4. 顺手减掉用不到的导航。**

内置界面里，专家 / 技能 / 连接器 / 定时任务 / IM 助理 这几项是写死的按钮（不走插槽），本包在构建时把它们删掉，折叠栏里的同款按钮一并删除；「最近」分组只在有游离会话时才有内容，空着时连标题一起隐藏（有会话时会照常出现，不会把会话藏起来）。改动点写在 `scripts/build-client.mjs` 里，带行号与锚点校验，内置文件本身没被改过。

## 删除时会发生什么

确认之后，Host 端真的把会话删掉：会话日志目录、工程记录与投影缓存一起移除，并通知前端从列表消失。不是加一个 `archived: true` 标记。

### 确认流程：不多弹一个窗

| 会话状态 | 流程 |
|---|---|
| 普通对话 | 菜单 →「删除会话」→ 侧边栏自己的确认框 → 删除完成 |
| 带着子智能体 / 派生对话 | 确认框先关掉，再弹出**家族树**：按层级列出全部后代会话，逐项勾选，确认按钮上写着「删除 N 个会话」 |
| 还有未结束的工作 | 弹窗顶部标出正在运行的会话，按钮变成「停止并删除」；Host 拒绝时会把最新活动状态回填到弹窗里 |

家族树里每个节点都有图标区分来源：`session`（本对话）、`subagent`（子智能体）、`member`（成员）、`chat`（派生对话）、`linked`（关联）。默认全选，可以只留一部分。

## 安装

### 从插件市场安装（推荐）

在 DSH 的插件市场里搜 `dsh-codex-session-deletetool`。

### 从 GitHub 安装

```text
plugin_manager action=install_bundle target=https://github.com/memoryovo/dsh-codex-session-deletetool
```

或者直接用发布包：

```text
plugin_manager action=install_bundle target=https://github.com/memoryovo/dsh-codex-session-deletetool/releases/download/v0.3.0/dsh-codex-session-deletetool-0.3.0.tgz
```

### 本地目录安装

```text
plugin_manager action=install_bundle target=<本仓库的绝对路径>
```

装好后重开页面即可。

> **先把 `@michengai/dsh-codex-ui` 停用。** 两个插件都会占据 `sidebar` 插槽（都以 priority `-1` 注册），同时启用会互相抢位置。本包自带界面，不再需要它：
>
> ```text
> plugin_manager action=set_bundle target=@michengai/dsh-codex-ui enabled=false
> ```

## 依赖

- **运行时不依赖 `@michengai/dsh-codex-ui`。** 界面代码在 `vendor/` 里，安装时不会去拉上游包。
- **不依赖 `better-dsh-session-deletetool`。** 删除引擎已内置在 `host.js` 里（改编自该项目，MIT）。
- 需要 DSH `>=0.2.0-rc.1 <0.3.0-0`，Node `^22.19.0 || >=24.0.0`。

## 已知限制

- **被 Harness 占用的会话，删掉之后可能回来。** 如果会话此刻还开着（Host 内存里仍有它的 Session/Agent），删除只会清掉磁盘记录；下一次刷新列表时 Host 会把这个仍在内存里的会话重新列出来，之后的任何一次写入还会把它重新落盘。DSH 目前没有向插件开放「释放一个活动会话」的接口，本插件也不打算去拆 Agent 的生命周期。实际表现：关掉该会话所在的窗口/标签，或重启 DSH 之后再删，就是彻底的。
- **内置界面固定在 1.1.49。** 这是刻意的：新版的界面与钩子都变了。想要新版请直接装官方 codex-ui，并停用本插件。
- **`session-title` 子路径插件没有内置。** DSH 一个包只加载一个 Client bundle，同一包再挂一行指不到第二个 bundle；会话标题改用官方提供方，侧边栏本身不受影响。

## 工作原理

```text
浏览器                                    Host
─────────────────────────────────────     ────────────────────────────────
client.js（一个 bundle，两个模块）
├─ @michengai/dsh-codex-ui   ← 内置 1.1.49 侧边栏
│    └─ 会话菜单：canDeleteSession 为真时出现「删除会话」
└─ dsh-codex-session-deletetool
     ├─ provide('remote.workspaceRegistry', { deleteSession })
     ├─ 家族树弹窗（shell.overlay，order 62）
     └─ 样式：放出「⋯」、隐藏空的「最近」

deleteSession(sessionId)  ── POST ──▶  /dsh-codex-session-deletetool/delete
                                       └─ host.js：会话日志 / 工程记录 / 投影缓存
                                          然后 emit('api-session/removed')
```

Host 端只暴露四条同源 HTTP 路由（`inspect`、`delete`、`catalog`、`delete-batch`），都做同源校验；Client 端不直接碰文件系统。

## 目录结构

```text
dsh-codex-session-deletetool/
├─ client.js              # 构建产物：内置 bundle + 自有模块（勿手改）
├─ src/client.js          # 自有 Client 模块：服务、家族树弹窗、样式
├─ host.js                # Host 删除引擎与四条路由
├─ index.js               # Host 入口：自有 apply + 内置 apply
├─ scripts/build-client.mjs   # 拼装 client.js，并应用导航裁剪
├─ vendor/codex-ui/       # Codex UI 1.1.49 原样拷贝 + NOTICE
├─ locale/                # zh / en 插件元数据
├─ docs/screenshots/      # 截图
└─ cordis.patch.yml
```

改完 `src/client.js` 或 `scripts/` 之后跑一次：

```bash
node scripts/build-client.mjs
```

## 致谢

- 界面来自 [@michengai/dsh-codex-ui](https://github.com/michengai/dsh-codex-ui) 1.1.49，Apache-2.0。
- 删除引擎改编自 [better-dsh-session-deletetool](https://github.com/Lzcdebear/better-dsh-session-deletetool)（作者 Lzcdebear，MIT）。
- 家族树、确认框与 Host 路由的取舍沿用该项目的设计。

## License

本仓库自有代码为 MIT，见 [LICENSE](LICENSE)；`vendor/codex-ui/` 为 Apache-2.0，见 [vendor/codex-ui/LICENSE](vendor/codex-ui/LICENSE)。
