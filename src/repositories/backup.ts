import { query, queryOne, run, transaction, nowIso, exportDatabaseBytes, restoreDatabase, dbSizeBytes, logAudit, insertSql } from '../db/database'
import { uid } from '../lib/id'
import { downloadBlob } from '../lib/exporters'
import { notifyDataChanged } from '../store/app'
import type { Settings } from '../types'

export interface BackupInfo {
  id: string
  created_at: string
  size_bytes: number
  note: string
}

export function listBackups(): BackupInfo[] {
  return query<BackupInfo>('SELECT * FROM backup_history ORDER BY created_at DESC')
}

export function backupFileName(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(
    d.getHours()
  ).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `bakery-backup-${stamp}.ubt`
}

/** Saves a `.ubt` file to the user's Downloads folder and logs the event. */
export function downloadBackup(note = ''): BackupInfo {
  const bytes = exportDatabaseBytes()
  downloadBlob(backupFileName(), bytes as unknown as BlobPart, 'application/octet-stream')
  const info: BackupInfo = { id: uid('bak_'), created_at: nowIso(), size_bytes: bytes.length, note }
  run(insertSql('backup_history', ['id', 'created_at', 'size_bytes', 'note']), [
    info.id,
    info.created_at,
    info.size_bytes,
    note,
  ])
  logAudit('backup', info.id, 'create', `${info.size_bytes} bytes`)
  return info
}

/** Validates then swaps in a backup file. Throws before touching data if invalid. */
export async function restoreBackupFile(file: File): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer())
  await restoreDatabase(buf)
  logAudit('backup', file.name, 'restore', `${buf.length} bytes`)
  notifyDataChanged()
}

export function currentDbSize(): number {
  return dbSizeBytes()
}

export function lastBackup(): BackupInfo | undefined {
  return queryOne<BackupInfo>('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 1')
}

/** Bulk-removes optional sample rows; real records are never touched. */
export function removeSampleData(): number {
  let removed = 0
  const count = (t: string) => {
    try {
      return queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE is_sample = 1`)?.c ?? 0
    } catch {
      return 0
    }
  }

  transaction(() => {
    // 1. reverse stock effects of sample production / purchases first
    run(
      `DELETE FROM inventory_movements
       WHERE related_batch_id IN (SELECT id FROM production_batches WHERE is_sample = 1)
          OR related_purchase_id IN (SELECT id FROM purchases WHERE is_sample = 1)
          OR related_waste_id IN (SELECT id FROM waste_records WHERE is_sample = 1)`
    )
    // 2. children
    for (const t of ['waste_records', 'production_batches', 'order_payments', 'order_items', 'orders', 'expenses', 'income_transactions', 'tasks', 'events', 'purchases']) {
      const before = count(t)
      if (!before) continue
      run(`DELETE FROM ${t} WHERE is_sample = 1`)
      removed += before
    }
    // 3. parents
    run(`UPDATE products SET recipe_id = NULL WHERE is_sample = 1`)
    for (const t of ['customers', 'products', 'ingredients', 'recipes', 'suppliers']) {
      const before = count(t)
      if (!before) continue
      run(`DELETE FROM ${t} WHERE is_sample = 1`)
      removed += before
    }
    // 4. recompute stock from the surviving ledger
    const rows = query<{ id: string; total: number | null }>(
      'SELECT ingredient_id AS id, SUM(quantity) AS total FROM inventory_movements GROUP BY ingredient_id'
    )
    const map = new Map(rows.map((r) => [r.id, r.total ?? 0]))
    for (const ing of query<{ id: string }>('SELECT id FROM ingredients')) {
      run('UPDATE ingredients SET current_stock = ? WHERE id = ?', [map.get(ing.id) ?? 0, ing.id])
    }
    logAudit('sample_data', null, 'remove', `${removed} rows`)
  })
  notifyDataChanged()
  return removed
}

export function sampleDataExists(): boolean {
  const t = ['orders', 'customers', 'products', 'ingredients', 'recipes']
  for (const table of t) {
    try {
      const c = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table} WHERE is_sample = 1`)?.c ?? 0
      if (c > 0) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export function applySettingsImport(settings: Settings) {
  void settings
}
