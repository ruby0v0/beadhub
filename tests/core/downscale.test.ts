import { describe, expect, it } from 'vitest'
import { downscaleBox, downscaleToMax } from '../../src/core/quantize/downscale'
import { checkerImage, solidImage } from './helpers'

describe('downscaleBox — 整除关系', () => {
  it('58×58 → 29×29：均匀图颜色不变', () => {
    const red = solidImage(58, 58, [200, 40, 10])
    const out = downscaleBox(red, 29, 29)
    expect(out.width).toBe(29)
    expect(out.height).toBe(29)
    for (let p = 0; p < 29 * 29; p++) {
      expect([out.data[p * 4], out.data[p * 4 + 1], out.data[p * 4 + 2]]).toEqual([200, 40, 10])
      expect(out.data[p * 4 + 3]).toBe(255)
    }
  })

  it('输出尺寸严格等于目标网格（任意组合）', () => {
    for (const [w, h] of [[101, 37], [57, 29], [96, 96], [300, 5]] as const) {
      const out = downscaleBox(solidImage(w, h, [1, 2, 3]), 29, 29)
      expect(out.width).toBe(29)
      expect(out.height).toBe(29)
      expect(out.data).toHaveLength(29 * 29 * 4)
    }
  })

  it('黑白棋盘 2×2 格 → 1×1 格：均值灰色', () => {
    // 4×4 图，黑白棋盘 cell=1；缩到 1×1 → RGB 均值 127.5，Uint8Clamped 舍入 128
    const out = downscaleBox(checkerImage(4, 4, 1), 1, 1)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    expect(out.data[0]).toBe(128)
    expect(out.data[1]).toBe(128)
    expect(out.data[2]).toBe(128)
    expect(out.data[3]).toBe(255)
  })

  it('黑白棋盘 2:1 占比 → 均值比例正确', () => {
    // 6×1：2 黑 4 白 → 均值 255*(4/6)=170
    const img = solidImage(6, 1, [255, 255, 255])
    for (let x = 0; x < 2; x++) {
      const o = x * 4
      img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0
    }
    const out = downscaleBox(img, 1, 1)
    expect(out.data[0]).toBe(170)
  })
})

describe('downscaleBox — 不整除与 alpha 语义', () => {
  it('57×57 → 29×29：均匀图仍保持颜色（面积加权无截断偏差）', () => {
    const out = downscaleBox(solidImage(57, 57, [80, 120, 200]), 29, 29)
    expect(out.width).toBe(29)
    for (let p = 0; p < 29 * 29; p++) {
      expect(Math.abs(out.data[p * 4] - 80)).toBeLessThanOrEqual(1)
      expect(Math.abs(out.data[p * 4 + 1] - 120)).toBeLessThanOrEqual(1)
      expect(Math.abs(out.data[p * 4 + 2] - 200)).toBeLessThanOrEqual(1)
    }
  })

  it('低 alpha 像素：阈值内低权重入均值，阈值外不污染颜色', () => {
    // 左格：红色 alpha=255；右格：蓝色 alpha=1（低于阈值 8 → 不进颜色均值）
    const img = solidImage(4, 1, [255, 0, 0])
    for (let x = 2; x < 4; x++) {
      const o = x * 4
      img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 255
      img.data[o + 3] = 1
    }
    const out = downscaleBox(img, 2, 1, { alphaThreshold: 8 })
    // 左格：纯红；右格：无有效颜色 → RGB=0，但 alpha 均值仍在
    expect(out.data[0]).toBe(255)
    expect(out.data[1]).toBe(0)
    expect(out.data[2]).toBe(0)
    expect(out.data[4]).toBe(0)
    expect(out.data[5]).toBe(0)
    expect(out.data[6]).toBe(0)
    // 已知语义：alpha 按全格面积平均（含透明像素），而不是只在有效像素间平均
    expect(out.data[7]).toBe(1)
  })

  it('全透明 → RGB=0 且 alpha=0', () => {
    const out = downscaleBox(solidImage(2, 2, [10, 20, 30], 0), 1, 1)
    expect([out.data[0], out.data[1], out.data[2], out.data[3]]).toEqual([0, 0, 0, 0])
  })
})

describe('downscaleToMax', () => {
  it('小于 maxSize 时返回原图引用（零拷贝）', () => {
    const img = solidImage(10, 8, [1, 2, 3])
    expect(downscaleToMax(img, 1024)).toBe(img)
  })

  it('等比缩到最长边 maxSize', () => {
    const out = downscaleToMax(solidImage(400, 200, [5, 5, 5]), 100)
    expect(out.width).toBe(100)
    expect(out.height).toBe(50)
  })

  it('极窄图不产生 0 尺寸', () => {
    const out = downscaleToMax(solidImage(2000, 3, [5, 5, 5]), 100)
    expect(out.width).toBe(100)
    expect(out.height).toBeGreaterThanOrEqual(1)
  })
})
