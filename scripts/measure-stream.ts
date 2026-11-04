// A 100 MB upload of users, one per line, generated on the fly as a Web
// ReadableStream and handed to the app the way a Worker hands it a request.
// Two routes: /users/import validates records as they arrive (src/index.ts);
// the buffered route below reads the whole body, splits it and validates,
// which is what a handler without the stream entry does. Each case runs in a
// fresh process so its peak RSS is its own.
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MB = 1024 * 1024
const TARGET = Number(process.env.MB || 100) * MB
const BAD_AT = 50

const line = (i: number, bad: boolean) => `{"email":"user${i}@example.com","name":"${bad ? '' : `User ${i}`}","age":${20 + (i % 50)}}`

function body(invalidAt: number) {
  let sent = 0
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= TARGET) return controller.close()
      const parts: string[] = []
      let bytes = 0
      while (bytes < 256 * 1024 && sent + bytes < TARGET) {
        const s = line(i, invalidAt === i) + '\n'
        parts.push(s)
        bytes += s.length
        i++
      }
      sent += bytes
      controller.enqueue(new TextEncoder().encode(parts.join('')))
    },
  })
}

async function child(mode: string, invalid: boolean) {
  const { default: app } = await import('../src/index.ts')
  const { Hono } = await import('hono')
  const user = await import('../src/generated/user.compiled.mjs')
  const buffered = new Hono()
  buffered.post('/users/import', async (c) => {
    const text = await c.req.text()
    let n = 0
    for (const l of text.split('\n')) {
      if (l === '') continue
      const r = user.validate(JSON.parse(l))
      if (!r.valid) return c.json({ success: false, record: n, errors: r.errors }, 400)
      n++
    }
    return c.json({ imported: n })
  })
  const target = mode === 'buffered' ? buffered : app
  const base = process.resourceUsage().maxRSS
  const t0 = performance.now()
  const res = await target.request('http://localhost/users/import', { method: 'POST', body: body(invalid ? BAD_AT : -1), headers: { 'Content-Type': 'application/x-ndjson' }, duplex: 'half' } as RequestInit)
  const text = await res.text()
  const ms = performance.now() - t0
  const peak = (process.resourceUsage().maxRSS - base) / 1024
  process.send!({ status: res.status, ms, peak, text: text.slice(0, 90) })
}

async function main() {
  const self = fileURLToPath(import.meta.url)
  for (const invalid of [true, false]) {
    for (const mode of ['buffered', 'stream']) {
      const r = await new Promise<any>((resolve) => {
        const p = fork(self, ['child', mode, String(invalid)], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
        p.once('message', resolve)
      })
      console.log(`${mode.padEnd(9)} ${(invalid ? `bad record at ${BAD_AT}` : 'all valid').padEnd(18)} status ${r.status} in ${r.ms.toFixed(0).padStart(5)} ms, peak RSS +${r.peak.toFixed(0).padStart(4)} MB  ${r.text}`)
    }
  }
}

if (process.argv[2] === 'child') child(process.argv[3], process.argv[4] === 'true')
else main()
