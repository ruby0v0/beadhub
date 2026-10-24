/**
 * Taro 本地存储薄封装：统一 key 前缀、JSON 读写、配额提示。
 *
 * 小程序单个 key 上限 1MB、总量 10MB，所以图纸拆成
 * `index`（索引）+ `pattern:<id>`（RLE 正文）两处存，列表页只读索引。
 */

import Taro from '@tarojs/taro'

export const STORAGE_PREFIX = 'beadhub:'

export const StorageKeys = {
  index: `${STORAGE_PREFIX}pattern-index:v1`,
  pattern: (id: string) => `${STORAGE_PREFIX}pattern:${id}`,
  progress: (id: string) => `${STORAGE_PREFIX}progress:${id}`,
  settings: `${STORAGE_PREFIX}settings:v1`,
  seeds: `${STORAGE_PREFIX}seeded:v1`,
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = Taro.getStorageSync(key)
    if (!raw) return fallback
    if (typeof raw === 'object') return raw as T
    return JSON.parse(raw as string) as T
  } catch (err) {
    console.warn('[storage] 读取失败', key, err)
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    Taro.setStorageSync(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.error('[storage] 写入失败', key, err)
    Taro.showToast({ title: '本地空间不足', icon: 'none' })
    return false
  }
}

export function removeKey(key: string): void {
  try {
    Taro.removeStorageSync(key)
  } catch (err) {
    console.warn('[storage] 删除失败', key, err)
  }
}

export function readRaw(key: string): string {
  try {
    const v = Taro.getStorageSync(key)
    return typeof v === 'string' ? v : v ? JSON.stringify(v) : ''
  } catch {
    return ''
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    Taro.setStorageSync(key, value)
  } catch (err) {
    console.error('[storage] 写入失败', key, err)
  }
}

/** 当前存储占用（KB），「我的」页展示 */
export function storageUsageKb(): { current: number; limit: number } {
  try {
    const info = Taro.getStorageInfoSync()
    return { current: info.currentSize ?? 0, limit: info.limitSize ?? 10240 }
  } catch {
    return { current: 0, limit: 10240 }
  }
}

export function clearAll(): void {
  try {
    const info = Taro.getStorageInfoSync()
    ;(info.keys ?? [])
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => Taro.removeStorageSync(k))
  } catch (err) {
    console.warn('[storage] 清空失败', err)
  }
}
