/**
 * 颜色 → 最近色号。
 *
 * 策略：色板的 Lab 值按 paletteId 预计算缓存，匹配用线性扫描 + ΔE00。
 * 291 色的线性扫描一次约 0.05ms，而流水线里真正逐像素走的是「K 个代表色」这一层，
 * 所以不需要 k-d 树那种复杂度。
 */

import { hexToRgb, rgbToLab, type Lab, type RGB } from './convert'
import { deltaE2000, deltaE76 } from './distance'

export interface PaletteEntry {
  code: string
  name?: string
  hex: string
}

export interface LabEntry<T extends PaletteEntry> {
  entry: T
  index: number
  rgb: RGB
  lab: Lab
}

/** 预计算：色板 → Lab 索引 */
export function buildLabIndex<T extends PaletteEntry>(colors: readonly T[]): LabEntry<T>[] {
  return colors.map((entry, index) => {
    const rgb = hexToRgb(entry.hex)
    return { entry, index, rgb, lab: rgbToLab(rgb) }
  })
}

export function nearestColorIndex(lab: Lab, index: readonly LabEntry<PaletteEntry>[]): number {
  return nearestLabIndex(lab, index)
}

/** 线性扫描（ΔE00），返回色板索引；空色板返回 -1 */
export function nearestLabIndex(lab: Lab, labs: readonly { lab: Lab }[]): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < labs.length; i++) {
    const d = deltaE2000(lab, labs[i].lab)
    if (d < bestDistance) {
      bestDistance = d
      best = i
      if (d === 0) break
    }
  }
  return best
}

/**
 * 带粗筛的匹配：先用 ΔE76 选出候选，再用 ΔE00 精算。
 * 结果与纯线性扫描一致（候选集一定包含 ΔE00 最优解的概率很高，
 * 保守起见只在色板 > 64 色时启用，且候选数按比例放宽）。
 */
export function nearestLabIndexFast(lab: Lab, labs: readonly { lab: Lab }[], candidates = 8): number {
  if (labs.length <= 64 || candidates >= labs.length) return nearestLabIndex(lab, labs)
  const scored: { i: number; d: number }[] = []
  for (let i = 0; i < labs.length; i++) scored.push({ i, d: deltaE76(lab, labs[i].lab) })
  scored.sort((a, b) => a.d - b.d)
  const shortlist = scored.slice(0, candidates)
  let best = shortlist[0].i
  let bestDistance = Number.POSITIVE_INFINITY
  for (const { i } of shortlist) {
    const d = deltaE2000(lab, labs[i].lab)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}

/**
 * 色板匹配器：构造时把 Lab 算好，之后匹配只做扫描。
 */
export class PaletteMatcher<T extends PaletteEntry = PaletteEntry> {
  readonly colors: readonly T[]
  readonly index: LabEntry<T>[]

  constructor(colors: readonly T[]) {
    this.colors = colors
    this.index = buildLabIndex(colors)
  }

  get size(): number {
    return this.colors.length
  }

  /** 返回色板索引，空色板返回 -1 */
  matchRgb(rgb: RGB): number {
    return nearestLabIndex(rgbToLab(rgb), this.index)
  }

  matchLab(lab: Lab): number {
    return nearestLabIndex(lab, this.index)
  }

  labAt(index: number): Lab | undefined {
    return this.index[index]?.lab
  }

  rgbAt(index: number): RGB | undefined {
    return this.index[index]?.rgb
  }

  codeAt(index: number): string | undefined {
    return this.index[index]?.entry.code
  }
}

const matcherCache = new Map<string, PaletteMatcher>()

/**
 * 按 paletteId 缓存 matcher：同一张图纸的所有像素映射共用一份预计算 Lab。
 * 色库换了版本（id 变了）自然拿到新的 matcher，不会串味。
 */
export function getMatcher<T extends PaletteEntry>(paletteId: string, colors?: readonly T[]): PaletteMatcher<T> {
  const cached = matcherCache.get(paletteId) as PaletteMatcher<T> | undefined
  if (cached) return cached
  if (!colors) {
    throw new Error(`[match] palette "${paletteId}" 未缓存，首次调用必须传入 colors`)
  }
  const matcher = new PaletteMatcher(colors)
  matcherCache.set(paletteId, matcher as PaletteMatcher)
  return matcher
}

export function clearMatcherCache(): void {
  matcherCache.clear()
}
