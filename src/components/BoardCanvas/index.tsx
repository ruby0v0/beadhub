/**
 * 底层 Canvas + 手势容器。
 *
 * 职责边界：
 * - 它只管「屏幕像素」：拿节点、算 fit、缩放平移、把点击换算成内容坐标；
 * - 画什么交给 render 回调（BeadGrid 负责画格子）。
 *
 * 之所以把 transform 放 ref + 直接重绘，而不是 React state：
 * 小程序里手指移动是 60fps 事件流，走 setState → setData 会掉帧。
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Canvas, View } from '@tarojs/components'
import { useCanvas } from '../../hooks/useCanvas'
import { pointsFromEvent, useGesture, type Point } from '../../hooks/useGesture'
import type { CanvasInfo, Transform } from '../../types'

const isH5 = process.env.TARO_ENV === 'h5'

export interface BoardCanvasHandle {
  reset: () => void
  zoomBy: (factor: number) => void
  getTransform: () => Transform
  redraw: () => void
}

export interface BoardCanvasRenderParams {
  /** 每格屏幕 px + 平移量 */
  transform: Transform
  /** fit 之后的基准变换（reset 会回到这里） */
  base: Transform
  info: CanvasInfo
}

export interface BoardCanvasProps {
  id: string
  className?: string
  style?: CSSProperties
  /** 内容尺寸（内容坐标系，1 单位 = 1 格） */
  content: { width: number; height: number }
  render: (ctx: any, params: BoardCanvasRenderParams) => void
  /** 点选：point 为画布本地 CSS px，contentPoint 为内容坐标（1 单位 = 1 格） */
  onTap?: (point: Point, contentPoint: Point) => void
  onTransformChange?: (transform: Transform) => void
  onReady?: (info: CanvasInfo) => void
  minScale?: number
  maxScale?: number
  /** fit 时四周留白（CSS px） */
  padding?: number
  /** fit 的最大放大倍数，避免小图纸被拉成巨块 */
  maxFitScale?: number
  /** 外部强制重绘的标记 */
  revision?: number | string
}

export const BoardCanvas = forwardRef<BoardCanvasHandle, BoardCanvasProps>((props, ref) => {
  const { id, content, render, onTap, onTransformChange, onReady, minScale = 0.4, maxScale = 24, padding = 16, maxFitScale = 48 } = props

  const [base, setBase] = useState<Transform>({ scale: 1, tx: 0, ty: 0 })
  const baseRef = useRef(base)
  const contentRef = useRef(content)
  const renderRef = useRef(render)
  const userAdjustedRef = useRef(false)
  /** useGesture 在下面才创建，这里先留个 ref 让 draw 回调能拿到最新的 transform */
  const gestureRef = useRef<{ transformRef: { current: Transform } } | null>(null)
  const [zoomLabel, setZoomLabel] = useState(1)

  contentRef.current = content
  renderRef.current = render
  baseRef.current = base

  const draw = useCallback((_ctx: any, info: CanvasInfo) => {
    const transform = gestureRef.current?.transformRef.current ?? { scale: 1, tx: 0, ty: 0 }
    renderRef.current(_ctx, { transform, base: baseRef.current, info })
  }, [])

  const canvas = useCanvas({ id, render: draw })

  const gesture = useGesture({
    minScale,
    maxScale,
    viewport: () => ({ width: canvas.width, height: canvas.height }),
    content: () => contentRef.current,
    onDraw: () => canvas.requestDraw(),
    onSettle: t => {
      setZoomLabel(t.scale)
      onTransformChange?.(t)
    },
    onTap: point => {
      const t = gesture.transformRef.current
      onTap?.(point, { x: (point.x - t.tx) / t.scale, y: (point.y - t.ty) / t.scale })
    },
  })

  gestureRef.current = gesture

  /** fit：内容居中 + 留白 */
  const computeBase = useCallback(
    (info: CanvasInfo): Transform => {
      const c = contentRef.current
      const usableW = Math.max(1, info.width - padding * 2)
      const usableH = Math.max(1, info.height - padding * 2)
      const scale = Math.min(usableW / c.width, usableH / c.height, maxFitScale)
      return {
        scale,
        tx: (info.width - c.width * scale) / 2,
        ty: (info.height - c.height * scale) / 2,
      }
    },
    [maxFitScale, padding],
  )

  // 尺寸 / 内容变化：重算 fit；用户手动缩放过就保留其视角，只做边界重夹
  useEffect(() => {
    if (!canvas.ready) return
    const next = computeBase(canvas)
    setBase(next)
    if (!userAdjustedRef.current) {
      gesture.setTransform(next, { silent: true })
      setZoomLabel(next.scale)
    } else {
      gesture.setTransform(gesture.transformRef.current)
    }
    onReady?.(canvas)
    canvas.requestDraw()
  }, [canvas.ready, canvas.width, canvas.height, content.width, content.height, computeBase])

  // 外部触发重绘（比如编辑器改了格子）
  useEffect(() => {
    canvas.requestDraw()
  }, [props.revision])

  const markAdjusted = useCallback(() => {
    userAdjustedRef.current = true
  }, [])

  const localPoints = useCallback(
    (e: any): Point[] => {
      const rect = { left: canvas.left, top: canvas.top }
      return pointsFromEvent(e).map(p => ({ x: p.x - rect.left, y: p.y - rect.top }))
    },
    [canvas.left, canvas.top],
  )

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: (e: any) => {
        markAdjusted()
        gesture.api.begin(localPoints(e))
      },
      onTouchMove: (e: any) => {
        gesture.api.move(localPoints(e))
      },
      onTouchEnd: () => gesture.api.end(),
      onTouchCancel: () => gesture.api.end(),
    }),
    [gesture.api, localPoints, markAdjusted],
  )

  // H5 桌面端：鼠标拖拽平移 / 滚轮缩放 / 单击点选
  useEffect(() => {
    if (!isH5 || !canvas.ready) return
    const node = canvas.canvas() as HTMLCanvasElement | null
    if (!node) return
    let dragging = false
    const local = (e: MouseEvent): Point => {
      const rect = node.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onDown = (e: MouseEvent) => {
      dragging = true
      markAdjusted()
      gesture.api.begin([local(e)])
    }
    const onMove = (e: MouseEvent) => {
      if (dragging) gesture.api.move([local(e)])
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      gesture.api.end()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      markAdjusted()
      gesture.zoomBy(Math.exp(-e.deltaY / 420), local(e))
    }
    node.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      node.removeEventListener('wheel', onWheel)
    }
  }, [canvas.ready, gesture.api, gesture.zoomBy, markAdjusted])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        userAdjustedRef.current = false
        const next = computeBase({ width: canvas.width, height: canvas.height, dpr: canvas.dpr })
        setBase(next)
        gesture.setTransform(next)
        setZoomLabel(next.scale)
      },
      zoomBy: factor => {
        markAdjusted()
        gesture.zoomBy(factor)
      },
      getTransform: () => gesture.transformRef.current,
      redraw: () => canvas.requestDraw(),
    }),
    [canvas, computeBase, gesture, markAdjusted],
  )

  return (
    <View className={props.className} style={{ position: 'relative', overflow: 'hidden', ...props.style }} {...touchHandlers}>
      <Canvas
        type='2d'
        id={id}
        canvasId={id}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <View
        className='absolute rounded-full bg-surface-2 px-12 py-4 text-20 text-ink-3'
        style={{ right: '16rpx', bottom: '16rpx', pointerEvents: 'none' }}
      >
        {Math.round(zoomLabel * 100)}%
      </View>
    </View>
  )
})

BoardCanvas.displayName = 'BoardCanvas'
