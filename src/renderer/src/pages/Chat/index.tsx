import React, { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { MessageDetailModal } from '../../components/MessageDetailModal'
import { ModelDownloadDialog, type DialogPhase, type DialogAction } from '../../components/ModelDownloadDialog'
import { HeaderActionBar } from '../../components/HeaderActionBar'
import { toast } from '../../components/Toast'
import { useMessageStore } from '../../stores/message-store'
import { useSettingStore } from '../../stores/setting-store'
import { detectLanguage } from '../../utils/language-detect'
import {
  transcribeAudio, initWhisper, isWhisperCached, getWhisperStatus,
  getWhisperLanguageHint, getLoadedWhisperModelId, type WhisperStatus
} from '../../services/whisper'
import { getWhisperModelMeta } from '../../services/whisper-models'
import {
  translateText,
  setTranslateProgressCallback,
  areTranslateModelsCached,
  isTranslatePairSupported,
  getMissingModelIds,
  downloadModel,
  getTranslateModelMeta
} from '../../services/translate'
import { resolveLocalizedLabel } from '../../utils/localize-label'
import { getShortcutLabels } from '../../utils/shortcut'
import { typewriterReveal } from '../../utils/typewriter'
import type { Message } from '../../types/message'
import type { InputSourceLang, LanguageCode } from '../../types/language'

/** 右键菜单状态 */
interface ContextMenuState {
  x: number
  y: number
  message: Message
}

/** 模型下载弹窗状态 */
interface DownloadDialogState {
  visible: boolean
  phase: DialogPhase
  action: DialogAction
  modelName: string
  progress: number
  errorMessage?: string
}

/** 弹窗初始状态 */
const DIALOG_INITIAL: DownloadDialogState = {
  visible: false,
  phase: 'confirm',
  action: 'install',
  modelName: '',
  progress: 0
}

/**
 * 聊天主页面
 * 整合消息列表、输入区域、模型下载弹窗、右键菜单、详情弹窗
 */
export const ChatPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const shortcutLabels = getShortcutLabels()

  /* 状态管理 */
  const {
    messages, loadMessages, addMessage,
    updateTranslation, deleteMessage, updateContent, setTranslationPreview
  } = useMessageStore()
  const {
    translateEnabled, targetLang, uiLang, inputSourceLang, speechModelId, theme,
    toggleTranslate, setTargetLang, setUiLang, setInputSourceLang, toggleTheme
  } = useSettingStore()

  /* Whisper 模型状态 */
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>('idle')
  const [transcribing, setTranscribing] = useState(false)

  /* 当前正在翻译中的消息 ID 集合 */
  const [translatingIds, setTranslatingIds] = useState<Set<number>>(new Set())

  /* 右键菜单状态 */
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  /* 详情弹窗 */
  const [detailMessage, setDetailMessage] = useState<Message | null>(null)

  /* 模型下载弹窗 */
  const [dialog, setDialog] = useState<DownloadDialogState>(DIALOG_INITIAL)

  /* 用于导航到设置页 */
  const [showSettings, setShowSettings] = useState(false)

  /* 记录当前弹窗的 resolve 用于等待用户操作 */
  const dialogResolveRef = useRef<((confirmed: boolean) => void) | null>(null)
  /* 记录当前待重试的下载函数 */
  const retryFnRef = useRef<(() => Promise<void>) | null>(null)
  /* done 弹窗关闭时的 resolve（仅 Whisper 流程用，防止录音自动开始） */
  const doneDismissRef = useRef<(() => void) | null>(null)

  /** 标记/取消翻译中状态 */
  const markTranslating = useCallback((id: number, translating: boolean) => {
    setTranslatingIds((prev) => {
      const next = new Set(prev)
      if (translating) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /* 启动时加载历史消息 */
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  /* 启动时若已缓存 Whisper，则静默预热到 Worker，降低首击麦克风延迟 */
  useEffect(() => {
    let cancelled = false
    let warmupTimer: ReturnType<typeof setTimeout> | null = null

    void isWhisperCached(speechModelId).then((cached) => {
      if (cancelled) return
      if (!cached) {
        setWhisperStatus('idle')
        return
      }

      /* 模型已缓存时，页面空闲后静默预热到 Worker，减少首击麦克风延迟。 */
      warmupTimer = setTimeout(() => {
        if (cancelled) return
        const loadedModelId = getLoadedWhisperModelId()
        setWhisperStatus((prev) => (
          prev === 'ready' && loadedModelId === speechModelId ? 'ready' : 'loading'
        ))
        void initWhisper(undefined, speechModelId)
          .then(() => {
            if (!cancelled) setWhisperStatus('ready')
          })
          .catch(() => {
            if (!cancelled) setWhisperStatus('idle')
          })
      }, 600)
    })

    return () => {
      cancelled = true
      if (warmupTimer) clearTimeout(warmupTimer)
    }
  }, [speechModelId])

  /* 界面语言切换同步到 i18next */
  useEffect(() => {
    i18n.changeLanguage(uiLang)
  }, [uiLang, i18n])

  /**
   * 显示模型下载确认弹窗，返回用户是否确认
   */
  const showDownloadConfirm = useCallback((modelName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve
      setDialog({
        visible: true,
        phase: 'confirm',
        action: 'install',
        modelName,
        progress: 0
      })
    })
  }, [])

  /** 弹窗确认回调 */
  const handleDialogConfirm = useCallback(async () => {
    if (dialog.phase === 'confirm') {
      /* 首次确认 */
      dialogResolveRef.current?.(true)
      dialogResolveRef.current = null
    } else if (dialog.phase === 'error') {
      /* 重试：直接重新执行下载 */
      const retryFn = retryFnRef.current
      if (retryFn) {
        setDialog((d) => ({ ...d, phase: 'downloading', progress: 0, errorMessage: undefined }))
        try {
          await retryFn()
        } catch {
          /* retryFn 内部已处理错误 */
        }
      }
    }
  }, [dialog.phase])

  /** 弹窗取消回调 */
  const handleDialogCancel = useCallback(() => {
    dialogResolveRef.current?.(false)
    dialogResolveRef.current = null
    /* 若 done 阶段用户关闭弹窗，解锁 Whisper 流程（防止录音自动开始） */
    doneDismissRef.current?.()
    doneDismissRef.current = null
    retryFnRef.current = null
    setDialog(DIALOG_INITIAL)
  }, [])

  /**
   * 确保翻译模型已就绪，未缓存时弹窗确认下载
   * @returns true 表示模型已就绪，false 表示用户取消
   */
  const ensureTranslateModels = useCallback(async (sourceLang: string, tgtLang: string): Promise<boolean> => {
    if (!isTranslatePairSupported(sourceLang, tgtLang)) {
      toast.error(t('chat.translatePairUnsupported'))
      return false
    }

    const cached = await areTranslateModelsCached(sourceLang, tgtLang)
    if (cached) return true

    /* 只获取真正缺失（未在内存或浏览器缓存中）的模型 */
    const missingIds = await getMissingModelIds(sourceLang, tgtLang)
    if (missingIds.length === 0) return true

    const modelLabel = missingIds
      .map((modelId) => resolveLocalizedLabel(getTranslateModelMeta(modelId), modelId, t))
      .join(' + ')
    const confirmed = await showDownloadConfirm(modelLabel)
    if (!confirmed) return false

    /** 执行下载（只下载缺失模型，可被重试调用） */
    const doDownload = async (): Promise<void> => {
      for (const modelId of missingIds) {
        const modelName = resolveLocalizedLabel(getTranslateModelMeta(modelId), modelId, t)
        setDialog((d) => ({ ...d, modelName, progress: 0 }))

        setTranslateProgressCallback((p) => {
          if (p.modelId === modelId && p.status === 'progress' && p.progress !== undefined) {
            setDialog((d) => ({ ...d, progress: p.progress ?? 0 }))
          }
        })

        await downloadModel(modelId)
        setTranslateProgressCallback(null)
      }
    }

    /* 保存重试函数 */
    retryFnRef.current = async () => {
      try {
        await doDownload()
        setDialog((d) => ({ ...d, phase: 'done' }))
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      }
    }

    /* 切换到下载阶段 */
    setDialog((d) => ({ ...d, phase: 'downloading', progress: 0 }))

    try {
      await doDownload()
      setDialog((d) => ({ ...d, phase: 'done' }))
      retryFnRef.current = null
      return true
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      return false
    }
  }, [showDownloadConfirm, t])

  /**
   * 确保 Whisper 模型已就绪
   */
  const ensureWhisperModel = useCallback(async (): Promise<boolean> => {
    /* 已加载到内存：同时校验服务侧实际状态（用户可能从设置页卸载了模型） */
    if (whisperStatus === 'ready') {
      const actualStatus = getWhisperStatus()
      if (actualStatus === 'ready' && getLoadedWhisperModelId() === speechModelId) return true
      /* 服务侧已重置（如卸载操作），同步组件状态再走完整加载流程 */
      setWhisperStatus('idle')
    }

    const selectedWhisperModel = getWhisperModelMeta(speechModelId)

    /** Whisper 进度回调 */
    const onWhisperProgress = (p: { status: string; progress?: number }): void => {
      if (p.status === 'progress' && p.progress !== undefined) {
        setDialog((d) => ({ ...d, progress: p.progress ?? 0 }))
      }
    }

    /** 执行初始化（可被重试调用） */
    const doInit = async (): Promise<void> => {
      await initWhisper(onWhisperProgress, speechModelId)
      setWhisperStatus('ready')
    }

    const cached = await isWhisperCached(speechModelId)
    if (cached) {
      /* 已下载：静默从本地缓存加载到 Worker，不弹任何弹窗
         用户点击麦克风后会有短暂等待（~1s），但体验远好于进度弹窗 */
      try {
        await doInit()   /* initWhisper 无进度回调，安静地从 Cache 读取 */
        return true
      } catch (err) {
        setWhisperStatus('error')
        toast.error(err instanceof Error ? err.message : t('chat.voiceModelError'))
        return false
      }
    }

    /* 未缓存：弹确认框，下载后初始化 */
    const confirmed = await showDownloadConfirm(t(selectedWhisperModel.labelKey))
    if (!confirmed) return false

    /* 保存重试函数 */
    retryFnRef.current = async () => {
      try {
        await doInit()
        setDialog((d) => ({ ...d, phase: 'done' }))
      } catch (err) {
        setWhisperStatus('error')
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      }
    }

    setDialog((d) => ({ ...d, phase: 'downloading', progress: 0 }))
    try {
      await doInit()
      /* 等待用户手动关闭 done 弹窗 */
      setDialog((d) => ({ ...d, phase: 'done' }))
      await new Promise<void>((resolve) => { doneDismissRef.current = resolve })
      retryFnRef.current = null
      toast.info(t('chat.voiceModelReady', { model: t(selectedWhisperModel.labelKey) }))
      /* 返回 false：让用户重新点击麦克风开始录音，而非下载完就自动开始 */
      return false
    } catch (err) {
      setWhisperStatus('error')
      const errMsg = err instanceof Error ? err.message : String(err)
      setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      return false
    }
  }, [whisperStatus, showDownloadConfirm, speechModelId, t])

  /** 发送文字消息 */
  const handleSendText = useCallback(
    async (text: string): Promise<void> => {
      /* 自动检测或使用手动指定的输入源语言 */
      const sourceLang = inputSourceLang === 'auto'
        ? detectLanguage(text)
        : inputSourceLang
      /* 先将消息添加到列表，UI 立即响应 */
      const message = await addMessage(text, sourceLang, 'text')

      /* 翻译在后台异步执行，不阻塞消息显示 */
      if (translateEnabled) {
        void (async () => {
          const ready = await ensureTranslateModels(sourceLang, targetLang)
          if (!ready) return

          markTranslating(message.id, true)
          try {
            /* 翻译完成后通过打字机效果展示译文 */
            const result = await translateText(text, sourceLang, targetLang)
            const displayText = result.trim()

            if (displayText) {
              /* 打字机速度根据文本长度动态调整，长文本加快展示 */
              const typeMs = Math.min(Math.max(displayText.length * 5, 500), 2000)
              await typewriterReveal(displayText, (partial) => {
                setTranslationPreview(message.id, partial, targetLang)
              }, typeMs)
            }

            /* 最终持久化到数据库 */
            await updateTranslation(message.id, displayText || text, targetLang)
          } catch (err) {
            console.error('Translation failed:', err)
            toast.error(t('chat.translateFailed'))
          } finally {
            markTranslating(message.id, false)
          }
        })()
      }
    },
    [
      addMessage,
      inputSourceLang,
      translateEnabled,
      targetLang,
      updateTranslation,
      setTranslationPreview,
      t,
      ensureTranslateModels,
      markTranslating
    ]
  )

  /** 输入源语言切换 */
  const handleSourceLangChange = useCallback((lang: InputSourceLang): void => {
    setInputSourceLang(lang)
  }, [setInputSourceLang])

  /**
   * 语音识别结束回调：最终转写全量音频并返回结果
   */
  const handleTranscribeVoice = useCallback(
    async (audioData: Float32Array): Promise<string | null> => {
      const whisperReady = await ensureWhisperModel()
      if (!whisperReady) return null

      try {
        setTranscribing(true)
        const langHint = getWhisperLanguageHint(uiLang)
        const text = await transcribeAudio(audioData, langHint)
        if (!text) {
          toast.warning(t('chat.voiceEmpty'))
          return null
        }
        return text
      } catch (err) {
        console.error('Voice transcription failed:', err)
        toast.error(t('chat.voiceError'))
        return null
      } finally {
        setTranscribing(false)
      }
    },
    [uiLang, t, ensureWhisperModel]
  )

  /** 重新翻译历史消息 */
  const handleRetranslate = useCallback(
    async (id: number, newTargetLang: LanguageCode): Promise<void> => {
      const msg = messages.find((m) => m.id === id)
      if (!msg) return

      /* 消息重译与底部目标语言保持一致，避免用户再次选择同一语言。 */
      setTargetLang(newTargetLang)

      /* 先检查模型 */
      const ready = await ensureTranslateModels(msg.sourceLang, newTargetLang)
      if (!ready) return

      markTranslating(id, true)
      try {
        const translated = await translateText(msg.content, msg.sourceLang, newTargetLang)
        await updateTranslation(id, translated, newTargetLang)
      } catch (err) {
        console.error('Re-translation failed:', err)
        toast.error(t('chat.translateFailed'))
      } finally {
        markTranslating(id, false)
      }
    },
    [messages, updateTranslation, t, ensureTranslateModels, markTranslating, setTargetLang]
  )

  /**
   * 翻译开关只切换状态。
   * 模型改为在实际翻译时按需安装，避免因预检查造成重复提示。
   */
  const handleToggleTranslate = useCallback(async (): Promise<void> => {
    toggleTranslate()
  }, [toggleTranslate])

  /**
   * 目标语言切换仅更新选择。
   * 具体模型在真正发送 / 重译时再检查，减少跨入口重复安装提示。
   */
  const handleTargetLangChange = useCallback(async (lang: LanguageCode): Promise<void> => {
    setTargetLang(lang)
  }, [setTargetLang])

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

  /** 详情弹窗: 翻译（同时同步全局目标语言） */
  const handleDetailTranslate = useCallback(
    async (id: number, lang: LanguageCode): Promise<void> => {
      const msg = messages.find((m) => m.id === id)
      if (!msg) return

      /* 同步全局目标语言，保持弹窗内外一致 */
      setTargetLang(lang)

      const ready = await ensureTranslateModels(msg.sourceLang, lang)
      if (!ready) return

      markTranslating(id, true)
      try {
        const translated = await translateText(msg.content, msg.sourceLang, lang)
        await updateTranslation(id, translated, lang)
      } catch (err) {
        console.error('Translation failed:', err)
        toast.error(t('chat.translateFailed'))
      } finally {
        markTranslating(id, false)
      }
    },
    [messages, updateTranslation, t, ensureTranslateModels, setTargetLang, markTranslating]
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

  /* 设置页面 */
  if (showSettings) {
    /* 动态导入设置页 */
    const SettingsPageLazy = React.lazy(() =>
      import('../Settings').then((m) => ({ default: m.SettingsPage }))
    )
    return (
      <React.Suspense fallback={null}>
        <SettingsPageLazy onBack={() => setShowSettings(false)} />
      </React.Suspense>
    )
  }

  return (
    <div className={styles.container}>
      {/* 标题栏 (macOS 拖拽区域) */}
      <header className={`${styles.titleBar} drag-region`}>
        <h1 className={styles.title}>{t('app.name')}</h1>
        <div className={`${styles.headerActions} no-drag`}>
          <HeaderActionBar
            theme={theme}
            uiLang={uiLang}
            onOpenSettings={() => setShowSettings(true)}
            onToggleTheme={toggleTheme}
            onToggleUiLang={toggleUiLang}
            settingsTitle={t('settings.title')}
            themeTitle={t(theme === 'light' ? 'settings.themeDark' : 'settings.themeLight')}
            languageTitle={t('settings.language')}
            shortcutHelp={{
              title: t('chat.shortcutsHelpTitle'),
              voiceLabel: t('chat.shortcutsVoiceLabel'),
              voiceValue: shortcutLabels.voice,
              buttonTitle: t('chat.shortcutsHelpButton')
            }}
          />
        </div>
      </header>

      {/* 消息列表 */}
      <main className={styles.main}>
        <MessageList
          messages={messages}
          onRetranslate={handleRetranslate}
          onMessageClick={handleMessageClick}
          onMessageContextMenu={handleContextMenu}
          translatingIds={translatingIds}
        />
      </main>

      {/* 输入区域 */}
      <ChatInput
        onSendText={handleSendText}
        onTranscribeVoice={handleTranscribeVoice}
        onBeforeVoice={ensureWhisperModel}
        disabled={transcribing}
        translateEnabled={translateEnabled}
        onToggleTranslate={handleToggleTranslate}
        targetLang={targetLang}
        sourceLang={inputSourceLang}
        onTargetLangChange={handleTargetLangChange}
        onSourceLangChange={handleSourceLangChange}
      />

      {/* 模型下载确认+进度弹窗 */}
      <ModelDownloadDialog
        visible={dialog.visible}
        phase={dialog.phase}
        action={dialog.action}
        modelName={dialog.modelName}
        progress={dialog.progress}
        errorMessage={dialog.errorMessage}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
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
          currentTargetLang={targetLang}
          onTargetLangChange={setTargetLang}
          isTranslating={translatingIds.has(activeDetailMessage.id)}
        />
      )}
    </div>
  )
}
