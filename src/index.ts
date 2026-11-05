import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { describeRoute, openAPIRouteHandler } from 'hono-openapi'
import type { OpenAPIV3_1 } from 'openapi-types'

// One schema file, three uses: `ata build` compiled it into a module that
// imports nothing (the validator below), wrote its type next to it (the
// handler's `User`), and the JSON itself goes into the OpenAPI document.
import userSchema from '../schemas/user.schema.json'
import createdSchema from '../schemas/created.schema.json'
import * as user from './generated/user.compiled.mjs'
import type { User } from './generated/user.compiled.mjs'
import userPlan from './generated/user.plan.json'
import { validateStream } from 'ata-validator/stream'
import type { Validator } from 'ata-validator'

// The JSON files are plain JSON Schema, which is what an OpenAPI 3.1 schema is.
const asSchema = (schema: object) => schema as OpenAPIV3_1.SchemaObject

const app = new Hono()

app.post(
  '/users',
  describeRoute({
    description: 'Create a user',
    requestBody: { required: true, content: { 'application/json': { schema: asSchema(userSchema) } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: asSchema(createdSchema) } } },
      400: { description: 'The body does not match the schema' },
    },
  }),
  validator('json', (data, c) => {
    const result = user.validate(data)
    if (!result.valid) return c.json({ success: false, errors: result.errors }, 400)
    return data as User
  }),
  (c) => {
    const body = c.req.valid('json') // typed as User, from the schema
    return c.json({ id: crypto.randomUUID(), name: body.name }, 201)
  }
)

// A bulk upload, validated as it arrives. The body is one user per line (or a
// JSON array); each record is checked the moment its last byte lands, and the
// first one that fails answers 400 before the rest of the body is read. On
// Workers the request body is a Web ReadableStream, which validateStream reads
// directly and cancels at the failure. The compiled module has the two
// methods a record stream calls; the cast is because the published type names
// the runtime Validator.
const userRecords = { isValidObject: user.isValid, validate: user.validate } as unknown as Validator<unknown>

app.post(
  '/users/import',
  describeRoute({
    description: 'Create many users from one body, one JSON object per line or a JSON array',
    requestBody: { required: true, content: { 'application/x-ndjson': { schema: asSchema(userSchema) }, 'application/json': { schema: { type: 'array', items: asSchema(userSchema) } } } },
    responses: {
      200: { description: 'How many users were imported', content: { 'application/json': { schema: { type: 'object', properties: { imported: { type: 'integer' } }, required: ['imported'] } } } },
      400: { description: 'The first record that does not match the schema, by its index from zero' },
    },
  }),
  async (c) => {
    if (c.req.raw.body === null) return c.json({ success: false, record: 0, errors: [] }, 400)
    const result = await validateStream(userRecords, c.req.raw.body)
    if (!result.valid) {
      const failure = result.errors[0]
      return c.json({ success: false, record: failure.record, errors: failure.errors }, 400)
    }
    return c.json({ imported: result.records })
  }
)

// The schema as a plan for the page, written at build time (scripts/plans.ts):
// the page reads it with fromPlan from ata-validator/plan and validates as the
// user types, with this worker's answers, carrying 6 KB instead of the
// runtime compiler. The worker serves the JSON as it is; the ETag is the
// plan's own hash, so a page that has it gets 304.
const planText = JSON.stringify(userPlan)
// FNV-1a over the text: a tag that changes exactly when the plan does, made
// at startup with no crypto call.
const planTag = '"' + ((): string => { let h = 0x811c9dc5; for (let i = 0; i < planText.length; i++) { h ^= planText.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') })() + '"'

app.get('/forms/user', (c) => {
  c.header('ETag', planTag)
  c.header('Cache-Control', 'public, max-age=300')
  if (c.req.header('if-none-match') === planTag) return c.body(null, 304)
  return c.body(planText, 200, { 'Content-Type': 'application/json; charset=utf-8' })
})

app.get('/openapi.json', openAPIRouteHandler(app, {
  documentation: { info: { title: 'hono-ata-starter', version: '0.1.0', description: 'Validation, types and this document come from schemas/*.schema.json' } },
}))

export default app
