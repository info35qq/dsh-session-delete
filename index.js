/**
 * Permanently delete an archived Session and the log files it stored.
 *
 * The Session persistence seam has no delete operation, so this plugin removes
 * the Session's own artifact directory after taking (and immediately releasing)
 * the write claim, then drops the Session from the archived set. It refuses
 * anything that is not archived, anything still owned by a live writer, and any
 * directory that holds entries other than Session log artifacts.
 */
import { readdir, rm, rmdir } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'

/** Plugin name shown in diagnostics. */
export const name = 'session-delete'

/** Host services this plugin reads; no Host tool surface is registered. */
export const inject = ['agents', 'commands', 'sessionPersistence', 'workspaceRegistry']

/** Session ids are single path segments; anything else never reaches the file system. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u

/** Log artifacts inside one Session directory: `session.v4.jsonl.zstd`, `session.jsonl`, and kin. */
const SESSION_ARTIFACT = /^session(\.[a-z0-9_-]+)*\.jsonl(\.zstd)?$/u

/** @param {string} text - reason shown to the caller. */
function failure(text) {
  return { kind: 'error', text }
}

/**
 * A directory qualifies as one Session's own directory when it is absolute and
 * has a non-empty leaf name below some parent (never a volume root).
 * @param {string} directory - candidate directory.
 * @returns {boolean} whether deleting the directory cannot be the whole store.
 */
function isSessionDirectory(directory) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) return false
  const leaf = basename(directory)
  return leaf.length > 0 && dirname(directory) !== directory
}

/**
 * Delete every log artifact of one Session, then the now-empty directory.
 * @param {string} directory - the Session's own directory.
 * @returns {Promise<number>} number of removed files.
 */
async function removeSessionArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const foreign = entries.filter(entry => !(entry.isFile() && SESSION_ARTIFACT.test(entry.name)))
  if (foreign.length > 0) {
    throw new Error(`目录中存在非会话日志条目，已取消删除：${foreign.slice(0, 5).map(entry => entry.name).join('、')}`)
  }
  let removed = 0
  for (const entry of entries) {
    await rm(join(directory, entry.name), { force: true })
    removed += 1
  }
  try {
    await rmdir(directory)
  } catch {
    // A directory still reported as busy is left in place; the logs are gone.
  }
  return removed
}

/**
 * Delete one archived Session.
 * @param {object} ctx - Host plugin context.
 * @param {object} invocation - the registry's command invocation.
 * @returns {Promise<object>} command result carrying the outcome text.
 */
async function deleteArchivedSession(ctx, invocation) {
  const id = invocation.rawInput.trim()
  if (id === '') return failure('用法：/delete-session <session-id>')
  if (!SESSION_ID.test(id)) return failure('会话 id 格式不正确，已取消删除。')
  if (id === invocation.agent.id) return failure('不能删除正在执行此操作的会话，请先切换到其他会话。')

  if (!ctx.workspaceRegistry.archivedSessionIds.includes(id)) {
    return failure('只能永久删除已归档的会话。请先在侧栏把该会话归档，然后重试。')
  }

  let handle
  try {
    handle = await ctx.sessionPersistence.open(id, 'write')
  } catch (error) {
    const reason = error?.name ?? ''
    if (!reason.includes('AlreadyOwned')) {
      if (reason.includes('NotFound')) {
        await ctx.workspaceRegistry.unarchiveSession(id)
        return { kind: 'success', text: `会话 ${id} 的日志已不存在，只清除了归档记录。` }
      }
      return failure(`无法打开该会话的存储：${error?.message ?? String(error)}`)
    }
    // A Session that was open in this app run keeps its agent resident after
    // archiving, and that agent still holds the write claim while the archive
    // gate refuses it any further model step. Deleting an archived log is what
    // the user asked for; only an unknown writer is a real reason to stop.
    if (ctx.agents.get(id) === undefined) {
      return failure('该会话被未知的写入方占用，暂时不能删除。请重启 DSH 后重试。')
    }
    handle = undefined
  }
  if (handle !== undefined) {
    try {
      await handle.close()
    } catch {
      // Releasing a fresh claim has nothing to flush; a close failure is not a reason to keep the log.
    }
  }

  const snapshot = await ctx.sessionPersistence.stat(id)
  if (snapshot === undefined) {
    await ctx.workspaceRegistry.unarchiveSession(id)
    return { kind: 'success', text: `会话 ${id} 的日志已不存在，只清除了归档记录。` }
  }

  const location = snapshot.location
  if (location?.kind !== 'jsonl' || typeof location.path !== 'string') {
    return failure('无法定位该会话的日志文件，已取消删除。')
  }
  const directory = dirname(location.path)
  if (!isSessionDirectory(directory)) {
    return failure(`该存储路径不属于单个会话，已取消删除：${directory}`)
  }

  let removed
  try {
    removed = await removeSessionArtifacts(directory)
  } catch (error) {
    return failure(`删除失败：${error?.message ?? String(error)}`)
  }

  await ctx.workspaceRegistry.unarchiveSession(id)
  return { kind: 'success', text: `已永久删除会话 ${id}（${removed} 个文件）。` }
}

/**
 * Register the deletion command for the lifetime of this plugin.
 * @param {object} ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: 'delete-session',
    description: 'Permanently delete an archived Session and the files it stored',
    input: { hint: '<session id>' },
    recordInput: false,
    handler: invocation => deleteArchivedSession(ctx, invocation),
  }), 'session-delete: command')
}