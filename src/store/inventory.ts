/**
 * 我的豆子库存（按色号计数），persist 到 Taro storage。
 *
 * 库存页 / BOM 页都要高频读「这个色号有没有豆」，
 * 所以除 counts 外还留一个 Set 缓存，避免每次渲染都 Object.keys 一遍。
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_PACK_SIZE } from '../constants/board'
import { taroStorage } from './taroStorage'

export const INVENTORY_KEY = 'beadhub:inventory:v1'

export interface InventoryState {
  paletteId: string
  /** 色号 → 颗数 */
  counts: Record<string, number>
  updatedAt: number
  setCount: (code: string, count: number) => void
  add: (code: string, delta: number) => void
  /** 有货 / 无货 切换（默认给一包的量） */
  toggleOwned: (code: string) => void
  /** 批量标记有货（BOM 一键备豆） */
  markOwned: (codes: readonly string[], count?: number) => void
  /** 按 BOM 建议颗数覆盖写入 */
  applyAmounts: (entries: readonly { code: string; count: number }[]) => void
  remove: (code: string) => void
  clear: () => void
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    set => ({
      paletteId: 'mard-v1',
      counts: {},
      updatedAt: 0,

      setCount: (code, count) => {
        const value = Math.max(0, Math.floor(count))
        set(state => {
          const counts = { ...state.counts }
          if (value <= 0) delete counts[code]
          else counts[code] = value
          return { counts, updatedAt: Date.now() }
        })
      },

      add: (code, delta) => {
        set(state => {
          const counts = { ...state.counts }
          const next = Math.max(0, (counts[code] ?? 0) + Math.floor(delta))
          if (next <= 0) delete counts[code]
          else counts[code] = next
          return { counts, updatedAt: Date.now() }
        })
      },

      toggleOwned: code => {
        set(state => {
          const counts = { ...state.counts }
          if (counts[code] > 0) delete counts[code]
          else counts[code] = DEFAULT_PACK_SIZE
          return { counts, updatedAt: Date.now() }
        })
      },

      markOwned: (codes, count = DEFAULT_PACK_SIZE) => {
        set(state => {
          const counts = { ...state.counts }
          for (const code of codes) if (!counts[code]) counts[code] = count
          return { counts, updatedAt: Date.now() }
        })
      },

      applyAmounts: entries => {
        set(state => {
          const counts = { ...state.counts }
          for (const entry of entries) counts[entry.code] = Math.max(0, Math.floor(entry.count))
          return { counts, updatedAt: Date.now() }
        })
      },

      remove: code => {
        set(state => {
          const counts = { ...state.counts }
          delete counts[code]
          return { counts, updatedAt: Date.now() }
        })
      },

      clear: () => set({ counts: {}, updatedAt: Date.now() }),
    }),
    {
      name: INVENTORY_KEY,
      storage: createJSONStorage(() => taroStorage),
      partialize: state => ({ paletteId: state.paletteId, counts: state.counts, updatedAt: state.updatedAt }),
    },
  ),
)

export function ownedCodesOf(counts: Record<string, number>): string[] {
  return Object.keys(counts).filter(code => (counts[code] ?? 0) > 0)
}

export function ownedCount(counts: Record<string, number>): number {
  return ownedCodesOf(counts).length
}
