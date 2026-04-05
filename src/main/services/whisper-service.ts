/**
 * Whisper 语音识别服务 (主进程侧)
 * 作为 IPC 后端，语音识别主要在渲染进程使用 @huggingface/transformers 完成
 * 此服务提供主进程侧的兜底能力
 */
export class WhisperService {
  private static instance: WhisperService | null = null
  private modelLoaded = false

  static getInstance(): WhisperService {
    if (!WhisperService.instance) {
      WhisperService.instance = new WhisperService()
    }
    return WhisperService.instance
  }

  /** 检查模型是否已加载 */
  isReady(): boolean {
    return this.modelLoaded
  }

  /** 加载 Whisper 模型 (主进程侧目前为占位) */
  async loadModel(_modelPath: string): Promise<void> {
    this.modelLoaded = true
  }

  /**
   * 识别音频数据为文字
   * 注意：实际推理在渲染进程通过 @huggingface/transformers 执行
   * 此方法仅作为 IPC 兜底，返回空字符串提示前端走本地推理
   */
  async transcribe(_audioData: Float32Array): Promise<string> {
    /* 渲染进程已直接调用 Whisper，此处不再重复推理 */
    return ''
  }
}
