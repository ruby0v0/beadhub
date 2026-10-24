/**
 * 跨层共享类型（UI / services / store）。
 * 纯算法类型留在 src/core/types.ts，别混进来。
 */

import type { Pattern } from '../core/pattern/model'

export type { Pattern }

/** 板数档位（用户侧只看到 小/中/大） */
export type BoardSizeKey = 'small' | 'medium' | 'large'

/** 颜色数档位 */
export type ColorCountKey = 'simple' | 'fine'

export interface BoardSizeOption {
  key: BoardSizeKey
  label: string
  grid: number
  hint: string
}

export interface ColorCountOption {
  key: ColorCountKey
  label: string
  count: number
  hint: string
}

/** 图纸在仓库里的状态：草稿 / 完成 */
export type PatternStatus = 'draft' | 'finished'

/** 保存到本地的图纸索引项 */
export interface StoredPatternMeta {
  id: string
  title: string
  width: number
  height: number
  paletteId: string
  colorCount: number
  filled: number
  /** 空格数（去背后的空心格） */
  empty: number
  status: PatternStatus
  favorite: boolean
  /** 出镜率最高的几个色号，列表页做缩略条 */
  topColors: string[]
  createdAt: number
  updatedAt: number
  openedAt: number
  /** 搭豆进度 0~1 */
  progress: number
}

export interface ProgressRecord {
  patternId: string
  completedCount: number
  total: number
  /** 逐行模式停在的行 */
  row: number
  updatedAt: number
}

/** 画布手势变换：内容坐标系（1 单位 = 1 格）→ 屏幕 px */
export interface Transform {
  /** 每格多少屏幕 px */
  scale: number
  tx: number
  ty: number
}

export interface CanvasInfo {
  /** CSS px */
  width: number
  height: number
  dpr: number
}

export type GridCell = { col: number; row: number }

export interface BuildRequestSummary {
  boardLabel: string
  colorLabel: string
  removeBackground: boolean
  dither: boolean
  rotate: number
}
