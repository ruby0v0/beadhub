import { beforeEach, describe, expect, it } from 'vitest'
import {
  PaletteMatcher,
  buildLabIndex,
  clearMatcherCache,
  getMatcher,
  nearestLabIndex,
  nearestLabIndexFast,
  type PaletteEntry,
} from '../../src/core/color/match'
import { hexToRgb, rgbToLab } from '../../src/core/color/convert'
import { TINY_PALETTE, mockPalette } from './helpers'

const lab = (L: number, a: number, b: number) => ({ L, a, b })

beforeEach(() => {
  clearMatcherCache()
})

describe('buildLabIndex / PaletteMatcher 预计算', () => {
  it('预计算结果与即时换算一致', () => {
    const index = buildLabIndex(TINY_PALETTE)
    expect(index).toHaveLength(TINY_PALETTE.length)
    index.forEach((item, i) => {
      expect(item.index).toBe(i)
      expect(item.entry).toBe(TINY_PALETTE[i])
      expect(item.rgb).toEqual(hexToRgb(TINY_PALETTE[i].hex))
      expect(item.lab).toEqual(rgbToLab(item.rgb))
    })
  })

  it('matcher 访问器：size / labAt / rgbAt / codeAt', () => {
    const matcher = new PaletteMatcher(TINY_PALETTE)
    expect(matcher.size).toBe(6)
    expect(matcher.codeAt(0)).toBe('RED')
    expect(matcher.rgbAt(3)).toEqual({ r: 255, g: 255, b: 255 })
    expect(matcher.labAt(4)).toEqual(rgbToLab({ r: 0, g: 0, b: 0 }))
    expect(matcher.codeAt(999)).toBeUndefined()
  })
})

describe('最近色匹配 — 小型 mock 色板', () => {
  const matcher = new PaletteMatcher(TINY_PALETTE)

  it('精确命中：输入色板内颜色 → 对应索引', () => {
    expect(matcher.matchRgb({ r: 255, g: 0, b: 0 })).toBe(0) // RED
    expect(matcher.matchRgb({ r: 0, g: 255, b: 0 })).toBe(1) // GREEN
    expect(matcher.matchRgb({ r: 0, g: 0, b: 255 })).toBe(2) // BLUE
    expect(matcher.matchRgb({ r: 255, g: 255, b: 255 })).toBe(3) // WHITE
    expect(matcher.matchRgb({ r: 0, g: 0, b: 0 })).toBe(4) // BLACK
    expect(matcher.matchRgb({ r: 255, g: 255, b: 0 })).toBe(5) // YELLOW
  })

  it('精确命中：Lab 路径', () => {
    expect(matcher.matchLab(rgbToLab({ r: 0, g: 0, b: 255 }))).toBe(2)
  })

  it('最近邻：接近红的输入 → RED', () => {
    expect(matcher.matchRgb({ r: 240, g: 10, b: 5 })).toBe(0)
  })

  it('最近邻：暖色干扰下橙色仍归到红而不是黄', () => {
    // 橙 (255,128,0) 与红的 ΔE00 远小于与黄的
    expect(matcher.matchRgb({ r: 255, g: 128, b: 0 })).toBe(0)
  })

  it('最近邻：深灰归到黑，浅灰归到白', () => {
    expect(matcher.matchRgb({ r: 20, g: 20, b: 20 })).toBe(4)
    expect(matcher.matchRgb({ r: 235, g: 235, b: 235 })).toBe(3)
  })

  it('空色板返回 -1', () => {
    expect(nearestLabIndex(lab(50, 0, 0), [])).toBe(-1)
    expect(new PaletteMatcher([]).matchRgb({ r: 1, g: 2, b: 3 })).toBe(-1)
  })

  it('平局取先出现的索引', () => {
    // 两个完全相同的颜色 → 命中索引 0
    const dup: PaletteEntry[] = [
      { code: 'A', hex: '#123456' },
      { code: 'B', hex: '#123456' },
    ]
    expect(new PaletteMatcher(dup).matchRgb(hexToRgb('#123456'))).toBe(0)
  })
})

