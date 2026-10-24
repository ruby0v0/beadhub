/**
 * Canvas type="2d" 节点管理：取节点 → 设 dpr → 按 rAF 合并重绘。
 *
 * weapp 必须通过 createSelectorQuery().fields({ node: true }) 拿真节点，
 * 不能像 H5 那样直接 getElementById；窗口尺寸变化时只重测（重新赋值 width/height，
 * 不要重建节点，小程序重建会掉帧）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import type { CanvasInfo } from '../types'

const isH5 = process.env.TARO_ENV === 'h5'

export interface CanvasRect extends CanvasInfo {
  left: number
  top: number
}

export interface UseCanvasOptions {
  /** Canvas 组件的 id */
  id: string
  /** 绘制回调：坐标系已被 dpr 缩放，直接按 CSS px 画即可 */
  render: (ctx: any, info: CanvasRect) => void
}

export interface UseCanvasResult extends CanvasRect {
  ready: boolean
  /** 请求重绘（同一帧内多次调用只画一次） */
  requestDraw: () => void
  /** 重新测量尺寸（H5 resize / 页面切换回来时用） */
  refresh: () => void
  canvas: () => any
  ctx: () => any
}

function queryWeapp(id: string): Promise<{ node: any; rect: any }> {
  return new Promise(resolve => {
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .fields({ node: true, size: true, rect: true })
      .exec(res => resolve({ node: res?.[0]?.node, rect: res?.[0] }))
  })
}

export function useCanvas({ id, render }: UseCanvasOptions): UseCanvasResult {
  const [state, setState] = useState<CanvasRect>({ width: 0, height: 0, dpr: 1, left: 0, top: 0 })
  const [ready, setReady] = useState(false)

  const nodeRef = useRef<any>(null)
  const ctxRef = useRef<any>(null)
  const renderRef = useRef(render)
  const rectRef = useRef<CanvasRect>(state)
  const frameRef = useRef<number | null>(null)
  const readyRef = useRef(false)

  renderRef.current = render
  rectRef.current = state

  const raf = useCallback((cb: () => void) => {
    const node = nodeRef.current
    if (node && typeof node.requestAnimationFrame === 'function') {
      return node.requestAnimationFrame(cb)
    }
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb)
    return setTimeout(cb, 16) as unknown as number
  }, [])

  const draw = useCallback(() => {
    frameRef.current = null
    const ctx = ctxRef.current
    if (!ctx || !readyRef.current) return
    const info = rectRef.current
    ctx.setTransform(info.dpr, 0, 0, info.dpr, 0, 0)
    ctx.clearRect(0, 0, info.width, info.height)
    renderRef.current(ctx, info)
  }, [])

  const requestDraw = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = raf(draw)
  }, [draw, raf])

  const setup = useCallback(async () => {
    const dpr = isH5 ? Math.min(window.devicePixelRatio || 1, 3) : (Taro.getSystemInfoSync().pixelRatio || 2)
    if (isH5) {
      const el = document.getElementById(id) as HTMLCanvasElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.round(rect.width || el.clientWidth || 300)
      const height = Math.round(rect.height || el.clientHeight || 300)
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      ctxRef.current = el.getContext('2d')
      nodeRef.current = el
      const info: CanvasRect = { width, height, dpr, left: rect.left, top: rect.top }
      rectRef.current = info
      setState(info)
    } else {
      const { node, rect } = await queryWeapp(id)
      if (!node) return
      const width = Math.round(rect?.width ?? 300)
      const height = Math.round(rect?.height ?? 300)
      node.width = Math.round(width * dpr)
      node.height = Math.round(height * dpr)
      nodeRef.current = node
      ctxRef.current = node.getContext('2d')
      const info: CanvasRect = { width, height, dpr, left: rect?.left ?? 0, top: rect?.top ?? 0 }
      rectRef.current = info
      setState(info)
    }
    readyRef.current = true
    setReady(true)
    requestDraw()
  }, [id, requestDraw])

  useEffect(() => {
    setup()
  }, [setup])

  // H5 桌面端窗口缩放 / 旋屏（小程序侧由页面 onResize 触发 refresh）
  useEffect(() => {
    if (!isH5 || typeof window === 'undefined') return
    let timer: any
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setup(), 160)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [setup])

  return {
    ...state,
    ready,
    requestDraw,
    refresh: setup,
    canvas: () => nodeRef.current,
    ctx: () => ctxRef.current,
  }
}

/** 离屏画布：给「整图一次性绘制 + 离屏缓存位图」用 */
export function createOffscreenCanvas(width: number, height: number): any {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  if (isH5) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  }
  return Taro.createOffscreenCanvas({ type: '2d', width: w, height: h })
}
