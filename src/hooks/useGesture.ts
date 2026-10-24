/**
 * 画布手势层：双指缩放 / 单指平移 / 点选 / 双击放大。
 *
 * 坐标系：内容坐标系（1 单位 = 1 格）→ 屏幕 px，变换就是
 *   screen = content * scale + (tx, ty)
 * 反算格子：col = floor((sx - tx) / scale)。
 *
 * 变换放在 ref 里而不是 React state：手指移动是 60fps 的高频事件，
 * 走 setState 会每帧触发一次小程序 setData。绘制由 onDraw 直接驱动 canvas。
 */

import { useCallback, useRef } from 'react'
import type { Transform } from '../types'

export interface Point {
  x: number
  y: number
}

export interface UseGestureOptions {
  minScale?: number
  maxScale?: number
  /** 视口（CSS px） */
  viewport?: () => { width: number; height: number }
  /** 内容尺寸（内容坐标系） */
  content?: () => { width: number; height: number }
  /** 变换变化 → 直接重绘（不触发 React 渲染） */
  onDraw: () => void
  /** 手势结束 / 需要刷新 UI 文案时回调 */
  onSettle?: (transform: Transform) => void
  /** 点击（未拖动）时回调，坐标已换算到画布本地 CSS px */
  onTap?: (point: Point) => void
  /** 单指拖动（编辑器画笔用）：传了就把单指拖动交给它，而不是平移画布 */
  onDrag?: (point: Point) => void
  /** 单指是否用于平移，默认 true；编辑器里设 false 让单指画画、双指平移 */
  singleTouchPan?: boolean
}

export interface UseGestureResult {
  transformRef: { current: Transform }
  setTransform: (next: Transform, options?: { silent?: boolean }) => void
  reset: (base?: Transform) => void
  zoomBy: (factor: number, origin?: Point) => void
  handlers: {
    onTouchStart: (e: any) => void
    onTouchMove: (e: any) => void
    onTouchEnd: (e: any) => void
    onTouchCancel: (e: any) => void
  }
  /** 给 H5 鼠标 / 滚轮复用同一套逻辑 */
  api: {
    begin: (points: Point[]) => void
    move: (points: Point[]) => void
    end: () => void
    isActive: () => boolean
  }
}

const TAP_MOVE_TOLERANCE = 8
const TAP_DURATION = 280
const DOUBLE_TAP_GAP = 260

export function pointsFromEvent(e: any): Point[] {
  const list = e?.touches || e?.detail?.touches || e?.changedTouches || e?.detail?.changedTouches || []
  return Array.from(list as any[]).map(t => ({
    x: t.clientX ?? t.pageX ?? t.x ?? 0,
    y: t.clientY ?? t.pageY ?? t.y ?? 0,
  }))
}

