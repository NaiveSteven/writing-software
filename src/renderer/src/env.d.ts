import type { ElectronAPI } from '../preload/index'

declare global {
  interface Window {
    api: ElectronAPI
    /** Web Speech API (标准 + webkit 前缀) */
    SpeechRecognition: typeof SpeechRecognition | undefined
    webkitSpeechRecognition: typeof SpeechRecognition | undefined
  }
}
