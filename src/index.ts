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

app.get('/openapi.json', openAPIRouteHandler(app, {
  documentation: { info: { title: 'hono-ata-starter', version: '0.1.0', description: 'Validation, types and this document come from schemas/*.schema.json' } },
}))

export default app
