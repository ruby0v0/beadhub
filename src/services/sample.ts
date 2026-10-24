/**
 * 首次进入时的种子数据：用内置样例图跑一遍流水线，
 * 保证首页 / 详情页 / 查看页在没导入过图片时也有东西可点。
 */

import { buildPatternFromImage, createSampleImage } from '../core'
import { DEFAULT_PALETTE_ID } from '../constants/palettes'
import type { Pattern } from '../core/pattern/model'
import { StorageKeys, readJSON, writeJSON } from './storage'
import { hasPattern, listPatterns, savePattern } from './patternRepo'

export const SAMPLE_PATTERN_ID = 'sample-heart'

export function createSeedPattern(): Pattern {
  const result = buildPatternFromImage(createSampleImage(256), {
    grid: 52,
    colorCount: 16,
    removeBackground: true,
    paletteId: DEFAULT_PALETTE_ID,
    id: SAMPLE_PATTERN_ID,
    title: '样例图纸 · 爱心',
  })
  return result.pattern
}

/** 幂等：已经种过就不再动，避免每次冷启动覆盖用户改过的样例 */
export function ensureSeedData(): void {
  const seeded = readJSON<boolean>(StorageKeys.seeds, false)
  if (seeded && hasPattern(SAMPLE_PATTERN_ID)) return
  if (!hasPattern(SAMPLE_PATTERN_ID) && listPatterns().length === 0) {
    savePattern(createSeedPattern(), { title: '样例图纸 · 爱心', status: 'finished' })
  }
  writeJSON(StorageKeys.seeds, true)
}
