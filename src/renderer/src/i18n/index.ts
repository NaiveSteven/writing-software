import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

/**
 * 国际化配置
 * 支持中文和英文界面切换
 */
i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS }
  },
  lng: 'zh-CN',
  fallbackLng: 'en-US',
  interpolation: {
    /* React 已自带 XSS 防护, 无需 i18next 转义 */
    escapeValue: false
  }
})

export default i18n
