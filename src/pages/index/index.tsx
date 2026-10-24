import { useCallback, useMemo, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { PALETTES } from '../../constants/palettes'
import { countPatterns, deletePattern, listPatterns, listRecent } from '../../services/patternRepo'
import type { StoredPatternMeta } from '../../types'

const paletteName = PALETTES['mard-v1']?.name ?? 'MARD'

function openPattern(id: string): void {
  Taro.navigateTo({ url: `/packagePattern/pages/view/index?id=${id}` })
}

export default function Index() {
  const [version, setVersion] = useState(0)

  useDidShow(() => setVersion(v => v + 1))

  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const stats = useMemo(() => countPatterns(), [version])
  const recent = useMemo(() => listRecent(4), [version])
  const all = useMemo(() => listPatterns(), [version])

  const start = useCallback(() => {
    Taro.navigateTo({ url: '/packagePattern/pages/create/index' })
  }, [])

  const remove = useCallback((meta: StoredPatternMeta) => {
    Taro.showModal({
      title: '删除图纸',
      content: `“${meta.title}”会连同进度一起删除。`,
      confirmColor: '#BE3B2B',
      success: res => {
        if (!res.confirm) return
        deletePattern(meta.id)
        refresh()
      },
    })
  }, [refresh])

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='hero card'>
        <Text className='t-cap'>BeadHub · 拼豆图纸</Text>
        <Text className='t-title mt-8'>导入一张图，生成可拼的豆子图纸</Text>
        <View className='row mt-24'>
          <Button className='btn-primary grow' onClick={start}>导入图片</Button>
          <Button className='btn-ghost ml-16' onClick={() => Taro.navigateTo({ url: '/pages/palette/index' })}>色库</Button>
        </View>
        <View className='stats row mt-24'>
          <View className='stat'><Text className='t-num'>{stats.total}</Text><Text className='t-cap'>图纸</Text></View>
          <View className='stat'><Text className='t-num'>{stats.drafts}</Text><Text className='t-cap'>草稿</Text></View>
          <View className='stat'><Text className='t-num'>{stats.favorites}</Text><Text className='t-cap'>收藏</Text></View>
        </View>
      </View>

      <View className='card mt-24'>
        <View className='row-between'>
          <Text className='t-h3'>最近打开</Text>
          <Text className='t-cap' onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}>全部</Text>
        </View>
        <View className='mt-16'>
          {recent.map(meta => (
            <View key={meta.id} className='item' onClick={() => openPattern(meta.id)}>
              <View className='row'>
                {meta.topColors.slice(0, 5).map((hex, i) => (
                  <View key={`${meta.id}-${i}`} className='swatch' style={{ width: '20rpx', height: '20rpx', backgroundColor: hex }} />
                ))}
              </View>
              <View className='grow ml-12'>
                <Text className='text-26 font-600'>{meta.title}</Text>
                <Text className='t-cap'>{meta.width}×{meta.height} · {meta.colorCount} 色</Text>
              </View>
              <Text className='t-cap'>{Math.round((meta.progress || 0) * 100)}%</Text>
            </View>
          ))}
          {recent.length === 0 && <Text className='t-body'>还没有图纸，先生成一张</Text>}
        </View>
      </View>

      <View className='card mt-16'>
        <View className='row-between'>
          <Text className='t-h3'>全部图纸</Text>
          <Text className='t-cap'>{paletteName}</Text>
        </View>
        {all.map(meta => (
          <View key={meta.id} className='item row mt-16'>
            <View className='grow' onClick={() => Taro.navigateTo({ url: `/packagePattern/pages/view/index?id=${meta.id}` })}>
              <Text className='text-26 font-600'>{meta.title}</Text>
              <Text className='t-cap mt-4'>{meta.width}×{meta.height} · {meta.filled} 颗 · {Math.round((meta.progress || 0) * 100)}%</Text>
            </View>
            <Button className='btn-sm btn-ghost' onClick={() => remove(meta)}>删除</Button>
          </View>
        ))}
      </View>
    </View>
  )
}
