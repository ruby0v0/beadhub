import { describe, expect, it } from 'vitest'
import { medianCut } from '../../src/core/quantize/median-cut'
import { makeImage, solidImage } from './helpers'

describe('medianCut — 输出色数契约', () => {
  it('单色图只返回 1 个主色', () => {
    const out = medianCut(solidImage(16, 16, [120, 60, 30]), 16)
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(256)
    expect(out[0].share).toBe(1)
    expect(out[0].rgb).toEqual({ r: 120, g: 60, b: 30 })
  })

  it('2 色图请求 16 色 → 实际返回 2 色', () => {
    // 左半红右半蓝
    const img = makeImage(16, 16, (x) => (x < 8 ? [255, 0, 0] : [0, 0, 255]))
    const out = medianCut(img, 16)
    expect(out).toHaveLength(2)
    expect(out[0].count).toBe(128)
    expect(out[1].count).toBe(128)
  })

  it('多色图请求 4 色返回 4 色，count 总和 = 有效像素数', () => {
    const img = makeImage(32, 32, (x, y) => {
      if (x < 16 && y < 16) return [255, 0, 0]
      if (x >= 16 && y < 16) return [0, 255, 0]
      if (x < 16 && y >= 16) return [0, 0, 255]
      return [255, 255, 0]
    })
    const out = medianCut(img, 4)
    expect(out).toHaveLength(4)
    const total = out.reduce((s, c) => s + c.count, 0)
    expect(total).toBe(32 * 32)
    // 占比都约 1/4，按 count 降序
    for (const c of out) {
      expect(c.share).toBeCloseTo(0.25, 5)
      expect(Number.isFinite(c.share)).toBe(true)
    }
    expect(out[0].count).toBeGreaterThanOrEqual(out[out.length - 1].count)
  })

  it('输出主色在原图实际颜色附近', () => {
    const img = makeImage(32, 32, (x) => (x < 16 ? [250, 10, 10] : [10, 10, 250]))
    const out = medianCut(img, 2)
    for (const c of out) {
      const isRed = c.rgb.r > 200 && c.rgb.g < 100 && c.rgb.b < 100
      const isBlue = c.rgb.b > 200 && c.rgb.r < 100 && c.rgb.g < 100
      expect(isRed || isBlue).toBe(true)
    }
  })
})

describe('medianCut — alpha / 采样 / 边界', () => {
  it('alpha 低于阈值视为无效像素，全透明图返回空数组', () => {
    expect(medianCut(solidImage(4, 4, [100, 100, 100], 0), 8)).toEqual([])
  })

  it('maxColors 最小为 1', () => {
    const img = makeImage(8, 8, (x) => (x % 2 ? [255, 0, 0] : [0, 255, 0]))
    const out = medianCut(img, 0)
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(64)
  })

  it('maxSamples 抽样后仍输出有效主色', () => {
    const img = makeImage(64, 64, (x, y) => (x < 32 ? [200, 20, 20] : [20, 20, 200]))
    const out = medianCut(img, 2, { maxSamples: 100 })
    expect(out).toHaveLength(2)
    const total = out.reduce((s, c) => s + c.count, 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(100)
  })

  it('space=rgb 与 lab 都能跑通且覆盖语义', () => {
    const img = makeImage(16, 16, (x) => (x < 8 ? [255, 0, 0] : [0, 0, 255]))
    for (const space of ['rgb', 'lab'] as const) {
      const out = medianCut(img, 2, { space })
      expect(out).toHaveLength(2)
      const total = out.reduce((s, c) => s + c.count, 0)
      expect(total).toBe(256)
    }
  })

  it('share 按总有效像素归一', () => {
    const img = makeImage(4, 8, (x) => (x < 2 ? [255, 0, 0] : [0, 255, 0]))
    const out = medianCut(img, 2)
    expect(out[0].count).toBe(16)
    expect(out[1].count).toBe(16)
    expect(out[0].share).toBeCloseTo(0.5, 5)
  })
})
