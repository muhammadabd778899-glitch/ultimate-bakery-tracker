/**
 * Static SQL alias checker.
 *
 * Shared SQL fragments (e.g. `o.status <> 'Cancelled'`) blow up at runtime when
 * they are used with an un-aliased table ("no such column: o.status"). This
 * script resolves `${const}` interpolations inside template literals so each
 * query can be checked as a whole: every `alias.column` reference must have a
 * matching `FROM/JOIN <table> alias`, `) alias`, or `WITH alias AS` definition
 * inside that same resolved query.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')
const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(entry)) files.push(p)
  }
})(root)

const NON_ALIASES = new Set([
  'substr', 'date', 'coalesce', 'round', 'sum', 'count', 'avg', 'max', 'min', 'abs',
  'ifnull', 'lower', 'upper', 'trim', 'printf', 'julianday', 'strftime', 'instr', 'length',
])

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

const problems = []
let checked = 0

// Second pass: aliasing a column with a SQLite reserved word is a syntax error
// (`AS in` blew up the Finances screen at runtime). Verified against sql.js.
const RESERVED = /\bAS\s+(in|order|group|from|select|where|having|limit|table|into|values|and|or|not|is|on|join|union|all|exists|between|case|when|then|else|distinct|primary|default|references|constraint)\b/gi

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = file.slice(process.cwd().length + 1)
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    for (const r of m[1].matchAll(RESERVED)) {
      problems.push(`${rel}: reserved word used as a column alias: "AS ${r[1]}"`)
    }
  }
}

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const decls = declarations(src)
  const rel = file.slice(process.cwd().length + 1)

  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const frag = m[1]
    if (!/\bSELECT\b/i.test(frag)) continue
    const sql = expand(frag, decls).replace(/\$\{[^{}]*\}/g, ' ')
    if (!/\bFROM\b/i.test(sql)) continue
    checked++

    const refs = new Set(
      [...sql.matchAll(/\b([a-z_][a-z0-9_]*)\.[a-z_][a-z0-9_]*/gi)]
        .map((r) => r[1].toLowerCase())
        .filter((a) => !NON_ALIASES.has(a))
    )

    for (const alias of refs) {
      const defined =
        new RegExp(`\\b(?:FROM|JOIN|UPDATE)\\s+[a-z_][a-z0-9_]*\\s+${alias}\\b`, 'i').test(sql) ||
        new RegExp(`\\)\\s+${alias}\\b`, 'i').test(sql) ||
        new RegExp(`\\bWITH\\s+${alias}\\s+AS\\b`, 'i').test(sql) ||
        new RegExp(`\\b(?:FROM|JOIN)\\s+${alias}\\b`, 'i').test(sql)
      if (!defined) {
        problems.push(`${rel}: alias "${alias}" referenced but not introduced\n      ${sql.replace(/\s+/g, ' ').slice(0, 160)}`)
      }
    }
  }
}

if (problems.length) {
  console.error('Alias check FAILED:')
  for (const p of [...new Set(problems)]) console.error('  ' + p)
  process.exit(1)
}
console.log(`Alias check OK — ${checked} queries across ${files.length} files.`)
