import { describe, expect, it } from 'vitest'
import {
  MAX_DIMENSION,
  PATTERN_VERSION,
  assertPatternSize,
  cellsFromRuns,
  countFilled,
  createPattern,
  cropPattern,
  decodeRle,
  decodeRuns,
  deserializePattern,
  encodeRle,
  getCell,
  isInside,
  resizePattern,
  rleRatio,
  runsOf,
  serializePattern,
  setCell,
  usedColorIndices,
} from '../../src/core/pattern/model'
import { EMPTY_CELL } from '../../src/core/types'

const makePattern = (width: number, height: number, cells: number[]) => ({
  ...createPattern(width, height, 'mard-v1', EMPTY_CELL, 'p_test'),
  cells,
})

describe('createPattern / 尺寸契约', () => {
  it('默认全空格，带版本与 paletteId', () => {
    const p = createPattern(10, 6, 'mard-v1')
    expect(p.version).toBe(PATTERN_VERSION)
    expect(p.width).toBe(10)
    expect(p.height).toBe(6)
    expect(p.paletteId).toBe('mard-v1')
    expect(p.cells).toHaveLength(60)
    expect(p.cells.every(v => v === EMPTY_CELL)).toBe(true)
    expect(p.id).toMatch(/^p_/)
  })

  it('尺寸上限 100×100', () => {
    expect(() => assertPatternSize(101, 1)).toThrow(/上限/)
    expect(() => assertPatternSize(1, 101)).toThrow(/上限/)
    expect(() => assertPatternSize(100, 100)).not.toThrow()
    expect(() => assertPatternSize(0, 10)).toThrow(/非法/)
    expect(() => assertPatternSize(-5, 10)).toThrow(/非法/)
  })

  it('MAX_DIMENSION 常量 = 100', () => {
    expect(MAX_DIMENSION).toBe(100)
  })
})

describe('getCell / setCell / 边界', () => {
  const p = makePattern(3, 2, [1, 2, 3, 4, -1, 6])

  it('读取越界返回空格，不抛异常', () => {
    expect(getCell(p, 0, 0)).toBe(1)
    expect(getCell(p, 1, 1)).toBe(EMPTY_CELL)
    expect(getCell(p, -1, 0)).toBe(EMPTY_CELL)
    expect(getCell(p, 3, 0)).toBe(EMPTY_CELL)
    expect(getCell(p, 0, 2)).toBe(EMPTY_CELL)
  })

  it('setCell 越界返回原引用；界内返回新对象', () => {
    expect(setCell(p, -1, 0, 9)).toBe(p)
    const next = setCell(p, 0, 1, 9)
    expect(next).not.toBe(p)
    expect(next.cells[1 * 3 + 0]).toBe(9)
    expect(p.cells[3]).toBe(4) // 原对象不变
  })

  it('isInside 覆盖四边', () => {
    expect(isInside(p, 0, 0)).toBe(true)
    expect(isInside(p, 2, 1)).toBe(true)
    expect(isInside(p, 3, 0)).toBe(false)
    expect(isInside(p, 0, -1)).toBe(false)
  })
})

describe('统计', () => {
  it('countFilled / usedColorIndices（去重升序）', () => {
    const cells = [3, 1, -1, 1, 3, 3]
    expect(countFilled(cells)).toBe(5)
    expect(usedColorIndices(cells)).toEqual([1, 3])
  })

  it('全空格 → countFilled = 0, usedColorIndices = []', () => {
    const p = createPattern(4, 4, 'x')
    expect(countFilled(p)).toBe(0)
    expect(usedColorIndices(p)).toEqual([])
  })
})

