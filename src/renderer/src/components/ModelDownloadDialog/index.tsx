import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './ModelDownloadDialog.module.css'

/** 弹窗状态 */
export type DialogPhase = 'confirm' | 'downloading' | 'done' | 'error'

/** 弹窗操作类型 */
export type DialogAction = 'install' | 'uninstall'

/** ModelDownloadDialog 属性 */
interface ModelDownloadDialogProps {
  /** 是否显示弹窗 */
  visible: boolean
  /** 当前阶段 */
  phase: DialogPhase
  /** 操作类型（安装 or 卸载） */
  action?: DialogAction
  /** 模型名称（用于展示） */
  modelName: string
  /** 下载进度 (0~100) */
  progress: number
  /** 错误信息 */
  errorMessage?: string
  /** 用户点击确认 */
  onConfirm: () => void
  /** 用户点击取消或关闭 */
  onCancel: () => void
}

/**
 * 模型操作确认+进度弹窗
 * 液态玻璃风格的居中弹窗
 * 支持安装/卸载两种操作模式
 */
export const ModelDownloadDialog: React.FC<ModelDownloadDialogProps> = ({
  visible,
  phase,
  action = 'install',
  modelName,
  progress,
  errorMessage,
  onConfirm,
  onCancel
}) => {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  /* ESC 键关闭 */
  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && phase !== 'downloading') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, phase, onCancel])

  if (!visible) return null

  /** 是否为卸载操作 */
  const isUninstall = action === 'uninstall'

  return (
    <div className={styles.overlay} onClick={() => phase !== 'downloading' && onCancel()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 确认阶段 */}
        {phase === 'confirm' && (
          <>
            <h3 className={styles.title}>
              {isUninstall ? t('modelDialog.confirmUninstall') : t('modelDialog.needDownload')}
            </h3>
            <p className={styles.desc}>
              {isUninstall
                ? t('modelDialog.uninstallDesc', { model: modelName })
                : t('modelDialog.confirmDesc', { model: modelName })}
            </p>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onCancel}>
                {t('modelDialog.cancel')}
              </button>
              <button
                className={isUninstall ? styles.dangerConfirmBtn : styles.confirmBtn}
                onClick={onConfirm}
              >
                {isUninstall ? t('modelDialog.confirmUninstallBtn') : t('modelDialog.startDownload')}
              </button>
            </div>
          </>
        )}

        {/* 下载/处理中阶段 */}
        {phase === 'downloading' && (
          <>
            <h3 className={styles.title}>
              {isUninstall ? t('modelDialog.uninstalling') : t('modelDialog.downloading')}
            </h3>
            <p className={styles.modelLabel}>{modelName}</p>
            {!isUninstall && (
              <>
                <div className={styles.progressBar}>
                  <div
                    className={`${styles.progressFill} ${progress >= 100 ? styles.progressFillPulse : ''}`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <p className={styles.progressText}>
                  {progress >= 100
                    ? t('modelDialog.initializing')
                    : t('model.progress', { percent: Math.round(progress) })}
                </p>
              </>
            )}
            {isUninstall && (
              <p className={styles.progressText}>{t('modelDialog.pleaseWait')}</p>
            )}
          </>
        )}

        {/* 完成阶段 */}
        {phase === 'done' && (
          <>
            <h3 className={styles.title}>
              {isUninstall ? t('modelDialog.uninstallSuccess') : t('modelDialog.success')}
            </h3>
            <p className={styles.desc}>
              {isUninstall ? t('modelDialog.uninstallDone') : t('modelDialog.readyToUse')}
            </p>
            <div className={styles.actions}>
              <button className={styles.confirmBtn} onClick={onCancel}>
                {t('modelDialog.ok')}
              </button>
            </div>
          </>
        )}

        {/* 错误阶段 */}
        {phase === 'error' && (
          <>
            <h3 className={`${styles.title} ${styles.errorTitle}`}>
              {isUninstall ? t('modelDialog.uninstallFailed') : t('modelDialog.failed')}
            </h3>
            <p className={styles.desc}>{errorMessage || t('modelDialog.unknownError')}</p>
            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onCancel}>
                {t('modelDialog.close')}
              </button>
              <button className={styles.confirmBtn} onClick={onConfirm}>
                {t('modelDialog.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
