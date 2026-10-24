/**
 * 导入图片的几何预处理：裁剪 / 旋转。
 * 拼豆图纸一般是正方形，所以默认走「中心正方形裁剪」。
 */

import { cloneImage, type RgbaImage } from '../types'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type Rotation = 0 | 90 | 180 | 270

export function cropImage(img: RgbaImage, rect: CropRect): RgbaImage {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(rect.x)))
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(rect.y)))
  const w = Math.max(1, Math.min(img.width - x0, Math.floor(rect.width)))
  const h = Math.max(1, Math.min(img.height - y0, Math.floor(rect.height)))
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcRow = ((y + y0) * img.width + x0) * 4
    out.set(img.data.subarray(srcRow, srcRow + w * 4), y * w * 4)
  }
  return { data: out, width: w, height: h }
}

export function rotateImage(img: RgbaImage, degrees: Rotation = 90): RgbaImage {
  if (degrees % 360 === 0) return cloneImage(img)
  const { width: w, height: h, data } = img
  const swap = degrees === 90 || degrees === 270
  const outW = swap ? h : w
  const outH = swap ? w : h
  const out = new Uint8ClampedArray(outW * outH * 4)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number
      let ny: number
      if (degrees === 90) {
        nx = h - 1 - y
        ny = x
      } else if (degrees === 180) {
        nx = w - 1 - x
        ny = h - 1 - y
      } else {
        nx = y
        ny = w - 1 - x
      }
      const so = (y * w + x) * 4
      const to = (ny * outW + nx) * 4
      out[to] = data[so]
      out[to + 1] = data[so + 1]
      out[to + 2] = data[so + 2]
      out[to + 3] = data[so + 3]
    }
  }
  return { data: out, width: outW, height: outH }
}

/** 中心裁成正方形（短边为准） */
export function centerSquare(img: RgbaImage): RgbaImage {
  const size = Math.min(img.width, img.height)
  if (size === img.width && size === img.height) return img
  return cropImage(img, {
    x: Math.floor((img.width - size) / 2),
    y: Math.floor((img.height - size) / 2),
    width: size,
    height: size,
  })
}
