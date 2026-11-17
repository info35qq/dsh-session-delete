# dsh-session-delete

English | [中文](README.zh.md)

A DeepSeek Harness (DSH) plugin that adds **Delete this session…** to a Session's `⋯` menu and permanently deletes an *archived* Session's stored log files.

DSH deliberately has no Session deletion: sessions can be archived but never removed. Archiving only hides the row and refuses further model steps; the files stay on disk. This plugin fills that gap for the one case where deleting is safe — a Session you already archived.

## Behavior

- The menu entry appears in the Session row's `⋯` menu (the legacy `sidebar.workspaces.session.menu.item` slot, above **归档会话**).
- First click turns the entry into **再点一次：永久删除 / Click again to delete permanently**; the second click deletes.
- Success removes the Session's log artifacts, drops the Session from the archived set, refreshes the list, and closes the menu.
- Failure leaves the files untouched and shows the reason inside the menu entry for a few seconds.

## Safety rules

- Only archived Sessions can be deleted; a visible, running, or open Session is refused with an explanation.
- The Session that executes the command cannot delete itself.
- A directory containing anything other than Session log artifacts is never deleted.
- A write claim held by a resident agent of an *archived* Session does not block deletion: the archive gate stops that agent from running another step, so the records it could still flush belong to work archiving already stopped. A claim from an unknown writer is refused.
- Attachments under `~/.dsh/attachments` are kept: they are content-addressed and may be shared with other Sessions.

Deletion cannot be undone. There is no trash.

## Requirements

- DSH `0.2.2-rc.3` or later, desktop or web profile.
- The shipped JSONL Session persistence backend (`@deepseek-ai/dsh-session-persistence-jsonl`), which reports a per-Session `location`. Other backends are refused rather than guessed at.

## Install

From the DSH GUI: **Plugins → Add plugin → local directory**, and pick this folder.

From an agent session with `plugin_manager`:

```text
plugin_manager install_bundle {"target": "<absolute path to this directory>"}
```

The bundle is linked into the profile (`link:`), so editing files here takes effect after an app restart.

## Verify

1. Archive a Session you no longer need (**归档会话**).
2. Open its `⋯` menu and click **删除该会话…** twice.
3. The row disappears and the Session's directory under `~/.dsh/sessions/<workspace>/<session-id>/` is gone.

Host logic has an offline suite that exercises the delete, all refusal paths, and the resident-agent case against a throwaway store:

```sh
ELECTRON_RUN_AS_NODE=1 "<dsh node>" test/run.mjs
```

## Layout

| Path | Purpose |
|---|---|
| `index.js` | Host plugin: registers `/delete-session <session-id>` and performs the deletion |
| `client.js` | Browser plugin: the `⋯` menu entry and its two-step confirmation |
| `cordis.patch.yml` | Loader row inserted by the bundle |
| `locale/*.json` | Plugin Manager title, description, detail document pointer |
| `docs/DETAIL.md` / `docs/DETAIL.zh.md` | Detail page shown in Plugin Manager (English / Chinese) |
| `test/run.mjs` | Offline checks of the Host handler |

## Limitations

- The UI is a menu entry, not a dialog; confirmation is a second click.
- Sessions are matched by Session id, so a renamed Session is still addressed correctly, but the menu entry carries no Session title in its final confirmation.
- The plugin depends on DSH internals (`ctx.commands`, `ctx.sessionPersistence`, `ctx.workspaceRegistry`, `ctx.agents`, the `sidebar.workspaces.session.menu.item` slot). A DSH upgrade may require adjustments.
- No license file is included; add one before publishing if you intend others to reuse this.