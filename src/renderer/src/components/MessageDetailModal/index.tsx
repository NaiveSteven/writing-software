import React, { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './MessageDetailModal.module.css'
import { GlassButton } from '../GlassButton'
import { LanguageSelector } from '../LanguageSelector'
import { formatTime } from '../../utils/format'
import type { Message } from '../../types/message'
import type { LanguageCode } from '../../types/language'

/** MessageDetailModal 属性 */
interface MessageDetailModalProps {
  /** 需要展示的消息 */
  message: Message
  /** 关闭弹窗 */
  onClose: () => void
  /** 保存原文编辑 */
  onSaveContent: (id: number, content: string) => void
  /** 翻译（切换语言） */
  onTranslate: (id: number, targetLang: LanguageCode) => void
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
  onTranslate
}) => {
  const { t } = useTranslation()

  /* 原文编辑态 */
  const [editContent, setEditContent] = useState(message.content)
  const [dirty, setDirty] = useState(false)

  /* 翻译目标语言 */
  const [targetLang, setTargetLang] = useState<LanguageCode>(
    message.targetLang || 'en'
  )

  /* 同步外部 message 更新（翻译结果回填） */
  useEffect(() => {
    setEditContent(message.content)
    setDirty(false)
  }, [message.content])

  /** 原文内容变更 */
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
    setDirty(e.target.value !== message.content)
  }, [message.content])

  /** 保存原文 */
  const handleSave = useCallback(() => {
    if (!dirty) return
    onSaveContent(message.id, editContent.trim())
    setDirty(false)
  }, [dirty, editContent, message.id, onSaveContent])

  /** 触发翻译 */
  const handleTranslate = useCallback(() => {
    onTranslate(message.id, targetLang)
  }, [message.id, targetLang, onTranslate])

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
              <span className={styles.langInfo}>
                {t('chat.detected', { lang: t(`language.${message.sourceLang}`) })}
              </span>
            </div>
            <textarea
              className={styles.textArea}
              value={editContent}
              onChange={handleContentChange}
              spellCheck={false}
            />
          </div>

          {/* 右侧: 译文 */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={`${styles.panelLabel} ${styles.translationLabel}`}>
                {t('chat.translation')}
              </span>
              <span className={styles.langInfo}>
                {message.targetLang ? `→ ${t(`language.${message.targetLang}`)}` : ''}
              </span>
            </div>
            <div className={styles.translationText}>
              {message.translatedText || (
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
            <LanguageSelector value={targetLang} onChange={setTargetLang} />
            <GlassButton size="sm" variant="primary" onClick={handleTranslate}>
              {t('chat.retranslate')}
            </GlassButton>
          </div>
          <div className={styles.footerRight}>
            {dirty && (
              <span className={styles.saveHint}>{t('detail.unsaved')}</span>
            )}
            <GlassButton
              size="sm"
              variant={dirty ? 'primary' : 'default'}
              onClick={handleSave}
              disabled={!dirty}
            >
              {t('detail.save')}
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  )
}
