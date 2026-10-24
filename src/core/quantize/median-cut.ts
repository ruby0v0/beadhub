/**
 * 中位切分（median cut）主色提取，输出 16 / 32 色档的代表色。
 *
 * 做法：把所有采样像素当成一个盒子，反复挑「跨度 × 像素数」最大的盒子，
 * 沿跨度最大的通道按中位数切成两半，直到盒数达标。代表色取盒子内均值。
 */

import { rgbToLab, type RGB } from '../color/convert'
import type { ColorAnchor, RgbaImage } from '../types'

export interface RepresentativeColor extends ColorAnchor {
  /** 落在该盒子里的采样像素数 */
  count: number
  /** 占比 0~1（相对全部有效采样） */
  share: number
}

export interface MedianCutOptions {
  /** alpha 低于该值视为无效像素，默认 8 */
  alphaThreshold?: number
  /** 最多采样多少个像素（大图抽样，控制耗时），默认 40000 */
  maxSamples?: number
  /** 切分通道空间，默认 lab（人眼感知更合理） */
  space?: 'rgb' | 'lab'
}

interface Box {
  start: number
  end: number
}

interface Samples {
  r: Float32Array
  g: Float32Array
  b: Float32Array
  count: number
}

export function medianCut(img: RgbaImage, maxColors: number, options: MedianCutOptions = {}): RepresentativeColor[] {
  const alphaThreshold = options.alphaThreshold ?? 8
  const space = options.space ?? 'lab'
  const colorCount = Math.max(1, Math.floor(maxColors))

  const samples = collectSamples(img, alphaThreshold, options.maxSamples ?? 40000)
  const n = samples.count
  if (n === 0) return []
  if (n <= colorCount) {
    // 像素比目标色数还少，一个像素一个盒子
    return Array.from({ length: n }, (_, i) => ({
      rgb: { r: samples.r[i], g: samples.g[i], b: samples.b[i] },
      lab: rgbToLab({ r: samples.r[i], g: samples.g[i], b: samples.b[i] }),
      count: 1,
      share: 1 / n,
    })).sort(sortByCountDesc)
  }

  // 索引数组：切分只重排索引，不搬数据
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i

  const channels = buildChannels(samples, space)
  const boxes: Box[] = [{ start: 0, end: n }]

  while (boxes.length < colorCount) {
    let target = -1
    let bestPriority = 0
    let bestChannel = -1

    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi]
      const count = box.end - box.start
      if (count < 2) continue
      let ch = -1
      let range = 0
      for (let c = 0; c < 3; c++) {
        const r = channelRange(channels[c], order, box)
        if (r > range) {
          range = r
          ch = c
        }
      }
      if (ch < 0) continue
      const priority = range * count
      if (priority > bestPriority) {
        bestPriority = priority
        target = bi
        bestChannel = ch
      }
    }

    if (target < 0) break // 所有盒子都不可再切

    const box = boxes[target]
    sortSegment(channels[bestChannel], order, box)
    const mid = box.start + ((box.end - box.start) >> 1)
    boxes.splice(target, 1, { start: box.start, end: mid }, { start: mid, end: box.end })
  }

  return boxes.map(box => summarize(box, order, samples, n)).sort(sortByCountDesc)
}

function sortByCountDesc(a: RepresentativeColor, b: RepresentativeColor): number {
  return b.count - a.count
}

/** lab 空间用 L/a/b 做切分轴，rgb 空间用 r/g/b */
function buildChannels(samples: Samples, space: 'rgb' | 'lab'): Float32Array[] {
  const n = samples.count
  const c0 = new Float32Array(n)
  const c1 = new Float32Array(n)
  const c2 = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (space === 'lab') {
      const lab = rgbToLab({ r: samples.r[i], g: samples.g[i], b: samples.b[i] })
      c0[i] = lab.L
      c1[i] = lab.a
      c2[i] = lab.b
    } else {
      c0[i] = samples.r[i]
      c1[i] = samples.g[i]
      c2[i] = samples.b[i]
    }
  }
  return [c0, c1, c2]
}

function channelRange(values: Float32Array, order: Uint32Array, box: Box): number {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = box.start; i < box.end; i++) {
    const v = values[order[i]]
    if (v < min) min = v
    if (v > max) max = v
  }
  return max - min
}

/** 按某一通道把 [box.start, box.end) 这段索引升序重排 */
function sortSegment(values: Float32Array, order: Uint32Array, box: Box): void {
  const segment = Array.from(order.subarray(box.start, box.end))
  segment.sort((a, b) => values[a] - values[b])
  for (let i = 0; i < segment.length; i++) order[box.start + i] = segment[i]
}

function summarize(box: Box, order: Uint32Array, samples: Samples, total: number): RepresentativeColor {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  const count = box.end - box.start
  for (let i = box.start; i < box.end; i++) {
    const idx = order[i]
    rSum += samples.r[idx]
    gSum += samples.g[idx]
    bSum += samples.b[idx]
  }
  const rgb: RGB = {
    r: Math.round(rSum / Math.max(1, count)),
    g: Math.round(gSum / Math.max(1, count)),
    b: Math.round(bSum / Math.max(1, count)),
  }
  return { rgb, lab: rgbToLab(rgb), count, share: count / Math.max(1, total) }
}

/** 均匀抽样收集有效像素（alpha 太低的直接丢掉） */
function collectSamples(img: RgbaImage, alphaThreshold: number, maxSamples: number): Samples {
  const total = img.width * img.height
  const step = Math.max(1, Math.ceil(total / Math.max(1, maxSamples)))
  const capacity = Math.ceil(total / step) + 1
  const r = new Float32Array(capacity)
  const g = new Float32Array(capacity)
  const b = new Float32Array(capacity)
  const data = img.data
  let count = 0
  for (let p = 0; p < total; p += step) {
    const o = p * 4
    if (data[o + 3] < alphaThreshold) continue
    r[count] = data[o]
    g[count] = data[o + 1]
    b[count] = data[o + 2]
    count++
  }
  return { r, g, b, count }
}
