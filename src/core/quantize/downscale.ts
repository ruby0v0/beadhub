/**
 * 区域平均（box filter）下采样。
 *
 * 拼豆图纸缩到 29/52/96 格时，最近邻会把噪点当特征、还会让细线断掉；
 * 这里按目标格子在原图上的覆盖面积加权平均，且 alpha 低的像素只计入面积、
 * 不污染颜色，避免透明边缘把整格拉黑。
 */

import type { RgbaImage } from '../types'

export interface DownscaleOptions {
  /** alpha 低于该值（0~255）不参与颜色平均，默认 8 */
  alphaThreshold?: number
}

export function downscaleBox(src: RgbaImage, dstWidth: number, dstHeight: number, options: DownscaleOptions = {}): RgbaImage {
  const alphaThreshold = options.alphaThreshold ?? 8
  const sw = src.width
  const sh = src.height
  const dw = Math.max(1, Math.floor(dstWidth))
  const dh = Math.max(1, Math.floor(dstHeight))
  const out = new Uint8ClampedArray(dw * dh * 4)
  const scaleX = sw / dw
  const scaleY = sh / dh
  const sd = src.data

  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * scaleY
    const sy1 = (dy + 1) * scaleY
    const iy0 = Math.floor(sy0)
    const iy1 = Math.min(sh, Math.ceil(sy1))
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * scaleX
      const sx1 = (dx + 1) * scaleX
      const ix0 = Math.floor(sx0)
      const ix1 = Math.min(sw, Math.ceil(sx1))

      let areaSum = 0
      let colorSum = 0
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0

      for (let sy = iy0; sy < iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0)
        if (wy <= 0) continue
        for (let sx = ix0; sx < ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0)
          if (wx <= 0) continue
          const w = wx * wy
          const o = (sy * sw + sx) * 4
          const a = sd[o + 3]
          areaSum += w
          aSum += a * w
          if (a >= alphaThreshold) {
            const cw = w * (a / 255)
            colorSum += cw
            rSum += sd[o] * cw
            gSum += sd[o + 1] * cw
            bSum += sd[o + 2] * cw
          }
        }
      }

      const o = (dy * dw + dx) * 4
      if (areaSum === 0) {
        out[o + 3] = 0
        continue
      }
      if (colorSum > 0) {
        out[o] = rSum / colorSum
        out[o + 1] = gSum / colorSum
        out[o + 2] = bSum / colorSum
      } else {
        // 整格都透明
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
      }
      out[o + 3] = Math.round(aSum / areaSum)
    }
  }

  return { data: out, width: dw, height: dh }
}

/**
 * 保持长宽比缩放到「最长边 <= maxSize」，再交给 box filter。
 * 用于把任意尺寸的原图先降到合理大小，减少后续计算量。
 */
export function downscaleToMax(src: RgbaImage, maxSize: number, options?: DownscaleOptions): RgbaImage {
  const longest = Math.max(src.width, src.height)
  if (longest <= maxSize) return src
  const ratio = maxSize / longest
  const w = Math.max(1, Math.round(src.width * ratio))
  const h = Math.max(1, Math.round(src.height * ratio))
  return downscaleBox(src, w, h, options)
}
