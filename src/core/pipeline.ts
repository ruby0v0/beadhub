/**
 * 图片 → 图纸 全流水线（create 页唯一入口）。
 *
 *   原图 → 裁剪/旋转 → 背景去除(可选) → 下采样 → 量化 → 颜色映射 → 抖动(可选) → Pattern
 *
 * 每一步的时间都记在 result.steps 里，方便在 UI 上展示「耗时」并做性能回归。
 * 这一层同样不碰任何 Taro API：像素从哪来（小程序 offscreen canvas / H5 canvas /
 * 单测里直接构造）由调用方决定。
 */

import {
  DEFAULT_PALETTE_ID,
  getPaletteColors,
  type PaletteColor,
} from '../constants/palettes'
import { getMatcher } from './color/match'
import { applyMaskToAlpha, removeBackground } from './image/background'
import { centerSquare, cropImage, rotateImage, type CropRect, type Rotation } from './image/transform'
import { assertPatternSize, createPattern, usedColorIndices, type Pattern } from './pattern/model'
import { downscaleBox, downscaleToMax } from './quantize/downscale'
import { ditherToAnchors } from './quantize/dither'
import { anchorsToPaletteIndices, applyAnchorPalette, mapPixelsToAnchors } from './quantize/map'
import { medianCut, type RepresentativeColor } from './quantize/median-cut'
import { EMPTY_CELL, type RgbaImage } from './types'

export type GridSpec = number | { width: number; height: number }

export interface BuildPatternOptions {
  /** 板数档位：29 / 52 / 96，也可以直接给 {width, height} */
  grid: GridSpec
  /** 颜色数档位：16（简洁）/ 32（细腻） */
  colorCount?: number
  paletteId?: string
  palette?: readonly PaletteColor[]
  /** 背景去除（四角取色 + 容差泛洪），默认开启 */
  removeBackground?: boolean
  /** 背景容差 0~255，默认 32 */
  backgroundTolerance?: number
  /** 抖动，默认关闭（高级选项） */
  dither?: boolean
  ditherStrength?: number
  rotate?: Rotation
  /** 裁剪：'center-square' 中心正方形 / 'none' 原图 / 显式矩形 */
  crop?: CropRect | 'center-square' | 'none'
  /** 下采样前的粗降上限，默认 1024 */
  sourceMaxSize?: number
  /** 格子 alpha 低于该值算空格，默认 96（去背后的半透明边缘不产生脏格） */
  emptyAlphaThreshold?: number
  id?: string
  title?: string
}

export interface BuildStep {
  name: string
  ms: number
}

export interface BuildPatternResult {
  pattern: Pattern
  /** 量化出的代表色（按占比降序），create 页用来展示「主色」 */
  anchors: RepresentativeColor[]
  /** 图纸实际用到的色板索引 */
  usedColorIndices: number[]
  /** 去背信息（未开启时为 undefined） */
  background?: {
    cornerColors: { r: number; g: number; b: number }[]
    removedRatio: number
  }
  steps: BuildStep[]
  timingMs: number
  title?: string
}

const now = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now()

export function buildPatternFromImage(image: RgbaImage, options: BuildPatternOptions): BuildPatternResult {
  const { width: gridW, height: gridH } = resolveGrid(options.grid)
  assertPatternSize(gridW, gridH)

  const paletteId = options.paletteId ?? DEFAULT_PALETTE_ID
  const palette = options.palette ?? getPaletteColors(paletteId)
  const emptyAlphaThreshold = options.emptyAlphaThreshold ?? 96
  const colorCount = Math.max(1, Math.floor(options.colorCount ?? 16))
  const steps: BuildStep[] = []
  const startedAt = now()

  const step = <T>(name: string, fn: () => T): T => {
    const t0 = now()
    const result = fn()
    steps.push({ name, ms: round2(now() - t0) })
    return result
  }

  // 1. 裁剪 / 旋转
  let source = step('裁剪/旋转', () => {
    let img = image
    if (options.rotate) img = rotateImage(img, options.rotate)
    const crop = options.crop ?? 'center-square'
    if (crop === 'center-square') img = centerSquare(img)
    else if (crop !== 'none') img = cropImage(img, crop)
    return img
  })

  // 2. 背景去除（可选）：直接落到 alpha 上，后续下采样天然跳过背景像素
  let background: BuildPatternResult['background']
  if (options.removeBackground ?? true) {
    const result = step('背景去除', () => removeBackground(source, { tolerance: options.backgroundTolerance ?? 32 }))
    source = applyMaskToAlpha(source, result.mask)
    const total = source.width * source.height
    background = { cornerColors: result.corners, removedRatio: total ? result.removed / total : 0 }
  }

  // 3. 下采样：先粗降到合理尺寸，再做 box filter 精降
  const gridImage = step('下采样', () => {
    const maxSize = options.sourceMaxSize ?? 1024
    const longest = Math.max(source.width, source.height)
    const pre = longest > maxSize * 2 ? downscaleToMax(source, maxSize) : source
    return downscaleBox(pre, gridW, gridH)
  })

  // 4. 量化：中位切分提取 K 个代表色
  const anchors = step('主色提取', () => medianCut(gridImage, colorCount))

  if (anchors.length === 0) {
    // 整张图都被判成背景：返回一张全空图纸
    steps.push({ name: '颜色映射', ms: 0 }, { name: '抖动', ms: 0 })
    const empty = createPattern(gridW, gridH, paletteId, EMPTY_CELL, options.id)
    return {
      pattern: empty,
      anchors: [],
      usedColorIndices: [],
      background,
      steps,
      timingMs: round2(now() - startedAt),
      title: options.title,
    }
  }

  // 5. 颜色映射：代表色 → 色号，像素 → 代表色（可选抖动）
  const matcher = getMatcher(paletteId, palette)
  const paletteOfAnchor = step('颜色映射', () => anchorsToPaletteIndices(anchors, matcher))
  const anchorIndex = step(options.dither ? '抖动' : '颜色映射', () =>
    options.dither
      ? ditherToAnchors(gridImage, anchors, { strength: options.ditherStrength ?? 1, alphaThreshold: emptyAlphaThreshold })
      : mapPixelsToAnchors(gridImage, anchors, { alphaThreshold: emptyAlphaThreshold }),
  )
  const cells = applyAnchorPalette(anchorIndex, paletteOfAnchor)

  const pattern: Pattern = {
    ...createPattern(gridW, gridH, paletteId, EMPTY_CELL, options.id),
    cells: Array.from(cells),
  }

  return {
    pattern,
    anchors,
    usedColorIndices: usedColorIndices(pattern),
    background,
    steps,
    timingMs: round2(now() - startedAt),
    title: options.title,
  }
}

export interface RawImageInput {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

/** 便捷入口：直接吃 RGBA buffer */
export function buildPatternFromRawRgba(input: RawImageInput, options: BuildPatternOptions): BuildPatternResult {
  return buildPatternFromImage({ data: input.data, width: input.width, height: input.height }, options)
}

/** 板数档位 → 网格尺寸 */
export const BOARD_PRESETS = {
  small: 29,
  medium: 52,
  large: 96,
} as const

export type BoardPresetKey = keyof typeof BOARD_PRESETS

export function resolveGrid(grid: GridSpec): { width: number; height: number } {
  if (typeof grid === 'number') {
    const size = Math.max(1, Math.floor(grid))
    return { width: size, height: size }
  }
  return { width: Math.max(1, Math.floor(grid.width)), height: Math.max(1, Math.floor(grid.height)) }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
