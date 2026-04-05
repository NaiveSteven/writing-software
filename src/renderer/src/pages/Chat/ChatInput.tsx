import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { GlassInput } from '../../components/GlassInput'
import { GlassButton } from '../../components/GlassButton'
import { VoiceButton } from '../../components/VoiceButton'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'

/** ChatInput 属性 */
interface ChatInputProps {
  /** 发送文字消息 */
  onSendText: (text: string) => void
  /** 发送语音数据 */
  onSendVoice: (audioData: Float32Array) => void
  /** 是否禁用发送 */
  disabled?: boolean
}

/**
 * 聊天输入区域
 * 包含文字输入框、发送按钮和语音录制按钮
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onSendVoice,
  disabled = false
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const { isRecording, duration, startRecording, stopRecording } = useAudioRecorder()

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
      /* 停止录音，发送音频数据 */
      const audioData = await stopRecording()
      if (audioData) {
        onSendVoice(audioData)
      }
    } else {
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording, onSendVoice])

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputRow}>
        {/* 语音按钮 */}
        <VoiceButton
          isRecording={isRecording}
          duration={duration}
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

      {/* 快捷键提示 */}
      <p className={styles.hint}>
        {t('chat.shortcutHint', {
          shortcut: navigator.platform.includes('Mac') ? '⌘ + Tab' : 'Ctrl + Tab'
        })}
      </p>
    </div>
  )
}
