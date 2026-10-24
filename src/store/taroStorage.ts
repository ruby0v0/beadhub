/**
 * zustand persist 的 Taro storage 适配层。
 * 契约要求：persist 中间件对接 Taro.setStorageSync。
 */

import Taro from '@tarojs/taro'
import type { StateStorage } from 'zustand/middleware'

export const taroStorage: StateStorage = {
  getItem: (name: string) => {
    try {
      const value = Taro.getStorageSync(name)
      if (value === '' || value === null || value === undefined) return null
      return typeof value === 'string' ? value : JSON.stringify(value)
    } catch (err) {
      console.warn('[taroStorage] getItem 失败', name, err)
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      Taro.setStorageSync(name, value)
    } catch (err) {
      console.error('[taroStorage] setItem 失败', name, err)
    }
  },
  removeItem: (name: string) => {
    try {
      Taro.removeStorageSync(name)
    } catch (err) {
      console.warn('[taroStorage] removeItem 失败', name, err)
    }
  },
}
