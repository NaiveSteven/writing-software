import { create } from 'zustand'
import type { Message } from '../types/message'
import { mapDbRecord } from '../types/message'
import type { LanguageCode } from '../types/language'

/** 消息状态定义 */
interface MessageState {
  /** 消息列表 */
  messages: Message[]
  /** 加载中标记 */
  loading: boolean

  /** 从数据库加载所有消息 */
  loadMessages: () => Promise<void>
  /** 添加新消息 */
  addMessage: (content: string, sourceLang: string, inputType: 'text' | 'voice') => Promise<Message>
  /** 更新消息的翻译结果 */
  updateTranslation: (id: number, translatedText: string, targetLang: LanguageCode) => Promise<void>
}

/**
 * 消息状态管理
 * 管理聊天消息的增删改查
 */
export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  loading: false,

  loadMessages: async () => {
    set({ loading: true })
    const records = await window.api.getAllMessages()
    const messages = (records as Record<string, unknown>[]).map(mapDbRecord)
    set({ messages, loading: false })
  },

  addMessage: async (content, sourceLang, inputType) => {
    const record = await window.api.createMessage({
      content,
      sourceLang,
      inputType
    })
    const message = mapDbRecord(record as Record<string, unknown>)
    set({ messages: [...get().messages, message] })
    return message
  },

  updateTranslation: async (id, translatedText, targetLang) => {
    await window.api.updateTranslation({ id, translatedText, targetLang })
    /* 更新本地状态 */
    const messages = get().messages.map((msg) =>
      msg.id === id
        ? { ...msg, translatedText, targetLang, updatedAt: new Date().toISOString() }
        : msg
    )
    set({ messages })
  }
}))
