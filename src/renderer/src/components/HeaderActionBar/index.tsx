import React from 'react'
import styles from './HeaderActionBar.module.css'

/** 顶部动作条属性 */
interface HeaderActionBarProps {
  /** 当前主题 */
  theme: 'light' | 'dark'
  /** 当前界面语言 */
  uiLang: 'zh-CN' | 'en-US'
  /** 打开设置 */
  onOpenSettings: () => void
  /** 切换主题 */
  onToggleTheme: () => void
  /** 切换界面语言 */
  onToggleUiLang: () => void
  /** 设置按钮标题 */
  settingsTitle: string
  /** 主题按钮标题 */
  themeTitle: string
  /** 语言按钮标题 */
  languageTitle: string
}

/** 设置图标 */
function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.06.06a1.8 1.8 0 0 1 0 2.55 1.8 1.8 0 0 1-2.55 0l-.06-.06a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.92V19.5A1.8 1.8 0 0 1 13.5 21.3h-3A1.8 1.8 0 0 1 8.7 19.5v-.12a1 1 0 0 0-.64-.93 1 1 0 0 0-1.08.2l-.1.08a1.8 1.8 0 0 1-2.55 0 1.8 1.8 0 0 1 0-2.55l.08-.08a1 1 0 0 0 .2-1.08 1 1 0 0 0-.92-.64H3.5A1.8 1.8 0 0 1 1.7 12.6v-1.2A1.8 1.8 0 0 1 3.5 9.6h.12a1 1 0 0 0 .92-.64 1 1 0 0 0-.2-1.08l-.08-.08a1.8 1.8 0 0 1 0-2.55 1.8 1.8 0 0 1 2.55 0l.1.08a1 1 0 0 0 1.08.2 1 1 0 0 0 .64-.93V4.5A1.8 1.8 0 0 1 10.5 2.7h3A1.8 1.8 0 0 1 15.3 4.5v.12a1 1 0 0 0 .6.92 1 1 0 0 0 1.1-.2l.06-.06a1.8 1.8 0 0 1 2.55 0 1.8 1.8 0 0 1 0 2.55l-.06.06a1 1 0 0 0-.2 1.1 1 1 0 0 0 .92.6h.12a1.8 1.8 0 0 1 1.8 1.8v1.2a1.8 1.8 0 0 1-1.8 1.8h-.12a1 1 0 0 0-.92.6Z" />
    </svg>
  )
}

/** 顶部统一动作条 */
export const HeaderActionBar: React.FC<HeaderActionBarProps> = ({
  theme,
  uiLang,
  onOpenSettings,
  onToggleTheme,
  onToggleUiLang,
  settingsTitle,
  themeTitle,
  languageTitle
}) => {
  return (
    <div className={styles.dock} role="toolbar" aria-label="window actions">
      <button
        type="button"
        className={styles.action}
        onClick={onOpenSettings}
        title={settingsTitle}
        aria-label={settingsTitle}
      >
        <span className={styles.icon} aria-hidden="true">
          <SettingsIcon />
        </span>
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={styles.action}
        data-theme-mode={theme}
        onClick={onToggleTheme}
        title={themeTitle}
        aria-label={themeTitle}
      >
        <span className={styles.themeStack} aria-hidden="true">
          <span className={`${styles.themeIcon} ${styles.sunIcon}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.12" />
              <path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46" />
            </svg>
          </span>
          <span className={`${styles.themeIcon} ${styles.moonIcon}`}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.55 2.75a1 1 0 0 1 .72 1.7 7.35 7.35 0 1 0 4.18 13.28 1 1 0 0 1 1.38 1.28 9.35 9.35 0 1 1-6.98-16.31 1 1 0 0 1 .7.05Z" />
            </svg>
          </span>
        </span>
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={`${styles.action} ${styles.langAction}`}
        onClick={onToggleUiLang}
        title={languageTitle}
        aria-label={languageTitle}
      >
        <span className={styles.langText}>{uiLang === 'zh-CN' ? 'EN' : '中'}</span>
      </button>
    </div>
  )
}
