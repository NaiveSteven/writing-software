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
  /** 发送语音数据 */
  onSendVoice: (audioData: Float32Array) => void
  /** 录音前校验（如检查语音模型），返回 false 阻止录音 */
  onBeforeVoice?: () => Promise<boolean>
  /** 是否禁用发送 */
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
 * 聊天输入区域
 * 包含文字输入框、发送按钮、语音按钮、翻译控制
 * 语言选择器始终显示，翻译按钮点击后由父组件校验模型再切换
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onSendVoice,
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

  /** 切换语音录制（录音前先校验模型） */
  const handleVoiceToggle = useCallback(async (): Promise<void> => {
    if (isRecording) {
      /* 停止录音，发送音频数据 */
      const audioData = await stopRecording()
      if (audioData) {
        onSendVoice(audioData)
      }
    } else {
      /* 开始录音前先校验模型是否就绪 */
      if (onBeforeVoice) {
        const ready = await onBeforeVoice()
        if (!ready) return
      }
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording, onSendVoice, onBeforeVoice])

  return (
    <div className={styles.inputArea}>
      {/* 翻译控制栏：目标语言选择（始终显示）+ 翻译开关 Switch */}
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

      <div className={styles.inputRow}>
        {/* 语音按钮 */}
        <VoiceButton
          isRecording={isRecording}
          duration={duration}
          volume={volume}
          onClick={handleVoiceToggle}
        />

        {/* 文字输入框 */}
        <GlassInput
          value={text}
          onChange={setText}
          placeholder={t('chat.inputPlaceholder')}
          onSubmit={handleSend}
          disabled={disabled || isRecording}
          multiline
        />

        {/* 发送按钮 */}
        <GlassButton
          variant="primary"
          onClick={handleSend}
          disabled={!text.trim() || disabled || isRecording}
        >
          {t('chat.send')}
        </GlassButton>
      </div>

      {/* 快捷键提示 / 识别状态 */}
      {disabled ? (
        <p className={`${styles.hint} ${styles.transcribingHint}`}>
          {t('chat.transcribing')}
        </p>
      ) : (
        <p className={styles.hint}>
          {t('chat.shortcutHint', {
            shortcut: navigator.platform.includes('Mac') ? '⌘ + Tab' : 'Ctrl + Tab'
          })}
        </p>
      )}
    </div>
  )
}
