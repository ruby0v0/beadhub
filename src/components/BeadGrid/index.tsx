/**
 * 图纸网格渲染（view / editor / preview 共用）。
 *
 * 性能约束（契约里的硬要求）：整图一次性绘制 + 离屏缓存位图，
 * 绝不为每个格子建节点。实现上：
 *   1. 离屏 canvas 按「1px = 1 格」画好底色 → 主画布 drawImage 放大（imageSmoothing 关掉，就是一个个方块）；
 *   2. 已完成格子另存一张 1px/格 的覆盖位图，进度变化时只重画它；
 *   3. 网格线 / 色号文字只在缩放足够大时才画，并且只画可见范围内的格子。
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { BoardCanvas, type BoardCanvasHandle, type BoardCanvasRenderParams } from '../BoardCanvas'
import { createOffscreenCanvas } from '../../hooks/useCanvas'
import type { Point } from '../../hooks/useGesture'
import { getPaletteColors } from '../../constants/palettes'
import { EMPTY_CELL } from '../../core/types'
import type { Pattern } from '../../core/pattern/model'
import type { CanvasInfo, GridCell, Transform } from '../../types'

export interface BeadGridHandle {
  reset: () => void
  zoomIn: () => void
  zoomOut: () => void
  getTransform: () => Transform
  redraw: () => void
}

export interface BeadGridProps {
  pattern: Pattern
  canvasId?: string
  className?: string
  style?: CSSProperties
  /** 已完成格子位图（0/1），长度 = w*h */
  completed?: Uint8Array | null
  /** 已完成位图的版本号（变化即重画覆盖层） */
  completedRevision?: number
  /** 逐行模式高亮的行 */
  highlightRow?: number | null
  selected?: GridCell | null
  showGrid?: boolean
  showCodes?: boolean
  showCompleted?: boolean
  /** 空格是否画出淡轮廓（去背后能看到图纸形状） */
  outlineEmpty?: boolean
  onSelectCell?: (cell: GridCell | null) => void
  onTransformChange?: (transform: Transform) => void
  onReady?: (info: CanvasInfo) => void
  minScale?: number
  maxScale?: number
  padding?: number
  maxFitScale?: number
  revision?: number | string
}

const EMPTY_FILL = '#EDE8DF'
const GRID_MIN_SCALE = 5
const CODE_MIN_SCALE = 17
const MAX_LABELS = 900

