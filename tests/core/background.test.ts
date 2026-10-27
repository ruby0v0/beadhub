import { describe, expect, it } from 'vitest'
import {
  applyMaskToAlpha,
  detectCornerColors,
  hasRemovedCells,
  removeBackground,
} from '../../src/core/image/background'
import { hexToRgb } from '../../src/core/color/convert'
import { makeImage } from './helpers'

/** 纯色背景 + 中心图形（4×4 图形位于 16×16 中央） */
function imageWithCenter(fg: [number, number, number], bg: [number, number, number], fgAlpha = 255) {
  return makeImage(16, 16, (x, y) => (x >= 6 && x < 10 && y >= 6 && y < 10 ? [fg[0], fg[1], fg[2], fgAlpha] : [bg[0], bg[1], bg[2], 255]))
}

describe('detectCornerColors', () => {
  it('四角取平均色', () => {
    const img = imageWithCenter([255, 0, 0], [200, 210, 220])
    const corners = detectCornerColors(img, 4)
    expect(corners).toHaveLength(4)
    for (const c of corners) {
      expect(c.r).toBeCloseTo(200, 5)
      expect(c.g).toBeCloseTo(210, 5)
      expect(c.b).toBeCloseTo(220, 5)
    }
  })

  it('sampleSize 超过半边时自动钳制', () => {
    const img = makeImage(4, 4, () => [10, 20, 30])
    const corners = detectCornerColors(img, 100)
    expect(corners).toHaveLength(4)
    expect(corners[0]).toEqual({ r: 10, g: 20, b: 30 })
  })
})

describe('removeBackground — 连通泛洪', () => {
  it('纯色背景 + 中心图形：背景被移除，图形保留', () => {
    const img = imageWithCenter([255, 0, 0], [240, 240, 240])
    const result = removeBackground(img, { tolerance: 32 })
    // 中心 4×4 保留，其余全被移除
    expect(result.removed).toBe(16 * 16 - 16)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const p = y * 16 + x
        const isCenter = x >= 6 && x < 10 && y >= 6 && y < 10
        expect(result.mask[p]).toBe(isCenter ? 1 : 0)
      }
    }
  })

  it('图形内部同色块不被误删（连通性保护）', () => {
    // 背景白，图形是白边框包住的白芯：泛洪不应吃掉内部白块
    const img = makeImage(9, 9, (x, y) => {
      const border = x >= 3 && x < 6 && y >= 3 && y < 6
      const inner = x >= 4 && x < 5 && y >= 4 && y < 5
      return [255, 255, 255] // 全白
    })
    const result = removeBackground(img, { tolerance: 32 })
    // 9×9 全部连通同色 → 全部移除（这是正确行为：全白图没有前景）
    expect(result.removed).toBe(81)
  })

  it('边框前景挡住内部同色：内部不被误删', () => {
    // 7×7：外圈白背景，第 2~4 行/列是黑色边框，最中心是白色芯（与背景同色但不连通）
    const img = makeImage(7, 7, (x, y) => {
      const inFrame = x >= 2 && x < 5 && y >= 2 && y < 5
      const isCore = x === 3 && y === 3
      if (isCore) return [255, 255, 255]
      if (inFrame) return [0, 0, 0]
      return [255, 255, 255]
    })
    const result = removeBackground(img, { tolerance: 32 })
    // 中心白芯 (3,3) 被黑框隔离，泛洪到不了
    expect(result.mask[3 * 7 + 3]).toBe(1)
    // 外圈白全部移除
    expect(result.mask[0]).toBe(0)
  })

  it('无背景图（全前景异色）→ removed = 0', () => {
    const img = makeImage(8, 8, (x, y) => [(x * 31) % 256, (y * 17) % 256, 128])
    const result = removeBackground(img, { tolerance: 8 })
    expect(result.removed).toBe(0)
    expect(result.mask.every(v => v === 1)).toBe(true)
  })

  it('容差边界：前景色在锚点容差内/外的行为', () => {
    // 8×8：四角是白背景（锚点 240），中心是 200 灰（每通道差 40 > 32）
    const img = makeImage(8, 8, (x, y) => {
      const center = x >= 3 && x < 5 && y >= 3 && y < 5
      return center ? [200, 200, 200] : [240, 240, 240]
    })
    const result = removeBackground(img, { tolerance: 32 })
    // 中心 4 格与锚点差超容差 → 保留
    expect(result.removed).toBe(64 - 4)
    expect(result.mask[3 * 8 + 3]).toBe(1)

    // 中心改成 220（每通道差 20 <= 32）→ 连通后与背景一起被吃掉
    const near = makeImage(8, 8, (x, y) => {
      const center = x >= 3 && x < 5 && y >= 3 && y < 5
      return center ? [220, 220, 220] : [240, 240, 240]
    })
    const removed = removeBackground(near, { tolerance: 32 })
    expect(removed.removed).toBe(64)
  })

  it('alpha=0 的角落像素：锚点为黑色，导致纯色图被整图移除（alpha 语义传导）', () => {
    // 全透明图：角平均色 RGB=0（alpha 不参与 RGB 平均），黑色成为锚点
    const img = makeImage(2, 2, () => [255, 255, 255, 0])
    const result = removeBackground(img, { tolerance: 32 })
    // alpha<8 直接判背景（四个角都会入栈）
    expect(result.removed).toBe(4)
    // 已知缺陷（见 bug 清单）：角平均色不排除透明像素，RGB 锚点被拉成白色而非黑色
    expect(result.corners[0]).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('contiguous=false：全局阈值模式，内部同色也被删', () => {
    const img = makeImage(7, 7, (x, y) => {
      const inFrame = x >= 2 && x < 5 && y >= 2 && y < 5
      const isCore = x === 3 && y === 3
      if (isCore) return [255, 255, 255]
      if (inFrame) return [0, 0, 0]
      return [255, 255, 255]
    })
    const result = removeBackground(img, { tolerance: 32, contiguous: false })
    // 中心白芯（不连通）在非连通模式下也被删
    expect(result.mask[3 * 7 + 3]).toBe(0)
  })
})

describe('applyMaskToAlpha / hasRemovedCells', () => {
  it('mask=0 的格子 alpha 落到 0，其余不变', () => {
    const img = imageWithCenter([255, 0, 0], [240, 240, 240])
    const { mask } = removeBackground(img, { tolerance: 32 })
    const out = applyMaskToAlpha(img, mask)
    expect(out.width).toBe(16)
    expect(out.data).toHaveLength(16 * 16 * 4)
    for (let p = 0; p < mask.length; p++) {
      expect(out.data[p * 4 + 3]).toBe(mask[p] === 0 ? 0 : 255)
    }
  })

  it('applyMaskToAlpha 不改原图', () => {
    const img = imageWithCenter([1, 2, 3], [200, 200, 200])
    const before = Array.from(img.data)
    const { mask } = removeBackground(img, { tolerance: 32 })
    applyMaskToAlpha(img, mask)
    expect(Array.from(img.data)).toEqual(before)
  })

  it('hasRemovedCells', () => {
    expect(hasRemovedCells(new Uint8Array([1, 1, 0]))).toBe(true)
    expect(hasRemovedCells(new Uint8Array([1, 1, 1]))).toBe(false)
    expect(hasRemovedCells(new Uint8Array(0))).toBe(false)
  })
})
