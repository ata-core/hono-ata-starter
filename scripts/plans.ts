// Plans for the page, written at build time beside the compiled modules: a
// schema the page validates as the user types goes out as data for the plan
// reader (ata-validator/plan, 6 KB gzipped) instead of the runtime compiler.
// The worker serves the JSON as it is; nothing of ata-validator/ir reaches it.
// Runs with `npm run schemas`.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tablePlan } from 'ata-validator/ir'

const dir = 'schemas'
const out = 'src/generated'
for (const file of readdirSync(dir).filter((f) => f.endsWith('.schema.json'))) {
  const name = basename(file, '.schema.json')
  const schema = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const plan = tablePlan(schema, { richErrors: false })
  if (plan === null) {
    // A schema a plan cannot carry is served as itself and validated on the
    // page with new Validator; the build says so rather than writing nothing.
    console.error(`plans: ${file} cannot be a plan (a $ref to another document, unevaluated keywords, dynamic references); serve the schema instead`)
    process.exitCode = 1
    continue
  }
  const target = join(out, `${name}.plan.json`)
  writeFileSync(target, JSON.stringify(plan))
  console.log(`plans: ${file} -> ${target} (${JSON.stringify(plan).length} bytes)`)
}
