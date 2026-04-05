import initSqlJs, { type Database } from 'sql.js'
import { getDatabasePath } from '../utils/paths'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

/** 消息记录类型 */
export interface MessageRecord {
  id: number
  content: string
  source_lang: string
  translated_text: string | null
  target_lang: string | null
  input_type: 'text' | 'voice'
  created_at: string
  updated_at: string
}

/** 新建消息参数 */
export interface CreateMessageParams {
  content: string
  sourceLang: string
  inputType: 'text' | 'voice'
}

/** 更新翻译参数 */
export interface UpdateTranslationParams {
  id: number
  translatedText: string
  targetLang: string
}

/**
 * SQLite 数据库服务 (基于 sql.js WASM)
 * 单例模式, 管理消息的 CRUD 操作
 */
export class DatabaseService {
  private static instance: DatabaseService | null = null
  private db: Database | null = null
  private dbPath: string
  private initPromise: Promise<void>

  private constructor() {
    this.dbPath = getDatabasePath()
    /* 确保数据库目录存在 */
    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.initPromise = this.init()
  }

  /** 获取单例实例 */
  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  /** 等待初始化完成 */
  async ready(): Promise<void> {
    await this.initPromise
  }

  /** 初始化 sql.js 和数据表 */
  private async init(): Promise<void> {
    /* 找到 sql.js 的 WASM 文件路径 */
    const wasmPath = join(
      app.getAppPath(),
      'node_modules/sql.js/dist/sql-wasm.wasm'
    )

    const SQL = await initSqlJs({
      locateFile: () => wasmPath
    })

    /* 如果数据库文件已存在, 加载它; 否则创建新数据库 */
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    this.initTables()
  }

  /** 初始化数据表 */
  private initTables(): void {
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        source_lang TEXT NOT NULL DEFAULT '',
        translated_text TEXT,
        target_lang TEXT,
        input_type TEXT NOT NULL DEFAULT 'text',
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `)
    this.save()
  }

  /** 将数据库持久化到磁盘 */
  private save(): void {
    if (!this.db) return
    const data = this.db.export()
    const buffer = Buffer.from(data)
    writeFileSync(this.dbPath, buffer)
  }

  /** 创建消息记录 */
  createMessage(params: CreateMessageParams): MessageRecord {
    this.db!.run(
      `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
      [params.content, params.sourceLang, params.inputType]
    )
    this.save()

    /* 获取刚插入的记录 */
    const result = this.db!.exec(
      `SELECT * FROM messages WHERE id = last_insert_rowid()`
    )
    return this.rowToRecord(result[0].columns, result[0].values[0])
  }

  /** 根据 ID 查询消息 */
  getMessageById(id: number): MessageRecord | undefined {
    const result = this.db!.exec(`SELECT * FROM messages WHERE id = ?`, [id])
    if (result.length === 0 || result[0].values.length === 0) return undefined
    return this.rowToRecord(result[0].columns, result[0].values[0])
  }

  /** 获取所有消息（按时间正序） */
  getAllMessages(): MessageRecord[] {
    const result = this.db!.exec(
      `SELECT * FROM messages ORDER BY created_at ASC`
    )
    if (result.length === 0) return []
    return result[0].values.map((row) =>
      this.rowToRecord(result[0].columns, row)
    )
  }

  /** 更新消息的翻译结果（不新增记录） */
  updateTranslation(params: UpdateTranslationParams): MessageRecord | undefined {
    this.db!.run(
      `UPDATE messages SET translated_text = ?, target_lang = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [params.translatedText, params.targetLang, params.id]
    )
    this.save()
    return this.getMessageById(params.id)
  }

  /** 将数据库行转换为 MessageRecord */
  private rowToRecord(
    columns: string[],
    values: (string | number | Uint8Array | null)[]
  ): MessageRecord {
    const record: Record<string, unknown> = {}
    columns.forEach((col, i) => {
      record[col] = values[i]
    })
    return record as unknown as MessageRecord
  }

  /** 关闭数据库连接 */
  close(): void {
    this.save()
    this.db?.close()
  }
}
