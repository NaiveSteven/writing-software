/**
 * DatabaseService 单元测试
 * 使用 sql.js 内存数据库，不依赖 Electron app 模块
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'

/* mock electron 的 app 模块 */
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-writing-software',
    getAppPath: () => process.cwd()
  }
}))

/* mock fs 操作，避免真实写入 */
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false)
}))

/**
 * 模拟 DatabaseService 核心逻辑的精简测试版本
 * 抽出纯 SQL 逻辑进行测试，不依赖 Electron 运行时
 */

/** 消息记录类型 (与 src/main/services/database.ts 一致) */
interface MessageRecord {
  id: number
  content: string
  source_lang: string
  translated_text: string | null
  target_lang: string | null
  input_type: 'text' | 'voice'
  created_at: string
  updated_at: string
}

/** 行转对象 */
function rowToRecord(
  columns: string[],
  values: (string | number | Uint8Array | null)[]
): MessageRecord {
  const record: Record<string, unknown> = {}
  columns.forEach((col, i) => {
    record[col] = values[i]
  })
  return record as unknown as MessageRecord
}

describe('DatabaseService 核心逻辑', () => {
  let db: Database

  beforeEach(async () => {
    const SQL = await initSqlJs()
    db = new SQL.Database()
    db.run(`
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
  })

  it('插入消息后能通过 last_insert_rowid 查询到', () => {
    db.run(
      `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
      ['你好世界', 'zh', 'text']
    )

    const result = db.exec(
      `SELECT * FROM messages WHERE id = last_insert_rowid()`
    )

    expect(result).toHaveLength(1)
    expect(result[0].values).toHaveLength(1)

    const record = rowToRecord(result[0].columns, result[0].values[0])
    expect(record.id).toBe(1)
    expect(record.content).toBe('你好世界')
    expect(record.source_lang).toBe('zh')
    expect(record.input_type).toBe('text')
  })

  it('export() 会重置 last_insert_rowid — 必须先查再 save', () => {
    db.run(
      `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
      ['Hello world', 'en', 'text']
    )

    /* 先查询再 export — 即修复后的顺序 */
    const result = db.exec(
      `SELECT * FROM messages WHERE id = last_insert_rowid()`
    )
    expect(result).toHaveLength(1)

    /* export 之后 last_insert_rowid 被重置，返回空 */
    db.export()
    const afterExport = db.exec(
      `SELECT * FROM messages WHERE id = last_insert_rowid()`
    )
    expect(afterExport).toHaveLength(0)
  })

  it('连续插入多条消息，id 自增', () => {
    const contents = ['第一条', '第二条', '第三条']
    const ids: number[] = []

    for (const content of contents) {
      db.run(
        `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
        [content, 'zh', 'text']
      )
      const r = db.exec(`SELECT * FROM messages WHERE id = last_insert_rowid()`)
      ids.push(rowToRecord(r[0].columns, r[0].values[0]).id)
    }

    expect(ids).toEqual([1, 2, 3])
  })

  it('getAllMessages 按创建时间正序返回', () => {
    db.run(`INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`, ['A', 'en', 'text'])
    db.run(`INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`, ['B', 'en', 'text'])
    db.run(`INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`, ['C', 'en', 'voice'])

    const result = db.exec(`SELECT * FROM messages ORDER BY created_at ASC`)
    expect(result[0].values).toHaveLength(3)

    const records = result[0].values.map((row) =>
      rowToRecord(result[0].columns, row)
    )
    expect(records.map((r) => r.content)).toEqual(['A', 'B', 'C'])
    expect(records[2].input_type).toBe('voice')
  })

  it('updateTranslation 更新译文并保留原文', () => {
    db.run(
      `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
      ['Hello', 'en', 'text']
    )

    db.run(
      `UPDATE messages SET translated_text = ?, target_lang = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      ['你好', 'zh', 1]
    )

    const result = db.exec(`SELECT * FROM messages WHERE id = ?`, [1])
    const record = rowToRecord(result[0].columns, result[0].values[0])

    expect(record.content).toBe('Hello')
    expect(record.translated_text).toBe('你好')
    expect(record.target_lang).toBe('zh')
  })

  it('查询不存在的 id 返回空结果', () => {
    const result = db.exec(`SELECT * FROM messages WHERE id = ?`, [999])
    expect(result).toHaveLength(0)
  })

  it('空表查询返回空数组', () => {
    const result = db.exec(`SELECT * FROM messages ORDER BY created_at ASC`)
    expect(result).toHaveLength(0)
  })

  it('voice 类型消息正确存储', () => {
    db.run(
      `INSERT INTO messages (content, source_lang, input_type) VALUES (?, ?, ?)`,
      ['语音识别结果', 'zh', 'voice']
    )

    const result = db.exec(`SELECT * FROM messages WHERE id = 1`)
    const record = rowToRecord(result[0].columns, result[0].values[0])
    expect(record.input_type).toBe('voice')
    expect(record.content).toBe('语音识别结果')
  })
})
