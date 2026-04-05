import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

/* 共享路径别名，与 tsconfig paths 保持一致 */
const sharedAlias = {
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  '@main': resolve(__dirname, 'src/main')
}

export default defineConfig({
  test: {
    /* 按目录区分环境，每个 project 需独立声明 resolve */
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'node',
          include: ['tests/main/**/*.test.ts', 'tests/logic/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'ui',
          include: ['tests/ui/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/ui/setup.ts'],
          css: true
        }
      }
    ]
  }
})
