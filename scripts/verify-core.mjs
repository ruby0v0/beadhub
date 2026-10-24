/**
 * core 层独立验证脚本（不依赖 Taro / 小程序运行时）。
 *
 *   node scripts/verify-core.mjs
 *
 * 做三件事：
 * 1. 静态检查 src/core/** 里没有任何 Taro / 小程序 API 依赖；
 * 2. 用 esbuild 把 core 打成纯 JS 再 import —— 证明 core 真的能脱离 Taro 跑起来；
 * 3. 用内置样例图跑通「去背 → 下采样 → 量化 → 映射 → 抖动」全流水线，
 *    并断言 RLE 往返、BOM 统计、色差等关键性质。
 */

import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = path.join(root, 'src/core')
const outFile = path.join(root, '.cache', 'core-verify.mjs')
const paletteFile = path.join(root, '.cache', 'palette-verify.mjs')

let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// 1. core 层纯净度
console.log('[1/3] core 层依赖纯净度')
const offenders = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.tsx?$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8')
      if (/@tarojs\/|from ['"]taro|Taro\.|wx\.|createSelectorQuery/.test(text)) {
        offenders.push(path.relative(root, full))
      }
    }
  }
}
walk(coreDir)
check('core/** 无 Taro / 小程序 API 依赖', offenders.length === 0, offenders.join(', '))

// 2. 打包成纯 JS（顺带证明没有运行时 Taro 依赖）
console.log('[2/3] core 独立打包 + import')
fs.mkdirSync(path.dirname(outFile), { recursive: true })
await build({
  entryPoints: [path.join(coreDir, 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: outFile,
  logLevel: 'error',
})
const core = await import(pathToFileURL(outFile).href)
check('core/index.ts 可作为纯 ESM 模块加载', typeof core.buildPatternFromImage === 'function')

// constants 也是纯 TS，单独打一份给断言用
await build({
  entryPoints: [path.join(root, 'src/constants/palettes.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: paletteFile,
  logLevel: 'error',
})
const palette = await import(pathToFileURL(paletteFile).href)
check('色库可独立加载', palette.getPaletteColors().length === 291, `${palette.getPaletteColors().length} 色`)

// 3. 全流水线
console.log('[3/3] 样例图全流水线')
const image = core.createSampleImage(256)
check('样例图生成', image.width === 256 && image.data.length === 256 * 256 * 4)

const t0 = Date.now()
const result = core.buildPatternFromImage(image, {
  grid: core.BOARD_PRESETS.medium, // 52 x 52
  colorCount: 16,
  removeBackground: true,
  dither: false,
})
const elapsed = Date.now() - t0
const pattern = result.pattern

check('网格尺寸 = 52×52', pattern.width === 52 && pattern.height === 52)
check('cells 长度 = w*h', pattern.cells.length === 52 * 52)
check('paletteId 已锁定', pattern.paletteId === 'mard-v1', pattern.paletteId)
check('背景被去除（产生 -1 空格）', pattern.cells.some(v => v === -1))
check('量化档位生效（色号数 <= 16）', result.usedColorIndices.length <= 16, `${result.usedColorIndices.length} 个色号`)
check('所有色号都在色板范围内', pattern.cells.every(v => v === -1 || v < palette.getPaletteColors().length))
check('流水线耗时 < 5000ms', elapsed < 5000, `${elapsed}ms`)

const rle = core.encodeRle(pattern)
const restored = core.decodeRle(rle, pattern.width, pattern.height)
check('RLE 往返一致', Array.from(restored).every((v, i) => v === pattern.cells[i]) && restored.length === pattern.cells.length)
console.log(`    · 照片类图纸 RLE 压缩比 ${core.rleRatio(rle, pattern.cells.length).toFixed(2)}`)

// 纯色底图纸（典型的「背景大面积同色」场景）压缩效果明显
const flat = core.createPattern(52, 52, 'mard-v1', 12)
flat.cells[0] = 30
const flatRle = core.encodeRle(flat)
check('纯色图纸 RLE 压缩到 1% 以下', flatRle.length < flat.cells.length * 0.01, `${flatRle.length} 字符 vs ${flat.cells.length} 格`)

const serialized = core.serializePattern(pattern)
const roundTrip = core.deserializePattern(JSON.stringify(serialized))
check('序列化往返一致', roundTrip.cells.every((v, i) => v === pattern.cells[i]))
check('反序列化保留 paletteId', roundTrip.paletteId === pattern.paletteId)

const bom = core.computeBom(pattern, palette.getPaletteColors())
check('BOM 颗数 = 已填格数', bom.totalBeads === bom.filledCells, `${bom.totalBeads} / ${bom.filledCells}`)
check('BOM 损耗在 5%~10% 区间', bom.wasteRatio >= 0.05 && bom.wasteRatio <= 0.1, `${bom.wasteRatio}`)
check('含损耗颗数 >= 实际颗数', bom.totalWithWaste >= bom.totalBeads)
check('52×52 需要 2×2 块 29×29 板', bom.boards.cols === 2 && bom.boards.rows === 2 && bom.boards.total === 4, JSON.stringify(bom.boards))

// 抖动开关
const dithered = core.buildPatternFromImage(image, {
  grid: core.BOARD_PRESETS.small,
  colorCount: 16,
  removeBackground: true,
  dither: true,
})
check('抖动分支可跑通', dithered.pattern.cells.length === 29 * 29 && dithered.usedColorIndices.length > 0)

// 色差实现用 Sharma 标准测试向量（CIEDE2000 论文里的第 1 组 / 第 7 组）
const d1 = core.deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })
const d2 = core.deltaE2000({ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 })
check('ΔE00 标准向量 #1 ≈ 2.0425', Math.abs(d1 - 2.0425) < 0.0001, d1.toFixed(4))
check('ΔE00 标准向量 #2 ≈ 4.3065', Math.abs(d2 - 4.3065) < 0.0001, d2.toFixed(4))

console.log('')
console.log(`样例图纸：${bom.width}×${bom.height}，${bom.colorCount} 个色号，${bom.totalBeads} 颗豆，含损耗 ${bom.totalWithWaste} 颗`)
console.log(`耗时明细：${result.steps.map(s => `${s.name} ${s.ms}ms`).join(' / ')}`)
console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`)
process.exit(failed === 0 ? 0 : 1)
