import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Settings.module.css'
import {
  getAllTranslateModelStatus,
  downloadModel,
  deleteModelCache,
  getTranslateModelMeta,
  setTranslateProgressCallback,
  type ModelInfo
} from '../../services/translate'
import {
  getAllWhisperModelStatus,
  initWhisper,
  deleteWhisperCache,
  type WhisperModelStatusInfo
} from '../../services/whisper'
import {
  getWhisperModelMeta,
  type WhisperModelId
} from '../../services/whisper-models'
import { useSettingStore } from '../../stores/setting-store'
import { ModelDownloadDialog, type DialogPhase, type DialogAction } from '../../components/ModelDownloadDialog'
import { resolveLocalizedLabel } from '../../utils/localize-label'
import { isMacPlatform } from '../../utils/platform'

/** 语音模型展示状态 */
interface SpeechModelInfo extends WhisperModelStatusInfo {
  labelKey: string
  hintKey: string
  sizeHint: string
}

/** 模型操作中状态 */
interface ModelAction {
  modelId: string
  type: 'install' | 'uninstall'
  progress: number
}

/** 下载弹窗本地状态 */
interface LocalDialogState {
  visible: boolean
  phase: DialogPhase
  action: DialogAction
  modelName: string
  progress: number
  errorMessage?: string
}

/** 弹窗初始状态 */
const DIALOG_INIT: LocalDialogState = {
  visible: false,
  phase: 'confirm',
  action: 'install',
  modelName: '',
  progress: 0
}

/**
 * 设置页面
 * 展示所有模型安装状态，支持安装/卸载
 * 使用与 Chat 页同风格的标题栏
 */
