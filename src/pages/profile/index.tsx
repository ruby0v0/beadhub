import { useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { countPatterns, deletePattern, listDrafts, listFavorites } from '../../services/patternRepo'
import { useInventoryStore } from '../../store/inventory'
import { storageUsageKb } from '../../services/storage'

export default function ProfilePage() {
  const counts = useInventoryStore(s => s.counts)
  const clearInventory = useInventoryStore(s => s.clear)
  const [version, setVersion] = useState(0)

  useDidShow(() => setVersion(v => v + 1))

  const stats = useMemo(() => countPatterns(), [version])
  const favorites = useMemo(() => listFavorites(), [version])
  const drafts = useMemo(() => listDrafts(), [version])
  const owned = Object.keys(counts).length
  const usage = useMemo(() => storageUsageKb(), [version])

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='card mb-24'>
        <Text className='t-title'>我的</Text>
        <Text className='t-body mt-8'>{stats.total} 张图纸 · {stats.beads} 颗豆 · 本地占用 {usage.current} / {usage.limit} KB</Text>
      </View>

      <View className='card mb-16'>
        <View className='row-between'>
          <Text className='t-h3'>收藏</Text>
          <Text className='t-cap'>{favorites.length}</Text>
        </View>
        {favorites.map(meta => (
          <View key={meta.id} className='item' onClick={() => Taro.navigateTo({ url: `/packagePattern/pages/view/index?id=${meta.id}` })}>
            <Text className='text-26 font-600'>{meta.title}</Text>
            <Text className='t-cap'>{meta.width}×{meta.height} · {Math.round((meta.progress || 0) * 100)}%</Text>
          </View>
        ))}
        {favorites.length === 0 && <Text className='t-body mt-12'>还没有收藏</Text>}
      </View>

      <View className='card mb-24'>
        <Text className='t-h3'>草稿</Text>
        {drafts.length === 0 && <Text className='t-body mt-12'>没有草稿</Text>}
        {drafts.map(meta => (
          <View key={meta.id} className='item row mt-12'>
            <View className='grow' onClick={() => Taro.navigateTo({ url: `/packagePattern/pages/editor/index?id=${meta.id}` })}>
              <Text className='text-26 font-600'>{meta.title}</Text>
              <Text className='t-cap'>{meta.width}×{meta.height}</Text>
            </View>
            <Button className='btn-sm btn-ghost' onClick={() => { deletePattern(meta.id); setVersion(v => v + 1) }}>删除</Button>
          </View>
        ))}
      </View>

      <View className='card'>
        <Text className='t-h3 mb-12'>库存</Text>
        <Text className='t-body'>已标记 {owned} 个色号</Text>
        <View className='row mt-24 gap-16'>
          <Button className='btn-primary grow' onClick={() => Taro.navigateTo({ url: '/pages/palette/index' })}>去标记色号</Button>
          <Button className='btn-ghost' onClick={clearInventory}>清空库存</Button>
        </View>
      </View>
    </View>
  )
}
