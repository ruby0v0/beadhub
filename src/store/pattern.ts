/**
 * 当前图纸（编辑中状态）。
 *
 * - 内存里放完整 Pattern，写盘时用 core 的 RLE 压缩；
 * - 编辑历史用 RLE 快照维护（默认保留 30 步），undo/redo 不用把整张图复制来复制去；
 * - persist 走 Taro.setStorageSync（见 taroStorage.ts），冷启动能直接回到上次没保存完的编辑。
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  clonePattern,
  decodeRle,
  deserializePattern,
  encodeRle,
  serializePattern,
  type Pattern,
  type SerializedPattern,
} from '../core/pattern/model'
import { floodFill, paintCells, replaceColor } from '../core/pattern/ops'
import { EMPTY_CELL } from '../core/types'
import { taroStorage } from './taroStorage'

const HISTORY_LIMIT = 30
export const CURRENT_PATTERN_KEY = 'beadhub:current-pattern:v1'

export interface PatternState {
  pattern: Pattern | null
  /** 编辑中但没保存 */
  dirty: boolean
  lastSavedAt: number
  past: string[]
  future: string[]
  /** 打开一张图纸（切图 / 新建 / 从仓库载入） */
  open: (pattern: Pattern, options?: { dirty?: boolean }) => void
  close: () => void
  /** 用整张新 cells 替换（编辑器批量操作） */
  replaceCells: (cells: ArrayLike<number>, options?: { history?: boolean }) => void
  /** 画笔：把一批格子涂成 value */
  paint: (indices: readonly number[], value: number) => void
  /** 单格点涂（点选用） */
  setCell: (col: number, row: number, value: number) => void
  /** 油漆桶 */
  bucket: (col: number, row: number, value: number) => void
  /** 全局换色 */
  swapColor: (from: number, to: number) => void
  clearAll: () => void
  undo: () => boolean
  redo: () => boolean
  markSaved: (pattern?: Pattern) => void
}

interface PersistedPatternState {
  pattern: SerializedPattern | null
  dirty: boolean
  lastSavedAt: number
  past: string[]
  future: string[]
}

export const usePatternStore = create<PatternState>()(
  persist(
    (set, get) => {
      const commit = (cells: ArrayLike<number>) => {
        const { pattern, past } = get()
        if (!pattern) return
        const snapshot = encodeRle(pattern)
        const next = {
          ...pattern,
          cells: Array.from(cells, v => v),
        }
        set({
          pattern: next,
          past: [...past, snapshot].slice(-HISTORY_LIMIT),
          future: [],
          dirty: true,
        })
      }

      return {
        pattern: null,
        dirty: false,
        lastSavedAt: 0,
        past: [],
        future: [],

        open: (pattern, options) =>
          set({
            pattern: clonePattern(pattern),
            past: [],
            future: [],
            dirty: options?.dirty ?? false,
          }),

        close: () => set({ pattern: null, past: [], future: [], dirty: false }),

        replaceCells: (cells, options) => {
          const { pattern } = get()
          if (!pattern) return
          if (options?.history === false) {
            set({ pattern: { ...pattern, cells: Array.from(cells, v => v) }, dirty: true })
            return
          }
          commit(cells)
        },

        paint: (indices, value) => {
          const { pattern } = get()
          if (!pattern) return
          commit(paintCells(pattern.cells, indices, value))
        },

        setCell: (col, row, value) => {
          const { pattern } = get()
          if (!pattern || col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) return
          const cells = pattern.cells.slice()
          cells[row * pattern.width + col] = value
          commit(cells)
        },

        bucket: (col, row, value) => {
          const { pattern } = get()
          if (!pattern) return
          commit(floodFill(pattern.cells, pattern.width, pattern.height, col, row, value))
        },

        swapColor: (from, to) => {
          const { pattern } = get()
          if (!pattern || from === to) return
          commit(replaceColor(pattern.cells, from, to))
        },

        clearAll: () => {
          const { pattern } = get()
          if (!pattern) return
          commit(new Array(pattern.width * pattern.height).fill(EMPTY_CELL))
        },

        undo: () => {
          const { pattern, past, future } = get()
          if (!pattern || past.length === 0) return false
          const previous = past[past.length - 1]
          const cells = decodeRle(previous, pattern.width, pattern.height)
          set({
            pattern: { ...pattern, cells: Array.from(cells) },
            past: past.slice(0, -1),
            future: [encodeRle(pattern), ...future].slice(0, HISTORY_LIMIT),
            dirty: true,
          })
          return true
        },

        redo: () => {
          const { pattern, past, future } = get()
          if (!pattern || future.length === 0) return false
          const [next, ...rest] = future
          const cells = decodeRle(next, pattern.width, pattern.height)
          set({
            pattern: { ...pattern, cells: Array.from(cells) },
            past: [...past, encodeRle(pattern)].slice(-HISTORY_LIMIT),
            future: rest,
            dirty: true,
          })
          return true
        },

        markSaved: (saved) =>
          set(state => ({
            pattern: saved ? clonePattern(saved) : state.pattern,
            dirty: false,
            lastSavedAt: Date.now(),
          })),
      }
    },
    {
      name: CURRENT_PATTERN_KEY,
      storage: createJSONStorage(() => taroStorage),
      partialize: (state): PersistedPatternState => ({
        pattern: state.pattern ? serializePattern(state.pattern) : null,
        dirty: state.dirty,
        lastSavedAt: state.lastSavedAt,
        past: state.past,
        future: state.future,
      }),
      merge: (persisted, current): PatternState => {
        const saved = persisted as Partial<PersistedPatternState> | undefined
        let pattern: Pattern | null = null
        if (saved?.pattern) {
          try {
            pattern = deserializePattern(saved.pattern)
          } catch (err) {
            console.warn('[patternStore] 恢复编辑中的图纸失败', err)
          }
        }
        return {
          ...current,
          pattern,
          dirty: saved?.dirty ?? false,
          lastSavedAt: saved?.lastSavedAt ?? 0,
          past: saved?.past ?? [],
          future: saved?.future ?? [],
        }
      },
    },
  ),
)
