<p align="center">
  <a href="https://hono.dev"><img src="https://raw.githubusercontent.com/honojs/hono/main/docs/images/hono-title.png" alt="Hono" width="300" /></a>
</p>

# hono-ata-starter

A Hono API where one JSON Schema file gives the request validation, the TypeScript type of the handler's input, and the OpenAPI document. The schema is compiled ahead of time with [ata-validator](https://github.com/ata-core/ata-validator), so the deployed worker carries no validator engine, only the checks the schema asks for, and nothing in it calls `new Function`, which is what Cloudflare Workers and a strict Content-Security-Policy refuse.

```text
schemas/user.schema.json
   │
   ├─ ata build ──► src/generated/user.compiled.mjs   validates, imports nothing
   │             └► src/generated/user.compiled.d.mts  `User`, the handler's type
   │
   └─ imported as JSON ─────────────────────────────► the OpenAPI document
```

## Run it

```sh
npm install
npm run dev        # compiles the schemas, then wrangler dev
npm test           # compiles, then the four tests below
npm run doc        # prints the OpenAPI document
npm run deploy     # compiles, then wrangler deploy
```

Change `schemas/user.schema.json`, run `npm run schemas`, and the validator, the type and the document follow. There is no second definition to keep in step.

## What is in it

`src/index.ts` is the whole app:

- `validator('json', ...)` from Hono itself runs the compiled module's `validate`, and returns the body typed as `User`, so `c.req.valid('json')` is typed from the schema.
- `describeRoute` takes the schema JSON as the request body and response schemas; JSON Schema is what an OpenAPI 3.1 schema is, so nothing is converted.
- `/openapi.json` serves the document through `hono-openapi`.

An invalid body answers `400` with `{ success: false, errors }`, one error per violation with `keyword`, `instancePath`, `schemaPath`, `params` and `message`.

## What it costs

Measured on this template with `npm run measure` (Apple M4 Pro, Node 25, esbuild for the bundle), against the same app with the route and the document but no validation:

| | this template | same app, no validation |
|---|---|---|
| worker bundle, minified | 42.9 KB | 31.1 KB |
| worker bundle, gzipped | 15.3 KB | 12.0 KB |
| fresh process to the first validated response | 22.2 ms | 21.6 ms |

Validation of the two schemas costs 3.3 KB gzipped and 0.6 ms at start; the rest of both columns is Hono and hono-openapi. The 400 path and the error list are in that 3.3 KB.

## Tests

`test/app.test.ts` holds four things: a valid body is accepted and typed, an invalid one gets the error list, the document carries the schema as written (`description`, `format`, `minLength` included), and the bundle contains no `new Function` and stays small.

## Without the OpenAPI document

Drop `hono-openapi` and the `describeRoute` and `/openapi.json` lines; the validation and the types stay as they are, and the bundle shrinks by what hono-openapi weighs.

## License

MIT
