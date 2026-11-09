import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { MIGRATIONS } from './schema'

const DB_STORE = 'ubt-storage'
const DB_KEY = 'sqlite-database'

let db: SqlJsDatabase | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveChain: Promise<void> = Promise.resolve()
let readyPromise: Promise<SqlJsDatabase> | null = null

export function isReady() {
  return db !== null
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database is not ready yet.')
  return db
}

/* ------------------------------------------------------------------ *
 * IndexedDB blob storage (offline, local to this browser profile)
 * ------------------------------------------------------------------ */
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ultimate-bakery-tracker', 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<Uint8Array | null> {
  try {
    const d = await idb()
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(DB_KEY)
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbPut(bytes: Uint8Array) {
  const d = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(bytes, DB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbClear() {
  try {
    const d = await idb()
    await new Promise<void>((resolve) => {
      const tx = d.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).delete(DB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
export type SqlParams = unknown[] | Record<string, unknown> | undefined

export function query<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
  const stmt = getDb().prepare(sql)
  try {
    if (params) stmt.bind(params as never)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

export function queryOne<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined {
  return query<T>(sql, params)[0]
}

export function scalar<T = number | string | null>(sql: string, params?: SqlParams): T | undefined {
  const row = queryOne<Record<string, unknown>>(sql, params)
  if (!row) return undefined
  const values = Object.values(row)
  return values.length ? (values[0] as T) : undefined
}

export function run(sql: string, params?: SqlParams): { changes: number } {
  const d = getDb()
  d.run(sql, params as never)
  const changes = scalar<number>('SELECT changes() AS c') ?? 0
  schedulePersist()
  return { changes }
}

/** Runs several statements atomically. Rolls back everything on error. */
export function transaction<T>(fn: () => T): T {
  const d = getDb()
  d.run('BEGIN')
  try {
    const out = fn()
    d.run('COMMIT')
    schedulePersist()
    return out
  } catch (e) {
    try {
      d.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** Builds `INSERT INTO t (a,b) VALUES (?,?)` so column/placeholder counts can never drift. */
export function insertSql(table: string, cols: string[]): string {
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
}

/** Builds `UPDATE t SET a=?, b=? WHERE id=?` — params must be values then where values. */
export function updateSql(table: string, cols: string[], whereCols: string[]): string {
  const set = cols.map((c) => `${c} = ?`).join(', ')
  const where = whereCols.map((c) => `${c} = ?`).join(' AND ')
  return `UPDATE ${table} SET ${set} WHERE ${where}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function logAudit(entity: string, entityId: string | null, action: string, detail = '') {
  try {
    run(
      `INSERT INTO audit_logs (entity, entity_id, action, detail, created_at) VALUES (?,?,?,?,?)`,
      [entity, entityId, action, detail.slice(0, 500), nowIso()]
    )
  } catch {
    /* audit must never break the user's action */
  }
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */
export function schedulePersist(delay = 350) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persistNow(), delay)
}

export async function persistNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveChain = saveChain.then(async () => {
    if (!db) return
    try {
      await idbPut(db.export())
    } catch (e) {
      console.error('Failed to persist database', e)
    }
  })
  return saveChain
}

export async function flushPending() {
  return persistNow()
}

/* ------------------------------------------------------------------ *
 * Init / migrations / restore
 * ------------------------------------------------------------------ */
function applyMigrations(database: SqlJsDatabase) {
  database.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')
  const stmt = database.prepare('SELECT value FROM meta WHERE key = ?')
  stmt.bind(['schema_version'])
  let version = 0
  if (stmt.step()) version = Number((stmt.getAsObject() as { value: string }).value || 0)
  stmt.free()

  for (const m of MIGRATIONS) {
    if (m.version <= version) continue
    database.run('BEGIN')
    try {
      database.run(m.sql)
      const ins = database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)')
      ins.run(['schema_version', String(m.version)])
      ins.free()
      database.run('COMMIT')
      version = m.version
    } catch (e) {
      try {
        database.run('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${String(e)}`)
    }
  }
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    const SQL = await initSqlJs({ locateFile: (f) => (f.endsWith('.wasm') ? wasmUrl : f) })
    const existing = await idbGet()
    const database = existing && existing.length ? new SQL.Database(existing) : new SQL.Database()
    database.run('PRAGMA foreign_keys = ON')
    applyMigrations(database)
    db = database
    await persistNow()
    return database
  })()
  return readyPromise
}

/** Replaces the live database with validated backup bytes. */
export async function restoreDatabase(bytes: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ locateFile: (f) => (f.endsWith('.wasm') ? wasmUrl : f) })
  const candidate = new SQL.Database(bytes)
  candidate.run('PRAGMA foreign_keys = ON')
  // Validate before we touch live data.
  const check = candidate.exec('PRAGMA integrity_check')
  const result = check[0]?.values[0]?.[0]
  if (result !== 'ok') {
    candidate.close()
    throw new Error(`Backup failed validation: ${String(result)}`)
  }
  const versionRow = candidate.exec('SELECT value FROM meta WHERE key = "schema_version"')
  if (!versionRow.length) {
    candidate.close()
    throw new Error('This file is not a valid Ultimate Bakery Tracker backup.')
  }
  if (db) db.close()
  db = candidate
  applyMigrations(candidate)
  await idbPut(candidate.export())
}

/** Wipes local data and starts a brand new database. */
export async function resetDatabase(): Promise<void> {
  await idbClear()
  if (db) db.close()
  db = null
  readyPromise = null
  await initDatabase()
}

export function exportDatabaseBytes(): Uint8Array {
  return getDb().export()
}

export function dbSizeBytes(): number {
  try {
    return getDb().export().length
  } catch {
    return 0
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void persistNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistNow()
  })
}
