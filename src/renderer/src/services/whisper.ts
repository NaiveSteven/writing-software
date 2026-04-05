/**
 * Whisper 语音识别服务 (渲染进程侧)
 * 使用 @huggingface/transformers 在 Chromium 中运行 ONNX Whisper 模型
 * 模型首次使用时自动从 HuggingFace CDN 下载并缓存到浏览器 Cache
 */

import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput
} from '@huggingface/transformers'

/** Whisper 模型状态 */
export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 模型加载进度回调 */
export type ProgressCallback = (progress: {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}) => void

/** 默认使用 whisper-tiny, 体积小（~40MB）适合Demo */
const DEFAULT_MODEL = 'onnx-community/whisper-tiny'

/** 单例 pipeline 实例 */
let whisperPipeline: AutomaticSpeechRecognitionPipeline | null = null
let currentStatus: WhisperStatus = 'idle'

/**
 * 获取当前 Whisper 状态
 */
export function getWhisperStatus(): WhisperStatus {
  return currentStatus
}

/**
 * 初始化 Whisper 模型
 * 会触发模型下载（首次）和 ONNX session 创建
 * @param onProgress - 可选的进度回调
 * @param modelId - 可选的模型 ID，默认 whisper-tiny
 */
export async function initWhisper(
  onProgress?: ProgressCallback,
  modelId: string = DEFAULT_MODEL
): Promise<void> {
  if (whisperPipeline) return
  if (currentStatus === 'loading') return

  currentStatus = 'loading'

  try {
    whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      modelId,
      {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: onProgress
      }
    )
    currentStatus = 'ready'
  } catch (err) {
    currentStatus = 'error'
    whisperPipeline = null
    throw err
  }
}

/**
 * 转录音频数据为文字
 * @param audioData - 16kHz 单声道 PCM Float32Array
 * @returns 识别出的文字
 */
export async function transcribeAudio(audioData: Float32Array): Promise<string> {
  /* 如果模型未初始化，自动加载 */
  if (!whisperPipeline) {
    await initWhisper()
  }

  if (!whisperPipeline) {
    throw new Error('Whisper model failed to initialize')
  }

  const result = await whisperPipeline(audioData, {
    language: 'zh',
    task: 'transcribe',
    return_timestamps: false
  }) as AutomaticSpeechRecognitionOutput

  return result.text.trim()
}

/**
 * 释放模型资源
 */
export async function disposeWhisper(): Promise<void> {
  if (whisperPipeline) {
    await whisperPipeline.dispose()
    whisperPipeline = null
    currentStatus = 'idle'
  }
}
