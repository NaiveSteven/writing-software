/**
 * 打字机效果工具函数
 * 将文本逐字符（或逐词）渐进式展示，给用户流式输出的视觉体验
 */

/**
 * 打字机渐进展示
 * @param text      需要展示的完整文本
 * @param onUpdate  每次更新时回调（传入当前已展示的文本片段）
 * @param totalMs   总展示时长（毫秒），默认 900ms 展示完毕
 */
export async function typewriterReveal(
  text: string,
  onUpdate: (partial: string) => void,
  totalMs = 900
): Promise<void> {
  if (!text) return

  const chars = [...text] // 按 Unicode 字符分割，支持 emoji / CJK
  const total = chars.length
  if (total === 0) return

  /* 每帧展示的字符数 ≥ 1，保证在 totalMs 内完成 */
  const intervalMs = 16 // ~60fps
  const charsPerTick = Math.max(1, Math.ceil((total * intervalMs) / totalMs))

  return new Promise<void>((resolve) => {
    let i = 0

    const tick = (): void => {
      i = Math.min(i + charsPerTick, total)
      onUpdate(chars.slice(0, i).join(''))
      if (i < total) {
        setTimeout(tick, intervalMs)
      } else {
        resolve()
      }
    }

    tick()
  })
}
