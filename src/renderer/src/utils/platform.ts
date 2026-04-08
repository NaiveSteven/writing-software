import { resolveShortcutPlatform, type ShortcutPlatform } from '../../../shared/shortcut'

/** 获取当前渲染进程所在平台。 */
export function getRendererPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'default'
  return resolveShortcutPlatform(navigator.platform)
}

/** 判断当前是否为 macOS。 */
export function isMacPlatform(): boolean {
  return getRendererPlatform() === 'mac'
}