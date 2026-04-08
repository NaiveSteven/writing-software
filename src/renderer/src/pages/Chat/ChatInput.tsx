import React, { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { GlassInput } from '../../components/GlassInput'
import { GlassButton } from '../../components/GlassButton'
import { LanguageSelector } from '../../components/LanguageSelector'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useShortcuts } from '../../hooks/useShortcuts'
import { getShortcutLabels } from '../../utils/shortcut'
import {
  INPUT_SOURCE_LANGUAGE_OPTIONS,
  type InputSourceLang,
  type LanguageCode
} from '../../types/language'

/** 输入区最小高度 */
const MIN_INPUT_HEIGHT = 130
/** 输入区最大高度 */
const MAX_INPUT_HEIGHT = 520

/** 格式化录音计时 mm:ss */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** ChatInput 属性 */
interface ChatInputProps {
  /** 发送文字消息 */
  onSendText: (text: string) => void
  /** 最终转写回调：用户结束录音后统一识别整段音频。 */
  onTranscribeVoice?: (audioData: Float32Array) => Promise<string | null>
  /** 录音前校验（如检查语音模型），返回 false 阻止录音 */
  onBeforeVoice?: () => Promise<boolean>
  /** 是否禁用输入 */
  disabled?: boolean
  /** 翻译开关状态 */
  translateEnabled: boolean
  /** 切换翻译开关 */
  onToggleTranslate: () => void
  /** 当前目标语言 */
  targetLang: LanguageCode
  /** 当前输入源语言 */
  sourceLang: InputSourceLang
  /** 变更目标语言 */
  onTargetLangChange: (lang: LanguageCode) => void
  /** 变更输入源语言 */
  onSourceLangChange: (lang: InputSourceLang) => void
}

/**
 * 聊天输入区域
 *
 * 语音输入当前只保留“停止后统一识别”的单次转写流程。
 * 之前的定时切片 + 文本拼接属于伪流式方案，准确率和稳定性都不够理想，先停用。
 *
 * 拖拽调整高度：8px 手柄，支持向上拖扩大
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onTranscribeVoice,
  onBeforeVoice,
  disabled = false,
  translateEnabled,
  onToggleTranslate,
  targetLang,
  sourceLang,
  onTargetLangChange,
  onSourceLangChange
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const { isRecording, duration, startRecording, stopRecording, getCurrentAudio } =
    useAudioRecorder()

  /* ---- 拖拽调整高度 ---- */
  const [areaHeight, setAreaHeight] = useState<number | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)
  const isStoppingRef = useRef(false)

  const handleResizeStart = useCallback((e: React.MouseEvent): void => {
    const el = areaRef.current
    if (!el) return
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: el.offsetHeight }
    const onMove = (ev: MouseEvent): void => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const next = Math.max(MIN_INPUT_HEIGHT, Math.min(MAX_INPUT_HEIGHT, dragRef.current.startH + delta))
      setAreaHeight(next)
    }
    const onUp = (): void => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  /** 发送文字消息 */
  const handleSend = useCallback((): void => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setText('')
  }, [text, onSendText])

  /** 切换语音录制 */
  const handleVoiceToggle = useCallback(async (): Promise<void> => {
    if (isRecording) {
      if (isStoppingRef.current) return
      isStoppingRef.current = true

      /* 先取全量快照，再并行停止录音器和做整段识别，尽量缩短停录等待时间。 */
      const snapshot = getCurrentAudio()
      const stopPromise = stopRecording()

      if (snapshot && onTranscribeVoice) {
        const finalText = await onTranscribeVoice(snapshot.slice(0))
        if (finalText) setText(finalText)
      }

      await stopPromise
      isStoppingRef.current = false
    } else {
      if (onBeforeVoice) {
        const ready = await onBeforeVoice()
        if (!ready) return
      }
      isStoppingRef.current = false
      setText('')
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording, getCurrentAudio, onTranscribeVoice, onBeforeVoice])

  /* 全局快捷键直接复用同一套录音切换逻辑。 */
  useShortcuts({
    onVoiceToggle: () => {
      void handleVoiceToggle()
    }
  })

  const canSend = Boolean(text.trim()) && !disabled && !isRecording
  const isExpanded = areaHeight !== null
  const shortcutLabels = getShortcutLabels()

  return (
    <div
      ref={areaRef}
      className={styles.inputArea}
      style={areaHeight !== null ? { height: areaHeight } : undefined}
    >
      {/* 拖拽调整手柄 */}
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />

      <div className={styles.inputCard} style={isExpanded ? { flex: 1 } : undefined}>
        {/* 多行文字输入框 */}
        <GlassInput
          value={text}
          onChange={setText}
          placeholder={isRecording ? t('chat.voiceListening') : t('chat.inputPlaceholder')}
          onSubmit={handleSend}
          disabled={disabled || isRecording}
          multiline
          className={`${styles.mainTextarea} ${isExpanded ? styles.mainTextareaExpanded : ''}`}
        />

        {/* ---- 工具栏 ---- */}
        <div className={styles.toolbar}>
          {/* 麦克风按钮 */}
          {onTranscribeVoice && (
            <button
              type="button"
              className={`${styles.micBtn} ${isRecording ? styles.micActive : ''}`}
              onClick={handleVoiceToggle}
              disabled={disabled}
              title={isRecording ? t('chat.voiceStop') : t('chat.voiceStart')}
            >
              {isRecording ? (
                <span className={styles.micRecording}>
                  <span className={styles.micDot} />
                  <span className={styles.micTimer}>{formatDuration(duration)}</span>
                </span>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 0 1-7 0v-6A3.5 3.5 0 0 1 12 2zm7 9a1 1 0 0 1 1 1 8 8 0 0 1-7 7.938V22h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.062A8 8 0 0 1 4 12a1 1 0 1 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 1-1z" />
                </svg>
              )}
            </button>
          )}

          {onTranscribeVoice && <div className={styles.toolDivider} />}

          <LanguageSelector
            value={sourceLang}
            onChange={onSourceLangChange}
            options={INPUT_SOURCE_LANGUAGE_OPTIONS}
            className={styles.langSelectCompact}
          />

          <div className={styles.toolDivider} />

          {/* 翻译切换 + 语言选择 */}
          <div className={styles.translateGroup}>
            <button
              type="button"
              className={`${styles.translateToggle} ${translateEnabled ? styles.translateOn : ''}`}
              onClick={onToggleTranslate}
              title={translateEnabled ? t('translate.on') : t('translate.off')}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <span>{t('translate.label')}</span>
            </button>

            {translateEnabled && (
              <LanguageSelector
                value={targetLang}
                onChange={onTargetLangChange}
                className={styles.langSelectCompact}
              />
            )}
          </div>

          <div className={styles.toolSpacer} />

          {/* 状态提示 */}
          {disabled ? (
            <span className={styles.hintTranscribing}>{t('chat.transcribing')}</span>
          ) : isRecording ? (
            <span className={styles.hintRecording}>{t('chat.voiceListening')}</span>
          ) : (
            <span className={styles.hintShortcut}>
              {t('chat.shortcutsSummary', { voice: shortcutLabels.voice })}
            </span>
          )}

          {/* 发送按钮 */}
          <GlassButton variant="primary" size="sm" onClick={handleSend} disabled={!canSend}>
            {t('chat.send')}
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
