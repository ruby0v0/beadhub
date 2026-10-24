import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import BeadGrid from '../../../components/BeadGrid'
import PalettePicker from '../../../components/PalettePicker'
import { EMPTY_CELL } from '../../../core/types'
import { getPaletteColors } from '../../../constants/palettes'
import { loadPattern, savePattern } from '../../../services/patternRepo'
import { usePatternStore } from '../../../store/pattern'
import type { GridCell } from '../../../types'

type Tool = 'brush' | 'bucket' | 'erase'

export default function EditorPage() {
  const { params } = useRouter()
  const id = params.id ?? ''

  const pattern = usePatternStore(s => s.pattern)
  const open = usePatternStore(s => s.open)
  const markSaved = usePatternStore(s => s.markSaved)
  const setCell = usePatternStore(s => s.setCell)
  const bucket = usePatternStore(s => s.bucket)
  const undo = usePatternStore(s => s.undo)
  const redo = usePatternStore(s => s.redo)
  const past = usePatternStore(s => s.past)
  const future = usePatternStore(s => s.future)

  const [tool, setTool] = useState<Tool>('brush')
  const [value, setValue] = useState(0)
  const [selected, setSelected] = useState<GridCell | null>(null)
  const [revision, setRevision] = useState(0)

  const colors = useMemo(() => getPaletteColors(pattern?.paletteId ?? 'mard-v1'), [pattern])

  useEffect(() => {
    const loaded = loadPattern(id)
    if (!loaded) return
    if (!pattern || pattern.id !== loaded.id) open(loaded)
  }, [id, open, pattern])

  const handleSelectCell = useCallback((cell: GridCell | null) => {
    if (!cell || !pattern) return
    setSelected(cell)
    if (tool === 'bucket') bucket(cell.col, cell.row, value)
    else if (tool === 'erase') setCell(cell.col, cell.row, EMPTY_CELL)
    else setCell(cell.col, cell.row, value)
    setRevision(v => v + 1)
  }, [bucket, pattern, setCell, tool, value])

  const save = useCallback(() => {
    if (!pattern) return
    savePattern(pattern, { title: pattern.id, status: 'draft' })
    markSaved(pattern)
    Taro.showToast({ title: '已保存到草稿', icon: 'success' })
  }, [markSaved, pattern])

  if (!pattern) {
    return (
      <View className='page-wrap p-24 center'>
        <Text className='t-body'>没有可编辑的图纸</Text>
        <Button className='btn-ghost mt-24' onClick={() => Taro.navigateBack()}>返回</Button>
      </View>
    )
  }

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='row-between mb-16'>
        <View>
          <Text className='t-h2'>网格编辑</Text>
          <Text className='t-cap'>{pattern.width}×{pattern.height} · {colors.length} 色库</Text>
        </View>
        <Text className='t-cap'>{selected ? `第 ${selected.row + 1} 行 ${selected.col + 1} 列` : '点格子编辑'}</Text>
      </View>

      <BeadGrid
        pattern={pattern}
        canvasId='pattern-editor-canvas'
        className='card-flat rounded-16 overflow-hidden'
        style={{ width: '100%', height: '720rpx' }}
        revision={revision}
        selected={selected}
        showGrid
        onSelectCell={handleSelectCell}
      />

      <View className='row gap-16 mt-16'>
        <Button className={tool === 'brush' ? 'btn-primary grow' : 'btn-soft grow'} onClick={() => setTool('brush')}>画笔</Button>
        <Button className={tool === 'bucket' ? 'btn-primary grow' : 'btn-soft grow'} onClick={() => setTool('bucket')}>油漆桶</Button>
        <Button className={tool === 'erase' ? 'btn-primary grow' : 'btn-soft grow'} onClick={() => setTool('erase')}>橡皮</Button>
      </View>

      <View className='row gap-16 mt-16'>
        <Button className='btn-soft grow' disabled={past.length === 0} onClick={() => { undo(); setRevision(v => v + 1) }}>撤销</Button>
        <Button className='btn-soft grow' disabled={future.length === 0} onClick={() => { redo(); setRevision(v => v + 1) }}>重做</Button>
        <Button className='btn-primary grow' onClick={save}>保存</Button>
      </View>

      <View className='mt-24'>
        <Text className='t-h3 mb-12'>选择颜色</Text>
        <PalettePicker
          paletteId={pattern.paletteId}
          value={value}
          height={560}
          onChange={(index) => setValue(index)}
        />
      </View>
    </View>
  )
}
