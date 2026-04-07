import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Settings.module.css'
import {
  getAllTranslateModelStatus,
  downloadModel,
  deleteModelCache,
  setTranslateProgressCallback,
  type ModelInfo
} from '../../services/translate'
import {
  WHISPER_MODEL_ID,
  isWhisperCached,
  initWhisper,
  deleteWhisperCache
} from '../../services/whisper'
import { ModelDownloadDialog, type DialogPhase, type DialogAction } from '../../components/ModelDownloadDialog'

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

/** Whisper small q4 量化大小 */
const WHISPER_SIZE_HINT = '~280 MB'

/** opus-mt int8 量化单模型大小（encoder + decoder 共约 105MB） */
const TRANSLATE_SIZE_HINT = '~105 MB'

/**
 * 设置页面
 * 展示所有模型安装状态，支持安装/卸载
 * 使用与 Chat 页同风格的标题栏
 */
export const SettingsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useTranslation()

  /** macOS：红绿灯在左侧，标题栏需要 80px 左缩进，返回按钮放右侧 */
  const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')

  /* 翻译模型列表 */
  const [translateModels, setTranslateModels] = useState<ModelInfo[]>([])
  /* Whisper 模型已缓存 */
  const [whisperCached, setWhisperCached] = useState(false)
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
    const [tModels, wCached] = await Promise.all([
      getAllTranslateModelStatus(),
      isWhisperCached()
    ])
    setTranslateModels(tModels)
    setWhisperCached(wCached)
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

  /**
   * 安装翻译模型（先弹确认，确认后下载）
   */
  const handleInstallTranslate = useCallback(async (modelId: string) => {
    /* 弹确认弹窗 */
    setDialog({
      visible: true,
      phase: 'confirm',
      action: 'install',
      modelName: modelId,
      progress: 0
    })

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

    /* 保存为待执行和重试函数 */
    pendingRef.current = doInstall
    retryRef.current = doInstall
  }, [refreshModels])

  /**
   * 卸载翻译模型（弹确认后执行）
   */
  const handleUninstallTranslate = useCallback(async (modelId: string) => {
    setDialog({
      visible: true,
      phase: 'confirm',
      action: 'uninstall',
      modelName: modelId,
      progress: 0
    })

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

    pendingRef.current = doUninstall
    retryRef.current = doUninstall
  }, [refreshModels])

  /** 安装 Whisper 模型 */
  const handleInstallWhisper = useCallback(async () => {
    setDialog({
      visible: true,
      phase: 'confirm',
      action: 'install',
      modelName: WHISPER_MODEL_ID,
      progress: 0
    })

    const doInstall = async (): Promise<void> => {
      setAction({ modelId: WHISPER_MODEL_ID, type: 'install', progress: 0 })
      try {
        await initWhisper((p) => {
          if (p.status === 'progress' && p.progress !== undefined) {
            const pct = p.progress ?? 0
            setAction((prev) => prev ? { ...prev, progress: pct } : null)
            setDialog((d) => ({ ...d, progress: pct }))
          }
        })
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

    pendingRef.current = doInstall
    retryRef.current = doInstall
  }, [refreshModels])

  /** 卸载 Whisper 模型 */
  const handleUninstallWhisper = useCallback(async () => {
    setDialog({
      visible: true,
      phase: 'confirm',
      action: 'uninstall',
      modelName: WHISPER_MODEL_ID,
      progress: 0
    })

    const doUninstall = async (): Promise<void> => {
      setAction({ modelId: WHISPER_MODEL_ID, type: 'uninstall', progress: 0 })
      try {
        await deleteWhisperCache()
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

    pendingRef.current = doUninstall
    retryRef.current = doUninstall
  }, [refreshModels])

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
            ← {t('settings.back')}
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
              {t('settings.back')}
            </button>
          </div>
        )}
      </header>

      <div className={styles.content}>
        {/* 语音识别模型 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('model.speechModel')}</h2>
          <p className={styles.sectionHint}>{t('settings.speechModelHint')}</p>

          <div className={styles.modelRow}>
            <div className={styles.modelMeta}>
              <span className={styles.modelName}>{WHISPER_MODEL_ID}</span>
              <span className={styles.modelSize}>{WHISPER_SIZE_HINT}</span>
            </div>
            <span className={`${styles.badge} ${whisperCached ? styles.installed : styles.notInstalled}`}>
              {whisperCached ? t('settings.installed') : t('settings.notInstalled')}
            </span>
            <button
              type="button"
              className={`${styles.actionBtn} ${whisperCached ? styles.dangerBtn : styles.primaryBtn}`}
              onClick={whisperCached ? handleUninstallWhisper : handleInstallWhisper}
              disabled={!!action}
            >
              {isActioning(WHISPER_MODEL_ID)
                ? t('model.progress', { percent: Math.round(action?.progress ?? 0) })
                : whisperCached
                  ? t('settings.uninstall')
                  : t('settings.install')}
            </button>
          </div>
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
                      {m.langPair.replace('-', ' → ')}
                    </span>
                    <span className={styles.modelSize}>{TRANSLATE_SIZE_HINT}</span>
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
