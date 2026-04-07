import type { TFunction } from 'i18next'

/**
 * 可选国际化标签元信息。
 * 有 labelKey 时优先走 i18n，缺失时回退到原始文案。
 */
export interface LocalizableLabelMeta {
  label?: string
  labelKey?: string
}

/**
 * 解析模型或选项的展示文案。
 * 统一收口后，页面层不需要反复写 labelKey ? t(...) : label。
 */
export function resolveLocalizedLabel(
  meta: LocalizableLabelMeta,
  fallbackLabel: string,
  t: TFunction
): string {
  if (meta.labelKey) {
    return t(meta.labelKey)
  }

  return meta.label ?? fallbackLabel
}