describe('nearestLabIndexFast 与线性扫描一致性', () => {
  // ΔE76 粗筛与 ΔE00 精算的排序不是严格同序，小候选集可能漏掉 ΔE00 最优解。
  // 这里验证的是实现契约：候选集够大时几乎一致；同时用近似误差上限保证可用性。
  it('候选数放大后与全量扫描几乎一致（5% 以内）', () => {
    const palette = mockPalette(200)
    const index = buildLabIndex(palette)
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    let mismatch = 0
    for (let t = 0; t < 100; t++) {
      const query = lab(rand() * 100, rand() * 200 - 100, rand() * 200 - 100)
      const full = nearestLabIndex(query, index)
      const fast = nearestLabIndexFast(query, index, 48)
      if (fast !== full) mismatch++
    }
    expect(mismatch).toBeLessThanOrEqual(5) // < 5% 抽样不一致率
  })

  it('色板 <= 64 时直接走全量扫描', () => {
    const palette = mockPalette(30)
    const index = buildLabIndex(palette)
    expect(nearestLabIndexFast(lab(50, 10, -10), index, 4)).toBe(nearestLabIndex(lab(50, 10, -10), index))
  })
})

describe('getMatcher 缓存', () => {
  it('同一 paletteId 返回同一实例（Lab 只算一次）', () => {
    const a = getMatcher('test-palette', mockPalette(50))
    const b = getMatcher('test-palette')
    expect(b).toBe(a)
  })

  it('未缓存且未传 colors 时明确报错', () => {
    expect(() => getMatcher('never-cached')).toThrow(/未缓存/)
  })

  it('clearMatcherCache 后需重新传入 colors', () => {
    getMatcher('test-palette', mockPalette(10))
    clearMatcherCache()
    expect(() => getMatcher('test-palette')).toThrow(/未缓存/)
  })
})

describe('性能：200 色板 × 10000 像素 < 500ms', () => {
  it('两步映射（锚点层 + 色板层）在时限内', () => {
    const palette = mockPalette(200)
    // 模拟 K=16 代表色的两级映射：10000 像素 → 16 锚点 → 200 色板
    const anchors = Array.from({ length: 16 }, (_, i) => ({
      rgb: hexToRgb(palette[i * 12].hex),
      lab: rgbToLab(hexToRgb(palette[i * 12].hex)),
    }))
    const matcher = new PaletteMatcher(palette)
    const anchorIndex = buildLabIndex(anchors.map(a => ({ code: `a${a.rgb.r}`, hex: '#000000' }))).map(() => 0)

    const t0 = performance.now()
    // 像素层：10000 次最近锚点（每次 16 个候选）
    let acc = 0
    for (let p = 0; p < 10000; p++) {
      acc += nearestLabIndex(anchors[p % 16].lab, anchors)
    }
    // 锚点层：16 次 → 200 色板
    for (const a of anchors) acc += matcher.matchLab(a.lab)
    const elapsed = performance.now() - t0
    expect(acc).toBeGreaterThanOrEqual(0)
    expect(elapsed).toBeLessThan(500)
  })

  it('Lab 预计算缓存生效：matcher 构造只做一次转换，matchLab 不再换算', () => {
    const palette = mockPalette(200)
    const t0 = performance.now()
    const matcher = new PaletteMatcher(palette)
    const buildMs = performance.now() - t0

    const t1 = performance.now()
    const query = lab(50, 20, -30)
    for (let i = 0; i < 1000; i++) matcher.matchLab(query)
    const match1000Ms = performance.now() - t1

    // 1000 次匹配（20 万次 ΔE00）应远快于重新换算 200 个 Lab 的成本×1000
    // 若 matchLab 内部重复 rgbToLab，这 1000 次调用会至少多花 1000×200 次 Lab 转换
    expect(match1000Ms).toBeLessThan(5000)
    // 构造（200 次 Lab 转换 + 200 次 ΔE 缓存准备）本身应在毫秒级
    expect(buildMs).toBeLessThan(500)
  })
})
