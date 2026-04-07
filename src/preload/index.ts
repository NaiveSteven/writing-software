import { contextBridge, ipcRenderer } from 'electron'

/** 消息创建参数 */
interface CreateMessageParams {
  content: string
  sourceLang: string
  inputType: 'text' | 'voice'
}

/** 翻译更新参数 */
interface UpdateTranslationParams {
  id: number
  translatedText: string
  targetLang: string
}

/** 模型下载进度 */
interface DownloadProgress {
  modelId: string
  percent: number
  downloadedBytes: number
  totalBytes: number
}

const api = {
  /* --- 消息操作 --- */
  createMessage: (params: CreateMessageParams) =>
    ipcRenderer.invoke('message:create', params),

  getAllMessages: () =>
    ipcRenderer.invoke('message:getAll'),

  updateTranslation: (params: UpdateTranslationParams) =>
    ipcRenderer.invoke('message:updateTranslation', params),

  deleteMessage: (id: number) =>
    ipcRenderer.invoke('message:delete', id),

  updateContent: (id: number, content: string) =>
    ipcRenderer.invoke('message:updateContent', id, content),

  /* --- 语音识别 --- */
  transcribeAudio: (audioData: Float32Array) =>
    ipcRenderer.invoke('whisper:transcribe', audioData),

  /* --- 模型管理 --- */
  checkModel: (modelId: string) =>
    ipcRenderer.invoke('model:check', modelId),

  listModels: () =>
    ipcRenderer.invoke('model:list'),

  downloadModel: (url: string, modelId: string) =>
    ipcRenderer.invoke('model:download', url, modelId),

  /** 监听模型下载进度 */
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('model:download-progress', listener)
    /* 返回取消监听函数 */
    return () => ipcRenderer.removeListener('model:download-progress', listener)
  }
}

/** 暴露 API 类型 */
export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
