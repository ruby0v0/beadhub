/**
 * 色号选择器：MARD 色板浏览 + 搜索 + 库存标记。
 *
 * 291 个色号一次性铺满在小程序里节点数偏多，所以按系列分组 + 分批显示
 * （默认先渲染 96 个，「显示更多」再追加），滚动依旧用 ScrollView。
 */

import { useMemo, useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import ColorSwatch from '../ColorSwatch'
import { PALETTES, getPaletteColors, groupBySeries, type PaletteColor } from '../../constants/palettes'
import { DEFAULT_PALETTE_ID } from '../../constants/palettes'

export interface PalettePickerProps {
  paletteId?: string
  /** 当前选中的色板索引 */
  value?: number
  onChange?: (index: number, color: PaletteColor) => void
  /** 库存：色号 → 颗数，用来打「有货」角标 */
  inventory?: Record<string, number>
  showSearch?: boolean
  /** ScrollView 高度（rpx） */
  height?: number
  batch?: number
  className?: string
}

export default function PalettePicker({
  paletteId = DEFAULT_PALETTE_ID,
  value = -1,
  onChange,
  inventory,
  showSearch = true,
  height = 520,
  batch = 96,
  className = '',
}: PalettePickerProps) {
  const colors = useMemo(() => getPaletteColors(paletteId), [paletteId])
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(batch)
  /** 只看有库存 */
  const [ownedOnly, setOwnedOnly] = useState(false)

  const filtered = useMemo(() => {
    const key = keyword.trim().toUpperCase()
    return colors.filter(color => {
      if (key && !color.code.toUpperCase().includes(key)) return false
      if (ownedOnly && !(inventory?.[color.code] ?? 0)) return false
      return true
    })
  }, [colors, inventory, keyword, ownedOnly])

  const groups = useMemo(() => groupBySeries(filtered.slice(0, limit)), [filtered, limit])
  const indexOf = useMemo(() => {
    const map = new Map<string, number>()
    colors.forEach((color, i) => map.set(color.code, i))
    return map
  }, [colors])
  const paletteName = PALETTES[paletteId]?.name ?? paletteId

  return (
    <View className={className}>
      <View className='row-between'>
        <Text className='t-cap'>
          {paletteName} · {filtered.length} 色
        </Text>
        <View
          className={`chip ${ownedOnly ? 'chip-active' : ''}`}
          style={{ height: '48rpx' }}
          onClick={() => setOwnedOnly(v => !v)}
        >
          <Text className='text-22'>只看我的</Text>
        </View>
      </View>

      {showSearch && (
        <View className='mt-12 row rounded-12 px-16' style={{ backgroundColor: '#F1EDE6', height: '64rpx' }}>
          <Input
            className='grow text-24'
            value={keyword}
            placeholder='搜索色号，如 A1 / ZG'
            placeholderClass='text-ink-3'
            onInput={e => {
              setKeyword(e.detail.value)
              setLimit(batch)
            }}
          />
          {!!keyword && (
            <Text className='t-cap' onClick={() => setKeyword('')}>
              清空
            </Text>
          )}
        </View>
      )}

      <ScrollView scrollY style={{ height: `${height}rpx`, marginTop: '16rpx' }} className='rounded-12' scrollWithAnimation>
        {groups.map(group => (
          <View key={group.series} className='mb-16'>
            <Text className='t-cap'>{group.series} 系列</Text>
            {/* 不用 flex gap：小程序低版本对 gap 支持不齐，用 margin 更稳 */}
            <View className='flex flex-wrap mt-8'>
              {group.colors.map(color => {
                const index = indexOf.get(color.code) ?? -1
                return (
                  <ColorSwatch
                    key={color.code}
                    className='mr-16 mb-16'
                    color={color}
                    size={76}
                    selected={index === value}
                    owned={(inventory?.[color.code] ?? 0) > 0}
                    count={inventory?.[color.code]}
                    onClick={() => onChange?.(index, color)}
                  />
                )
              })}
            </View>
          </View>
        ))}
        {limit < filtered.length && (
          <View
            className='btn btn-soft btn-sm w-full mt-8'
            onClick={() => setLimit(v => v + batch)}
          >
            <Text>显示更多（还有 {filtered.length - limit} 个）</Text>
          </View>
        )}
        {filtered.length === 0 && (
          <View className='center py-40'>
            <Text className='t-body'>没有匹配的色号</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
