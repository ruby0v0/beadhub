/**
 * Floyd–Steinberg 抖动（默认关闭，放在 create 页的高级选项里）。
 *
 * 关键点：误差传播在 Lab 空间做，而不是 RGB。
 * RGB 上传播误差会让暗部出现明显偏色（尤其是拼豆这种大面积纯色块），
 * Lab 的 L/a/b 更接近人眼，扩散出来的过渡更干净。
 */

import { rgbToLab, type Lab } from '../color/convert'
import { deltaE2000 } from '../color/distance'
import { EMPTY_CELL, type ColorAnchor, type RgbaImage } from '../types'

export interface DitherOptions {
  /** alpha 低于该值的像素保持空格，默认 8 */
  alphaThreshold?: number
  /** 误差扩散强度，1 = 标准 FS，0.6~0.8 更保守，默认 1 */
  strength?: number
}

const FS_WEIGHTS = [
  { dx: 1, dy: 0, w: 7 / 16 },
  { dx: -1, dy: 1, w: 3 / 16 },
  { dx: 0, dy: 1, w: 5 / 16 },
  { dx: 1, dy: 1, w: 1 / 16 },
]

/**
 * 返回锚点序号数组（-1 = 空格）。
 * 误差只往「有效像素」上扩散，空格周围的误差直接丢弃，避免边缘脏边。
 */
export function ditherToAnchors(img: RgbaImage, anchors: readonly ColorAnchor[], options: DitherOptions = {}): Int16Array {
  const alphaThreshold = options.alphaThreshold ?? 8
  const strength = options.strength ?? 1
  const { width: w, height: h, data } = img
  const n = w * h
  const out = new Int16Array(n)

  if (anchors.length === 0) {
    out.fill(EMPTY_CELL)
    return out
  }
  if (anchors.length === 1) {
    for (let p = 0; p < n; p++) out[p] = data[p * 4 + 3] < alphaThreshold ? EMPTY_CELL : 0
    return out
  }

  const anchorLabs = anchors.map(a => a.lab)
  // 源像素 Lab + 累积误差
  const buf = new Float32Array(n * 3)
  const valid = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const o = p * 4
    if (data[o + 3] < alphaThreshold) continue
    valid[p] = 1
    const lab = rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] })
    buf[p * 3] = lab.L
    buf[p * 3 + 1] = lab.a
    buf[p * 3 + 2] = lab.b
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!valid[p]) {
        out[p] = EMPTY_CELL
        continue
      }
      const cur: Lab = { L: buf[p * 3], a: buf[p * 3 + 1], b: buf[p * 3 + 2] }
      const idx = nearestAnchor(cur, anchorLabs)
      out[p] = idx
      if (strength === 0) continue

      const target = anchors[idx].lab
      const errL = (cur.L - target.L) * strength
      const errA = (cur.a - target.a) * strength
      const errB = (cur.b - target.b) * strength

      for (const { dx, dy, w: weight } of FS_WEIGHTS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (!valid[np]) continue
        buf[np * 3] += errL * weight
        buf[np * 3 + 1] += errA * weight
        buf[np * 3 + 2] += errB * weight
      }
    }
  }

  return out
}

function nearestAnchor(lab: Lab, anchorLabs: readonly Lab[]): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < anchorLabs.length; i++) {
    const d = deltaE2000(lab, anchorLabs[i])
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}
