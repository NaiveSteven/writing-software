import React, { useEffect } from 'react'
import { ChatPage } from './pages/Chat'
import { useSettingStore } from './stores/setting-store'

/**
 * 应用根组件
 * 管理全局主题属性，启动后进入对话翻译界面
 */
const App: React.FC = () => {
  const theme = useSettingStore((s) => s.theme)

  /* 同步主题到 document，驱动 CSS 变量切换 */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return <ChatPage />
}

export default App
