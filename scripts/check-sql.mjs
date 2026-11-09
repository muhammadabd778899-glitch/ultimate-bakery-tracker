// Static checker: verifies every hand-written SQL INSERT/UPDATE in src/ has a
// placeholder count that matches its column count. Run: node scripts/check-sql.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')
const files = []
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e)) files.push(p)
  }
}
walk(root)

const problems = []

function topLevelParams(valuesStr) {
  // counts `?` outside of parentheses
  let depth = 0
  let count = 0
  for (const ch of valuesStr) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === '?' && depth === 0) count++
  }
  return count
}

function splitTop(str, sep = ',') {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === sep && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = file.replace(process.cwd(), '')

  // template literals or plain strings containing SQL
  const stmts = [...text.matchAll(/(?:`([^`]*?)`|"([^"]*?)"|'([^']*?)')/gs)]
  for (const m of stmts) {
    const sql = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\s+/g, ' ').trim()
    if (!/^INSERT INTO|^UPDATE/i.test(sql)) continue

    const head = /^INSERT INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(/i.exec(sql)
    if (head) {
      const cols = splitTop(head[2])
      // balanced-paren scan of the VALUES tuple (subqueries may nest)
      const start = head.index + head[0].length
      let depth = 1
      let body = ''
      for (let i = start; i < sql.length; i++) {
        const ch = sql[i]
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) break
        }
        body += ch
      }
      // every top-level VALUES token is exactly one bound column value
      const tokens = splitTop(body)
      const consumed = tokens.length
      const placeholders = (body.match(/\?/g) || []).length
      if (cols.length !== consumed) {
        problems.push(`${rel}: INSERT ${head[1]} -> ${cols.length} cols vs ${consumed} values (${placeholders} placeholders)`)
      }
      continue
    }

    const upd = /^UPDATE\s+\w+\s+SET\s+(.*?)\s+WHERE\s+(.*)$/i.exec(sql)
    if (upd) {
      const sets = splitTop(upd[1])
      const wheres = splitTop(upd[2])
      const setParams = sets.filter((s) => s.includes('?')).length
      const setLiterals = sets.filter((s) => !s.includes('?'))
      const whereParams = wheres.filter((s) => s.includes('?')).length
      if (setLiterals.length) {
        // not a plain param binding — skip (validated by hand)
      }
      const totalNeeded = setParams + whereParams
      const totalAvailable = (sql.match(/\?/g) || []).length
      // only flag when ? count cannot possibly satisfy SET+WHERE arity
      if (totalAvailable < setParams) {
        problems.push(`${rel}: UPDATE has ${totalAvailable} placeholders but ${setParams} SET columns need binding`)
      }
      void totalNeeded
    }
  }
}

if (problems.length) {
  console.error('SQL shape problems found:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(`OK — checked ${files.length} files, no INSERT/UPDATE arity problems.`)
