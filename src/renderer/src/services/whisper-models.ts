/**
 * Whisper 模型配置
 * 统一维护可选模型的 ID、文案和体积提示。
 */

/** 可选 Whisper 模型 ID */
export type WhisperModelId =
  | 'onnx-community/whisper-tiny'
  | 'onnx-community/whisper-base'
  | 'onnx-community/whisper-small'

/** Whisper 模型展示信息 */
export interface WhisperModelOption {
  id: WhisperModelId
  labelKey: string
  hintKey: string
  sizeHint: string
}

/** 默认语音识别模型 */
export const DEFAULT_WHISPER_MODEL_ID: WhisperModelId = 'onnx-community/whisper-base'

/** 兼容旧调用方的默认模型常量 */
export const WHISPER_MODEL_ID = DEFAULT_WHISPER_MODEL_ID

/** 可比较的 Whisper 模型列表 */
export const WHISPER_MODEL_OPTIONS: readonly WhisperModelOption[] = [
  {
    id: 'onnx-community/whisper-tiny',
    labelKey: 'settings.speechTiny',
    hintKey: 'settings.speechTinyHint',
    sizeHint: '~55 MB'
  },
  {
    id: 'onnx-community/whisper-base',
    labelKey: 'settings.speechBase',
    hintKey: 'settings.speechBaseHint',
    sizeHint: '~150 MB'
  },
  {
    id: 'onnx-community/whisper-small',
    labelKey: 'settings.speechSmall',
    hintKey: 'settings.speechSmallHint',
    sizeHint: '~280 MB'
  }
]

/** 按模型 ID 快速索引配置 */
export const WHISPER_MODEL_META_BY_ID = Object.fromEntries(
  WHISPER_MODEL_OPTIONS.map((option) => [option.id, option])
) as Record<WhisperModelId, WhisperModelOption>

/** 获取指定模型配置 */
export function getWhisperModelMeta(modelId: WhisperModelId): WhisperModelOption {
  return WHISPER_MODEL_META_BY_ID[modelId]
}
