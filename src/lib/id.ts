export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = Date.now().toString(36)
  return `${prefix}${time}${rand}`
}

let orderCounter: number | null = null

export function nextOrderNo(existingMax: number | null): string {
  const seq = (existingMax ?? 0) + 1
  orderCounter = seq
  const year = new Date().getFullYear()
  return `ORD-${year}-${String(seq).padStart(4, '0')}`
}

export function nextBatchNo(seq: number): string {
  const year = new Date().getFullYear()
  return `BAT-${year}-${String(seq).padStart(4, '0')}`
}

export function nextDocNo(prefix: string, seq: number): string {
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}
