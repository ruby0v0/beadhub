/**
 * 图纸数据模型 + RLE 序列化。
 *
 * - 内存里用 Int16Array（100×100 也就 20KB），存盘 / 传输用 RLE 字符串。
 * - RLE 是 `[{c, colorIndex}, {n, count}]` 的游程序列，落成字符串形如 `12:0,5:-1,37`
 *   （count:colorIndex，逗号分隔；连续 1 格时省略 count，直接写色号），-1 表示空格。
 *   照片类图纸游程短，省略 `1:` 能省下不少字符；纯色底图纸则压缩到几十个字符。
 * - paletteId 从第一天就带上：色库以后加色 / 改色值都不会毁掉已存的图纸。
 */

import { EMPTY_CELL, type CellValue } from '../types'

export const PATTERN_VERSION = 1 as const
/** 单图纸尺寸上限（正方形板的最大边长） */
export const MAX_DIMENSION = 100

export interface Pattern {
  id: string
  version: typeof PATTERN_VERSION
  width: number
  height: number
  /** 锁定的色库版本，如 'mard-v1' */
  paletteId: string
  /** 长度 = width * height，值 = 色板索引，-1 = 空 */
  cells: number[]
}

/** RLE 游程：c = 色板索引，n = 连续格子数 */
export interface RleRun {
  c: CellValue
  n: number
}

export interface PatternMeta {
  id: string
  width: number
  height: number
  paletteId: string
  /** 已填色格子数 */
  filled: number
  /** 用到的色号数 */
  colorCount: number
  createdAt: number
  updatedAt: number
  title?: string
}

export function assertPatternSize(width: number, height: number): void {
  const w = Math.floor(width)
  const h = Math.floor(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error(`[pattern] 尺寸非法：${width} x ${height}`)
  }
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    throw new Error(`[pattern] 超过单图纸上限 ${MAX_DIMENSION} x ${MAX_DIMENSION}`)
  }
}

export function createPatternId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `p_${Date.now().toString(36)}_${rand}`
}

export function createPattern(
  width: number,
  height: number,
  paletteId: string,
  fill: CellValue = EMPTY_CELL,
  id: string = createPatternId(),
): Pattern {
  assertPatternSize(width, height)
  const w = Math.floor(width)
  const h = Math.floor(height)
  return {
    id,
    version: PATTERN_VERSION,
    width: w,
    height: h,
    paletteId,
    cells: new Array(w * h).fill(fill),
  }
}

/** 内存态：cells 转 Int16Array */
export function toInt16(pattern: Pattern | readonly number[]): Int16Array {
  const cells = Array.isArray(pattern) ? pattern : (pattern as Pattern).cells
  return Int16Array.from(cells as number[])
}

export function toCellArray(cells: ArrayLike<number>): number[] {
  return Array.from(cells, v => v)
}

export function index2d(pattern: Pick<Pattern, 'width'>, col: number, row: number): number {
  return row * pattern.width + col
}

export function isInside(pattern: Pick<Pattern, 'width' | 'height'>, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < pattern.width && row < pattern.height
}

export function getCell(pattern: Pattern, col: number, row: number): CellValue {
  if (!isInside(pattern, col, row)) return EMPTY_CELL
  return pattern.cells[row * pattern.width + col]
}

export function setCell(pattern: Pattern, col: number, row: number, value: CellValue): Pattern {
  if (!isInside(pattern, col, row)) return pattern
  const cells = pattern.cells.slice()
  cells[row * pattern.width + col] = value
  return { ...pattern, cells }
}

export function clonePattern(pattern: Pattern): Pattern {
  return { ...pattern, cells: pattern.cells.slice() }
}

/** 已填色（非空格）格子数 */
export function countFilled(pattern: Pattern | readonly number[]): number {
  const cells = Array.isArray(pattern) ? pattern : (pattern as Pattern).cells
  let filled = 0
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) filled++
  return filled
}

/** 图纸用到的色板索引（去重，升序） */
export function usedColorIndices(pattern: Pattern | readonly number[]): number[] {
  const cells = Array.isArray(pattern) ? pattern : (pattern as Pattern).cells
  const set = new Set<number>()
  for (let i = 0; i < cells.length; i++) if (cells[i] >= 0) set.add(cells[i])
  return [...set].sort((a, b) => a - b)
}

/** 逐格跑出行程（RLE） */
export function runsOf(cells: ArrayLike<number>): RleRun[] {
  const runs: RleRun[] = []
  if (cells.length === 0) return runs
  let current = cells[0]
  let count = 1
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] === current) {
      count++
    } else {
      runs.push({ c: current, n: count })
      current = cells[i]
      count = 1
    }
  }
  runs.push({ c: current, n: count })
  return runs
}

export function cellsFromRuns(runs: readonly RleRun[], width: number, height: number): Int16Array {
  const total = width * height
  const out = new Int16Array(total)
  let p = 0
  for (const run of runs) {
    const n = Math.max(0, Math.floor(run.n))
    for (let i = 0; i < n && p < total; i++) out[p++] = run.c
  }
  if (p !== total) throw new Error(`[pattern] RLE 长度不匹配：期望 ${total}，实际 ${p}`)
  return out
}

