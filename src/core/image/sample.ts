/**
 * 内置样例图（纯代码画的像素画）。
 *
 * 用途：create 页在没给相册权限 / 只想试参数时，点「用样例图」直接跑通整条流水线，
 * 也方便单测里不依赖任何图片文件。
 */

import { createImage, type RgbaImage } from '../types'

interface Patch {
  color: [number, number, number]
  /** 归一化坐标范围 [x0, y0, x1, y1] */
  rect: [number, number, number, number]
  round?: boolean
}

/** 一颗红色的像素爱心 + 背景渐变，足够验证去背/下采样/量化三件事 */
const HEART_PATCHES: Patch[] = [
  { color: [228, 87, 61], rect: [0.24, 0.26, 0.76, 0.68], round: true },
  { color: [0xf2, 0x5c, 0x54], rect: [0.32, 0.2, 0.68, 0.34], round: true },
  { color: [0xff, 0xe0, 0xd6], rect: [0.38, 0.34, 0.46, 0.42], round: true },
]

export function createSampleImage(size = 256): RgbaImage {
  const img = createImage(size, size)
  const data = img.data

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      // 背景：浅色对角渐变（去背时四角容差要能吃住这段渐变）
      const t = (x + y) / (size * 2)
      data[o] = 244 + t * 8
      data[o + 1] = 242 + t * 10
      data[o + 2] = 236 + t * 12
      data[o + 3] = 255
    }
  }

  for (const patch of HEART_PATCHES) {
    const [x0, y0, x1, y1] = patch.rect
    const px0 = Math.floor(x0 * size)
    const px1 = Math.floor(x1 * size)
    const py0 = Math.floor(y0 * size)
    const py1 = Math.floor(y1 * size)
    for (let y = py0; y < py1; y++) {
      for (let x = px0; x < px1; x++) {
        if (patch.round) {
          // 用曼哈顿圆角近似，制造清晰的斜边给去背/下采样吃
          const nx = (x - (px0 + px1) / 2) / ((px1 - px0) / 2)
          const ny = (y - (py0 + py1) / 2) / ((py1 - py0) / 2)
          if (nx * nx + ny * ny > 1) continue
        }
        const o = (y * size + x) * 4
        data[o] = patch.color[0]
        data[o + 1] = patch.color[1]
        data[o + 2] = patch.color[2]
        data[o + 3] = 255
      }
    }
  }

  // 加一道深色描边，让量化结果不至于全是浅色
  const stroke = Math.max(2, Math.round(size * 0.02))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y)
      if (d >= stroke) continue
      const o = (y * size + x) * 4
      data[o] = 0x3a
      data[o + 1] = 0x33
      data[o + 2] = 0x2d
      data[o + 3] = 255
    }
  }

  return img
}