export function useGesture(options: UseGestureOptions): UseGestureResult {
  const { minScale = 0.4, maxScale = 24, onDraw, onSettle, onTap, onDrag, singleTouchPan = true } = options

  const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 })
  const sessionRef = useRef<{
    active: boolean
    mode: 'none' | 'pan' | 'pinch' | 'drag'
    startPoints: Point[]
    startTransform: Transform
    startDistance: number
    startMid: Point
    lastPoint: Point
    startAt: number
    startTapPoint: Point | null
  }>({
    active: false,
    mode: 'none',
    startPoints: [],
    startTransform: { scale: 1, tx: 0, ty: 0 },
    startDistance: 0,
    startMid: { x: 0, y: 0 },
    lastPoint: { x: 0, y: 0 },
    startAt: 0,
    startTapPoint: null,
  })
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null)

  const clamp = useCallback(
    (t: Transform): Transform => {
      const viewport = options.viewport?.()
      const content = options.content?.()
      const scale = Math.min(maxScale, Math.max(minScale, t.scale))
      let { tx, ty } = t
      if (viewport && content) {
        const cw = content.width * scale
        const ch = content.height * scale
        tx = cw <= viewport.width ? (viewport.width - cw) / 2 : Math.min(0, Math.max(viewport.width - cw, tx))
        ty = ch <= viewport.height ? (viewport.height - ch) / 2 : Math.min(0, Math.max(viewport.height - ch, ty))
      }
      return { scale, tx, ty }
    },
    [maxScale, minScale, options],
  )

  const setTransform = useCallback(
    (next: Transform, opts?: { silent?: boolean }) => {
      transformRef.current = clamp(next)
      if (!opts?.silent) onDraw()
    },
    [clamp, onDraw],
  )

  const zoomBy = useCallback(
    (factor: number, origin?: Point) => {
      const viewport = options.viewport?.()
      const point = origin ?? (viewport ? { x: viewport.width / 2, y: viewport.height / 2 } : { x: 0, y: 0 })
      const current = transformRef.current
      const nextScale = current.scale * factor
      const ratio = clamp({ ...current, scale: nextScale }).scale / current.scale
      setTransform({
        scale: current.scale * ratio,
        tx: point.x - (point.x - current.tx) * ratio,
        ty: point.y - (point.y - current.ty) * ratio,
      })
      onSettle?.(transformRef.current)
    },
    [clamp, onSettle, options, setTransform],
  )

  const reset = useCallback(
    (base?: Transform) => {
      setTransform(base ?? { scale: 1, tx: 0, ty: 0 })
      onSettle?.(transformRef.current)
    },
    [onSettle, setTransform],
  )

  const begin = useCallback((points: Point[]) => {
    const session = sessionRef.current
    session.active = true
    session.startPoints = points
    session.startTransform = { ...transformRef.current }
    session.startAt = Date.now()
    session.lastPoint = points[0] ?? { x: 0, y: 0 }
    session.startTapPoint = points[0] ? { ...points[0] } : null
    if (points.length >= 2) {
      session.mode = 'pinch'
      session.startDistance = distance(points[0], points[1]) || 1
      session.startMid = midpoint(points[0], points[1])
    } else {
      session.mode = points.length === 1 ? 'pan' : 'none'
    }
  }, [])

  const move = useCallback(
    (points: Point[]) => {
      const session = sessionRef.current
      if (!session.active || points.length === 0) return
      const start = session.startTransform

      if (points.length >= 2) {
        if (session.mode !== 'pinch') {
          // 单指途中加第二指：以当前状态为新的基准
          session.mode = 'pinch'
          session.startPoints = points
          session.startTransform = { ...transformRef.current }
          session.startDistance = distance(points[0], points[1]) || 1
          session.startMid = midpoint(points[0], points[1])
          return
        }
        const dist = distance(points[0], points[1]) || 1
        const mid = midpoint(points[0], points[1])
        const ratio = dist / session.startDistance
        const nextScale = Math.min(maxScale, Math.max(minScale, start.scale * ratio))
        const applied = nextScale / start.scale
        setTransform({
          scale: nextScale,
          tx: mid.x - (session.startMid.x - start.tx) * applied,
          ty: mid.y - (session.startMid.y - start.ty) * applied,
        })
        return
      }

      const point = points[0]
      session.lastPoint = point
      if (!singleTouchPan && onDrag) {
        session.mode = 'drag'
        session.startTapPoint = null
        onDrag(point)
        return
      }
      if (session.mode === 'pinch') {
        // 双指抬到单指：重新以当前状态为基准继续平移
        session.mode = 'pan'
        session.startPoints = points
        session.startTransform = { ...transformRef.current }
        session.startTapPoint = null
        return
      }
      const origin = session.startPoints[0] ?? point
      setTransform({
        scale: start.scale,
        tx: start.tx + (point.x - origin.x),
        ty: start.ty + (point.y - origin.y),
      })
    },
    [maxScale, minScale, setTransform],
  )

  const end = useCallback(() => {
    const session = sessionRef.current
    if (!session.active) return
    session.active = false
    onSettle?.(transformRef.current)

    const startPoint = session.startTapPoint
    const elapsed = Date.now() - session.startAt
    if (startPoint && elapsed < TAP_DURATION) {
      const moved = distance(startPoint, session.lastPoint)
      if (moved <= TAP_MOVE_TOLERANCE) {
        const now = Date.now()
        const last = lastTapRef.current
        if (last && now - last.at < DOUBLE_TAP_GAP && distance(last.point, startPoint) < 40) {
          // 双击：在点击位置放大 / 复原
          lastTapRef.current = null
          const factor = transformRef.current.scale < maxScale * 0.6 ? 2 : 0.0001
          zoomBy(factor, startPoint)
          return
        }
        lastTapRef.current = { at: now, point: startPoint }
        onTap?.(startPoint)
      }
    }
  }, [maxScale, onSettle, onTap, zoomBy])

  return {
    transformRef,
    setTransform,
    reset,
    zoomBy,
    handlers: {
      onTouchStart: (e: any) => begin(pointsFromEvent(e)),
      onTouchMove: (e: any) => move(pointsFromEvent(e)),
      onTouchEnd: () => end(),
      onTouchCancel: () => end(),
    },
    api: {
      begin,
      move,
      end,
      isActive: () => sessionRef.current.active,
    },
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
