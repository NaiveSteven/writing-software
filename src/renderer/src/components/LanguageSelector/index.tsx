import React from 'react'
import { useTranslation } from 'react-i18next'
import styles from './LanguageSelector.module.css'
import { LANGUAGE_OPTIONS } from '../../types/language'
import type { LanguageCode, LanguageOption } from '../../types/language'

type SelectorOnChange<T extends string> = {
  bivarianceHack: (lang: T) => void
}['bivarianceHack']

/** LanguageSelector 属性 */
interface LanguageSelectorProps<T extends string = LanguageCode> {
  /** 当前选中语言 */
  value: T
  /** 语言变更回调 */
  onChange: SelectorOnChange<T>
  /** 可选项，默认使用目标语言列表 */
  options?: readonly LanguageOption<T>[]
  className?: string
}

/**
 * 语言选择器
 * 下拉菜单切换 9 种目标翻译语言
 */
export function LanguageSelector<T extends string = LanguageCode>({
  value,
  onChange,
  options,
  className = ''
}: LanguageSelectorProps<T>): React.JSX.Element {
  const { t } = useTranslation()
  const selectOptions = options ?? (LANGUAGE_OPTIONS as unknown as readonly LanguageOption<T>[])

  return (
    <select
      className={`${styles.select} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {selectOptions.map((option) => (
        <option key={option.code} value={option.code}>
          {t(option.labelKey)}
        </option>
      ))}
    </select>
  )
}
