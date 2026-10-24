/**
 * 像素 → 色号映射。
 *
 * 两条路径：
 * 1. 直接匹配：像素逐颗扫全色板（色板小或不做量化时用）。
 * 2. 两级映射（create 页默认）：像素先落到 K 个代表色上，代表色再一次性匹配到色板，
 *    这样 w*h 个像素只需要扫 K 个锚点，最后统一成色板索引。
 */

import { rgbToLab } from '../color/convert'
import { deltaE2000 } from '../color/distance'
import { nearestLabIndex, type PaletteEntry, type PaletteMatcher } from '../color/match'
import { EMPTY_CELL, type ColorAnchor, type RgbaImage } from '../types'

export interface MapOptions {
  /** alpha 低于该值的像素映射成空格 -1，默认 8 */
  alphaThreshold?: number
}

/** 逐像素在色板上找最近色号，返回色板索引数组（-1 = 空格） */
export function mapPixelsToPalette<T extends PaletteEntry>(
  img: RgbaImage,
  matcher: PaletteMatcher<T>,
  options: MapOptions = {},
): Int16Array {
  const alphaThreshold = options.alphaThreshold ?? 8
  const { width: w, height: h, data } = img
  const out = new Int16Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const o = p * 4
    if (data[o + 3] < alphaThreshold) {
      out[p] = EMPTY_CELL
      continue
    }
    out[p] = nearestLabIndex(rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] }), matcher.index)
  }
  return out
}

/** 逐像素找最近代表色，返回锚点序号数组（-1 = 空格） */
export function mapPixelsToAnchors(img: RgbaImage, anchors: readonly ColorAnchor[], options: MapOptions = {}): Int16Array {
  const alphaThreshold = options.alphaThreshold ?? 8
  const { width: w, height: h, data } = img
  const out = new Int16Array(w * h)
  if (anchors.length === 0) {
    out.fill(EMPTY_CELL)
    return out
  }
  for (let p = 0; p < w * h; p++) {
    const o = p * 4
    if (data[o + 3] < alphaThreshold) {
      out[p] = EMPTY_CELL
      continue
    }
    out[p] = nearestLabIndex(rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] }), anchors)
  }
  return out
}

/**
 * 代表色 → 色板索引。
 * 多个代表色可能落到同一个色号（16 色缩到 12 个色号很常见），这里只做映射不去重，
 * 去重交给 usedColorIndices()。
 */
export function anchorsToPaletteIndices<T extends PaletteEntry>(
  anchors: readonly ColorAnchor[],
  matcher: PaletteMatcher<T>,
): number[] {
  return anchors.map(a => matcher.matchLab(a.lab))
}

/** 锚点序号数组 → 色板索引数组 */
export function applyAnchorPalette(anchorIndex: Int16Array, paletteOfAnchor: readonly number[]): Int16Array {
  const out = new Int16Array(anchorIndex.length)
  for (let i = 0; i < anchorIndex.length; i++) {
    const a = anchorIndex[i]
    out[i] = a < 0 ? EMPTY_CELL : paletteOfAnchor[a] ?? EMPTY_CELL
  }
  return out
}

/** 锚点序号数组 → 色板索引数组，但直接在已有数组上写（省一次分配） */
export function applyAnchorPaletteInPlace(anchorIndex: Int16Array, paletteOfAnchor: readonly number[]): Int16Array {
  for (let i = 0; i < anchorIndex.length; i++) {
    const a = anchorIndex[i]
    if (a >= 0) anchorIndex[i] = paletteOfAnchor[a] ?? EMPTY_CELL
  }
  return anchorIndex
}

/** 两个 Lab 色的 ΔE00，暴露给 UI 做「色差提示」 */
export function anchorDistance(a: ColorAnchor, b: ColorAnchor): number {
  return deltaE2000(a.lab, b.lab)
}
