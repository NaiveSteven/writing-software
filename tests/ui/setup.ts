import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/* 每个测试后自动清理 React DOM */
afterEach(() => {
  cleanup()
})

/* mock window.api (Electron preload 注入) */
const mockApi = {
  createMessage: vi.fn(),
  getAllMessages: vi.fn().mockResolvedValue([]),
  updateTranslation: vi.fn(),
  translateText: vi.fn(),
  transcribeAudio: vi.fn(),
  checkModel: vi.fn(),
  listModels: vi.fn(),
  downloadModel: vi.fn(),
  onDownloadProgress: vi.fn().mockReturnValue(() => {})
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true
})

/* mock i18next — 返回 key 本身 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'zh-CN' }
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() }
}))
