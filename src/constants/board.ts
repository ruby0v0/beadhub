/**
 * 用户侧参数档位（契约要求：不给用户看数字）。
 * 数值只在这里出现一次，页面 / store / 服务统一引用。
 */

import type { BoardSizeOption, ColorCountOption } from '../types'

export const BOARD_SIZES: BoardSizeOption[] = [
  { key: 'small', label: '小', grid: 29, hint: '29×29 · 一块小板' },
  { key: 'medium', label: '中', grid: 52, hint: '52×52 · 推荐' },
  { key: 'large', label: '大', grid: 96, hint: '96×96 · 细节多' },
]

export const COLOR_COUNTS: ColorCountOption[] = [
  { key: 'simple', label: '简洁', count: 16, hint: '16 色 · 好备豆' },
  { key: 'fine', label: '细腻', count: 32, hint: '32 色 · 更还原' },
]

export const DEFAULT_BOARD_KEY = 'medium'
export const DEFAULT_COLOR_KEY = 'simple'

export function boardOption(key: string): BoardSizeOption {
  return BOARD_SIZES.find(b => b.key === key) ?? BOARD_SIZES[1]
}

export function colorOption(key: string): ColorCountOption {
  return COLOR_COUNTS.find(c => c.key === key) ?? COLOR_COUNTS[0]
}

/** 库存「一键标记有货」的默认颗数 */
export const DEFAULT_PACK_SIZE = 1000
