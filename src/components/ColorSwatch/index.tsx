/**
 * 色号色块。动态颜色一律走 inline style（不生成动态类名，wxss 才不受影响）。
 */

import { Text, View } from '@tarojs/components'
import type { PaletteColor } from '../../constants/palettes'

export interface ColorSwatchProps {
  color: PaletteColor
  /** 色块边长（rpx） */
  size?: number
  selected?: boolean
  /** 库存里有这个色号 */
  owned?: boolean
  /** 库存颗数，给了就显示角标 */
  count?: number
  /** 展示色号文字 */
  showCode?: boolean
  /** 已用尽 / 失去库存时的淡化 */
  dim?: boolean
  onClick?: (color: PaletteColor) => void
  className?: string
}

export default function ColorSwatch({
  color,
  size = 88,
  selected = false,
  owned = false,
  count,
  showCode = true,
  dim = false,
  onClick,
  className = '',
}: ColorSwatchProps) {
  return (
    <View
      className={`flex flex-col items-center ${className}`}
      onClick={() => onClick?.(color)}
    >
      <View
        className='rounded-8'
        style={{
          width: `${size}rpx`,
          height: `${size}rpx`,
          backgroundColor: color.hex,
          opacity: dim ? 0.35 : 1,
          borderWidth: selected ? '4rpx' : '2rpx',
          borderStyle: 'solid',
          borderColor: selected ? '#E4573D' : 'rgba(29,27,25,0.16)',
          boxShadow: selected ? '0 0 0 4rpx rgba(228,87,61,0.18)' : 'none',
        }}
      />
      {showCode && (
        <Text className={`mt-4 text-20 ${selected ? 'text-brand font-600' : 'text-ink-2'}`}>{color.code}</Text>
      )}
      {owned && (
        <View
          className='row-center mt-2 rounded-full'
          style={{ backgroundColor: count && count > 0 ? '#E3F1EE' : '#F1EDE6', padding: '2rpx 8rpx' }}
        >
          <Text className='text-18' style={{ color: '#2E8F7E' }}>
            {count ? count : '有'}
          </Text>
        </View>
      )}
    </View>
  )
}
