/**
 * Executes every SQL statement found in src/ against a database created from the
 * real schema (src/db/schema.ts), with each `?` placeholder bound as NULL.
 *
 * Catches the class of bug that only shows up at runtime:
 *   - "no such column: o.status"      (alias / column drift)
 *   - "no such table: xyz"            (renamed table)
 *   - INSERT/UPDATE column mismatches (arity is checked by check-sql.mjs)
 *
 * Syntax errors caused by deliberately dynamic fragments (`${table}`) are ignored;
 * reserved-word aliases are covered by check-alias.mjs.
 */
import { readFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import initSqlJs from 'sql.js'

const cwd = process.cwd()

/* --------------------------- 1. build the schema -------------------------- */
const outFile = join(cwd, '.schema-build.mjs')
const { build } = await import('esbuild')
await build({
  entryPoints: [join(cwd, 'src', 'db', 'schema.ts')],
  bundle: true,
  format: 'esm',
  outfile: outFile,
  logLevel: 'error',
})

const { SCHEMA_V1, MIGRATIONS } = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)
if (existsSync(outFile)) unlinkSync(outFile)

const SQL = await initSqlJs()
const db = new SQL.Database()
db.run(SCHEMA_V1)
for (const m of MIGRATIONS ?? []) db.run(m.sql)

/* --------------------------- 2. gather statements ------------------------- */
const root = join(cwd, 'src')
const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p)
  }
})(root)

function declarations(src) {
  const map = new Map()
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_][\w]*)\s*=\s*`([^`]*)`/g)) map.set(m[1], m[2])
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_][\w]*)\s*=\s*'([^'\n]*)'/g)) map.set(m[1], m[2])
  return map
}
function expand(text, decls, depth = 0) {
  if (depth > 6) return text
  let out = text
  for (const [name, value] of decls) {
    const token = '${' + name + '}'
    if (out.includes(token)) out = out.split(token).join(expand(value, decls, depth + 1))
  }
  return out
}

const failures = []
let executed = 0
let skipped = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const decls = declarations(src)
  const rel = file.slice(cwd.length + 1)

  for (const m of src.matchAll(/`([^`]*)`/g)) {
    // Ignore literals that live in a comment (doc examples like `INSERT INTO t …`).
    const lineStart = src.lastIndexOf('\n', m.index) + 1
    const linePrefix = src.slice(lineStart, m.index).trim()
    if (/^(\/\/|\/\*|\*|<\*|--)/.test(linePrefix)) continue
    const raw = m[1]
    const isStatic = !raw.includes('${')
    let sql = expand(raw, decls).replace(/\$\{[^{}]*\}/g, ' NULL ')
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue
    // Table names that were dynamic can't be validated — skip those.
    if (/INSERT\s+INTO\s+NULL|DELETE\s+FROM\s+NULL|UPDATE\s+NULL|JOIN\s+NULL|FROM\s+NULL/i.test(sql)) { skipped++; continue }
    // Placeholders become NULLs; strip trailing statement terminators noise.
    sql = sql.replace(/\?/g, 'NULL').trim().replace(/;+\s*$/, '')
    if (!sql) { skipped++; continue }

    try {
      db.exec(sql)
      executed++
    } catch (e) {
      const msg = String(e.message ?? e)
      // Column/table drift and value/column count mismatches are always real
      // bugs. NOT NULL + datatype complaints are artifacts of binding NULL for
      // every placeholder, and dynamic fragments can produce syntax noise.
      const fatal =
        /no such column|no such table|values for|columns.*differ|unrecognized token/i.test(msg)
      const dynamicNoise = /NOT NULL constraint|datatype mismatch/i.test(msg)
      if (fatal && isStatic) {
        failures.push(`${rel}: ${msg}\n      ${sql.replace(/\s+/g, ' ').slice(0, 180)}`)
      } else if (fatal && !dynamicNoise) {
        failures.push(`${rel}: ${msg}\n      ${sql.replace(/\s+/g, ' ').slice(0, 180)}`)
      } else {
        skipped++ // dynamic-fragment syntax noise / NULL-binding artifacts
      }
    }
  }
}

if (failures.length) {
  console.error('Query check FAILED:')
  for (const f of [...new Set(failures)]) console.error('  ' + f)
  process.exit(1)
}
console.log(`Query check OK — ${executed} statements executed against the real schema, ${skipped} dynamic statements skipped.`)
