import { ipcMain } from 'electron'
import { DatabaseService } from '../services/database'
import type { CreateMessageParams, UpdateTranslationParams } from '../services/database'
import { TranslateService } from '../services/translate-service'
import { ModelDownloader } from '../services/model-downloader'

/**
 * IPC 通道名称常量
 * 统一管理所有通道, 避免拼写错误
 */
export const IPC_CHANNELS = {
  /* 消息相关 */
  MESSAGE_CREATE: 'message:create',
  MESSAGE_GET_ALL: 'message:getAll',
  MESSAGE_UPDATE_TRANSLATION: 'message:updateTranslation',

  /* 翻译相关 */
  TRANSLATE_TEXT: 'translate:text',

  /* 语音识别相关 */
  WHISPER_TRANSCRIBE: 'whisper:transcribe',

  /* 模型管理 */
  MODEL_CHECK: 'model:check',
  MODEL_DOWNLOAD: 'model:download',
  MODEL_LIST: 'model:list'
} as const

/** 注册所有 IPC 处理器 */
export function registerIpcHandlers(): void {
  const db = DatabaseService.getInstance()
  const translator = TranslateService.getInstance()
  const modelDownloader = new ModelDownloader()

  /* --- 消息 CRUD --- */

  /** 创建消息 */
  ipcMain.handle(IPC_CHANNELS.MESSAGE_CREATE, async (_event, params: CreateMessageParams) => {
    await db.ready()
    return db.createMessage(params)
  })

  /** 获取所有消息 */
  ipcMain.handle(IPC_CHANNELS.MESSAGE_GET_ALL, async () => {
    await db.ready()
    return db.getAllMessages()
  })

  /** 更新消息翻译 */
  ipcMain.handle(
    IPC_CHANNELS.MESSAGE_UPDATE_TRANSLATION,
    async (_event, params: UpdateTranslationParams) => {
      await db.ready()
      return db.updateTranslation(params)
    }
  )

  /* --- 翻译 --- */

  /** 翻译文本 */
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_TEXT,
    async (_event, text: string, sourceLang: string, targetLang: string) => {
      return translator.translate(text, sourceLang, targetLang)
    }
  )

  /* --- 模型管理 --- */

  /** 检查模型是否已下载 */
  ipcMain.handle(IPC_CHANNELS.MODEL_CHECK, (_event, modelId: string) => {
    return modelDownloader.isModelDownloaded(modelId)
  })

  /** 获取已下载模型列表 */
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, () => {
    return modelDownloader.getDownloadedModels()
  })

  /** 下载模型 */
  ipcMain.handle(
    IPC_CHANNELS.MODEL_DOWNLOAD,
    async (event, url: string, modelId: string) => {
      return modelDownloader.downloadModel(url, modelId, (progress) => {
        /* 推送下载进度到渲染进程 */
        event.sender.send('model:download-progress', progress)
      })
    }
  )
}
