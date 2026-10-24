/**
 * 背景去除：四角取色 + 容差泛洪。
 *
 * 输出一张 mask（1 = 保留前景，0 = 背景），背景格子在图纸里落成 -1 空格。
 * 之所以用「四角取色 + 从边框泛洪」而不是全图色差阈值：
 * 阈值法会把图案内部的同色区域（比如白衣服）一起吃掉，泛洪只看连通的背景。
 */

import type { RGB } from '../color/convert'
import type { RgbaImage } from '../types'

export interface BackgroundOptions {
  /** 通道容差 0~255，越大去得越狠，默认 32 */
  tolerance?: number
  /** 四角取样块边长（像素），默认 4 */
  sampleSize?: number
  /** alpha 低于该值直接算背景，默认 8 */
  alphaThreshold?: number
  /** 是否要求背景与边缘连通（true 时不会误删图案内部同色块），默认 true */
  contiguous?: boolean
}

export interface BackgroundResult {
  /** 1 = 前景保留，0 = 背景 */
  mask: Uint8Array
  /** 四角参考色 */
  corners: RGB[]
  /** 被判为背景的像素数 */
  removed: number
}

/** 四角各取一个 sample×sample 的平均色 */
export function detectCornerColors(img: RgbaImage, sampleSize = 4): RGB[] {
  const s = Math.max(1, Math.min(sampleSize, Math.floor(Math.min(img.width, img.height) / 2) || 1))
  const spots = [
    { x: 0, y: 0 },
    { x: img.width - s, y: 0 },
    { x: 0, y: img.height - s },
    { x: img.width - s, y: img.height - s },
  ]
  return spots.map(({ x, y }) => averagePatch(img, x, y, s))
}

function averagePatch(img: RgbaImage, x0: number, y0: number, size: number): RGB {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = y0; y < y0 + size && y < img.height; y++) {
    for (let x = x0; x < x0 + size && x < img.width; x++) {
      const o = (y * img.width + x) * 4
      r += img.data[o]
      g += img.data[o + 1]
      b += img.data[o + 2]
      count++
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0 }
  return { r: r / count, g: g / count, b: b / count }
}

/** 通道最大差 <= tolerance 视为同色 */
function withinTolerance(a: RGB, r: number, g: number, b: number, tolerance: number): boolean {
  return (
    Math.abs(a.r - r) <= tolerance &&
    Math.abs(a.g - g) <= tolerance &&
    Math.abs(a.b - b) <= tolerance
  )
}

export function removeBackground(img: RgbaImage, options: BackgroundOptions = {}): BackgroundResult {
  const tolerance = options.tolerance ?? 32
  const alphaThreshold = options.alphaThreshold ?? 8
  const contiguous = options.contiguous ?? true
  const { width: w, height: h, data } = img
  const corners = detectCornerColors(img, options.sampleSize ?? 4)
  const n = w * h
  const mask = new Uint8Array(n).fill(1)

  const isBackgroundCandidate = (p: number): boolean => {
    const o = p * 4
    if (data[o + 3] < alphaThreshold) return true
    for (const c of corners) {
      if (withinTolerance(c, data[o], data[o + 1], data[o + 2], tolerance)) return true
    }
    return false
  }

  let removed = 0
  const mark = (p: number) => {
    if (mask[p] === 0) return
    mask[p] = 0
    removed++
  }

  if (!contiguous) {
    for (let p = 0; p < n; p++) if (isBackgroundCandidate(p)) mark(p)
    return { mask, corners, removed }
  }

  // 从四条边泛洪：只吃和边缘连通的背景
  const stack: number[] = []
  const pushIfCandidate = (p: number) => {
    if (mask[p] === 1 && isBackgroundCandidate(p)) stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    pushIfCandidate(x)
    pushIfCandidate((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    pushIfCandidate(y * w)
    pushIfCandidate(y * w + w - 1)
  }

  while (stack.length) {
    const p = stack.pop() as number
    if (mask[p] === 0) continue
    mark(p)
    const x = p % w
    const y = (p - x) / w
    if (x > 0) pushIfCandidate(p - 1)
    if (x < w - 1) pushIfCandidate(p + 1)
    if (y > 0) pushIfCandidate(p - w)
    if (y < h - 1) pushIfCandidate(p + w)
  }

  return { mask, corners, removed }
}

/** 把 mask 落到 alpha 上（0 = 透明），方便直接复用下采样 / 量化链路 */
export function applyMaskToAlpha(img: RgbaImage, mask: Uint8Array): RgbaImage {
  const out = new Uint8ClampedArray(img.data)
  for (let p = 0; p < img.width * img.height; p++) {
    if (mask[p] === 0) out[p * 4 + 3] = 0
  }
  return { data: out, width: img.width, height: img.height }
}

/** 背景格要不要显示成「空格」：mask 全为前景时返回 false，UI 就不用画空心格 */
export function hasRemovedCells(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i] === 0) return true
  return false
}
