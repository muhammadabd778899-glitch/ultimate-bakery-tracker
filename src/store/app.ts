import { create } from 'zustand'
import type { Settings } from '../types'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
}

interface AppState {
  booted: boolean
  settings: Settings | null
  dataVersion: number
  sidebarCollapsed: boolean
  toasts: Toast[]
  globalQuery: string
  boot: (s: Settings) => void
  setSettings: (s: Settings) => void
  bump: () => void
  toggleSidebar: () => void
  setGlobalQuery: (q: string) => void
  toast: (kind: Toast['kind'], title: string, message?: string) => void
  dismiss: (id: number) => void
}

let toastSeq = 1

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  settings: null,
  dataVersion: 0,
  sidebarCollapsed: false,
  toasts: [],
  globalQuery: '',
  boot: (s) => set({ booted: true, settings: s }),
  setSettings: (s) => set({ settings: s }),
  bump: () => set((st) => ({ dataVersion: st.dataVersion + 1 })),
  toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),
  setGlobalQuery: (q) => set({ globalQuery: q }),
  toast: (kind, title, message) => {
    const id = toastSeq++
    set((st) => ({ toasts: [...st.toasts, { id, kind, title, message }] }))
    setTimeout(() => {
      set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }))
    }, kind === 'error' ? 7000 : 4000)
  },
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
}))

/** Call after every write so every mounted screen refreshes its queries. */
export function notifyDataChanged() {
  useApp.getState().bump()
}

export function toastSuccess(title: string, message?: string) {
  useApp.getState().toast('success', title, message)
}

export function toastError(title: string, message?: string) {
  useApp.getState().toast('error', title, message)
}
