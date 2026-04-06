import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './MessageDetailModal.module.css'
import { GlassButton } from '../GlassButton'
import { LanguageSelector } from '../LanguageSelector'
import { formatTime, copyToClipboard } from '../../utils/format'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'

/** MessageDetailModal 属性 */
interface MessageDetailModalProps {
  /** 需要展示的消息 */
  message: Message
  /** 关闭弹窗 */
  onClose: () => void
  /** 保存原文编辑（失焦时自动触发） */
  onSaveContent: (id: number, content: string) => void
  /** 翻译（切换语言） */
  onTranslate: (id: number, targetLang: LanguageCode) => void
  /** 当前全局目标语言 */
  currentTargetLang: LanguageCode
  /** 修改全局目标语言（选择器变化时同步） */
  onTargetLangChange: (lang: LanguageCode) => void
  /** 是否正在翻译中 */
  isTranslating?: boolean
}

/**
 * 消息详情弹窗
 * 左侧: 可编辑的原文
 * 右侧: 译文 + 目标语言切换
 */
export const MessageDetailModal: React.FC<MessageDetailModalProps> = ({
  message,
  onClose,
  onSaveContent,
  onTranslate,
  currentTargetLang,
  onTargetLangChange,
  isTranslating = false
}) => {
  const { t } = useTranslation()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* 原文编辑态 */
  const [editContent, setEditContent] = useState(message.content)

  /* 翻译目标语言：优先使用消息已有的目标语言，否则用全局目标语言 */
  const [targetLang, setTargetLangLocal] = useState<LanguageCode>(
    message.targetLang || currentTargetLang
  )

  /* 复制状态：原文 | 译文 */
  const [copiedOriginal, setCopiedOriginal] = useState(false)
  const [copiedTranslation, setCopiedTranslation] = useState(false)

  /* 同步外部 message 更新（翻译结果回填） */
  useEffect(() => {
    setEditContent(message.content)
  }, [message.content])

  /** 原文内容变更（无保存按钮，内容变化不走自动保存，仅 blur 时保存） */
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
  }, [])

  /** 失焦自动保存（只有内容变化时才保存） */
  const handleContentBlur = useCallback(() => {
    const trimmed = editContent.trim()
    if (trimmed && trimmed !== message.content) {
      onSaveContent(message.id, trimmed)
    }
  }, [editContent, message.content, message.id, onSaveContent])

  /** 语言选择变化 → 同步到全局 targetLang */
  const handleLangChange = useCallback((lang: LanguageCode) => {
    setTargetLangLocal(lang)
    onTargetLangChange(lang)
  }, [onTargetLangChange])

  /** 触发翻译 */
  const handleTranslate = useCallback(() => {
    onTranslate(message.id, targetLang)
  }, [message.id, targetLang, onTranslate])

  /** 复制原文 */
  const handleCopyOriginal = useCallback(async () => {
    const success = await copyToClipboard(editContent)
    if (success) {
      setCopiedOriginal(true)
      setTimeout(() => setCopiedOriginal(false), 1500)
    }
  }, [editContent])

  /** 复制译文 */
  const handleCopyTranslation = useCallback(async () => {
    if (!message.translatedText) return
    const success = await copyToClipboard(message.translatedText)
    if (success) {
      setCopiedTranslation(true)
      setTimeout(() => setCopiedTranslation(false), 1500)
    }
  }, [message.translatedText])

  /* 清除定时器 */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  /** ESC 关闭 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      {/* 阻止点击冒泡，避免点击弹窗内部关闭 */}
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 顶部栏 */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>{t('detail.title')}</span>
            <span className={styles.meta}>
              {formatTime(message.createdAt)}
              {message.inputType === 'voice' && ' · 🎙'}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 左右分栏 */}
        <div className={styles.body}>
          {/* 左侧: 原文（可编辑） */}
          <div className={`${styles.panel} ${styles.panelLeft}`}>
            <div className={styles.panelHeader}>
              <span className={`${styles.panelLabel} ${styles.originalLabel}`}>
                {t('chat.original')}
              </span>
              <div className={styles.panelHeaderRight}>
                <span className={styles.langInfo}>
                  {t('chat.detected', { lang: t(`language.${message.sourceLang}`) })}
                </span>
                <button
                  type="button"
                  className={`${styles.copyBtn} ${copiedOriginal ? styles.copyBtnCopied : ''}`}
                  onClick={handleCopyOriginal}
                  title={t('detail.copyOriginal')}
                >
                  {copiedOriginal ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  )}
                  <span>{copiedOriginal ? t('detail.copied') : t('detail.copyOriginal')}</span>
                </button>
              </div>
            </div>
            <textarea
              className={styles.textArea}
              value={editContent}
              onChange={handleContentChange}
              onBlur={handleContentBlur}
              spellCheck={false}
              placeholder={t('detail.editHint')}
            />
          </div>

          {/* 右侧: 译文 */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={`${styles.panelLabel} ${styles.translationLabel}`}>
                {t('chat.translation')}
              </span>
              <div className={styles.panelHeaderRight}>
                <span className={styles.langInfo}>
                  {message.targetLang
                    ? `→ ${t(`language.${message.targetLang}`)}`
                    : ''}
                </span>
                {isTranslating ? (
                  <span className={styles.translatingBadge}>{t('translate.translating')}</span>
                ) : message.translatedText ? (
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copiedTranslation ? styles.copyBtnCopied : ''}`}
                    onClick={handleCopyTranslation}
                    title={t('detail.copyTranslation')}
                  >
                    {copiedTranslation ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    )}
                    <span>{copiedTranslation ? t('detail.copied') : t('detail.copyTranslation')}</span>
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`${styles.translationText} ${isTranslating ? styles.translationTextLoading : ''}`}>
              {isTranslating ? (
                <div className={styles.skeletonLines}>
                  <div className={styles.skeletonLine} style={{ width: '82%' }} />
                  <div className={styles.skeletonLine} style={{ width: '66%' }} />
                  <div className={styles.skeletonLine} style={{ width: '74%' }} />
                </div>
              ) : message.translatedText ? (
                message.translatedText
              ) : (
                <span className={styles.emptyTranslation}>
                  {t('detail.noTranslation')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.translateLabel}>{t('translate.targetLang')}:</span>
            <LanguageSelector value={targetLang} onChange={handleLangChange} />
            <GlassButton size="sm" variant="primary" onClick={handleTranslate} disabled={isTranslating}>
              {t('chat.retranslate')}
            </GlassButton>
          </div>
          <p className={styles.autoSaveHint}>{t('detail.autoSaveHint')}</p>
        </div>
      </div>
    </div>
  )
}
