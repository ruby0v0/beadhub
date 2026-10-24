/**
 * 图纸编辑操作（纯函数，返回新数组，方便编辑器做 undo）。
 */

import { EMPTY_CELL } from '../types'

/** 四邻域油漆桶：把 (col,row) 所在的同色连通块刷成 value */
export function floodFill(
  cells: ArrayLike<number>,
  width: number,
  height: number,
  col: number,
  row: number,
  value: number,
): Int16Array {
  const out = Int16Array.from(cells as ArrayLike<number>)
  if (col < 0 || row < 0 || col >= width || row >= height) return out
  const start = row * width + col
  const target = out[start]
  if (target === value) return out

  const stack: number[] = [start]
  const seen = new Uint8Array(width * height)
  seen[start] = 1
  while (stack.length) {
    const p = stack.pop() as number
    out[p] = value
    const x = p % width
    const y = (p - x) / width
    if (x > 0) push(p - 1)
    if (x < width - 1) push(p + 1)
    if (y > 0) push(p - width)
    if (y < height - 1) push(p + width)
  }
  return out

  function push(p: number) {
    if (seen[p]) return
    if (out[p] !== target) return
    seen[p] = 1
    stack.push(p)
  }
}

/** 把图纸里所有 oldValue 换成 newValue（一键换色） */
export function replaceColor(cells: ArrayLike<number>, oldValue: number, newValue: number): Int16Array {
  const out = Int16Array.from(cells as ArrayLike<number>)
  if (oldValue === newValue) return out
  for (let i = 0; i < out.length; i++) if (out[i] === oldValue) out[i] = newValue
  return out
}

/** 清空一批格子 */
export function clearCells(cells: ArrayLike<number>, indices: readonly number[]): Int16Array {
  const out = Int16Array.from(cells as ArrayLike<number>)
  for (const i of indices) if (i >= 0 && i < out.length) out[i] = EMPTY_CELL
  return out
}

/** 画笔：按格子列表涂色 */
export function paintCells(cells: ArrayLike<number>, indices: readonly number[], value: number): Int16Array {
  const out = Int16Array.from(cells as ArrayLike<number>)
  for (const i of indices) if (i >= 0 && i < out.length) out[i] = value
  return out
}

/** 直线（Bresenham）：手指滑太快时补齐中间格子，避免断线 */
export function lineIndices(
  width: number,
  height: number,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
): number[] {
  const points: number[] = []
  let x0 = col0
  let y0 = row0
  const dx = Math.abs(col1 - x0)
  const dy = Math.abs(row1 - y0)
  const sx = x0 < col1 ? 1 : -1
  const sy = y0 < row1 ? 1 : -1
  let err = dx - dy
  for (let guard = 0; guard < width * height + 2; guard++) {
    if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) points.push(y0 * width + x0)
    if (x0 === col1 && y0 === row1) break
    const e2 = err * 2
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
  return points
}
