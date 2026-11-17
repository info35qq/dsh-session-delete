# Delete archived sessions

Adds one entry to the Session row's **⋯** menu: **删除该会话… / Delete this session…**. After a second confirming click it permanently removes the archived Session's stored log files from disk and drops the Session from the archived set.

## Usage

1. Archive the Session first (row menu → **归档会话**). Archiving is the reversible step and stays available.
2. Open the archived row's **⋯** menu and choose **删除该会话…**.
3. Click the same entry again when it reads **再点一次：永久删除**.
4. The row disappears. The files are gone.

The deletion runs through the Host, from whichever Session you have open, because an archived Session owns no live agent. If no Session is open, or the target is the open one, the menu reports why it stopped.

## What it removes

- Every log artifact in the Session's own directory, for example `~/.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`.
- The Session's entry in the archived set, so no dangling archive record survives.

## What it keeps

- **Attachments** under `~/.dsh/attachments` stay: they are content-addressed and may be shared with other Sessions.
- Search-index rows and projection caches are left to their own caches; they drop the Session when it stops existing.

## Limits

- Only **archived** Sessions can be deleted. A live, running, or currently open Session refuses with an explanation instead of deleting.
- The Session whose agent runs the command cannot delete itself.
- A Session that was opened during the current app run keeps its agent resident after archiving, and that agent still holds the write claim. The deletion proceeds anyway: the archive gate stops the agent from running another step, so the only records it could still flush belong to work that archiving already stopped. A write claim held by anything other than a live agent of that Session is refused, with a restart as the suggested cure.
- A directory holding anything other than Session log artifacts is never deleted; the command reports the unexpected entries instead.
- Deleting cannot be undone. There is no trash and no restore path beyond a backup of the profile directory.
- The plugin relies on the JSONL persistence backend's `location` field. A different backend that does not report a per-Session location is refused rather than guessed at.