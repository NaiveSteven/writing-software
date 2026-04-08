import {
  getShortcutLabelsForPlatform,
  isVoiceShortcutInput,
  type ShortcutInput,
  type ShortcutLabels,
  type ShortcutPlatform
} from '../../../shared/shortcut'
import { getRendererPlatform, isMacPlatform } from './platform'

export type { ShortcutInput, ShortcutLabels, ShortcutPlatform }
export { isVoiceShortcutInput }

/** 获取当前渲染进程所在平台。 */
export function getShortcutPlatform(): ShortcutPlatform {
  return getRendererPlatform()
}

export { isMacPlatform }

/** 获取当前平台的快捷键展示文案。 */
export function getShortcutLabels(): ShortcutLabels {
  return getShortcutLabelsForPlatform(getShortcutPlatform())
}