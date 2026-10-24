import { defineConfig, presetWind3, type Rule } from 'unocss'
import { presetApplet, presetRemRpx } from 'unocss-applet'

/**
 * 平台分支
 * - weapp：presetApplet()（小程序安全选择器）+ presetRemRpx()（rem→rpx，兜底）
 * - H5    ：presetWind3() + presetRemRpx({ mode: 'rpx2rem' })
 *
 * ⚠️ H5 的换算基准必须和 Taro 运行时对齐：Taro 注入的 `html{font-size}` 脚本是
 * `clamp(40 * screenWidth / 750, 20, 40)px`，也就是 designWidth=750 时 1rpx = 1/40 rem。
 * 所以这里显式传 screenWidth=750 / baseFontSize=40（默认 375/16 会整体放大 1.25 倍，
 * 和 Taro 自己生成的样式对不上）。
 */
const isApplet = process.env.TARO_ENV !== 'h5'

/** 数值工具类 = N rpx（designWidth 750）。写 `p-24` 就是 24rpx，和设计稿逐字对应。 */
const rpx = (n: string) => `${n}rpx`

const sizeRules: Rule[] = [
  [/^p-(\d+)$/, ([, n]) => ({ padding: rpx(n) })],
  [/^px-(\d+)$/, ([, n]) => ({ 'padding-left': rpx(n), 'padding-right': rpx(n) })],
  [/^py-(\d+)$/, ([, n]) => ({ 'padding-top': rpx(n), 'padding-bottom': rpx(n) })],
  [/^pt-(\d+)$/, ([, n]) => ({ 'padding-top': rpx(n) })],
  [/^pr-(\d+)$/, ([, n]) => ({ 'padding-right': rpx(n) })],
  [/^pb-(\d+)$/, ([, n]) => ({ 'padding-bottom': rpx(n) })],
  [/^pl-(\d+)$/, ([, n]) => ({ 'padding-left': rpx(n) })],
  [/^m-(\d+)$/, ([, n]) => ({ margin: rpx(n) })],
  [/^mx-(\d+)$/, ([, n]) => ({ 'margin-left': rpx(n), 'margin-right': rpx(n) })],
  [/^my-(\d+)$/, ([, n]) => ({ 'margin-top': rpx(n), 'margin-bottom': rpx(n) })],
  [/^mt-(\d+)$/, ([, n]) => ({ 'margin-top': rpx(n) })],
  [/^mr-(\d+)$/, ([, n]) => ({ 'margin-right': rpx(n) })],
  [/^mb-(\d+)$/, ([, n]) => ({ 'margin-bottom': rpx(n) })],
  [/^ml-(\d+)$/, ([, n]) => ({ 'margin-left': rpx(n) })],
  [/^w-(\d+)$/, ([, n]) => ({ width: rpx(n) })],
  [/^h-(\d+)$/, ([, n]) => ({ height: rpx(n) })],
  [/^min-w-(\d+)$/, ([, n]) => ({ 'min-width': rpx(n) })],
  [/^min-h-(\d+)$/, ([, n]) => ({ 'min-height': rpx(n) })],
  [/^max-w-(\d+)$/, ([, n]) => ({ 'max-width': rpx(n) })],
  [/^max-h-(\d+)$/, ([, n]) => ({ 'max-height': rpx(n) })],
  [/^size-(\d+)$/, ([, n]) => ({ width: rpx(n), height: rpx(n) })],
  [/^gap-(\d+)$/, ([, n]) => ({ gap: rpx(n) })],
  [/^gap-x-(\d+)$/, ([, n]) => ({ 'column-gap': rpx(n) })],
  [/^gap-y-(\d+)$/, ([, n]) => ({ 'row-gap': rpx(n) })],
  [/^top-(\d+)$/, ([, n]) => ({ top: rpx(n) })],
  [/^right-(\d+)$/, ([, n]) => ({ right: rpx(n) })],
  [/^bottom-(\d+)$/, ([, n]) => ({ bottom: rpx(n) })],
  [/^left-(\d+)$/, ([, n]) => ({ left: rpx(n) })],
  [/^leading-(\d+)$/, ([, n]) => ({ 'line-height': rpx(n) })],
  [/^border-w-(\d+)$/, ([, n]) => ({ 'border-width': rpx(n) })],
]

