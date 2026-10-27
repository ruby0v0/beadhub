import type { RgbaImage } from '../../src/core/types'
import type { PaletteEntry } from '../../src/core/color/match'

/** 构造一张 w×h 的 RGBA 图，pixel(col, row) 返回 [r,g,b,a] */
export function makeImage(
  width: number,
  height: number,
  pixel: (col: number, row: number) => [number, number, number, number?],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y)
      const o = (y * width + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    }
  }
  return { data, width, height }
}

/** 纯色图 */
export function solidImage(width: number, height: number, rgb: [number, number, number], alpha = 255): RgbaImage {
  return makeImage(width, height, () => [rgb[0], rgb[1], rgb[2], alpha])
}

/** 黑白棋盘，格子边长为 cell */
export function checkerImage(width: number, height: number, cell = 1): RgbaImage {
  return makeImage(width, height, (x, y) => {
    const black = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
    return black ? [0, 0, 0] : [255, 255, 255]
  })
}

/** 测试用 mock 色板（不依赖真实摩达色库） */
export function mockPalette(n: number): PaletteEntry[] {
  const colors: PaletteEntry[] = []
  // 固定伪随机序列，保证测试可复现
  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let i = 0; i < n; i++) {
    const r = Math.floor(rand() * 256)
    const g = Math.floor(rand() * 256)
    const b = Math.floor(rand() * 256)
    colors.push({
      code: `M${String(i).padStart(3, '0')}`,
      name: `mock-${i}`,
      hex: `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`,
    })
  }
  return colors
}

/** 小型手工色板：语义明确，方便断言「精确命中 / 最近邻」 */
export const TINY_PALETTE: PaletteEntry[] = [
  { code: 'RED', hex: '#FF0000' },
  { code: 'GREEN', hex: '#00FF00' },
  { code: 'BLUE', hex: '#0000FF' },
  { code: 'WHITE', hex: '#FFFFFF' },
  { code: 'BLACK', hex: '#000000' },
  { code: 'YELLOW', hex: '#FFFF00' },
]
