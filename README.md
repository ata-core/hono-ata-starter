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

Measured on this template with `npm run measure` (Apple M4 Pro, Node 25, ata-validator 1.63.1, esbuild for the bundle), against the same app with the `/users` route and the document but no validation, and against the template before the import route:

| | this template | `/users` route alone | same app, no validation |
|---|---|---|---|
| worker bundle, minified | 50.1 KB | 43.6 KB | 34.3 KB |
| worker bundle, gzipped | 17.2 KB | 15.2 KB | 13.2 KB |
| fresh process to the first validated response | 27.6 ms | 24.3 ms | 23.5 ms |

Validation of the two schemas costs 2.0 KB gzipped and 0.8 ms at start; the import route and the `ata-validator/stream` entry it loads cost another 2.0 KB and 3.3 ms. The rest of every column is Hono and hono-openapi. The 400 path and the error list are in those 2.0 KB.

## A bulk upload, validated as it arrives

`POST /users/import` takes one user per line (`application/x-ndjson`) or a JSON array and validates each record the moment its last byte lands. The first record that fails answers 400 with its index from zero and its errors, and the rest of the body is not read: on Workers the request body is a Web `ReadableStream`, and `validateStream` from `ata-validator/stream` cancels it at the failure. The compiled module is handed over as `{ isValidObject: isValid, validate }`, the two methods a record stream calls, so the worker still carries no validator engine.

Measured with `node --import tsx scripts/measure-stream.ts`, a 100 MB body of 1.6 million users generated on the fly, each case in a fresh process, against a handler that reads the whole body with `c.req.text()` and validates line by line:

| | bad record at index 50 | all records valid |
|---|---|---|
| whole body first | 400 after 255 ms, +411 MB RSS | 200 in 579 ms, +508 MB RSS |
| `/users/import` | 400 after 11 ms, +7 MB RSS | 200 in 549 ms, +82 MB RSS |

The valid case is not faster, the same 1.6 million records are validated either way; what changes is that the process never holds the body. Not covered: a Workers runtime measurement (this is Node), and multipart uploads.

## Tests

`test/app.test.ts` holds seven things: a valid body is accepted and typed, an invalid one gets the error list, the document carries the schema as written (`description`, `format`, `minLength` included), an upload of one user per line and one as a JSON array are imported, a body that never ends is refused at its first bad record and read no further, and the bundle contains no `new Function` and stays small.

## Without the OpenAPI document

Drop `hono-openapi` and the `describeRoute` and `/openapi.json` lines; the validation and the types stay as they are, and the bundle shrinks by what hono-openapi weighs.

## The same idea elsewhere

[fastify-ata-starter](https://github.com/ata-core/fastify-ata-starter) does this on Fastify with no build step, and [mcp-ata-workers-starter](https://github.com/ata-core/mcp-ata-workers-starter) is an MCP server on Workers whose tool schemas are compiled the same way.

## License

MIT
