import { describe, expect, it } from 'vitest'
import {
  boardLayout,
  clampWaste,
  computeBom,
  DEFAULT_BOARD_SIZE,
  DEFAULT_WASTE_RATIO,
  emptyRatio,
  formatBomLine,
  formatBomText,
  isEmptyCell,
  shortages,
  WASTE_RATIO_MAX,
  WASTE_RATIO_MIN,
} from '../../src/core/pattern/bom'
import { createPattern } from '../../src/core/pattern/model'

const palette = [
  { code: 'RED', name: '红色', hex: '#FF0000' },
  { code: 'BLUE', name: '蓝色', hex: '#0000FF' },
  { code: 'GREEN', name: '绿色', hex: '#00FF00' },
]

const makePattern = (width: number, height: number, cells: number[]) => ({
  ...createPattern(width, height, 'mard-v1', -1, 'p_bom'),
  cells,
})

describe('computeBom — 手工计数', () => {
  it('按色号计数与手算一致，share 正确', () => {
    // 2×3：RED×2, BLUE×1, 空×1, GREEN×2
    const p = makePattern(2, 3, [0, 0, 1, -1, 2, 2])
    const bom = computeBom(p, palette)

    expect(bom.entries).toHaveLength(3)
    const byCode = Object.fromEntries(bom.entries.map(e => [e.code, e]))
    expect(byCode.RED.count).toBe(2)
    expect(byCode.BLUE.count).toBe(1)
    expect(byCode.GREEN.count).toBe(2)
    expect(byCode.RED.share).toBeCloseTo(2 / 5, 10)
    expect(byCode.BLUE.share).toBeCloseTo(1 / 5, 10)

    expect(bom.totalCells).toBe(6)
    expect(bom.filledCells).toBe(5)
    expect(bom.emptyCells).toBe(1)
    expect(bom.totalBeads).toBe(5)
    expect(bom.colorCount).toBe(3)
    // 颗数多的排前面；同颗数按 entries 构造序（usedColorIndices 升序）
    expect(bom.entries.map(e => e.code)).toEqual(['RED', 'GREEN', 'BLUE'])
  })

  it('空图 → 空 BOM', () => {
    const p = makePattern(3, 3, new Array(9).fill(-1))
    const bom = computeBom(p, palette)
    expect(bom.entries).toEqual([])
    expect(bom.filledCells).toBe(0)
    expect(bom.totalBeads).toBe(0)
    expect(bom.emptyCells).toBe(9)
    expect(emptyRatio(bom)).toBe(1)
  })

  it('越界索引仍产生兜底 entry（usedColorIndices 未过滤越界）', () => {
    const p = makePattern(2, 2, [0, 1, 99, 50])
    const bom = computeBom(p, palette)
    expect(bom.filledCells).toBe(4)
    expect(bom.entries.map(e => e.code)).toEqual(['RED', 'BLUE', '#50', '#99'])
    // 越界索引在 Int32Array(palette.length) 之外不会被计数 → count undefined
    expect(bom.entries.map(e => e.count)).toEqual([1, 1, undefined, undefined])
  })
})

describe('computeBom — 损耗系数', () => {
  const p = makePattern(1, 10, [0, 0, 0, 0, 0, 0, 0, 1, 1, -1])

  it('wasteRatio=0 仍被钳制到 5%（实现契约）', () => {
    const bom = computeBom(p, palette, { wasteRatio: 0 })
    expect(bom.wasteRatio).toBe(0.05)
    // 7 颗 RED：ceil(7 * 1.05) = ceil(7.35) = 8（钳制后仍有损耗）
    const red = bom.entries.find(e => e.code === 'RED')!
    expect(red.withWaste).toBe(8)
    expect(bom.totalWithWaste).toBeGreaterThan(bom.totalBeads)
  })

  it('wasteRatio=0.05：8 颗 → ceil(8.4)=9', () => {
    const bom = computeBom(p, palette, { wasteRatio: 0.05 })
    const red = bom.entries.find(e => e.code === 'RED')!
    expect(red.count).toBe(7)
    expect(red.withWaste).toBe(8) // ceil(7 * 1.05) = ceil(7.35)
  })

  it('wasteRatio=0.1：向上取整', () => {
    const bom = computeBom(p, palette, { wasteRatio: 0.1 })
    const red = bom.entries.find(e => e.code === 'RED')!
    expect(red.withWaste).toBe(8) // ceil(7 * 1.1) = ceil(7.7)
    const blue = bom.entries.find(e => e.code === 'BLUE')!
    expect(blue.withWaste).toBe(3) // ceil(2 * 1.1) = ceil(2.2)
  })

  it('默认损耗 8%', () => {
    const bom = computeBom(p, palette)
    expect(bom.wasteRatio).toBe(DEFAULT_WASTE_RATIO)
    expect(DEFAULT_WASTE_RATIO).toBe(0.08)
  })

  it('损耗区间钳制到 5%~10%', () => {
    expect(clampWaste(0)).toBe(WASTE_RATIO_MIN)
    expect(clampWaste(0.04)).toBe(WASTE_RATIO_MIN)
    expect(clampWaste(0.5)).toBe(WASTE_RATIO_MAX)
    expect(clampWaste(0.07)).toBe(0.07)
    expect(clampWaste(NaN)).toBe(DEFAULT_WASTE_RATIO)
  })
})