export const SettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useTranslation()
  const { speechModelId, setSpeechModelId } = useSettingStore()

  /** macOS：红绿灯在左侧，标题栏需要 80px 左缩进，返回按钮放右侧 */
  const isMac = isMacPlatform()

  /* 翻译模型列表 */
  const [translateModels, setTranslateModels] = useState<ModelInfo[]>([])
  /* Whisper 模型列表 */
  const [whisperModels, setWhisperModels] = useState<SpeechModelInfo[]>([])
  /* 当前操作中的模型 */
  const [action, setAction] = useState<ModelAction | null>(null)
  /* 是否初始加载完 */
  const [loaded, setLoaded] = useState(false)
  /* 下载确认弹窗 */
  const [dialog, setDialog] = useState<LocalDialogState>(DIALOG_INIT)
  /* 待执行的操作（等用户确认后执行） */
  const pendingRef = React.useRef<(() => Promise<void>) | null>(null)
  /* 保存重试函数 */
  const retryRef = React.useRef<(() => Promise<void>) | null>(null)

  /** 刷新模型状态 */
  const refreshModels = useCallback(async () => {
    const [tModels, whisperStatuses] = await Promise.all([
      getAllTranslateModelStatus(),
      getAllWhisperModelStatus()
    ])
    setTranslateModels(tModels)
    setWhisperModels(
      whisperStatuses.map((status) => ({
        ...status,
        ...getWhisperModelMeta(status.modelId)
      }))
    )
    setLoaded(true)
  }, [])

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  /** 弹窗确认 → 执行待操作 */
  const handleDialogConfirm = useCallback(async () => {
    if (dialog.phase === 'confirm') {
      /* 首次确认：执行待操作 */
      const fn = pendingRef.current
      if (!fn) return
      pendingRef.current = null
      setDialog((d) => ({ ...d, phase: 'downloading', progress: 0 }))
      await fn()
    } else if (dialog.phase === 'error') {
      /* 重试：重新执行待操作 */
      const fn = retryRef.current
      if (!fn) return
      setDialog((d) => ({ ...d, phase: 'downloading', progress: 0, errorMessage: undefined }))
      await fn()
    }
  }, [dialog.phase])

  /** 弹窗取消 */
  const handleDialogCancel = useCallback(() => {
    pendingRef.current = null
    retryRef.current = null
    setDialog(DIALOG_INIT)
    setAction(null)
  }, [])

  /** 统一注册一次需要用户确认的模型操作。 */
  const scheduleDialogAction = useCallback((
    actionType: DialogAction,
    modelName: string,
    task: () => Promise<void>
  ): void => {
    setDialog({
      visible: true,
      phase: 'confirm',
      action: actionType,
      modelName,
      progress: 0
    })
    pendingRef.current = task
    retryRef.current = task
  }, [])

  /**
   * 安装翻译模型（先弹确认，确认后下载）
   */
  const handleInstallTranslate = useCallback(async (modelId: string) => {
    const modelName = resolveLocalizedLabel(getTranslateModelMeta(modelId), modelId, t)

    /** 执行下载（可被重试调用） */
    const doInstall = async (): Promise<void> => {
      setAction({ modelId, type: 'install', progress: 0 })

      setTranslateProgressCallback((p) => {
        if (p.modelId === modelId && p.status === 'progress' && p.progress !== undefined) {
          const pct = p.progress ?? 0
          setAction((prev) => prev ? { ...prev, progress: pct } : null)
          setDialog((d) => ({ ...d, progress: pct }))
        }
      })

      try {
        await downloadModel(modelId)
        setTranslateProgressCallback(null)
        await refreshModels()
        setDialog((d) => ({ ...d, phase: 'done' }))
        retryRef.current = null
      } catch (err) {
        setTranslateProgressCallback(null)
        /* 刷新状态，确保安装失败后不显示"已安装" */
        await refreshModels()
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      } finally {
        setAction(null)
      }
    }

    scheduleDialogAction('install', modelName, doInstall)
  }, [refreshModels, scheduleDialogAction, t])

  /**
   * 卸载翻译模型（弹确认后执行）
   */
  const handleUninstallTranslate = useCallback(async (modelId: string) => {
    const modelName = resolveLocalizedLabel(getTranslateModelMeta(modelId), modelId, t)

    const doUninstall = async (): Promise<void> => {
      setAction({ modelId, type: 'uninstall', progress: 0 })
      try {
        await deleteModelCache(modelId)
        await refreshModels()
        setDialog((d) => ({ ...d, phase: 'done' }))
        retryRef.current = null
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      } finally {
        setAction(null)
      }
    }

    scheduleDialogAction('uninstall', modelName, doUninstall)
  }, [refreshModels, scheduleDialogAction, t])

  /** 安装 Whisper 模型 */
  const handleInstallWhisper = useCallback(async (modelId: WhisperModelId) => {
    const modelMeta = getWhisperModelMeta(modelId)
    const modelName = resolveLocalizedLabel(modelMeta, modelId, t)

    const doInstall = async (): Promise<void> => {
      setAction({ modelId, type: 'install', progress: 0 })
      try {
        await initWhisper((p) => {
          if (p.status === 'progress' && p.progress !== undefined) {
            const pct = p.progress ?? 0
            setAction((prev) => prev ? { ...prev, progress: pct } : null)
            setDialog((d) => ({ ...d, progress: pct }))
          }
        }, modelId)
        await refreshModels()
        setDialog((d) => ({ ...d, phase: 'done' }))
        retryRef.current = null
      } catch (err) {
        /* 刷新状态，确保安装失败后不显示"已安装" */
        await refreshModels()
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      } finally {
        setAction(null)
      }
    }

    scheduleDialogAction('install', modelName, doInstall)
  }, [refreshModels, scheduleDialogAction, t])

  /** 卸载 Whisper 模型 */
  const handleUninstallWhisper = useCallback(async (modelId: WhisperModelId) => {
    const modelMeta = getWhisperModelMeta(modelId)
    const modelName = resolveLocalizedLabel(modelMeta, modelId, t)

    const doUninstall = async (): Promise<void> => {
      setAction({ modelId, type: 'uninstall', progress: 0 })
      try {
        await deleteWhisperCache(modelId)
        if (speechModelId === modelId) {
          const nextModel = whisperModels.find((model) => model.modelId !== modelId && model.cached)
          if (nextModel) {
            setSpeechModelId(nextModel.modelId)
          }
        }
        await refreshModels()
        setDialog((d) => ({ ...d, phase: 'done' }))
        retryRef.current = null
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        setDialog((d) => ({ ...d, phase: 'error', errorMessage: errMsg }))
      } finally {
        setAction(null)
      }
    }

    scheduleDialogAction('uninstall', modelName, doUninstall)
  }, [refreshModels, scheduleDialogAction, setSpeechModelId, speechModelId, t, whisperModels])

  /** 判断某模型是否正在操作中 */
  const isActioning = (modelId: string): boolean => action?.modelId === modelId

  return (
    <div className={styles.container}>
      {/* 标题栏 — 按平台调整布局：macOS 红绿灯左置 / Windows 返回按钮左置 */}
      <header className={`${styles.titleBar} ${isMac ? '' : styles.titleBarWin} drag-region`}>
        {/* Windows：返回按钮在左侧（与 Windows 标题栏约定一致） */}
        {!isMac && (
          <button
            type="button"
            className={`${styles.backBtn} no-drag`}
            onClick={onBack}
            title={t('settings.back')}
          >
            <span className={styles.backIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </span>
            <span className={styles.backText}>{t('settings.back')}</span>
          </button>
        )}

        <h1 className={styles.title}>{t('settings.title')}</h1>

        {/* macOS：返回按钮在右侧（避让左侧红绿灯） */}
        {isMac && (
          <div className={`${styles.headerActions} no-drag`}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={onBack}
              title={t('settings.back')}
            >
              <span className={styles.backIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
              <span className={styles.backText}>{t('settings.back')}</span>
            </button>
          </div>
        )}
      </header>

      <div className={styles.content}>
        {/* 语音识别模型 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('model.speechModel')}</h2>
          <p className={styles.sectionHint}>{t('settings.speechModelHint')}</p>

          {whisperModels.map((model) => (
            <div key={model.modelId} className={styles.modelRow}>
              <div className={styles.modelMetaStack}>
                <div className={styles.modelMeta}>
                  <span className={styles.modelName}>{resolveLocalizedLabel(model, model.modelId, t)}</span>
                  <span className={styles.modelSize}>{model.sizeHint}</span>
                </div>
                <p className={styles.modelDesc}>{t(model.hintKey)}</p>
              </div>

              <div className={styles.badgeGroup}>
                <span className={`${styles.badge} ${model.cached ? styles.installed : styles.notInstalled}`}>
                  {model.cached ? t('settings.installed') : t('settings.notInstalled')}
                </span>
                {speechModelId === model.modelId && (
                  <span className={`${styles.badge} ${styles.activeBadge}`}>
                    {t('settings.inUse')}
                  </span>
                )}
              </div>

              <div className={styles.actionGroup}>
                {model.cached && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                    onClick={() => setSpeechModelId(model.modelId)}
                    disabled={!!action || speechModelId === model.modelId}
                  >
                    {speechModelId === model.modelId ? t('settings.inUse') : t('settings.useNow')}
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.actionBtn} ${model.cached ? styles.dangerBtn : styles.primaryBtn}`}
                  onClick={() =>
                    model.cached
                      ? handleUninstallWhisper(model.modelId)
                      : handleInstallWhisper(model.modelId)
                  }
                  disabled={!!action}
                >
                  {isActioning(model.modelId)
                    ? t('model.progress', { percent: Math.round(action?.progress ?? 0) })
                    : model.cached
                      ? t('settings.uninstall')
                      : t('settings.install')}
                </button>
              </div>
            </div>
          ))}
        </section>

        {/* 翻译模型列表 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('model.translateModel')}</h2>
          <p className={styles.sectionHint}>{t('settings.translateModelHint')}</p>

          {!loaded ? (
            <p className={styles.loading}>{t('settings.loading')}</p>
          ) : (
            <div className={styles.modelGrid}>
              {translateModels.map((m) => (
                <div key={m.modelId} className={styles.modelRow}>
                  <div className={styles.modelMeta}>
                    <span className={styles.modelName}>
                      {resolveLocalizedLabel(m, m.modelId, t)}
                    </span>
                    <span className={styles.modelSize}>{m.sizeHint}</span>
                  </div>
                  <span className={`${styles.badge} ${m.cached ? styles.installed : styles.notInstalled}`}>
                    {m.cached ? t('settings.installed') : t('settings.notInstalled')}
                  </span>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${m.cached ? styles.dangerBtn : styles.primaryBtn}`}
                    onClick={() =>
                      m.cached
                        ? handleUninstallTranslate(m.modelId)
                        : handleInstallTranslate(m.modelId)
                    }
                    disabled={!!action}
                  >
                    {isActioning(m.modelId)
                      ? t('model.progress', { percent: Math.round(action?.progress ?? 0) })
                      : m.cached
                        ? t('settings.uninstall')
                        : t('settings.install')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 下载/卸载确认弹窗 */}
      <ModelDownloadDialog
        visible={dialog.visible}
        phase={dialog.phase}
        action={dialog.action}
        modelName={dialog.modelName}
        progress={dialog.progress}
        errorMessage={dialog.errorMessage}
        onConfirm={handleDialogConfirm}
        onCancel={handleDialogCancel}
      />
    </div>
  )
}
