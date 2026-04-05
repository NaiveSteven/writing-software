import React from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Chat.module.css'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import { LanguageSelector } from '../../components/LanguageSelector'
import type { LanguageCode } from '../../types/language'

/** TranslationPanel 属性 */
interface TranslationPanelProps {
  /** 翻译开关状态 */
  enabled: boolean
  /** 切换翻译开关 */
  onToggle: () => void
  /** 当前目标语言 */
  targetLang: LanguageCode
  /** 变更目标语言 */
  onTargetLangChange: (lang: LanguageCode) => void
}

/**
 * 翻译控制面板
 * iOS 风格开关 + 目标语言选择
 */
export const TranslationPanel: React.FC<TranslationPanelProps> = ({
  enabled,
  onToggle,
  targetLang,
  onTargetLangChange
}) => {
  const { t } = useTranslation()

  return (
    <div className={styles.translationPanel}>
      {/* iOS 风格翻译开关 */}
      <ToggleSwitch
        checked={enabled}
        onChange={onToggle}
        labelOn={t('translate.on')}
        labelOff={t('translate.off')}
      />

      {/* 目标语言选择（仅翻译开启时显示） */}
      {enabled && (
        <div className={styles.langSelect}>
          <span className={styles.langLabel}>{t('translate.targetLang')}:</span>
          <LanguageSelector value={targetLang} onChange={onTargetLangChange} />
        </div>
      )}
    </div>
  )
}
