import { existsSync, mkdirSync, createWriteStream, readdirSync } from 'fs'
import { join } from 'path'
import { getModelsPath } from '../utils/paths'
import { net } from 'electron'

/** 模型下载进度回调 */
export interface DownloadProgress {
  modelId: string
  percent: number
  downloadedBytes: number
  totalBytes: number
}

/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  size: string
  downloaded: boolean
}

/**
 * 模型下载管理器
 * 负责从 HuggingFace 按需下载语音识别和翻译模型
 */
export class ModelDownloader {
  private modelsDir: string

  constructor() {
    this.modelsDir = getModelsPath()
    mkdirSync(this.modelsDir, { recursive: true })
  }

  /** 检查模型是否已下载 */
  isModelDownloaded(modelId: string): boolean {
    const modelDir = join(this.modelsDir, modelId.replace(/\//g, '_'))
    return existsSync(modelDir)
  }

  /** 获取已下载的模型列表 */
  getDownloadedModels(): string[] {
    if (!existsSync(this.modelsDir)) return []
    return readdirSync(this.modelsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  }

  /** 获取模型本地路径 */
  getModelPath(modelId: string): string {
    return join(this.modelsDir, modelId.replace(/\//g, '_'))
  }

  /**
   * 下载模型文件
   * @param url - 模型下载地址
   * @param modelId - 模型标识
   * @param onProgress - 进度回调
   */
  async downloadModel(
    url: string,
    modelId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<string> {
    const modelDir = this.getModelPath(modelId)
    mkdirSync(modelDir, { recursive: true })

    const fileName = url.split('/').pop() || 'model.bin'
    const filePath = join(modelDir, fileName)

    /* 已存在则跳过 */
    if (existsSync(filePath)) {
      return filePath
    }

    return new Promise((resolve, reject) => {
      const request = net.request(url)

      request.on('response', (response) => {
        const totalBytes = Number(response.headers['content-length'] || 0)
        let downloadedBytes = 0

        const writeStream = createWriteStream(filePath)

        response.on('data', (chunk) => {
          writeStream.write(chunk)
          downloadedBytes += chunk.length

          if (onProgress && totalBytes > 0) {
            onProgress({
              modelId,
              percent: Math.round((downloadedBytes / totalBytes) * 100),
              downloadedBytes,
              totalBytes
            })
          }
        })

        response.on('end', () => {
          writeStream.end()
          resolve(filePath)
        })

        response.on('error', (err) => {
          writeStream.destroy()
          reject(err)
        })
      })

      request.on('error', (err) => {
        reject(err)
      })

      request.end()
    })
  }
}
