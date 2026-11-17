/**
 * Exercise the Host deletion handler against a throwaway store.
 * Run: ELECTRON_RUN_AS_NODE=1 <node> test/run.mjs
 */
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import { apply } from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'session-delete-test-'))
const workspaceDir = join(root, 'sessions', '--C-ws--')

/** Build a fake Host context around one stored Session. */
async function fixture(id, { archived = true, extraFile = undefined, writeError = undefined, resident = false } = {}) {
  const sessionDir = join(workspaceDir, id)
  await mkdir(sessionDir, { recursive: true })
  await writeFile(join(sessionDir, 'session.v3.jsonl.zstd'), 'old')
  await writeFile(join(sessionDir, 'session.v4.jsonl.zstd'), 'current')
  if (extraFile !== undefined) await writeFile(join(sessionDir, extraFile), 'keep me')

  const calls = { unarchived: [], registered: undefined, closed: 0 }
  const ctx = {
    effect: (fn) => { fn() },
    agents: { get: (target) => (resident && target === id ? { id: target } : undefined) },
    commands: { register: (definition) => { calls.registered = definition; return () => {} } },
    sessionPersistence: {
      open: async () => {
        if (writeError !== undefined) throw writeError
        return { close: async () => { calls.closed += 1 } }
      },
      stat: async () => ({
        header: {},
        revision: 'r1',
        sizeBytes: 3,
        location: { kind: 'jsonl', path: join(sessionDir, 'session.v4.jsonl.zstd') },
      }),
    },
    workspaceRegistry: {
      archivedSessionIds: archived ? [id] : [],
      unarchiveSession: async (target) => { calls.unarchived.push(target) },
    },
  }
  apply(ctx)
  assert.ok(calls.registered !== undefined, 'command registered')
  return { ctx, calls, definition: calls.registered, sessionDir }
}

const owned = Object.assign(new Error('already owned'), { name: 'SessionAlreadyOwnedError' })

const results = []
function report(name, passed, detail = '') {
  results.push({ name, passed, detail })
  if (!passed) process.exitCode = 1
}

// 1. Deletes an archived Session's artifacts and its archive record.
{
  const id = 'session-11111111-1111-4111-8111-111111111111'
  const { definition, calls, sessionDir } = await fixture(id)
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id: 'session-other' }, attachments: [], signal: undefined })
  const entries = await readdir(sessionDir).catch(() => [])
  report('archived session deleted', result.kind === 'success' && entries.length === 0 && calls.unarchived[0] === id && calls.closed === 1, JSON.stringify(result))
}

// 2. Refuses a Session that is not archived.
{
  const id = 'session-22222222-2222-4222-8222-222222222222'
  const { definition, sessionDir } = await fixture(id, { archived: false })
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id: 'session-other' } })
  const entries = await readdir(sessionDir)
  report('refuses unarchived session', result.kind === 'error' && entries.length === 2, result.text)
}

// 3. Refuses a Session whose agent issued the command.
{
  const id = 'session-33333333-3333-4333-8333-333333333333'
  const { definition, sessionDir } = await fixture(id)
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id } })
  const entries = await readdir(sessionDir)
  report('refuses self-delete', result.kind === 'error' && entries.length === 2, result.text)
}

// 4. Never deletes a directory holding foreign entries.
{
  const id = 'session-44444444-4444-4444-8444-444444444444'
  const { definition, sessionDir } = await fixture(id, { extraFile: 'notes.txt' })
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id: 'session-other' } })
  const entries = await readdir(sessionDir)
  report('refuses foreign entries', result.kind === 'error' && entries.includes('notes.txt'), result.text)
}

// 5. Rejects path-ish input before touching the file system.
{
  const { definition } = await fixture('session-55555555-5555-4555-8555-555555555555')
  const result = await definition.handler({ rawInput: ' ../escape', agent: { id: 'session-other' } })
  report('rejects malformed id', result.kind === 'error', result.text)
}

// 6. A resident agent from this app run still holds the claim; the archived log is deleted anyway.
{
  const id = 'session-66666666-6666-4666-8666-666666666666'
  const { definition, calls, sessionDir } = await fixture(id, { writeError: owned, resident: true })
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id: 'session-other' } })
  const entries = await readdir(sessionDir).catch(() => [])
  report('deletes behind a resident agent', result.kind === 'success' && entries.length === 0 && calls.unarchived[0] === id, result.text ?? JSON.stringify(result))
}

// 7. An unknown writer is a real reason to stop.
{
  const id = 'session-77777777-7777-4777-8777-777777777777'
  const { definition, sessionDir } = await fixture(id, { writeError: owned })
  const result = await definition.handler({ rawInput: ` ${id}`, agent: { id: 'session-other' } })
  const entries = await readdir(sessionDir)
  report('refuses unknown writer', result.kind === 'error' && entries.length === 2, result.text)
}

for (const item of results) console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name}${item.passed ? '' : `  -> ${item.detail}`}`)
await rm(root, { recursive: true, force: true })
console.log(results.every(item => item.passed) ? 'all checks passed' : 'checks failed')