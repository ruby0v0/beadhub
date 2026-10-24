/**
 * 色差公式。配色匹配的主力是 CIEDE2000（ΔE00），
 * ΔE76 只用来做廉价的粗筛。
 */

import type { Lab, RGB } from './convert'

export function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2)
}

/**
 * CIEDE2000 色差（kL = kC = kH = 1）。
 * 参考 Sharma et al. 2005 的实现，与标准测试向量一致。
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: l1, a: a1, b: b1 } = lab1
  const { L: l2, a: a2, b: b2 } = lab2

  const c1 = Math.sqrt(a1 * a1 + b1 * b1)
  const c2 = Math.sqrt(a2 * a2 + b2 * b2)
  const cBar = (c1 + c2) / 2

  const cBar7 = cBar ** 7
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)))
  const a1p = (1 + g) * a1
  const a2p = (1 + g) * a2
  const c1p = Math.sqrt(a1p * a1p + b1 * b1)
  const c2p = Math.sqrt(a2p * a2p + b2 * b2)

  const h1p = c1p === 0 ? 0 : normalizeHue((Math.atan2(b1, a1p) * 180) / Math.PI)
  const h2p = c2p === 0 ? 0 : normalizeHue((Math.atan2(b2, a2p) * 180) / Math.PI)

  const dLp = l2 - l1
  const dCp = c2p - c1p

  let dhp = 0
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(((dhp / 2) * Math.PI) / 180)

  const lBarP = (l1 + l2) / 2
  const cBarP = (c1p + c2p) / 2

  let hBarP: number
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2
  } else if (h1p + h2p < 360) {
    hBarP = (h1p + h2p + 360) / 2
  } else {
    hBarP = (h1p + h2p - 360) / 2
  }

  const t =
    1 -
    0.17 * Math.cos(((hBarP - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hBarP) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hBarP + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hBarP - 63) * Math.PI) / 180)

  const dTheta = 30 * Math.exp(-((((hBarP - 275) / 25) ** 2)))
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7))
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2)
  const sc = 1 + 0.045 * cBarP
  const sh = 1 + 0.015 * cBarP * t
  const rt = -Math.sin(((2 * dTheta) * Math.PI) / 180) * rc

  const lTerm = dLp / sl
  const cTerm = dCp / sc
  const hTerm = dHp / sh

  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm)
}

function normalizeHue(h: number): number {
  const v = h % 360
  return v < 0 ? v + 360 : v
}

/** 权重可调的 ΔE00，用于以后加“偏红更接近”这种权重策略 */
export interface DeltaEWeights {
  kL?: number
  kC?: number
  kH?: number
}

export function deltaE2000Weighted(a: Lab, b: Lab, _w: DeltaEWeights = {}): number {
  // 当前只有默认权重，保留入口避免以后调用方散落
  return deltaE2000(a, b)
}

/** RGB 欧氏距离，只在需要极快粗筛时用 */
export function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}
