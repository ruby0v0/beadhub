import { useCallback, useMemo, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BOARD_SIZES, COLOR_COUNTS, DEFAULT_BOARD_KEY, DEFAULT_COLOR_KEY } from '../../../constants/board'
import { DEFAULT_PALETTE_ID } from '../../../constants/palettes'
import { buildPatternFromRawRgba, createSampleImage, BOARD_PRESETS } from '../../../core'
import type { BuildPatternResult } from '../../../core/pipeline'
import type { RgbaImage } from '../../../core/types'
import { decodeToRgba, pickImage } from '../../../services/imageSource'
import { savePattern } from '../../../services/patternRepo'

type BoardKey = typeof BOARD_SIZES[number]['key']
type ColorKey = typeof COLOR_COUNTS[number]['key']

export default function CreatePage() {
  const [boardKey, setBoardKey] = useState<BoardKey>(DEFAULT_BOARD_KEY as BoardKey)
  const [colorKey, setColorKey] = useState<ColorKey>(DEFAULT_COLOR_KEY as ColorKey)
  const [removeBackground, setRemoveBackground] = useState(true)
  const [dither, setDither] = useState(false)
  const [picked, setPicked] = useState<{ path: string; width: number; height: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BuildPatternResult | null>(null)
  const [sampleImage, setSampleImage] = useState<RgbaImage | null>(null)

  const colorCount = useMemo(() => COLOR_COUNTS.find(v => v.key === colorKey)?.count ?? 16, [colorKey])

  const choose = useCallback(async () => {
    const file = await pickImage()
    if (file) {
      setSampleImage(null)
      setPicked(file)
    }
  }, [])

  const useSample = useCallback(() => {
    const image = createSampleImage(256)
    setSampleImage(image)
    setPicked({ path: '', width: image.width, height: image.height })
  }, [])

  const generate = useCallback(async () => {
    if (!picked) return
    setBusy(true)
    try {
      const rgba = sampleImage ?? await decodeToRgba(picked.path, 1024)
      const generated = buildPatternFromRawRgba(rgba, {
        grid: BOARD_PRESETS[boardKey],
        colorCount,
        removeBackground,
        dither,
        paletteId: DEFAULT_PALETTE_ID,
        title: picked.path ? '导入图纸' : '样例图纸',
      })
      const meta = savePattern(generated.pattern, { title: picked.path ? '导入图纸' : '样例图纸', status: 'draft' })
      setResult(generated)
      Taro.showToast({ title: `已生成 ${meta.width}×${meta.height} 图纸`, icon: 'success' })
    } catch (err) {
      console.warn('[create] 生成失败', err)
      Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }, [boardKey, colorCount, dither, picked, removeBackground, sampleImage])

  const viewResult = useCallback(() => {
    if (!result) return
    Taro.redirectTo({ url: `/packagePattern/pages/view/index?id=${result.pattern.id}` })
  }, [result])

  return (
    <View className='page-wrap min-h-screen p-24'>
      <View className='card mb-24'>
        <Text className='t-title'>选择图片</Text>
        <View className='row mt-20 gap-16'>
          <Button className='btn-primary grow' onClick={choose}>从相册 / 拍照</Button>
          <Button className='btn-ghost' onClick={useSample}>样例图</Button>
        </View>
        {picked && (
          <View className='row mt-16'>
            <Text className='t-body'>已选择 {picked.width}×{picked.height} 图片</Text>
          </View>
        )}
      </View>

      <View className='card mb-24'>
        <Text className='t-h3 mb-12'>板数</Text>
        <View className='row flex-wrap gap-16'>
          {BOARD_SIZES.map(item => (
            <View
              key={item.key}
              className={item.key === boardKey ? 'chip chip-active' : 'chip'}
              onClick={() => setBoardKey(item.key)}
            >
              <Text>{item.label}</Text>
            </View>
          ))}
        </View>
        <Text className='t-cap mt-8'>{BOARD_SIZES.find(v => v.key === boardKey)?.hint}</Text>

        <Text className='t-h3 mt-24'>颜色数</Text>
        <View className='row flex-wrap gap-16 mt-12'>
          {COLOR_COUNTS.map(item => (
            <View key={item.key} className={item.key === colorKey ? 'chip chip-active' : 'chip'} onClick={() => setColorKey(item.key)}>
              <Text>{item.label}</Text>
            </View>
          ))}
        </View>
        <Text className='t-cap mt-8'>{COLOR_COUNTS.find(v => v.key === colorKey)?.hint}</Text>

        <View className='row mt-24 gap-16'>
          <Button className='btn-soft grow' onClick={() => setRemoveBackground(v => !v)}>去背景 {removeBackground ? '开' : '关'}</Button>
          <Button className='btn-soft grow' onClick={() => setDither(v => !v)}>抖动 {dither ? '开' : '关'}</Button>
        </View>
      </View>

      <View className='row gap-16'>
        <Button className='btn-ghost grow' disabled={busy} onClick={useSample}>重新用样例</Button>
        <Button className='btn-primary grow' disabled={!picked || busy} onClick={generate}>
          {busy ? '生成中…' : '生成图纸'}
        </Button>
      </View>

      {result && (
        <View className='card mt-24'>
          <Text className='t-h3'>生成完成</Text>
          <Text className='t-body mt-8'>
            {result.pattern.width}×{result.pattern.height} · {result.usedColorIndices.length} 色 · {result.timingMs}ms
          </Text>
          <Button className='btn-primary w-full mt-24' onClick={viewResult}>去全屏查看</Button>
        </View>
      )}
    </View>
  )
}
