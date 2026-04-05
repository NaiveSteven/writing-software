import React, { useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { TranslationPanel } from './TranslationPanel'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { MessageDetailModal } from '../../components/MessageDetailModal'
import { useMessageStore } from '../../stores/message-store'
import { useSettingStore } from '../../stores/setting-store'
import { useShortcuts } from '../../hooks/useShortcuts'
import { detectLanguage } from '../../utils/language-detect'
import { transcribeAudio, initWhisper, type WhisperStatus } from '../../services/whisper'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'

/** 右键菜单状态 */
interface ContextMenuState {
  x: number
  y: number
  message: Message
}

/**
 * 聊天主页面
 * 整合消息列表、输入区域、翻译面板、右键菜单、详情弹窗
 */
export const ChatPage: React.FC = () => {
  const { t, i18n } = useTranslation()

  /* 状态管理 */
  const {
    messages, loadMessages, addMessage,
    updateTranslation, deleteMessage, updateContent
  } = useMessageStore()
  const {
    translateEnabled, targetLang, uiLang, theme,
    toggleTranslate, setTargetLang, setUiLang, toggleTheme
  } = useSettingStore()

  /* Whisper 模型状态 */
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>('idle')
  const [transcribing, setTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  /* 右键菜单状态 */
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  /* 详情弹窗 */
  const [detailMessage, setDetailMessage] = useState<Message | null>(null)

  /* 启动时加载历史消息 */
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  /* 预热 Whisper 模型（后台加载，不阻塞 UI） */
  useEffect(() => {
    initWhisper((progress) => {
      if (progress.status === 'progress') {
        setWhisperStatus('loading')
      } else if (progress.status === 'ready') {
        setWhisperStatus('ready')
      }
    }).then(() => {
      setWhisperStatus('ready')
    }).catch((err) => {
      console.warn('Whisper model preload failed, will retry on first use:', err)
      setWhisperStatus('idle')
    })
  }, [])

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

  /** 发送语音数据（渲染进程内 Whisper 推理） */
  const handleSendVoice = useCallback(
    async (audioData: Float32Array): Promise<void> => {
      try {
        setTranscribing(true)
        setVoiceError(null)

        /* 在渲染进程内直接调用 Whisper，避免 IPC 传输大音频数据 */
        const text = await transcribeAudio(audioData)
        if (!text) {
          setVoiceError(t('chat.voiceEmpty'))
          return
        }

        const sourceLang = detectLanguage(text)
        const message = await addMessage(text, sourceLang, 'voice')

        /* 翻译开启时自动翻译 */
        if (translateEnabled) {
          const translated = await window.api.translateText(text, sourceLang, targetLang)
          await updateTranslation(message.id, translated, targetLang)
        }
      } catch (err) {
        console.error('Voice transcription failed:', err)
        setVoiceError(t('chat.voiceError'))
      } finally {
        setTranscribing(false)
      }
    },
    [addMessage, translateEnabled, targetLang, updateTranslation, t]
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
    }
  })

  /** 切换界面语言 */
  const toggleUiLang = (): void => {
    setUiLang(uiLang === 'zh-CN' ? 'en-US' : 'zh-CN')
  }

  /** 右键菜单: 显示 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, message: Message): void => {
      setContextMenu({ x: e.clientX, y: e.clientY, message })
    },
    []
  )

  /** 右键菜单: 删除消息 */
  const handleDelete = useCallback(
    async (id: number): Promise<void> => {
      await deleteMessage(id)
    },
    [deleteMessage]
  )

  /** 点击消息: 打开详情弹窗 */
  const handleMessageClick = useCallback(
    (message: Message): void => {
      setDetailMessage(message)
    },
    []
  )

  /** 详情弹窗: 保存原文编辑 */
  const handleSaveContent = useCallback(
    async (id: number, content: string): Promise<void> => {
      await updateContent(id, content)
    },
    [updateContent]
  )

  /** 详情弹窗: 翻译 */
  const handleDetailTranslate = useCallback(
    async (id: number, lang: LanguageCode): Promise<void> => {
      const msg = messages.find((m) => m.id === id)
      if (!msg) return
      try {
        const translated = await window.api.translateText(msg.content, msg.sourceLang, lang)
        await updateTranslation(id, translated, lang)
      } catch (err) {
        console.error('Translation failed:', err)
      }
    },
    [messages, updateTranslation]
  )

  /* 当 messages 更新时，同步详情弹窗中的消息 */
  const activeDetailMessage = detailMessage
    ? messages.find((m) => m.id === detailMessage.id) || null
    : null

  /** 构建右键菜单项 */
  const contextMenuItems: MenuItem[] = contextMenu
    ? [
        {
          key: 'detail',
          label: t('context.detail'),
          icon: '📄',
          onClick: () => handleMessageClick(contextMenu.message)
        },
        {
          key: 'delete',
          label: t('context.delete'),
          icon: '🗑',
          danger: true,
          onClick: () => handleDelete(contextMenu.message.id)
        }
      ]
    : []

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
          onMessageClick={handleMessageClick}
          onMessageContextMenu={handleContextMenu}
        />
      </main>

      {/* 语音错误提示 */}
      {voiceError && (
        <div className={styles.voiceErrorBar}>
          <span>{voiceError}</span>
          <button type="button" onClick={() => setVoiceError(null)}>✕</button>
        </div>
      )}

      {/* 输入区域 */}
      <ChatInput
        onSendText={handleSendText}
        onSendVoice={handleSendVoice}
        disabled={transcribing}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 消息详情弹窗 */}
      {activeDetailMessage && (
        <MessageDetailModal
          message={activeDetailMessage}
          onClose={() => setDetailMessage(null)}
          onSaveContent={handleSaveContent}
          onTranslate={handleDetailTranslate}
        />
      )}
    </div>
  )
}
