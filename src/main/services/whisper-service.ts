/**
 * Whisper 语音识别服务
 * TODO: Phase 4 实现 — 集成 onnxruntime-node + Whisper ONNX 模型
 * 当前为接口预留，返回占位结果
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

  /** 加载 Whisper 模型 */
  async loadModel(_modelPath: string): Promise<void> {
    // TODO: 加载 ONNX Whisper 模型
    this.modelLoaded = true
  }

  /** 识别音频数据为文字 */
  async transcribe(_audioData: Float32Array): Promise<string> {
    if (!this.modelLoaded) {
      throw new Error('Whisper model not loaded')
    }
    // TODO: 调用 ONNX Runtime 推理
    return ''
  }
}
