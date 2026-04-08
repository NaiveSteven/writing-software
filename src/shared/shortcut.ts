/** 快捷键平台类型。 */
export type ShortcutPlatform = 'mac' | 'default'

/** 快捷键展示文案。 */
export interface ShortcutLabels {
  voice: string
}

/** 统一后的按键输入结构。 */
export interface ShortcutInput {
  key?: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
}

/** 将运行平台归一化为当前快捷键策略。 */
export function resolveShortcutPlatform(rawPlatform: string): ShortcutPlatform {
  const normalized = rawPlatform.toLowerCase()
  if (normalized === 'darwin' || normalized.includes('mac')) {
    return 'mac'
  }

  return 'default'
}

/** 获取指定平台的快捷键展示文案。 */
export function getShortcutLabelsForPlatform(platform: ShortcutPlatform): ShortcutLabels {
  if (platform === 'mac') {
    return {
      voice: 'Command + Shift + Space'
    }
  }

  return {
    voice: 'Ctrl + Shift + Space'
  }
}

/** 是否为空格键。 */
function isSpaceKey(input: ShortcutInput): boolean {
  return input.code === 'Space'
    || input.key === ' '
    || input.key === 'Space'
    || input.key === 'Spacebar'
}

/** 判断当前按键是否命中语音快捷键。 */
export function isVoiceShortcutInput(
  input: ShortcutInput,
  platform: ShortcutPlatform
): boolean {
  if (!isSpaceKey(input) || input.altKey || input.repeat) {
    return false
  }

  if (!input.shiftKey) {
    return false
  }

  if (platform === 'mac') {
    return Boolean(input.metaKey) && !input.ctrlKey
  }

  return Boolean(input.ctrlKey) && !input.metaKey
}