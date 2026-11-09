import { useEffect, useMemo, useRef } from 'react'
import { useApp } from '../store/app'

/** Re-runs `fn` whenever global data changes or any dependency changes.
 *  Keeps every screen in sync with the database without prop drilling. */
export function useLive<T>(fn: () => T, deps: unknown[] = []): T {
  const version = useApp((s) => s.dataVersion)
  const ref = useRef(fn)
  ref.current = fn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ref.current(), [version, ...deps])
}

/** Fires `fn` on an interval (used for "Today" counters crossing midnight). */
export function useInterval(fn: () => void, ms: number) {
  useEffect(() => {
    const t = setInterval(fn, ms)
    return () => clearInterval(t)
  }, [fn, ms])
}
