/**
 * 图纸仓库：本地增删查改 + 收藏 + 进度。
 * 存盘统一走 core 的 RLE 序列化，索引里只放轻量元信息。
 */

import {
  countFilled,
  decodeRle,
  deserializePattern,
  encodeRle,
  serializePattern,
  type Pattern,
} from '../core/pattern/model'
import { computeBom } from '../core/pattern/bom'
import { getPaletteColors } from '../constants/palettes'
import type { ProgressRecord, StoredPatternMeta } from '../types'
import { StorageKeys, readJSON, readRaw, removeKey, writeJSON, writeRaw } from './storage'

function readIndex(): StoredPatternMeta[] {
  return readJSON<StoredPatternMeta[]>(StorageKeys.index, [])
}

function writeIndex(list: StoredPatternMeta[]): void {
  writeJSON(StorageKeys.index, list)
}

export interface SaveOptions {
  title?: string
  status?: StoredPatternMeta['status']
  favorite?: boolean
}

/** 顶色彩号：列表页缩略条用 */
export function topColorsOf(pattern: Pattern, limit = 5): string[] {
  const bom = computeBom(pattern, getPaletteColors(pattern.paletteId))
  return bom.entries.slice(0, limit).map(e => e.hex)
}

export function savePattern(pattern: Pattern, options: SaveOptions = {}): StoredPatternMeta {
  const list = readIndex()
  const existing = list.find(item => item.id === pattern.id)
  const now = Date.now()
  const bom = computeBom(pattern, getPaletteColors(pattern.paletteId))

  const meta: StoredPatternMeta = {
    id: pattern.id,
    title: options.title ?? existing?.title ?? defaultTitle(pattern),
    width: pattern.width,
    height: pattern.height,
    paletteId: pattern.paletteId,
    colorCount: bom.colorCount,
    filled: bom.filledCells,
    empty: bom.emptyCells,
    status: options.status ?? existing?.status ?? 'draft',
    favorite: options.favorite ?? existing?.favorite ?? false,
    topColors: topColorsOf(pattern),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    openedAt: existing?.openedAt ?? now,
    progress: existing?.progress ?? 0,
  }

  writeRaw(StorageKeys.pattern(pattern.id), JSON.stringify(serializePattern(pattern)))
  writeIndex([meta, ...list.filter(item => item.id !== pattern.id)])
  return meta
}

export function loadPattern(id: string): Pattern | null {
  const raw = readRaw(StorageKeys.pattern(id))
  if (!raw) return null
  try {
    return deserializePattern(raw)
  } catch (err) {
    console.error('[patternRepo] 反序列化失败', id, err)
    return null
  }
}

export function hasPattern(id: string): boolean {
  return !!readRaw(StorageKeys.pattern(id))
}

export function listPatterns(): StoredPatternMeta[] {
  return readIndex()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listRecent(limit = 3): StoredPatternMeta[] {
  return readIndex()
    .slice()
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, limit)
}

export function listFavorites(): StoredPatternMeta[] {
  return listPatterns().filter(item => item.favorite)
}

export function listDrafts(): StoredPatternMeta[] {
  return listPatterns().filter(item => item.status === 'draft')
}

export function getMeta(id: string): StoredPatternMeta | null {
  return readIndex().find(item => item.id === id) ?? null
}

export function patchMeta(id: string, patch: Partial<StoredPatternMeta>): StoredPatternMeta | null {
  const list = readIndex()
  const index = list.findIndex(item => item.id === id)
  if (index < 0) return null
  const next = { ...list[index], ...patch, updatedAt: Date.now() }
  list[index] = next
  writeIndex(list)
  return next
}

export function toggleFavorite(id: string): boolean {
  const meta = getMeta(id)
  if (!meta) return false
  patchMeta(id, { favorite: !meta.favorite })
  return !meta.favorite
}

export function touchOpened(id: string): void {
  const meta = getMeta(id)
  if (meta) patchMeta(id, { openedAt: Date.now() })
}

export function setStatus(id: string, status: StoredPatternMeta['status']): void {
  patchMeta(id, { status })
}

export function renamePattern(id: string, title: string): void {
  patchMeta(id, { title })
}

export function deletePattern(id: string): void {
  removeKey(StorageKeys.pattern(id))
  removeKey(StorageKeys.progress(id))
  writeIndex(readIndex().filter(item => item.id !== id))
}

export function countPatterns(): { total: number; favorites: number; drafts: number; beads: number } {
  const list = readIndex()
  return {
    total: list.length,
    favorites: list.filter(i => i.favorite).length,
    drafts: list.filter(i => i.status === 'draft').length,
    beads: list.reduce((sum, i) => sum + i.filled, 0),
  }
}

/* ------------------------------- 拼搭进度 ------------------------------- */

export interface LoadedProgress {
  bits: Uint8Array
  row: number
  record: ProgressRecord | null
}

export function loadProgress(pattern: Pattern): LoadedProgress {
  const bits = new Uint8Array(pattern.width * pattern.height)
  const raw = readRaw(StorageKeys.progress(pattern.id))
  if (!raw) return { bits, row: 0, record: null }
  try {
    const record = JSON.parse(raw) as ProgressRecord & { rle?: string }
    if (record.rle) {
      const decoded = decodeRle(record.rle, pattern.width, pattern.height)
      for (let i = 0; i < bits.length; i++) bits[i] = decoded[i] > 0 ? 1 : 0
    }
    const row = Math.max(0, Math.min(pattern.height - 1, record.row ?? 0))
    return { bits, row, record }
  } catch (err) {
    console.warn('[patternRepo] 进度读取失败', err)
    return { bits, row: 0, record: null }
  }
}

export function saveProgress(pattern: Pattern, bits: Uint8Array, row: number): ProgressRecord {
  let completedCount = 0
  for (let i = 0; i < bits.length; i++) if (bits[i]) completedCount++
  const filled = countFilled(pattern)
  const record: ProgressRecord = {
    patternId: pattern.id,
    completedCount,
    total: filled,
    row,
    updatedAt: Date.now(),
  }

  // 进度位图也走 RLE：刚开工时几乎不占空间
  const rle = encodeRle(Array.from(bits))
  writeRaw(StorageKeys.progress(pattern.id), JSON.stringify({ ...record, rle }))
  patchMeta(pattern.id, { progress: filled > 0 ? completedCount / filled : 0 })
  return record
}

export function clearProgress(pattern: Pattern): void {
  removeKey(StorageKeys.progress(pattern.id))
  patchMeta(pattern.id, { progress: 0 })
}

function defaultTitle(pattern: Pattern): string {
  const d = new Date()
  return `${pattern.width}×${pattern.height} 图纸 ${d.getMonth() + 1}/${d.getDate()}`
}
