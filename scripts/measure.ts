// What this app costs: the worker bundle, and a fresh process from the first
// import to the first validated response. Run after `npm run schemas`.
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'

const out = await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent' })
const text = out.outputFiles[0].text
console.log(`worker bundle: ${(text.length / 1000).toFixed(1)} KB minified, ${(gzipSync(text, { level: 9 }).length / 1000).toFixed(1)} KB gzipped`)

const probe = `
  const t0 = performance.now()
  const { default: app } = await import('./src/index.ts')
  const res = await app.request('http://localhost/users', { method: 'POST', body: JSON.stringify({ email: 'ada@example.com', name: 'Ada', age: 36 }), headers: { 'Content-Type': 'application/json' } })
  if (res.status !== 201) throw new Error(String(res.status))
  console.log((performance.now() - t0).toFixed(2))
`
const runs: number[] = []
for (let i = 0; i < 11; i++) runs.push(parseFloat(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', probe], { encoding: 'utf8' }).trim()))
runs.sort((a, b) => a - b)
console.log(`fresh process to first validated response: ${runs[5].toFixed(1)} ms (median of 11, includes loading Hono and hono-openapi)`)
