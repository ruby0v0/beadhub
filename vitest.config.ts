import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 独立的测试配置：不复用 Taro 的 config/index.ts。
// 只测 src/core（纯算法层），Node 环境，无需 jsdom / Taro mock。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/core/**/*.test.ts', 'src/core/**/__tests__/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      reporter: ['text', 'html'],
    },
  },
})