/** cells → RLE 字符串：`12:0,5:-1,37`（`n === 1` 时省略 count） */
export function encodeRle(pattern: Pattern | ArrayLike<number>): string {
  const cells = isPatternLike(pattern) ? pattern.cells : (pattern as ArrayLike<number>)
  return runsOf(cells)
    .map(run => (run.n === 1 ? `${run.c}` : `${run.n}:${run.c}`))
    .join(',')
}

/** RLE 字符串 → Int16Array，长度必须等于 width*height */
export function decodeRle(rle: string, width: number, height: number): Int16Array {
  const total = width * height
  const out = new Int16Array(total)
  if (!rle) {
    out.fill(EMPTY_CELL)
    return out
  }
  let p = 0
  for (const chunk of rle.split(',')) {
    if (!chunk) continue
    const sep = chunk.indexOf(':')
    const n = sep < 0 ? 1 : Number(chunk.slice(0, sep))
    const c = sep < 0 ? Number(chunk) : Number(chunk.slice(sep + 1))
    if (!Number.isFinite(n) || !Number.isFinite(c) || n <= 0) {
      throw new Error(`[pattern] RLE 片段非法：${chunk}`)
    }
    for (let i = 0; i < n && p < total; i++) out[p++] = c
  }
  if (p !== total) throw new Error(`[pattern] RLE 长度不匹配：期望 ${total}，实际 ${p}`)
  return out
}

/** RLE 字符串 → 游程序列（契约里的 [{c},{n}] 形式，UI 想按行渲染时用） */
export function decodeRuns(rle: string): RleRun[] {
  return rle
    .split(',')
    .filter(Boolean)
    .map(chunk => {
      const sep = chunk.indexOf(':')
      if (sep < 0) return { n: 1, c: Number(chunk) }
      return { n: Number(chunk.slice(0, sep)), c: Number(chunk.slice(sep + 1)) }
    })
}

/** RLE 文本的压缩比（相对未压缩的 cells），> 1 表示比原始数组还大 */
export function rleRatio(rle: string, cellCount: number): number {
  return cellCount === 0 ? 0 : rle.length / cellCount
}

/** 存盘 / 传输用的紧凑结构 */
export interface SerializedPattern {
  id: string
  v: typeof PATTERN_VERSION
  w: number
  h: number
  paletteId: string
  /** RLE 字符串 */
  rle: string
}

export function serializePattern(pattern: Pattern): SerializedPattern {
  return {
    id: pattern.id,
    v: PATTERN_VERSION,
    w: pattern.width,
    h: pattern.height,
    paletteId: pattern.paletteId,
    rle: encodeRle(pattern),
  }
}

export function deserializePattern(data: SerializedPattern | string): Pattern {
  const obj: SerializedPattern = typeof data === 'string' ? JSON.parse(data) : data
  if (!obj || typeof obj !== 'object') throw new Error('[pattern] 反序列化失败：数据为空')
  if (obj.v !== PATTERN_VERSION) throw new Error(`[pattern] 版本不支持：${obj.v}`)
  assertPatternSize(obj.w, obj.h)
  const cells = decodeRle(obj.rle, obj.w, obj.h)
  return {
    id: obj.id,
    version: PATTERN_VERSION,
    width: obj.w,
    height: obj.h,
    paletteId: obj.paletteId,
    cells: toCellArray(cells),
  }
}

export function patternMeta(pattern: Pattern, extra: Partial<PatternMeta> = {}): PatternMeta {
  const now = Date.now()
  return {
    id: pattern.id,
    width: pattern.width,
    height: pattern.height,
    paletteId: pattern.paletteId,
    filled: countFilled(pattern),
    colorCount: usedColorIndices(pattern).length,
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

/** 裁剪到指定范围（编辑器里框选删除用） */
export function cropPattern(pattern: Pattern, x: number, y: number, width: number, height: number): Pattern {
  assertPatternSize(width, height)
  const cells: number[] = new Array(width * height).fill(EMPTY_CELL)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells[row * width + col] = getCell(pattern, x + col, y + row)
    }
  }
  return { ...pattern, width, height, cells }
}

/** 把图纸等比缩放到另一个网格尺寸（编辑器换板数用，最近邻取整格） */
export function resizePattern(pattern: Pattern, width: number, height: number): Pattern {
  assertPatternSize(width, height)
  const cells: number[] = new Array(width * height).fill(EMPTY_CELL)
  for (let row = 0; row < height; row++) {
    const sy = Math.min(pattern.height - 1, Math.floor(((row + 0.5) * pattern.height) / height))
    for (let col = 0; col < width; col++) {
      const sx = Math.min(pattern.width - 1, Math.floor(((col + 0.5) * pattern.width) / width))
      cells[row * width + col] = pattern.cells[sy * pattern.width + sx]
    }
  }
  return { ...pattern, width, height, cells }
}

function isPatternLike(value: unknown): value is Pattern {
  return !!value && typeof value === 'object' && Array.isArray((value as Pattern).cells)
}
