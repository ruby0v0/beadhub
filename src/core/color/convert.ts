/**
 * sRGB → 线性 RGB → CIE XYZ → CIE Lab（D65 白点）。
 *
 * 纯函数，零依赖，可单独在 Node 里跑单测。
 */

export interface RGB {
  /** 0 ~ 255 */
  r: number
  /** 0 ~ 255 */
  g: number
  /** 0 ~ 255 */
  b: number
}

export interface XYZ {
  x: number
  y: number
  z: number
}

export interface Lab {
  /** 亮度 0 ~ 100 */
  L: number
  a: number
  b: number
}

/** D65 2° 观察者标准白点 */
export const D65_WHITE: XYZ = { x: 95.047, y: 100, z: 108.883 }

const DELTA = 6 / 29
const DELTA_POW3 = DELTA * DELTA * DELTA
const LAB_F_T = (t: number) => (t > DELTA_POW3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29)

export function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0
  if (v <= 0) return 0
  if (v >= 255) return 255
  return Math.round(v)
}

/** `#RGB` / `#RRGGBB` / 不带 `#` 都吃 */
export function hexToRgb(hex: string): RGB {
  let s = (hex || '').trim().replace(/^#/, '')
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  if (s.length === 8) s = s.slice(0, 6) // 忽略 alpha
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    // 脏数据（空字符串 / 'transparent' 之类）统一退回黑色，避免整条匹配链崩掉
    return { r: 0, g: 0, b: 0 }
  }
  const n = parseInt(s, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to2 = (v: number) => clampByte(v).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase()
}

/** 单通道 sRGB（0~1）→ 线性（0~1） */
export function srgbChannelToLinear(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** 线性（0~1）→ sRGB（0~1） */
export function linearChannelToSrgb(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

export function srgbToLinear({ r, g, b }: RGB): XYZ {
  return {
    x: srgbChannelToLinear(r / 255),
    y: srgbChannelToLinear(g / 255),
    z: srgbChannelToLinear(b / 255),
  }
}

export function rgbToXyz(rgb: RGB): XYZ {
  const { x: r, y: g, z: b } = srgbToLinear(rgb)
  return {
    x: (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    y: (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100,
    z: (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100,
  }
}

export function xyzToLab(xyz: XYZ, white: XYZ = D65_WHITE): Lab {
  const fx = LAB_F_T(xyz.x / white.x)
  const fy = LAB_F_T(xyz.y / white.y)
  const fz = LAB_F_T(xyz.z / white.z)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function rgbToLab(rgb: RGB): Lab {
  return xyzToLab(rgbToXyz(rgb))
}

export function labToXyz(lab: Lab, white: XYZ = D65_WHITE): XYZ {
  const fy = (lab.L + 16) / 116
  const fx = fy + lab.a / 500
  const fz = fy - lab.b / 200
  const finv = (f: number) => (f ** 3 > DELTA_POW3 ? f ** 3 : 3 * DELTA * DELTA * (f - 4 / 29))
  return {
    x: finv(fx) * white.x,
    y: finv(fy) * white.y,
    z: finv(fz) * white.z,
  }
}

/** 抖动的误差回写需要 Lab → RGB，色域外做软裁剪 */
export function labToRgb(lab: Lab): RGB {
  const { x, y, z } = labToXyz(lab)
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return {
    r: clampByte(linearChannelToSrgb(r / 100) * 255),
    g: clampByte(linearChannelToSrgb(g / 100) * 255),
    b: clampByte(linearChannelToSrgb(b / 100) * 255),
  }
}
