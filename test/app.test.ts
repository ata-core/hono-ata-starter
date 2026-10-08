import { describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import app from '../src/index.ts'

const post = (body: unknown) =>
  app.request('http://localhost/users', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

describe('users', () => {
  it('accepts a valid body and types it', async () => {
    const res = await post({ email: 'ada@example.com', name: 'Ada', age: 36 })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ name: 'Ada' })
  })

  it('refuses an invalid body with the error list', async () => {
    const res = await post({ email: 'not-an-email', name: '', age: 7 })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean; errors: { instancePath: string; keyword: string }[] }
    expect(body.success).toBe(false)
    expect(body.errors.map((e) => e.instancePath).sort()).toEqual(['/age', '/email', '/name'])
  })

  it('documents the route from the same schema', async () => {
    const res = await app.request('http://localhost/openapi.json')
    const doc = (await res.json()) as any
    const body = doc.paths['/users'].post.requestBody.content['application/json'].schema
    expect(body.properties.name).toEqual({ type: 'string', minLength: 1, maxLength: 80, description: 'Display name' })
    expect(doc.paths['/users'].post.responses['201'].content['application/json'].schema.properties.id.format).toBe('uuid')
  })

  it('ships no validator engine: the worker bundle is small', async () => {
    const out = await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent' })
    const text = out.outputFiles[0].text
    expect(text).not.toContain('new Function')
    const gz = gzipSync(text, { level: 9 }).length
    console.log(`worker bundle ${(text.length / 1000).toFixed(1)} KB, ${(gz / 1000).toFixed(1)} KB gzipped`)
    expect(gz).toBeLessThan(40_000)
  })
})
