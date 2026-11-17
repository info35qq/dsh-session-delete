/**
 * Decode stored Session logs and look for our /delete-session command events.
 * Run with ELECTRON_RUN_AS_NODE=1 and the DSH node executable.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const root = process.env.SESSIONS_ROOT
const lines = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { await walk(full); continue }
    if (!entry.name.endsWith('.zstd')) continue
    const info = await stat(full)
    let text
    try {
      text = zstdDecompressSync(await readFile(full)).toString('utf8')
    } catch (error) {
      lines.push(`DECODE-FAIL ${full} :: ${error.message}`)
      continue
    }
    const events = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try { events.push(JSON.parse(line)) } catch { /* header/frame boundary noise */ }
    }
    const hits = events.filter(event => JSON.stringify(event).includes('delete-session'))
    lines.push(`${full} | ${(info.size / 1024).toFixed(1)} KiB | ${info.mtime.toISOString()} | events=${events.length} | delete-session hits=${hits.length}`)
    for (const hit of hits.slice(0, 6)) lines.push(`    ${JSON.stringify(hit).slice(0, 400)}`)
  }
}

await walk(root)
console.log(lines.join('\n'))