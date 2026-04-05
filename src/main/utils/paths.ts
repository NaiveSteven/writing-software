import { app } from 'electron'
import { join } from 'path'

/** 获取用户数据目录 */
export function getUserDataPath(): string {
  return app.getPath('userData')
}

/** 获取模型存储目录 */
export function getModelsPath(): string {
  return join(getUserDataPath(), 'models')
}

/** 获取数据库文件路径 */
export function getDatabasePath(): string {
  return join(getUserDataPath(), 'messages.db')
}
