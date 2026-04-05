import React, { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { TranslationPanel } from './TranslationPanel'
import { useMessageStore } from '../../stores/message-store'
import { useSettingStore } from '../../stores/setting-store'
import { useShortcuts } from '../../hooks/useShortcuts'
import { detectLanguage } from '../../utils/language-detect'
import type { LanguageCode } from '../../types/language'

/**
 * 聊天主页面
 * 整合消息列表、输入区域、翻译面板
 */
export const ChatPage: React.FC = () => {
  const { t, i18n } = useTranslation()

  /* 状态管理 */
  const { messages, loadMessages, addMessage, updateTranslation } = useMessageStore()
  const {
    translateEnabled, targetLang, uiLang, theme,
    toggleTranslate, setTargetLang, setUiLang, toggleTheme
  } = useSettingStore()

  /* 启动时加载历史消息 */
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  /* 界面语言切换同步到 i18next */
  useEffect(() => {
    i18n.changeLanguage(uiLang)
  }, [uiLang, i18n])

  /** 发送文字消息 */
  const handleSendText = useCallback(
    async (text: string): Promise<void> => {
      /* 自动检测语言 */
      const sourceLang = detectLanguage(text)
      const message = await addMessage(text, sourceLang, 'text')

      /* 翻译开启时自动翻译 */
      if (translateEnabled) {
        try {
          const translated = await window.api.translateText(text, sourceLang, targetLang)
          await updateTranslation(message.id, translated, targetLang)
        } catch (err) {
          console.error('Translation failed:', err)
        }
      }
    },
    [addMessage, translateEnabled, targetLang, updateTranslation]
  )

  /** 发送语音数据 */
  const handleSendVoice = useCallback(
    async (audioData: Float32Array): Promise<void> => {
      try {
        /* 调用 Whisper 语音识别 */
        const text = await window.api.transcribeAudio(audioData)
        if (!text) return

        const sourceLang = detectLanguage(text)
        const message = await addMessage(text, sourceLang, 'voice')

        /* 翻译开启时自动翻译 */
        if (translateEnabled) {
          const translated = await window.api.translateText(text, sourceLang, targetLang)
          await updateTranslation(message.id, translated, targetLang)
        }
      } catch (err) {
        console.error('Voice transcription failed:', err)
      }
    },
    [addMessage, translateEnabled, targetLang, updateTranslation]
  )

  /** 重新翻译历史消息（不新增记录） */
  const handleRetranslate = useCallback(
    async (id: number, newTargetLang: LanguageCode): Promise<void> => {
      const msg = messages.find((m) => m.id === id)
      if (!msg) return

      try {
        const translated = await window.api.translateText(
          msg.content,
          msg.sourceLang,
          newTargetLang
        )
        await updateTranslation(id, translated, newTargetLang)
      } catch (err) {
        console.error('Re-translation failed:', err)
      }
    },
    [messages, updateTranslation]
  )

  /* 注册快捷键 */
  useShortcuts({
    onVoiceToggle: () => {
      // 快捷键触发由 ChatInput 内部的 VoiceButton 处理
      // 这里留作扩展
    }
  })

  /** 切换界面语言 */
  const toggleUiLang = (): void => {
    setUiLang(uiLang === 'zh-CN' ? 'en-US' : 'zh-CN')
  }

  return (
    <div className={styles.container}>
      {/* 标题栏 (macOS 拖拽区域) */}
      <header className={`${styles.titleBar} drag-region`}>
        <h1 className={styles.title}>{t('app.name')}</h1>
        <div className={`${styles.headerActions} no-drag`}>
          {/* 主题切换 */}
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleTheme}
            title={t(theme === 'light' ? 'settings.themeDark' : 'settings.themeLight')}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {/* 界面语言切换 */}
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleUiLang}
            title={t('settings.language')}
          >
            {uiLang === 'zh-CN' ? 'EN' : '中'}
          </button>
        </div>
      </header>

      {/* 翻译控制面板 */}
      <TranslationPanel
        enabled={translateEnabled}
        onToggle={toggleTranslate}
        targetLang={targetLang}
        onTargetLangChange={setTargetLang}
      />

      {/* 消息列表 */}
      <main className={styles.main}>
        <MessageList
          messages={messages}
          showTranslation={translateEnabled}
          onRetranslate={handleRetranslate}
        />
      </main>

      {/* 输入区域 */}
      <ChatInput
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
      />
    </div>
  )
}
