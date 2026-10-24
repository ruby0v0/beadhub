/**
 * 少量全局偏好（查看器 / BOM 的显示选项），同样 persist 到 Taro storage。
 * 单独放一个 store 是为了不让 pattern / inventory 两个核心 store 变胖。
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_WASTE_RATIO, clampWaste } from '../core/pattern/bom'
import { taroStorage } from './taroStorage'

export const SETTINGS_KEY = 'beadhub:settings:v1'

export interface SettingsState {
  /** BOM 损耗系数，契约区间 0.05 ~ 0.10 */
  wasteRatio: number
  /** 查看器显示色号 */
  showCodes: boolean
  /** 查看器显示网格线 */
  showGrid: boolean
  /** 逐行模式：点击最后一格自动跳下一行 */
  autoAdvanceRow: boolean
  setWasteRatio: (ratio: number) => void
  toggleCodes: () => void
  toggleGrid: () => void
  toggleAutoAdvance: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      wasteRatio: DEFAULT_WASTE_RATIO,
      showCodes: false,
      showGrid: true,
      autoAdvanceRow: true,
      setWasteRatio: ratio => set({ wasteRatio: clampWaste(ratio) }),
      toggleCodes: () => set(state => ({ showCodes: !state.showCodes })),
      toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),
      toggleAutoAdvance: () => set(state => ({ autoAdvanceRow: !state.autoAdvanceRow })),
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => taroStorage),
      partialize: state => ({
        wasteRatio: state.wasteRatio,
        showCodes: state.showCodes,
        showGrid: state.showGrid,
        autoAdvanceRow: state.autoAdvanceRow,
      }),
    },
  ),
)