const BeadGrid = forwardRef<BeadGridHandle, BeadGridProps>((props, ref) => {
  const {
    pattern,
    completed,
    completedRevision = 0,
    highlightRow = null,
    selected = null,
    showGrid = true,
    showCodes = false,
    showCompleted = true,
    outlineEmpty = true,
    onSelectCell,
    revision,
  } = props

  const canvasId = props.canvasId ?? 'bead-grid'
  const boardRef = useRef<BoardCanvasHandle | null>(null)
  const bitmapRef = useRef<any>(null)
  const overlayRef = useRef<any>(null)
  const bitmapKeyRef = useRef<string>('')
  const overlayKeyRef = useRef<string>('')

  const colors = useMemo(() => getPaletteColors(pattern.paletteId), [pattern.paletteId])
  const hexOf = useCallback(
    (value: number) => (value >= 0 && value < colors.length ? colors[value].hex : null),
    [colors],
  )

  /** 底色位图：1px = 1 格，只在图纸内容变化时重建 */
  const ensureBitmap = useCallback(() => {
    const key = `${pattern.id}:${pattern.width}x${pattern.height}:${pattern.cells.length}:${revision ?? ''}`
    if (bitmapRef.current && bitmapKeyRef.current === key) return bitmapRef.current
    const canvas = createOffscreenCanvas(pattern.width, pattern.height)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, pattern.width, pattern.height)
    let last = -2
    for (let row = 0; row < pattern.height; row++) {
      for (let col = 0; col < pattern.width; col++) {
        const value = pattern.cells[row * pattern.width + col]
        if (value === last) {
          ctx.fillRect(col, row, 1, 1)
          continue
        }
        last = value
        if (value === EMPTY_CELL) {
          if (!outlineEmpty) continue
          ctx.fillStyle = EMPTY_FILL
        } else {
          ctx.fillStyle = hexOf(value) ?? EMPTY_FILL
        }
        ctx.fillRect(col, row, 1, 1)
      }
    }
    bitmapRef.current = canvas
    bitmapKeyRef.current = key
    return canvas
  }, [hexOf, outlineEmpty, pattern.cells, pattern.height, pattern.id, pattern.width, revision])

  /** 已完成覆盖位图：淡化的白色罩子，一眼能看出拼到哪 */
  const ensureOverlay = useCallback(() => {
    if (!completed || !showCompleted) {
      overlayRef.current = null
      overlayKeyRef.current = ''
      return null
    }
    const key = `${completedRevision}:${completed.length}`
    if (overlayRef.current && overlayKeyRef.current === key) return overlayRef.current
    const canvas = createOffscreenCanvas(pattern.width, pattern.height)
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, pattern.width, pattern.height)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    for (let row = 0; row < pattern.height; row++) {
      for (let col = 0; col < pattern.width; col++) {
        const i = row * pattern.width + col
        if (!completed[i]) continue
        if (pattern.cells[i] === EMPTY_CELL) continue
        ctx.fillRect(col, row, 1, 1)
      }
    }
    overlayRef.current = canvas
    overlayKeyRef.current = key
    return canvas
  }, [completed, completedRevision, pattern.cells, pattern.height, pattern.width, showCompleted])

  useEffect(() => {
    bitmapRef.current = null
    bitmapKeyRef.current = ''
    boardRef.current?.redraw()
  }, [pattern, revision])

  useEffect(() => {
    overlayRef.current = null
    overlayKeyRef.current = ''
    boardRef.current?.redraw()
  }, [completed, completedRevision, showCompleted, showGrid, showCodes, highlightRow, selected])

  const render = useCallback(
    (ctx: any, params: BoardCanvasRenderParams) => {
      const { transform, info } = params
      const { width, height } = pattern
      const bitmap = ensureBitmap()
      const overlay = ensureOverlay()

      ctx.save()
      ctx.translate(transform.tx, transform.ty)
      ctx.scale(transform.scale, transform.scale)
      ctx.imageSmoothingEnabled = false

      if (bitmap) ctx.drawImage(bitmap, 0, 0, width, height, 0, 0, width, height)

      // 高亮当前行（逐行拼搭模式）
      if (highlightRow !== null && highlightRow >= 0 && highlightRow < height) {
        ctx.fillStyle = 'rgba(228,87,61,0.16)'
        ctx.fillRect(0, highlightRow, width, 1)
        ctx.strokeStyle = 'rgba(228,87,61,0.9)'
        ctx.lineWidth = 1 / transform.scale
        ctx.strokeRect(0.5 / transform.scale, highlightRow + 0.5 / transform.scale, width - 1 / transform.scale, 1 - 1 / transform.scale)
      }

      if (overlay) ctx.drawImage(overlay, 0, 0, width, height, 0, 0, width, height)

      // 网格线：只画可见范围
      if (showGrid && transform.scale >= GRID_MIN_SCALE) {
        const visible = visibleCells(transform, info, width, height)
        ctx.strokeStyle = 'rgba(29,27,25,0.18)'
        ctx.lineWidth = 1 / transform.scale
        ctx.beginPath()
        for (let col = visible.col0; col <= visible.col1 + 1; col++) {
          ctx.moveTo(col, visible.row0)
          ctx.lineTo(col, visible.row1 + 1)
        }
        for (let row = visible.row0; row <= visible.row1 + 1; row++) {
          ctx.moveTo(visible.col0, row)
          ctx.lineTo(visible.col1 + 1, row)
        }
        ctx.stroke()
      }

      // 色号文字：放到足够大才画，并且限制数量
      if (showCodes && transform.scale >= CODE_MIN_SCALE) {
        const visible = visibleCells(transform, info, width, height)
        const fontSize = Math.min(1, 10 / transform.scale)
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        let drawn = 0
        for (let row = visible.row0; row <= visible.row1 && drawn < MAX_LABELS; row++) {
          for (let col = visible.col0; col <= visible.col1 && drawn < MAX_LABELS; col++) {
            const value = pattern.cells[row * width + col]
            if (value === EMPTY_CELL) continue
            const hex = hexOf(value)
            ctx.fillStyle = isLight(hex) ? 'rgba(29,27,25,0.75)' : 'rgba(255,255,255,0.85)'
            ctx.fillText(colors[value]?.code ?? '', col + 0.5, row + 0.55)
            drawn++
          }
        }
      }

      // 选中格
      if (selected) {
        ctx.strokeStyle = '#E4573D'
        ctx.lineWidth = 2 / transform.scale
        ctx.strokeRect(selected.col + 0.5 / transform.scale, selected.row + 0.5 / transform.scale, 1 - 1 / transform.scale, 1 - 1 / transform.scale)
      }

      // 图纸外框
      ctx.strokeStyle = 'rgba(29,27,25,0.28)'
      ctx.lineWidth = 1 / transform.scale
      ctx.strokeRect(0, 0, width, height)
      ctx.restore()
    },
    [colors, ensureBitmap, ensureOverlay, hexOf, highlightRow, pattern, selected, showCodes, showGrid],
  )

  const handleTap = useCallback(
    (_point: Point, contentPoint: Point) => {
      const col = Math.floor(contentPoint.x)
      const row = Math.floor(contentPoint.y)
      if (col < 0 || row < 0 || col >= pattern.width || row >= pattern.height) {
        onSelectCell?.(null)
        return
      }
      onSelectCell?.({ col, row })
    },
    [onSelectCell, pattern.height, pattern.width],
  )

  useImperativeHandle(
    ref,
    () => ({
      reset: () => boardRef.current?.reset(),
      zoomIn: () => boardRef.current?.zoomBy(1.35),
      zoomOut: () => boardRef.current?.zoomBy(1 / 1.35),
      getTransform: () => boardRef.current?.getTransform() ?? { scale: 1, tx: 0, ty: 0 },
      redraw: () => boardRef.current?.redraw(),
    }),
    [],
  )

  return (
    <BoardCanvas
      ref={boardRef}
      id={canvasId}
      className={props.className}
      style={props.style}
      content={{ width: pattern.width, height: pattern.height }}
      render={render}
      onTap={handleTap}
      onTransformChange={props.onTransformChange}
      onReady={props.onReady}
      minScale={props.minScale ?? 0.6}
      maxScale={props.maxScale ?? 24}
      padding={props.padding ?? 20}
      maxFitScale={props.maxFitScale ?? 40}
      revision={`${revision ?? ''}:${completedRevision}:${showCodes}:${showGrid}:${highlightRow ?? ''}`}
    />
  )
})

BeadGrid.displayName = 'BeadGrid'

function visibleCells(transform: Transform, info: CanvasInfo, width: number, height: number) {
  const col0 = Math.max(0, Math.floor((0 - transform.tx) / transform.scale))
  const row0 = Math.max(0, Math.floor((0 - transform.ty) / transform.scale))
  const col1 = Math.min(width - 1, Math.ceil((info.width - transform.tx) / transform.scale))
  const row1 = Math.min(height - 1, Math.ceil((info.height - transform.ty) / transform.scale))
  return { col0, row0, col1: Math.max(col0, col1), row1: Math.max(row0, row1) }
}

/** 亮色底用深色文字，暗色底用浅色文字 */
function isLight(hex: string | null): boolean {
  if (!hex || hex.length < 7) return true
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

export default BeadGrid
