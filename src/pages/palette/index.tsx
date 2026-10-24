import { Text, View } from '@tarojs/components'
import PalettePicker from '../../components/PalettePicker'
import { useInventoryStore } from '../../store/inventory'

export default function PalettePage() {
  const counts = useInventoryStore(s => s.counts)
  const setCount = useInventoryStore(s => s.setCount)
  const ownedCount = Object.values(counts).filter(v => v > 0).length

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='card mb-24'>
        <Text className='t-title'>MARD 色库</Text>
        <Text className='t-body mt-8'>共 {ownedCount} 个色号有库存，点击色块即可切换有货/无货。</Text>
      </View>
      <PalettePicker
        paletteId='mard-v1'
        inventory={counts}
        height={920}
        onChange={(_index, color) => {
          const current = counts[color.code] ?? 0
          setCount(color.code, current > 0 ? 0 : 1000)
        }}
      />
    </View>
  )
}
