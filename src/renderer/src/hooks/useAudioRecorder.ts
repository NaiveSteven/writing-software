import { useState, useCallback, useRef } from 'react'
import { toast } from '../components/Toast'

/** 录音状态 */
interface AudioRecorderState {
  /** 是否正在录音 */
  isRecording: boolean
  /** 录音时长(秒) */
  duration: number
  /** 错误信息 */
  error: string | null
  /** 实时音量 (0~1)，用于波形动画 */
  volume: number
}

/** 录音 Hook 返回值 */
interface UseAudioRecorderReturn extends AudioRecorderState {
  /** 开始录音 */
  startRecording: () => Promise<void>
  /** 停止录音并返回音频数据 */
  stopRecording: () => Promise<Float32Array | null>
  /** 获取当前录音的完整音频快照（不停止录音），用于流式识别 */
  getCurrentAudio: () => Float32Array | null
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
    error: null,
    volume: 0
  })

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const volumeRafRef = useRef<number | null>(null)

  /** 开始录音 */
  const startRecording = useCallback(async () => {
    try {
      setState({ isRecording: true, duration: 0, error: null, volume: 0 })
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

      /* AnalyserNode 用于实时音量检测 */
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      source.connect(analyser)

      /* 使用 ScriptProcessor 采集原始 PCM 数据 */
      const processor = context.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0)
        chunksRef.current.push(new Float32Array(data))
      }

      source.connect(processor)
      processor.connect(context.destination)

      /* 实时音量更新 (requestAnimationFrame) */
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateVolume = (): void => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length / 255
        setState((prev) => ({ ...prev, volume: avg }))
        volumeRafRef.current = requestAnimationFrame(updateVolume)
      }
      volumeRafRef.current = requestAnimationFrame(updateVolume)

      /* 计时器 */
      timerRef.current = setInterval(() => {
        setState((prev) => ({ ...prev, duration: prev.duration + 1 }))
      }, 1000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording'
      setState({ isRecording: false, duration: 0, error: message, volume: 0 })
      /* 麦克风权限被拒或设备不可用时，弹出 Toast 提醒 */
      toast.error(message.includes('Permission') || message.includes('NotAllowed')
        ? '麦克风权限被拒绝，请在系统设置中允许'
        : `录音启动失败: ${message}`
      )
    }
  }, [])

  /** 停止录音，合并音频数据 */
  const stopRecording = useCallback(async (): Promise<Float32Array | null> => {
    /* 1. 立即清理计时器 & 动画帧，避免 state 继续更新 */
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current)
      volumeRafRef.current = null
    }

    /* 2. 先置空 onaudioprocess 回调，阻止后续音频块写入；
          这是消除停止时 2~3 秒卡顿的关键：ScriptProcessor 在
          disconnect 之前仍会触发回调，提前 null 掉可立即停止。 */
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
    }

    /* 3. 立即更新 UI 状态，让界面秒响应 */
    setState({ isRecording: false, duration: 0, error: null, volume: 0 })

    /* 4. 收集 ref 快照后清空，防止重复调用 */
    const processor = processorRef.current
    const context = contextRef.current
    const stream = streamRef.current
    processorRef.current = null
    contextRef.current = null
    analyserRef.current = null
    streamRef.current = null

    /* 5. 耗时的 AudioContext.close() 及断开操作延迟执行，
          不阻塞主线程，避免卡顿 */
    setTimeout(() => {
      try { processor?.disconnect() } catch (_) { /* ignore */ }
      try { stream?.getTracks().forEach((track) => track.stop()) } catch (_) { /* ignore */ }
      /* AudioContext.close() 是异步的，返回 Promise，用 void 忽略即可 */
      void context?.close()
    }, 0)

    /* 6. 让 React 优先完成 UI 渲染（setState 的批量处理）再进行 CPU 密集的合并操作
          使用 setTimeout(0) 将合并任务放到下一个宏任务，避免阻塞当前渲染帧 */
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

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

  /**
   * 获取当前录音缓冲区的合并快照（不停止录音）
   * 每次调用都创建新的 Float32Array，可安全传入 Worker 做 buffer transfer
   */
  const getCurrentAudio = useCallback((): Float32Array | null => {
    const chunks = chunksRef.current
    if (chunks.length === 0) return null
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    if (totalLength === 0) return null
    const result = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }, [])

  return {
    ...state,
    startRecording,
    stopRecording,
    getCurrentAudio
  }
}