export default defineConfig({
  presets: [
    ...(isApplet ? [presetApplet()] : [presetWind3()]),
    isApplet
      ? presetRemRpx()
      : presetRemRpx({ mode: 'rpx2rem', screenWidth: 750, baseFontSize: 40 }),
  ],
  theme: {
    colors: {
      paper: '#F7F4EF',
      surface: '#FFFFFF',
      'surface-2': '#F1EDE6',
      ink: '#1D1B19',
      'ink-2': '#57524A',
      'ink-3': '#8E887D',
      line: '#E4DED3',
      brand: '#E4573D',
      'brand-soft': '#FBE9E3',
      accent: '#2E8F7E',
      'accent-soft': '#E3F1EE',
      warn: '#B8791C',
      'warn-soft': '#FAF0DD',
      danger: '#BE3B2B',
    },
    fontSize: {
      '2xs': '20rpx',
      xs: '22rpx',
      sm: '24rpx',
      base: '26rpx',
      md: '28rpx',
      lg: '32rpx',
      xl: '36rpx',
      '2xl': '44rpx',
      '3xl': '52rpx',
      '20': '20rpx',
      '18': '18rpx',
      '16': '16rpx',
      '22': '22rpx',
      '24': '24rpx',
      '26': '26rpx',
      '28': '28rpx',
      '30': '30rpx',
      '32': '32rpx',
      '34': '34rpx',
      '36': '36rpx',
      '40': '40rpx',
      '44': '44rpx',
      '48': '48rpx',
      '56': '56rpx',
      '64': '64rpx',
    },
    borderRadius: {
      '2': '4rpx',
      '4': '8rpx',
      '6': '12rpx',
      '8': '16rpx',
      '12': '24rpx',
      '16': '32rpx',
      '20': '40rpx',
      '24': '48rpx',
      '32': '64rpx',
      full: '9999rpx',
    },
    boxShadow: {
      card: '0 4rpx 24rpx rgba(29,27,25,0.06)',
      float: '0 12rpx 48rpx rgba(29,27,25,0.18)',
    },
  },
  rules: [
    ...sizeRules,
    // rgba 背景（小程序 wxss 不能用 `bg-black/50` 这类 class 名，所以单独给个工具类）
    ['bg-mask', { 'background-color': 'rgba(22,20,18,0.62)' }],
  ],
  shortcuts: [
    // 布局
    ['page-wrap', 'min-h-screen bg-paper text-ink'],
    ['row', 'flex items-center'],
    ['row-between', 'flex items-center justify-between'],
    ['row-center', 'flex items-center justify-center'],
    ['col', 'flex flex-col'],
    ['grow', 'flex-1 min-w-0'],
    // 文字
    ['t-title', 'text-40 font-700 tracking-tight'],
    ['t-h2', 'text-32 font-700'],
    ['t-h3', 'text-28 font-600'],
    ['t-body', 'text-26 text-ink-2'],
    ['t-cap', 'text-22 text-ink-3'],
    ['t-num', 'text-24 font-600 tabular-nums'],
    // 容器
    ['card', 'bg-surface rounded-16 p-24 shadow-card'],
    ['card-flat', 'bg-surface rounded-16 p-24 border-w-1 border-solid border-line'],
    ['chip', 'row-center h-56 px-20 rounded-full bg-surface-2 text-22 text-ink-2'],
    ['chip-active', 'chip bg-brand text-white font-600'],
    ['divider', 'h-1 w-full bg-line'],
    // 按钮
    ['btn', 'row-center h-88 px-32 rounded-16 text-28 font-600'],
    ['btn-primary', 'btn bg-brand text-white'],
    ['btn-ghost', 'btn bg-surface border-w-1 border-solid border-line text-ink'],
    ['btn-soft', 'btn bg-surface-2 text-ink-2'],
    ['btn-sm', 'h-64 px-24 rounded-12 text-24'],
    // 网格色块
    ['swatch', 'rounded-6 border-w-1 border-solid border-line'],
  ],
})
