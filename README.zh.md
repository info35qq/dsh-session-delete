# dsh-session-delete

[English](README.md) | 中文

一个 DeepSeek Harness（DSH）插件：在会话行的 `⋯` 菜单里加一项 **删除该会话…**，把**已归档**会话的日志文件从磁盘上真正删掉。

DSH 本身刻意不提供删除会话的能力——会话可以归档，但永远不会被删除。归档只是把行藏起来、并拦掉后续的模型步骤，文件仍然留在磁盘上。这个插件补的正是唯一安全的那个场景：你已经归档、确定不需要的会话。

## 行为

- 菜单项出现在会话行 `⋯` 菜单中（复用内置的 `sidebar.workspaces.session.menu.item` 槽位），位于**归档会话**上方。
- 第一次点击后，该项变为 **再点一次：永久删除**；第二次点击才真正执行。
- 成功：删除该会话的日志产物 → 从归档集合中摘除 → 刷新列表 → 关闭菜单。
- 失败：文件保持不动，菜单项原地显示失败原因，几秒后恢复。

## 安全规则

- 只能删除已归档的会话；可见、运行中或正被打开的会话会被拒绝并说明原因。
- 执行命令的那个会话不能删除自己。
- 目录里只要出现会话日志之外的文件，就整体拒绝删除。
- 已归档会话若仍有常驻 agent 占着写入句柄，**不阻塞删除**：归档已经拦掉了它的后续模型步骤，之后可能刷盘的记录本来就属于被停止的工作。未知写入方占用则仍然拒绝。
- `~/.dsh/attachments` 下的附件保留：它们按内容寻址，可能与其他会话共用。

删除不可撤销，没有回收站。

## 依赖

- DSH `0.2.2-rc.3` 或更高，桌面版或 Web profile 均可。
- 随产品交付的 JSONL 会话持久化后端（`@deepseek-ai/dsh-session-persistence-jsonl`），它会在 `stat` 中给出每个会话的 `location`。其他后端会被拒绝，而不是去猜路径。

## 安装

图形界面：**插件 → 添加插件 → 本地目录**，选择本目录。

在 agent 会话里用 `plugin_manager`：

```text
plugin_manager install_bundle {"target": "<本目录的绝对路径>"}
```

bundle 以 `link:` 方式装入 profile，所以之后修改本目录里的文件，重启应用即可生效。

## 验证

1. 归档一个不再需要的会话（**归档会话**）。
2. 打开它的 `⋯` 菜单，点两次 **删除该会话…**。
3. 行消失，`~/.dsh/sessions/<工作区>/<会话 id>/` 目录也随之消失。

宿主逻辑有离线测试，覆盖正常删除、全部拒绝路径以及常驻 agent 的情况，跑在临时目录上：

```sh
ELECTRON_RUN_AS_NODE=1 "<dsh 的 node>" test/run.mjs
```

## 目录结构

| 路径 | 用途 |
|---|---|
| `index.js` | 宿主插件：注册 `/delete-session <会话 id>`，执行删除 |
| `client.js` | 浏览器插件：`⋯` 菜单项与两步确认 |
| `cordis.patch.yml` | bundle 插入的装载行 |
| `locale/*.json` | 插件管理里的标题、描述、详情页指针 |
| `docs/DETAIL.md` / `docs/DETAIL.zh.md` | 插件管理详情页（英 / 中） |
| `test/run.mjs` | 宿主处理逻辑的离线检查 |

## 限制

- 界面是菜单项而不是对话框；确认方式是“点第二次”。
- 以会话 id 寻址，所以改名后的会话照样删得对，但最终确认里不带会话标题。
- 插件依赖 DSH 内部接口（`ctx.commands`、`ctx.sessionPersistence`、`ctx.workspaceRegistry`、`ctx.agents`，以及 `sidebar.workspaces.session.menu.item` 槽位）。DSH 升级后可能需要跟着调整。
- 仓库未附带许可证文件；如果打算让别人复用，发布前请补一个。