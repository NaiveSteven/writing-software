/** 模型下载状态 */
export type ModelStatus = 'not-downloaded' | 'downloading' | 'ready' | 'error'

/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  status: ModelStatus
  /** 下载进度百分比 (0-100) */
  progress: number
}