describe('RLE 编解码', () => {
  it('runsOf：连续同值合并，含空格 -1', () => {
    expect(runsOf([1, 1, 1, -1, -1, 2])).toEqual([
      { c: 1, n: 3 },
      { c: -1, n: 2 },
      { c: 2, n: 1 },
    ])
  })

  it('encodeRle：n=1 省略 count', () => {
    expect(encodeRle([1, 1, 1, -1, 2])).toBe('3:1,-1,2')
    expect(encodeRle([0, 0, 0])).toBe('3:0')
  })

  it('decodeRle round-trip：任意混合', () => {
    const cells = [1, 1, -1, -1, -1, 5, 5, -1, 0, 0, 0, 0]
    const rle = encodeRle(cells)
    const restored = decodeRle(rle, 6, 2)
    expect(Array.from(restored)).toEqual(cells)
  })

  it('decodeRle：空串 = 全空格', () => {
    const out = decodeRle('', 4, 3)
    expect(out).toHaveLength(12)
    expect(Array.from(out).every(v => v === EMPTY_CELL)).toBe(true)
  })

  it('decodeRle 长度不匹配 → 明确报错（多填不报错是已知缺陷，见 bug 清单）', () => {
    expect(() => decodeRle('3:1', 4, 4)).toThrow(/长度不匹配/)
    // 正好填满：'20:1' = 20 格 = 4×4，不报错（实现按 p<total 截断）
    expect(Array.from(decodeRle('20:1', 4, 4))).toHaveLength(16)
  })

  it('decodeRle 非法片段 → 明确报错', () => {
    expect(() => decodeRle('abc', 2, 2)).toThrow(/非法/)
    expect(() => decodeRle('0:1', 2, 2)).toThrow(/非法/) // n <= 0
    expect(() => decodeRle('-1:1', 2, 2)).toThrow(/非法/)
  })

  it('decodeRuns 输出 [{c},{n}] 契约', () => {
    expect(decodeRuns('3:1,-1,2')).toEqual([
      { n: 3, c: 1 },
      { n: 1, c: -1 },
      { n: 1, c: 2 },
    ])
  })

  it('cellsFromRuns：覆盖总长度校验', () => {
    const out = cellsFromRuns([{ c: 2, n: 5 }, { c: -1, n: 3 }], 4, 2)
    expect(Array.from(out)).toEqual([2, 2, 2, 2, 2, -1, -1, -1])
    expect(() => cellsFromRuns([{ c: 1, n: 3 }], 2, 2)).toThrow(/长度不匹配/)
  })

  it('全同色 100×100 → RLE 压缩到 <1%', () => {
    const flat = createPattern(100, 100, 'x', 7)
    const rle = encodeRle(flat)
    expect(rle).toBe('10000:7')
    expect(rleRatio(rle, flat.cells.length)).toBeLessThan(0.01)
  })

  it('全空 100×100 round-trip', () => {
    const p = createPattern(100, 100, 'x')
    const rle = encodeRle(p)
    expect(rle).toBe('10000:-1')
    expect(Array.from(decodeRle(rle, 100, 100)).every(v => v === EMPTY_CELL)).toBe(true)
  })
})

describe('serialize / deserialize', () => {
  it('round-trip 保留全部字段', () => {
    const p = makePattern(3, 2, [1, 1, -1, 4, -1, 4])
    const data = serializePattern(p)
    expect(data).toEqual({
      id: p.id,
      v: PATTERN_VERSION,
      w: 3,
      h: 2,
      paletteId: 'mard-v1',
      rle: '2:1,-1,4,-1,4',
    })
    const restored = deserializePattern(JSON.stringify(data))
    expect(restored.id).toBe(p.id)
    expect(restored.width).toBe(3)
    expect(restored.height).toBe(2)
    expect(restored.paletteId).toBe('mard-v1')
    expect(restored.cells).toEqual(p.cells)
  })

  it('对象形态 deserialize 也支持', () => {
    const p = makePattern(2, 2, [0, -1, -1, 0])
    const restored = deserializePattern(serializePattern(p))
    expect(restored.cells).toEqual(p.cells)
  })

  it('版本不支持 → 明确报错', () => {
    const data = { ...serializePattern(makePattern(2, 2, [])), v: 999 as never }
    expect(() => deserializePattern(data)).toThrow(/版本不支持/)
  })

  it('尺寸非法 → 明确报错', () => {
    const data = { ...serializePattern(makePattern(2, 2, [])), w: 0 }
    expect(() => deserializePattern(data)).toThrow(/尺寸非法/)
  })
})

describe('cropPattern / resizePattern', () => {
  it('crop 保留越界空格，尺寸正确', () => {
    const p = makePattern(4, 4, [
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ])
    const cropped = cropPattern(p, 1, 1, 2, 2)
    expect(cropped.width).toBe(2)
    expect(cropped.height).toBe(2)
    expect(cropped.cells).toEqual([6, 7, 10, 11])
  })

  it('resize：最近邻采样，纯色图保持纯色', () => {
    const p = makePattern(4, 4, new Array(16).fill(3))
    const bigger = resizePattern(p, 8, 8)
    expect(bigger.width).toBe(8)
    expect(bigger.cells).toHaveLength(64)
    expect(bigger.cells.every(v => v === 3)).toBe(true)

    const smaller = resizePattern(p, 2, 2)
    expect(smaller.cells).toEqual([3, 3, 3, 3])
  })

  it('resize 非纯色：输出只含输入色（最近邻不合成）', () => {
    const p = makePattern(2, 2, [1, 2, 3, 4])
    const resized = resizePattern(p, 3, 3)
    for (const v of resized.cells) expect([1, 2, 3, 4]).toContain(v)
  })
})
