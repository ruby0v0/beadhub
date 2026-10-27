import { describe, expect, it } from 'vitest'
import { PaletteMatcher } from '../../src/core/color/match'
import type { PaletteEntry } from '../../src/core/color/match'
import { ditherToAnchors } from '../../src/core/quantize/dither'
import {
  anchorsToPaletteIndices,
  applyAnchorPalette,
  applyAnchorPaletteInPlace,
  anchorDistance,
  mapPixelsToAnchors,
  mapPixelsToPalette,
} from '../../src/core/quantize/map'
import { rgbToLab } from '../../src/core/color/convert'
import { EMPTY_CELL, type ColorAnchor } from '../../src/core/types'
import { makeImage, solidImage, TINY_PALETTE } from './helpers'

const anchors = (list: [number, number, number][]): ColorAnchor[] =>
  list.map(([r, g, b]) => ({ rgb: { r, g, b }, lab: rgbToLab({ r, g, b }) }))

describe('mapPixelsToPalette', () => {
  it('像素精确命中色板；alpha 低于阈值 → 空格', () => {
    const matcher = new PaletteMatcher(TINY_PALETTE)
    const img = makeImage(4, 1, (x) => {
      if (x === 0) return [255, 0, 0]
      if (x === 1) return [0, 0, 255]
      if (x === 2) return [255, 255, 255]
      return [0, 0, 0, 4]
    })
    const out = mapPixelsToPalette(img, matcher, { alphaThreshold: 8 })
    expect(Array.from(out)).toEqual([0, 2, 3, EMPTY_CELL])
  })

  it('输出值域 ∈ [-1, paletteCount)', () => {
    const matcher = new PaletteMatcher(TINY_PALETTE)
    const img = makeImage(16, 16, (x, y) => [(x * 16) % 256, (y * 8) % 256, 128])
    const out = mapPixelsToPalette(img, matcher)
    for (const v of out) expect(v).toBeGreaterThanOrEqual(-1)
    for (const v of out) expect(v).toBeLessThan(TINY_PALETTE.length)
  })
})

describe('mapPixelsToAnchors + applyAnchorPalette', () => {
  it('像素归到最近锚点；锚点序号再映射到色板索引', () => {
    const anchorList = anchors([
      [255, 0, 0],
      [0, 0, 255],
    ])
    const matcher = new PaletteMatcher(TINY_PALETTE)
    const paletteOfAnchor = anchorsToPaletteIndices(anchorList, matcher)
    expect(paletteOfAnchor).toEqual([0, 2])

    const img = makeImage(4, 1, (x) => (x < 2 ? [250, 5, 5] : [5, 5, 250]))
    const anchorIdx = mapPixelsToAnchors(img, anchorList)
    expect(Array.from(anchorIdx)).toEqual([0, 0, 1, 1])

    const cells = applyAnchorPalette(anchorIdx, paletteOfAnchor)
    expect(Array.from(cells)).toEqual([0, 0, 2, 2])
  })

  it('锚点为空 → 全部空格；paletteOfAnchor 缺失 → 空格兜底', () => {
    const img = solidImage(2, 2, [10, 10, 10])
    expect(Array.from(mapPixelsToAnchors(img, []))).toEqual([EMPTY_CELL, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL])

    const idx = new Int16Array([0, 1, -1, 2])
    const out = applyAnchorPalette(idx, [7])
    expect(Array.from(out)).toEqual([7, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL])
  })

  it('applyAnchorPaletteInPlace 就地改写，不新建数组', () => {
    const idx = new Int16Array([0, 1, -1])
    const out = applyAnchorPaletteInPlace(idx, [3, 4])
    expect(out).toBe(idx)
    expect(Array.from(out)).toEqual([3, 4, -1])
  })

  it('anchorDistance 输出 ΔE00 且同色为 0', () => {
    const [red, blue] = anchors([
      [255, 0, 0],
      [0, 0, 255],
    ])
    expect(anchorDistance(red, red)).toBe(0)
    expect(anchorDistance(red, blue)).toBeGreaterThan(20)
    expect(anchorDistance(red, blue)).toBe(anchorDistance(blue, red))
  })
})

describe('ditherToAnchors', () => {
  it('dither 关闭（strength=0）时与纯 map 结果一致', () => {
    const anchorList = anchors([
      [255, 0, 0],
      [0, 0, 255],
      [0, 255, 0],
    ])
    const img = makeImage(24, 24, (x, y) => [x * 10 % 256, y * 10 % 256, (x + y) * 5 % 256])
    const mapped = mapPixelsToAnchors(img, anchorList)
    const dithered = ditherToAnchors(img, anchorList, { strength: 0 })
    expect(Array.from(dithered)).toEqual(Array.from(mapped))
  })

  it('开启抖动后输出仍为合法锚点序号 / 空格', () => {
    const anchorList = anchors([
      [255, 0, 0],
      [0, 0, 255],
      [0, 255, 0],
    ])
    const img = makeImage(16, 16, (x, y) => [x * 16 % 256, y * 16 % 256, 128])
    const out = ditherToAnchors(img, anchorList, { strength: 1 })
    expect(out).toHaveLength(16 * 16)
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(anchorList.length)
    }
  })

  it('抖动让灰阶过渡更接近原图均值（黑白渐变图）', () => {
    // 32×2 渐变：灰度从 0 → 255；锚点只有黑/白
    const anchorList = anchors([
      [0, 0, 0],
      [255, 255, 255],
    ])
    const img = makeImage(32, 2, (x) => [Math.round((x / 31) * 255), Math.round((x / 31) * 255), Math.round((x / 31) * 255)])
    const plain = mapPixelsToAnchors(img, anchorList)
    const dithered = ditherToAnchors(img, anchorList, { strength: 1 })

    // 原图平均亮度（0~255）
    const sourceMean = 127.5
    const anchorBrightness = [0, 255]
    const meanOf = (out: Int16Array) => {
      let sum = 0
      let n = 0
      for (let p = 0; p < out.length; p++) {
        sum += anchorBrightness[out[p]]
        n++
      }
      return sum / n
    }
    // 不抖动：每个格子二值化，64 格中 34 白 30 黑 → 均值 135.5（偏差 8）
    // 抖动：Lab 误差扩散让灰阶分布更接近原图 50% 占比
    expect(Math.abs(meanOf(dithered) - sourceMean)).toBeLessThanOrEqual(Math.abs(meanOf(plain) - sourceMean))
    expect(Math.abs(meanOf(dithered) - sourceMean)).toBeLessThan(10)
  })

  it('单锚点图：有效像素全为 0，透明格保持空格', () => {
    const anchorList = anchors([[100, 100, 100]])
    const img = makeImage(3, 1, (x) => (x === 1 ? [200, 200, 200, 2] : [200, 200, 200]))
    const out = ditherToAnchors(img, anchorList)
    expect(Array.from(out)).toEqual([0, EMPTY_CELL, 0])
  })
})
