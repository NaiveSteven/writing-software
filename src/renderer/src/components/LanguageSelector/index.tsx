import React from 'react'
import { useTranslation } from 'react-i18next'
import styles from './LanguageSelector.module.css'
import { LANGUAGE_OPTIONS } from '../../types/language'
import type { LanguageCode } from '../../types/language'

/** LanguageSelector 属性 */
interface LanguageSelectorProps {
  /** 当前选中语言 */
  value: LanguageCode
  /** 语言变更回调 */
  onChange: (lang: LanguageCode) => void
  className?: string
}

/**
 * 语言选择器
 * 下拉菜单切换 9 种目标翻译语言
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  value,
  onChange,
  className = ''
}) => {
  const { t } = useTranslation()

  return (
    <select
      className={`${styles.select} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as LanguageCode)}
    >
      {LANGUAGE_OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {t(option.labelKey)}
        </option>
      ))}
    </select>
  )
}
