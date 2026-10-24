import { useCallback, useMemo, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import BeadGrid from '../../components/BeadGrid'
import BomList from '../../components/BomList'
import { computeBom } from '../../core/pattern/bom'
import { getPaletteColors } from '../../constants/palettes'
import { loadPattern, getMeta, toggleFavorite, setStatus } from '../../services/patternRepo'
import { useInventoryStore } from '../../store/inventory'

export default function PatternDetail() {
  const { params } = useRouter()
  const id = params.id ?? ''
  const [version, setVersion] = useState(0)

  useDidShow(() => setVersion(v => v + 1))

  const pattern = useMemo(() => loadPattern(id), [id, version])
  const meta = useMemo(() => getMeta(id), [id, version])
  const inventory = useInventoryStore(s => s.counts)

  const bom = useMemo(() => {
    if (!pattern) return null
    return computeBom(pattern, getPaletteColors(pattern.paletteId), { inventory })
  }, [pattern, inventory])

  const handleFavorite = useCallback(() => {
    if (!id) return
    toggleFavorite(id)
    setVersion(v => v + 1)
  }, [id])

  const handleStartBuild = useCallback(() => {
    if (!id) return
    setStatus(id, 'draft')
    Taro.navigateTo({ url: `/packagePattern/pages/view/index?id=${id}` })
  }, [id])

  if (!pattern) {
    return (
      <View className='page-wrap p-24 center'>
        <Text className='t-body'>图纸不存在</Text>
        <Button className='btn-ghost mt-24' onClick={() => Taro.navigateBack()}>返回</Button>
      </View>
    )
  }

  return (
    <ScrollView scrollY className='min-h-screen p-24'>
      <View className='card-flat rounded-16 overflow-hidden mb-24'>
        <BeadGrid
          pattern={pattern}
          canvasId='detail-preview'
          style={{ width: '100%', height: '480rpx' }}
          maxFitScale={16}
          showGrid={false}
        />
      </View>

      <View className='row-between mb-20'>
        <View className='grow'>
          <Text className='t-h2'>{meta?.title ?? pattern.id}</Text>
          <Text className='t-body mt-4'>{pattern.width}×{pattern.height} · {bom?.colorCount ?? 0} 色</Text>
        </View>
        <Button
          className={`btn btn-sm ${meta?.favorite ? 'btn-soft' : 'btn-ghost'}`}
          onClick={handleFavorite}
        >
          {meta?.favorite ? '★ 收藏' : '☆ 收藏'}
        </Button>
      </View>

      {bom && bom.boards.total > 0 && (
        <View className='card mb-20'>
          <Text className='t-h3 mb-12'>拼板规划</Text>
          <View className='row'>
            <Text className='t-body'>需要 {bom.boards.cols}×{bom.boards.rows} = {bom.boards.total} 块 {bom.boards.boardSize}×{bom.boards.boardSize} 板</Text>
          </View>
          <View className='row mt-12'>
            <Text className='t-body'>备豆 {bom.totalWithWaste} 颗（含 {Math.round(bom.wasteRatio * 100)}% 损耗）</Text>
          </View>
        </View>
      )}

      <View className='mb-24'>
        <Text className='t-h3 mb-12'>用量清单</Text>
        {bom && <BomList bom={bom} inventory={inventory} showWaste />}
      </View>

      <View className='row gap-16'>
        <Button className='btn-primary grow' onClick={handleStartBuild}>开始拼搭</Button>
        <Button className='btn-ghost' onClick={() => Taro.navigateTo({ url: `/packagePattern/pages/editor/index?id=${id}` })}>编辑</Button>
      </View>
    </ScrollView>
  )
}