describe('computeBom — 库存与缺豆', () => {
  const p = makePattern(1, 5, [0, 0, 0, 1, -1])

  it('库存足够 → shortage=0；不足 → 差值', () => {
    const bom = computeBom(p, palette, { wasteRatio: 0, inventory: { RED: 2, BLUE: 2 } })
    const red = bom.entries.find(e => e.code === 'RED')!
    const blue = bom.entries.find(e => e.code === 'BLUE')!
    expect(red.owned).toBe(2)
    expect(red.shortage).toBe(2)
    expect(blue.owned).toBe(2)
    expect(blue.shortage).toBe(0)
    expect(shortages(bom).map(e => e.code)).toEqual(['RED'])
  })

  it('未传库存 → owned=0，全部按需备货', () => {
    const bom = computeBom(p, palette) // 默认 8% 损耗
    for (const e of bom.entries) {
      expect(e.owned).toBe(0)
      expect(e.shortage).toBe(e.withWaste)
    }
  })
})

describe('boardLayout / 工具函数', () => {
  it('52×52 → 2×2 块 29 板', () => {
    expect(boardLayout(52, 52, 29)).toEqual({ cols: 2, rows: 2, total: 4, boardSize: 29 })
  })

  it('刚好整除 → 不多排板', () => {
    expect(boardLayout(58, 29, 29)).toEqual({ cols: 2, rows: 1, total: 2, boardSize: 29 })
    expect(boardLayout(29, 29, 29)).toEqual({ cols: 1, rows: 1, total: 1, boardSize: 29 })
  })

  it('boardSize 最小为 1', () => {
    expect(boardLayout(3, 2, 0)).toEqual({ cols: 3, rows: 2, total: 6, boardSize: 1 })
  })

  it('isEmptyCell 语义', () => {
    expect(isEmptyCell(-1)).toBe(true)
    expect(isEmptyCell(0)).toBe(false)
  })
})

describe('格式化输出', () => {
  it('formatBomLine：无损耗时不带括号，有损耗带建议颗数', () => {
    const p = makePattern(1, 4, [0, 0, 1, -1])
    const noWaste = computeBom(p, palette, { wasteRatio: 0.05 })
    expect(formatBomLine(noWaste.entries[0])).toBe('RED #FF0000 2 颗（含损耗 3）')

    const withWaste = computeBom(p, palette, { wasteRatio: 0.1 })
    expect(formatBomLine(withWaste.entries[0])).toBe('RED #FF0000 2 颗（含损耗 3）')
  })

  it('formatBomText 包含总数与板数', () => {
    const p = makePattern(29, 29, new Array(29 * 29).fill(0))
    const bom = computeBom(p, palette)
    const text = formatBomText(bom)
    expect(text).toContain('共 841 颗')
    expect(text).toContain('1 个色号')
    expect(text).toContain('1 块 29×29 板')
  })
})

describe('常量契约', () => {
  it('默认板 29、损耗区间 [0.05, 0.1]', () => {
    expect(DEFAULT_BOARD_SIZE).toBe(29)
    expect(WASTE_RATIO_MIN).toBe(0.05)
    expect(WASTE_RATIO_MAX).toBe(0.1)
  })
})
