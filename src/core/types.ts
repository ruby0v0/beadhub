/**
 * core 层公共类型。这里只允许出现纯数据结构，
 * core/** 任何文件都不许 import Taro / 小程序 API（保证可跑 Node 单测）。
 */

import type { Lab, RGB } from './color/convert'

/** 解出来的位图（RGBA，每通道 0~255，长度 = width * height * 4） */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

/** 一个「代表色」：量化（中位切分）产出的色锚点 */
export interface ColorAnchor {
  rgb: RGB
  lab: Lab
}

/** 图纸格子值：>= 0 是色板索引，-1 是空格 */
export type CellValue = number
export const EMPTY_CELL: CellValue = -1

export function createImage(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

export function cloneImage(img: RgbaImage): RgbaImage {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
}
