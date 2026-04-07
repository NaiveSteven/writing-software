import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { GlassInput } from '../../components/GlassInput'
import { GlassButton } from '../../components/GlassButton'
import { LanguageSelector } from '../../components/LanguageSelector'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import {
  INPUT_SOURCE_LANGUAGE_OPTIONS,
  type InputSourceLang,
  type LanguageCode
} from '../../types/language'

/**
 * 分段识别时每段的最短音频时长（秒）
 * 适当降低门槛，让一句短语更早出现首个识别结果
 */
const SEGMENT_MIN_DURATION_SEC = 0.8
/**
 * 分段识别检查间隔（毫秒）
 * 1.2s 一次，兼顾首字响应和 CPU 开销
 */
const SEGMENT_INTERVAL_MS = 1200
/** 每段最大采样数：3 秒，降低单次推理耗时 */
const SEGMENT_MAX_SAMPLES = 3 * 16000
/**
 * 有已有分段结果时，停止录音后改为后台全量精修，避免输入区长时间卡在不可交互状态
 */
const USE_BACKGROUND_FINAL_REFINE = true
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
  /**
   * 最终转写回调
   * stopping 时可传 background=true，表示已有预览文字，仅做后台精修
   */
  onTranscribeVoice?: (
    audioData: Float32Array,
    options?: { background?: boolean }
  ) => Promise<string | null>
  /**
   * 分段追加回调：录音期间每积累一段新音频时触发
   * @param newAudio  本段新增音频（不含已提交的旧音频）
   * @param prevText  输入框中已有的文字（前缀）
   * @returns 新的完整文字（prevText + 本段识别）；null 表示跳过本段
   */
  onSegmentTranscribe?: (
    newAudio: Float32Array,
    prevText: string
  ) => Promise<string | null>
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
 * 语音分段追加架构：
 *  - 录音期间每积累 3s 新音频 或 每过 1.2s，转写新增片段
 *  - 结果追加到输入框（不替换），解决"覆盖"问题
 *  - 停止录音时触发完整音频的最终转写，覆盖所有中间结果
 *  - 分段游标 segmentCursorRef 记录"已提交的采样数"
 *
 * 拖拽调整高度：8px 手柄，支持向上拖扩大
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onTranscribeVoice,
  onSegmentTranscribe,
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

  /* ---- 分段追加识别保护机制 ----
   * segmentCursorRef: 已提交给"分段识别"的采样数游标。
   *   每次分段识别完成后推进游标，确保下次只取新增音频。
   *   停止录音时重置为 0，为下次录音做准备。
   * isFinalRef: 停止录音标志。置 true 后分段定时器的回调结果会被丢弃。
   * segBusyRef: 互斥锁，防止并发分段请求。
   */
  const segmentCursorRef = useRef(0)
  const isFinalRef = useRef(false)
  const segBusyRef = useRef(false)
  /** 当前输入框文字的 ref（分段回调中读取最新值） */
  const textRef = useRef('')
  useEffect(() => { textRef.current = text }, [text])

  /* ---- 分段识别定时器 ----
   * 录音期间每 SEGMENT_INTERVAL_MS 检查一次：
   *   新增采样数 >= SEGMENT_MAX_SAMPLES → 立即触发分段识别
   *   新增时长 >= SEGMENT_MIN_DURATION_SEC → 触发分段识别
   * 分段识别结果 **追加** 到输入框（prevText + 本段识别），而非替换
   */
  useEffect(() => {
    if (!isRecording || !onSegmentTranscribe) return

    const intervalId = setInterval(async () => {
      if (segBusyRef.current || isFinalRef.current) return

      const fullAudio = getCurrentAudio()
      if (!fullAudio) return

      /* 计算本次新增的采样数 */
      const newStart = segmentCursorRef.current
      const newSamples = fullAudio.length - newStart

      /* 新增不足 SEGMENT_MIN_DURATION_SEC 且未超 MAX → 等下次 */
      const newDuration = newSamples / 16000
      if (newDuration < SEGMENT_MIN_DURATION_SEC && newSamples < SEGMENT_MAX_SAMPLES) return

      /* 取新增的 slice（最多 3 秒） */
      const sliceStart = newSamples > SEGMENT_MAX_SAMPLES
        ? fullAudio.length - SEGMENT_MAX_SAMPLES
        : newStart
      const newAudio = fullAudio.slice(sliceStart)

      segBusyRef.current = true
      /* 提前更新游标到当前末尾，避免重叠 */
      segmentCursorRef.current = fullAudio.length
      try {
        const result = await onSegmentTranscribe(newAudio.slice(0), textRef.current)
        /* 停录信号触发后，不更新文本（最终转写会覆盖） */
        if (!isFinalRef.current && result !== null) {
          setText(result)
        }
      } finally {
        segBusyRef.current = false
      }
    }, SEGMENT_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [isRecording, onSegmentTranscribe, getCurrentAudio])

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
      /* 1. 立即标记停止，阻止分段回调写入文本 */
      isFinalRef.current = true
      segBusyRef.current = false

      /* 2. 立即取全量快照并行进行最终转写 + 停止录音器 */
      const snapshot = getCurrentAudio()
      const stopPromise = stopRecording()

      if (snapshot && onTranscribeVoice) {
        const hasPreviewText = textRef.current.trim().length > 0
        if (hasPreviewText && USE_BACKGROUND_FINAL_REFINE) {
          void onTranscribeVoice(snapshot.slice(0), { background: true }).then((finalText) => {
            if (finalText) setText(finalText)
          })
        } else {
          const finalText = await onTranscribeVoice(snapshot.slice(0))
          if (finalText) setText(finalText)
        }
      }

      /* 3. 重置游标，为下次录音做准备 */
      segmentCursorRef.current = 0
      isFinalRef.current = false
      await stopPromise
    } else {
      if (onBeforeVoice) {
        const ready = await onBeforeVoice()
        if (!ready) return
      }
      /* 重置所有状态 */
      segmentCursorRef.current = 0
      isFinalRef.current = false
      segBusyRef.current = false
      setText('')
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording, getCurrentAudio, onTranscribeVoice, onBeforeVoice])

  const canSend = Boolean(text.trim()) && !disabled && !isRecording
  const isMac = navigator.platform.includes('Mac')
  const isExpanded = areaHeight !== null

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
            <span className={styles.hintRecording}>
              {text ? t('chat.voiceStreaming') : t('chat.voiceListening')}
            </span>
          ) : (
            <span className={styles.hintShortcut}>{isMac ? '⌘↵' : 'Ctrl↵'}</span>
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
