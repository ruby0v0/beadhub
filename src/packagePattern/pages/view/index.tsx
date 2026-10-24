import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import BeadGrid from '../../../components/BeadGrid'
import { loadPattern, loadProgress, saveProgress, touchOpened } from '../../../services/patternRepo'
import { useSettingsStore } from '../../../store/settings'
import type { Pattern } from '../../../core/pattern/model'
import type { GridCell } from '../../../types'

export default function PatternView() {
  const { params } = useRouter()
  const id = params.id ?? ''
  const [pattern, setPattern] = useState<Pattern | null>(null)
  const [completed, setCompleted] = useState<Uint8Array | null>(null)
  const [revision, setRevision] = useState(0)
  const [row, setRow] = useState(0)
  const [selected, setSelected] = useState<GridCell | null>(null)

  const showCodes = useSettingsStore(s => s.showCodes)
  const showGrid = useSettingsStore(s => s.showGrid)
  const autoAdvanceRow = useSettingsStore(s => s.autoAdvanceRow)
  const toggleCodes = useSettingsStore(s => s.toggleCodes)
  const toggleGrid = useSettingsStore(s => s.toggleGrid)
  const toggleAutoAdvanceRow = useSettingsStore(s => s.toggleAutoAdvance)

  useEffect(() => {
    if (!id) return
    const loaded = loadPattern(id)
    if (!loaded) return
    const progress = loadProgress(loaded)
    setPattern(loaded)
    setCompleted(progress.bits)
    setRow(progress.row)
    touchOpened(id)
  }, [id])

  const totalFilled = useMemo(() => pattern?.cells.filter(v => v >= 0).length ?? 0, [pattern])
  const completedCount = useMemo(() => completed?.reduce((sum, v) => sum + (v ? 1 : 0), 0) ?? 0, [completed])

  const handleSelect = useCallback((cell: GridCell | null) => {
    if (!cell || !pattern || !completed) return
    const i = cell.row * pattern.width + cell.col
    if (pattern.cells[i] < 0) return
    const next = completed.slice()
    next[i] = next[i] ? 0 : 1
    setCompleted(next)
    setRevision(v => v + 1)
    setSelected(cell)

    let nextRow = row
    if (autoAdvanceRow) {
      // 行内最后一个有豆格标记后，自动把高亮移到下一行
      let lastFilled = -1
      for (let c = pattern.width - 1; c >= 0; c--) {
        if (pattern.cells[cell.row * pattern.width + c] >= 0) {
          lastFilled = c
          break
        }
      }
      if (cell.col === lastFilled && cell.row === row) nextRow = Math.min(pattern.height - 1, row + 1)
      setRow(nextRow)
    }
    saveProgress(pattern, next, nextRow)
  }, [autoAdvanceRow, completed, pattern, row])

  if (!pattern) {
    return (
      <View className='page-wrap min-h-screen p-24 center'>
        <Text className='t-body'>图纸不存在</Text>
        <Button className='btn-ghost mt-24' onClick={() => Taro.navigateBack()}>返回</Button>
      </View>
    )
  }

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='row-between mb-16'>
        <View className='grow'>
          <Text className='t-h2'>第 {row + 1} / {pattern.height} 行</Text>
          <Text className='t-cap'>点击格子标记完成 · {completedCount}/{totalFilled} 颗</Text>
        </View>
        <Text className='t-num'>{Math.round((completedCount / Math.max(1, totalFilled)) * 100)}%</Text>
      </View>

      <BeadGrid
        pattern={pattern}
        canvasId='pattern-view-canvas'
        className='card-flat rounded-16 overflow-hidden'
        style={{ width: '100%', height: '880rpx' }}
        completed={completed}
        completedRevision={revision}
        highlightRow={row}
        selected={selected}
        showGrid={showGrid}
        showCodes={showCodes}
        onSelectCell={handleSelect}
      />

      <View className='row gap-16 mt-24'>
        <Button className='btn-soft' onClick={() => setRow(v => Math.max(0, v - 1))}>上一行</Button>
        <Button className='btn-primary grow' onClick={() => setRow(v => Math.min(pattern.height - 1, v + 1))}>下一行</Button>
        <Button className='btn-ghost' onClick={() => Taro.navigateTo({ url: `/packagePattern/pages/editor/index?id=${id}` })}>编辑</Button>
      </View>

      <View className='row mt-24 gap-16'>
        <Button className='btn-ghost grow' onClick={toggleGrid}>网格线</Button>
        <Button className='btn-ghost grow' onClick={toggleCodes}>色号</Button>
        <Button className='btn-ghost grow' onClick={toggleAutoAdvanceRow}>自动换行</Button>
      </View>
    </View>
  )
}
