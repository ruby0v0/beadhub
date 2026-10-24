/**
 * 图片导入：选图 → 取尺寸 → 解成 RGBA。
 *
 * 平台差异只集中在这一个文件里：
 * - weapp：Taro.createOffscreenCanvas({ type: '2d' }) + canvas.createImage()
 * - h5    ：document.createElement('canvas') + new Image()
 * 解出来的像素交给 core，core 那边完全不知道自己跑在哪个端。
 */

import Taro from '@tarojs/taro'
import type { RgbaImage } from '../core/types'

export interface PickedImage {
  path: string
  width: number
  height: number
  size?: number
}

const isH5 = process.env.TARO_ENV === 'h5'

export async function pickImage(): Promise<PickedImage | null> {
  try {
    const res = await Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    })
    const file = res.tempFiles?.[0]
    if (!file) return null
    const info = await Taro.getImageInfo({ src: file.tempFilePath })
    return { path: file.tempFilePath, width: info.width, height: info.height, size: file.size }
  } catch (err: any) {
    // 用户取消不提示
    if (String(err?.errMsg ?? '').includes('cancel')) return null
    console.warn('[imageSource] 选图失败', err)
    Taro.showToast({ title: '选图失败，请重试', icon: 'none' })
    return null
  }
}

/**
 * 解码成 RGBA。maxSize 限制解码尺寸：手机上 4000px 的原图直接 getImageData
 * 会吃掉几十 MB，先按比例降一次更稳，也顺带减少后续下采样的耗时。
 */
export async function decodeToRgba(path: string, maxSize = 1024): Promise<RgbaImage> {
  const info = await Taro.getImageInfo({ src: path })
  const longest = Math.max(info.width, info.height)
  const ratio = longest > maxSize ? maxSize / longest : 1
  const width = Math.max(1, Math.round(info.width * ratio))
  const height = Math.max(1, Math.round(info.height * ratio))
  return isH5 ? decodeH5(path, width, height) : decodeWeapp(path, width, height)
}

async function decodeWeapp(path: string, width: number, height: number): Promise<RgbaImage> {
  const canvas = Taro.createOffscreenCanvas({ type: '2d', width, height })
  const ctx = canvas.getContext('2d') as any
  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = path
  })
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)
  return { data: ctx.getImageData(0, 0, width, height).data, width, height }
}

async function decodeH5(path: string, width: number, height: number): Promise<RgbaImage> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d 上下文创建失败')
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = path
  })
  ctx.drawImage(image, 0, 0, width, height)
  return { data: ctx.getImageData(0, 0, width, height).data, width, height }
}

/** 把图纸导成图片（分享 / 保存到相册）：离屏 canvas 上按格子上色 */
export async function exportPatternImage(
  width: number,
  height: number,
  colorAt: (col: number, row: number) => string | null,
  cellSize = 12,
): Promise<string> {
  const canvasW = width * cellSize
  const canvasH = height * cellSize
  const canvas: any = isH5
    ? document.createElement('canvas')
    : Taro.createOffscreenCanvas({ type: '2d', width: canvasW, height: canvasH })
  if (isH5) {
    canvas.width = canvasW
    canvas.height = canvasH
  }
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#F7F4EF'
  ctx.fillRect(0, 0, canvasW, canvasH)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const color = colorAt(col, row)
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize)
    }
  }
  if (isH5) return (canvas as HTMLCanvasElement).toDataURL('image/png')
  return new Promise<string>((resolve, reject) => {
    Taro.canvasToTempFilePath({
      canvas,
      success: res => resolve(res.tempFilePath),
      fail: err => reject(err),
    })
  })
}
