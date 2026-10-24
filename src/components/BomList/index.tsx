/**
 * 用量清单（BOM）。按颗数降序，库存够不够一眼可见。
 */

import { Text, View } from '@tarojs/components'
import type { Bom, BomEntry } from '../../core/pattern/bom'

export interface BomListProps {
  bom: Bom
  /** 库存颗数（按色号），传了就显示缺豆标记 */
  inventory?: Record<string, number>
  selectedIndex?: number | null
  onSelect?: (entry: BomEntry) => void
  /** 是否显示含损耗列 */
  showWaste?: boolean
  maxRows?: number
  emptyText?: string
  className?: string
}

export default function BomList({
  bom,
  inventory,
  selectedIndex = null,
  onSelect,
  showWaste = true,
  maxRows,
  emptyText = '这张图纸还没有上色',
  className = '',
}: BomListProps) {
  const rows = maxRows ? bom.entries.slice(0, maxRows) : bom.entries

  if (rows.length === 0) {
    return (
      <View className={`card-flat center ${className}`}>
        <Text className='t-body'>{emptyText}</Text>
      </View>
    )
  }

  return (
    <View className={`card ${className}`} style={{ padding: '16rpx 24rpx' }}>
      {rows.map((entry, i) => {
        const owned = inventory ? inventory[entry.code] ?? 0 : null
        const shortage = owned !== null ? Math.max(0, entry.withWaste - owned) : 0
        const selected = selectedIndex === entry.colorIndex
        return (
          <View
            key={entry.code}
            className={`flex items-center py-16 ${i < rows.length - 1 ? 'border-b-1 border-solid border-line' : ''}`}
            onClick={() => onSelect?.(entry)}
          >
            <View
              className='rounded-6 mr-16'
              style={{
                width: '48rpx',
                height: '48rpx',
                backgroundColor: entry.hex,
                borderWidth: selected ? '4rpx' : '2rpx',
                borderStyle: 'solid',
                borderColor: selected ? '#E4573D' : 'rgba(29,27,25,0.14)',
              }}
            />
            <View className='grow'>
              <View className='row'>
                <Text className='text-26 font-600'>{entry.code}</Text>
                <Text className='t-cap ml-8'>{(entry.share * 100).toFixed(1)}%</Text>
              </View>
              <View className='mt-6 h-6 w-full rounded-full overflow-hidden' style={{ backgroundColor: '#F1EDE6' }}>
                <View
                  className='h-6 rounded-full'
                  style={{ width: `${Math.max(2, entry.share * 100)}%`, backgroundColor: entry.hex }}
                />
              </View>
            </View>
            <View className='flex flex-col items-end ml-16'>
              <Text className='t-num'>{entry.count} 颗</Text>
              {showWaste && <Text className='t-cap'>备 {entry.withWaste}</Text>}
            </View>
            {shortage > 0 && (
              <View className='row-center ml-12 rounded-full' style={{ backgroundColor: '#FAF0DD', padding: '4rpx 12rpx' }}>
                <Text className='text-20' style={{ color: '#B8791C' }}>
                  缺 {shortage}
                </Text>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}
