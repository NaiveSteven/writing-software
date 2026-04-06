import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { GlassInput } from '../../components/GlassInput'
import { GlassButton } from '../../components/GlassButton'
import { VoiceButton } from '../../components/VoiceButton'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { LanguageSelector } from '../../components/LanguageSelector'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import type { LanguageCode } from '../../types/language'

/** ChatInput 属性 */
interface ChatInputProps {
  /** 发送文字消息 */
  onSendText: (text: string) => void
  /**
   * 语音识别完成后的回调：转写音频 → 返回识别文字
   * undefined 时语音功能禁用
   */
  onTranscribeVoice?: (audioData: Float32Array) => Promise<string | null>
  /** 录音前校验（如检查语音模型），返回 false 阻止录音 */
  onBeforeVoice?: () => Promise<boolean>
  /** 是否禁用输入（转写中） */
  disabled?: boolean
  /** 翻译开关状态 */
  translateEnabled: boolean
  /** 切换翻译开关（包含模型校验逻辑，外部实现） */
  onToggleTranslate: () => void
  /** 当前目标语言 */
  targetLang: LanguageCode
  /** 变更目标语言 */
  onTargetLangChange: (lang: LanguageCode) => void
}

/**
 * 聊天输入区域（重设计版）
 * 文字输入框宽屏展示，自动撑高；语音与发送按钮移至底部行
 * 语音识别结果回填到输入框，用户可二次编辑后再发送
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onTranscribeVoice,
  onBeforeVoice,
  disabled = false,
  translateEnabled,
  onToggleTranslate,
  targetLang,
  onTargetLangChange
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const { isRecording, duration, volume, startRecording, stopRecording } = useAudioRecorder()

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
      /* 停止录音，等待 UI 更新后再转写 */
      const audioData = await stopRecording()
      if (audioData && onTranscribeVoice) {
        /* 转写结果回填输入框，用户可编辑后发送 */
        const transcribed = await onTranscribeVoice(audioData)
        if (transcribed) setText(transcribed)
      }
    } else {
      /* 开始录音前先校验模型是否就绪 */
      if (onBeforeVoice) {
        const ready = await onBeforeVoice()
        if (!ready) return
      }
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording, onTranscribeVoice, onBeforeVoice])

  const canSend = Boolean(text.trim()) && !disabled && !isRecording

  return (
    <div className={styles.inputArea}>
      {/* 翻译控制栏 */}
      <div className={styles.translateBar}>
        <div className={styles.langSelect}>
          <span className={styles.langLabel}>{t('translate.targetLang')}:</span>
          <LanguageSelector value={targetLang} onChange={onTargetLangChange} />
        </div>
        <ToggleSwitch
          checked={translateEnabled}
          onChange={onToggleTranslate}
          labelOn={t('translate.on')}
          labelOff={t('translate.off')}
        />
      </div>

      {/* 输入卡片：全宽 textarea + 底部操作行 */}
      <div className={styles.inputCard}>
        {/* 多行文字输入框，自动撑高 */}
        <GlassInput
          value={text}
          onChange={setText}
          placeholder={t('chat.inputPlaceholder')}
          onSubmit={handleSend}
          disabled={disabled || isRecording}
          multiline
          className={styles.mainTextarea}
        />

        {/* 底部操作行：语音 | 状态提示 | 发送 */}
        <div className={styles.inputActions}>
          {/* 语音按钮（onTranscribeVoice 未传则隐藏） */}
          {onTranscribeVoice && (
            <VoiceButton
              isRecording={isRecording}
              duration={duration}
              volume={volume}
              onClick={handleVoiceToggle}
            />
          )}

          {/* 中间状态提示 */}
          <div className={styles.inputHint}>
            {disabled ? (
              <span className={styles.transcribingHint}>{t('chat.transcribing')}</span>
            ) : (
              <span className={styles.shortcutHint}>
                {t('chat.shortcutHint', {
                  shortcut: navigator.platform.includes('Mac') ? '⌘↵' : 'Ctrl↵'
                })}
              </span>
            )}
          </div>

          {/* 发送按钮 */}
          <GlassButton
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
          >
            {t('chat.send')}
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
