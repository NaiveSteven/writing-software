import { useState, useCallback, useRef } from 'react'

/** 录音状态 */
interface AudioRecorderState {
  /** 是否正在录音 */
  isRecording: boolean
  /** 录音时长(秒) */
  duration: number
  /** 错误信息 */
  error: string | null
}

/** 录音 Hook 返回值 */
interface UseAudioRecorderReturn extends AudioRecorderState {
  /** 开始录音 */
  startRecording: () => Promise<void>
  /** 停止录音并返回音频数据 */
  stopRecording: () => Promise<Float32Array | null>
}

/**
 * 音频录制 Hook
 * 使用 Web Audio API 录制麦克风音频
 * 输出 16kHz 单声道 PCM 数据，适配 Whisper 模型输入
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    duration: 0,
    error: null
  })

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** 开始录音 */
  const startRecording = useCallback(async () => {
    try {
      setState({ isRecording: true, duration: 0, error: null })
      chunksRef.current = []

      /* 请求麦克风权限 */
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream

      /* 创建 AudioContext (16kHz采样率) */
      const context = new AudioContext({ sampleRate: 16000 })
      contextRef.current = context

      const source = context.createMediaStreamSource(stream)

      /* 使用 ScriptProcessor 采集原始 PCM 数据 */
      const processor = context.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0)
        chunksRef.current.push(new Float32Array(data))
      }

      source.connect(processor)
      processor.connect(context.destination)

      /* 计时器 */
      timerRef.current = setInterval(() => {
        setState((prev) => ({ ...prev, duration: prev.duration + 1 }))
      }, 1000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording'
      setState({ isRecording: false, duration: 0, error: message })
    }
  }, [])

  /** 停止录音，合并音频数据 */
  const stopRecording = useCallback(async (): Promise<Float32Array | null> => {
    /* 清理计时器 */
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    /* 断开音频节点 */
    processorRef.current?.disconnect()
    contextRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())

    setState({ isRecording: false, duration: 0, error: null })

    /* 合并所有音频片段 */
    const chunks = chunksRef.current
    if (chunks.length === 0) return null

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    chunksRef.current = []
    return result
  }, [])

  return {
    ...state,
    startRecording,
    stopRecording
  }
}
