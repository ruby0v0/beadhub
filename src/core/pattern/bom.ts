/**
 * 用量清单（BOM）：按色号计数 + 损耗系数。
 *
 * 损耗默认 8%（契约要求的 5%~10% 区间），因为拼豆实际拼的时候会掉、会碎，
 * 而且按包买的时候整包数量也对不齐。UI 上可以让用户在这区间内选。
 */

import { EMPTY_CELL } from '../types'
import { countFilled, usedColorIndices, type Pattern } from './model'

export interface BomPaletteColor {
  code: string
  name?: string
  hex: string
}

export interface BomOptions {
  /** 损耗系数，默认 0.08，契约区间 0.05 ~ 0.10 */
  wasteRatio?: number
  /** 库存（按色号计数），传了就带出缺豆数 */
  inventory?: Record<string, number>
  /** 每块板的边长，默认 29（小号板） */
  boardSize?: number
}

export interface BomEntry {
  /** 色板索引 */
  colorIndex: number
  code: string
  name: string
  hex: string
  /** 图纸实际颗数 */
  count: number
  /** 含损耗后建议准备的颗数 */
  withWaste: number
  /** 库存颗数（未传 inventory 时为 0） */
  owned: number
  /** 还差多少颗（owned 足够时为 0） */
  shortage: number
  /** 占比 0~1 */
  share: number
}

export interface BomBoardLayout {
  /** 横向需要几块板 */
  cols: number
  /** 纵向需要几块板 */
  rows: number
  total: number
  boardSize: number
}

export interface Bom {
  patternId: string
  width: number
  height: number
  paletteId: string
  /** 全部格子数 */
  totalCells: number
  /** 需要拼的格子数（排除空格） */
  filledCells: number
  /** 空格数 */
  emptyCells: number
  /** 用到的色号数 */
  colorCount: number
  entries: BomEntry[]
  /** 总颗数（不含损耗） */
  totalBeads: number
  /** 总颗数（含损耗） */
  totalWithWaste: number
  wasteRatio: number
  boards: BomBoardLayout
}

/** 契约要求的损耗区间 */
export const WASTE_RATIO_MIN = 0.05
export const WASTE_RATIO_MAX = 0.1
export const DEFAULT_WASTE_RATIO = 0.08
export const DEFAULT_BOARD_SIZE = 29

export function computeBom(
  pattern: Pattern,
  palette: readonly BomPaletteColor[],
  options: BomOptions = {},
): Bom {
  const wasteRatio = clampWaste(options.wasteRatio ?? DEFAULT_WASTE_RATIO)
  const boardSize = Math.max(1, Math.floor(options.boardSize ?? DEFAULT_BOARD_SIZE))
  const inventory = options.inventory ?? {}
  const totalCells = pattern.width * pattern.height

  // 用 Int32Array 计数：色板索引就是下标，省掉 Map 的哈希开销
  const counts = new Int32Array(palette.length)
  for (let i = 0; i < pattern.cells.length; i++) {
    const v = pattern.cells[i]
    if (v >= 0 && v < counts.length) counts[v]++
  }

  const filledCells = countFilled(pattern)
  const entries: BomEntry[] = usedColorIndices(pattern).map(colorIndex => {
    const color = palette[colorIndex]
    const count = counts[colorIndex]
    const withWaste = Math.ceil(count * (1 + wasteRatio))
    const owned = inventory[color?.code] ?? 0
    return {
      colorIndex,
      code: color?.code ?? `#${colorIndex}`,
      name: color?.name ?? color?.code ?? `色号 ${colorIndex}`,
      hex: color?.hex ?? '#000000',
      count,
      withWaste,
      owned,
      shortage: Math.max(0, withWaste - owned),
      share: filledCells > 0 ? count / filledCells : 0,
    }
  })

  // 颗数多的排前面，UI 直接照着买
  entries.sort((a, b) => b.count - a.count || a.colorIndex - b.colorIndex)

  const totalBeads = entries.reduce((sum, e) => sum + e.count, 0)
  const totalWithWaste = entries.reduce((sum, e) => sum + e.withWaste, 0)

  return {
    patternId: pattern.id,
    width: pattern.width,
    height: pattern.height,
    paletteId: pattern.paletteId,
    totalCells,
    filledCells,
    emptyCells: totalCells - filledCells,
    colorCount: entries.length,
    entries,
    totalBeads,
    totalWithWaste,
    wasteRatio,
    boards: boardLayout(pattern.width, pattern.height, boardSize),
  }
}

export function boardLayout(width: number, height: number, boardSize = DEFAULT_BOARD_SIZE): BomBoardLayout {
  const size = Math.max(1, Math.floor(boardSize))
  const cols = Math.ceil(width / size)
  const rows = Math.ceil(height / size)
  return { cols, rows, total: cols * rows, boardSize: size }
}

export function clampWaste(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_WASTE_RATIO
  if (ratio < WASTE_RATIO_MIN) return WASTE_RATIO_MIN
  if (ratio > WASTE_RATIO_MAX) return WASTE_RATIO_MAX
  return ratio
}

/** 单行文案：给分享 / 复制清单用 */
export function formatBomLine(entry: BomEntry): string {
  const waste = entry.withWaste !== entry.count ? `（含损耗 ${entry.withWaste}）` : ''
  return `${entry.code} ${entry.hex} ${entry.count} 颗${waste}`
}

export function formatBomText(bom: Bom): string {
  const lines = [
    `图纸 ${bom.width}×${bom.height}｜共 ${bom.totalBeads} 颗｜${bom.colorCount} 个色号`,
    `按 ${(bom.wasteRatio * 100).toFixed(0)}% 损耗备豆：${bom.totalWithWaste} 颗`,
    `需要 ${bom.boards.total} 块 ${bom.boards.boardSize}×${bom.boards.boardSize} 板`,
    '',
  ]
  bom.entries.forEach((e, i) => lines.push(`${i + 1}. ${formatBomLine(e)}`))
  return lines.join('\n')
}

/** 缺豆清单（库存不够的色号） */
export function shortages(bom: Bom): BomEntry[] {
  return bom.entries.filter(e => e.shortage > 0).sort((a, b) => b.shortage - a.shortage)
}

/** 空格占比，UI 上提示「背景已去除」用 */
export function emptyRatio(bom: Bom): number {
  return bom.totalCells === 0 ? 0 : bom.emptyCells / bom.totalCells
}

export function isEmptyCell(value: number): boolean {
  return value === EMPTY_CELL
}
