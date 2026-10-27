import { describe, expect, it } from 'vitest'
import {
  clampByte,
  hexToRgb,
  labToRgb,
  labToXyz,
  rgbToHex,
  rgbToLab,
  rgbToXyz,
  srgbChannelToLinear,
  linearChannelToSrgb,
  xyzToLab,
  D65_WHITE,
  type RGB,
} from '../../src/core/color/convert'

describe('clampByte', () => {
  it('0~255 内四舍五入', () => {
    expect(clampByte(10.4)).toBe(10)
    expect(clampByte(10.5)).toBe(11)
    expect(clampByte(127)).toBe(127)
  })

  it('越界钳制到 0 / 255', () => {
    expect(clampByte(-1)).toBe(0)
    expect(clampByte(-1000)).toBe(0)
    expect(clampByte(255)).toBe(255)
    expect(clampByte(256)).toBe(255)
  })

  it('NaN / Infinity 不抛异常，按约定统一回 0', () => {
    expect(clampByte(NaN)).toBe(0)
    expect(clampByte(Infinity)).toBe(0)
    expect(clampByte(-Infinity)).toBe(0)
  })
})

describe('hexToRgb / rgbToHex', () => {
  it('解析 #RRGGBB / #RGB / 不带 #', () => {
    expect(hexToRgb('#FF8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(hexToRgb('FF8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 }) // 0x8*17 = 136
    expect(hexToRgb('#FF800080')).toEqual({ r: 255, g: 128, b: 0 }) // 8 位忽略 alpha
  })

  it('脏输入退回黑色，不抛异常', () => {
    expect(hexToRgb('')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('transparent')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#XYZ123')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('rgbToHex 输出大写并钳制', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 16 })).toBe('#FF0010')
    expect(rgbToHex({ r: -5, g: 300, b: NaN })).toBe('#00FF00')
  })

  it('hex 往返一致', () => {
    for (const hex of ['#000000', '#FFFFFF', '#E4573D', '#123ABC', '#abcdef']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex.toUpperCase())
    }
  })
})

describe('sRGB 通道线性化', () => {
  it('端点：0→0，1→1', () => {
    expect(srgbChannelToLinear(0)).toBe(0)
    expect(srgbChannelToLinear(1)).toBe(1)
    expect(linearChannelToSrgb(0)).toBe(0)
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 12) // 浮点 0.999...；实现约定的端点映射
  })

  it('标准分段点：0.04045 / 0.0031308', () => {
    // 0.04045 处两条公式衔接（值约 0.0031308）
    expect(srgbChannelToLinear(0.04045)).toBeCloseTo(0.0031308, 6)
    expect(linearChannelToSrgb(0.0031308)).toBeCloseTo(0.04045, 5)
  })

  it('往返近似一致（8bit 精度内）', () => {
    for (let v = 0; v <= 255; v += 5) {
      const lin = srgbChannelToLinear(v / 255)
      const back = linearChannelToSrgb(lin) * 255
      expect(Math.abs(back - v)).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('rgbToXyz', () => {
  it('黑 → (0,0,0)，白 → D65 白点', () => {
    expect(rgbToXyz({ r: 0, g: 0, b: 0 })).toEqual({ x: 0, y: 0, z: 0 })
    const white = rgbToXyz({ r: 255, g: 255, b: 255 })
    expect(white.x).toBeCloseTo(D65_WHITE.x, 1)
    expect(white.y).toBeCloseTo(D65_WHITE.y, 1)
    expect(white.z).toBeCloseTo(D65_WHITE.z, 1)
  })

  it('红/绿/蓝主色落在对应轴附近', () => {
    const red = rgbToXyz({ r: 255, g: 0, b: 0 })
    expect(red.y).toBeCloseTo(21.267, 1) // 红的 Y 系数
    const green = rgbToXyz({ r: 0, g: 255, b: 0 })
    expect(green.y).toBeCloseTo(71.515, 1)
    const blue = rgbToXyz({ r: 0, g: 0, b: 255 })
    expect(blue.y).toBeCloseTo(7.2175, 1)
  })
})

describe('rgbToLab 已知值锚点', () => {
  it('白点 Lab ≈ (100, 0, 0)', () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 })
    expect(lab.L).toBeCloseTo(100, 4)
    expect(lab.a).toBeCloseTo(0, 4)
    expect(lab.b).toBeCloseTo(0, 4)
  })

  it('黑点 Lab ≈ (0, 0, 0)', () => {
    const lab = rgbToLab({ r: 0, g: 0, b: 0 })
    expect(lab.L).toBeCloseTo(0, 4)
    expect(lab.a).toBeCloseTo(0, 4)
    expect(lab.b).toBeCloseTo(0, 4)
  })

  it('中性灰的 a/b 接近 0，L 随亮度单调', () => {
    let prevL = -1
    for (const v of [32, 64, 128, 192]) {
      const lab = rgbToLab({ r: v, g: v, b: v })
      expect(Math.abs(lab.a)).toBeLessThan(0.5)
      expect(Math.abs(lab.b)).toBeLessThan(0.5)
      expect(lab.L).toBeGreaterThan(prevL)
      prevL = lab.L
    }
  })

  it('纯红 a 为正，纯蓝 b 为负（Lab 语义）', () => {
    expect(rgbToLab({ r: 255, g: 0, b: 0 }).a).toBeGreaterThan(40)
    expect(rgbToLab({ r: 0, g: 0, b: 255 }).b).toBeLessThan(-40)
    expect(rgbToLab({ r: 255, g: 255, b: 0 }).b).toBeGreaterThan(40) // 黄
  })
})

describe('Lab ↔ XYZ ↔ RGB 往返', () => {
  const samples: RGB[] = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 128, g: 128, b: 128 },
    { r: 12, g: 200, b: 77 },
    { r: 250, g: 1, b: 254 },
    { r: 1, g: 2, b: 3 },
  ]

  it('RGB → Lab → RGB 在 ±0.5 内还原', () => {
    for (const rgb of samples) {
      const back = labToRgb(rgbToLab(rgb))
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(0.5)
    }
  })

  it('Lab → XYZ → Lab 在 ±0.5 内还原', () => {
    for (const rgb of samples) {
      const lab = rgbToLab(rgb)
      const back = xyzToLab(labToXyz(lab))
      expect(Math.abs(back.L - lab.L)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(back.a - lab.a)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(back.b - lab.b)).toBeLessThanOrEqual(0.5)
    }
  })

  it('labToRgb 对色域外的 Lab 做软裁剪，不产生 NaN / 越界值', () => {
    const out = labToRgb({ L: 200, a: 0, b: 0 }) // L 超过 100
    for (const v of [out.r, out.g, out.b]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})

describe('非法输入约定（不抛异常）', () => {
  it('NaN 通道经 clampByte 走 rgbToHex 不抛', () => {
    expect(() => rgbToHex({ r: NaN, g: NaN, b: NaN })).not.toThrow()
  })

  it('负数 / 超大通道在 labToRgb 中被钳制', () => {
    const out = labToRgb({ L: -50, a: 999, b: -999 })
    for (const v of [out.r, out.g, out.b]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})
