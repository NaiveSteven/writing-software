/** sql.js 类型声明 */
declare module 'sql.js' {
  interface SqlJsStatic {
    Database: {
      new (): Database
      new (data: ArrayLike<number>): Database
      new (data: Buffer): Database
    }
  }

  interface Database {
    run(sql: string, params?: (string | number | null)[]): Database
    exec(sql: string, params?: (string | number | null)[]): QueryResults[]
    export(): Uint8Array
    close(): void
  }

  interface QueryResults {
    columns: string[]
    values: (string | number | Uint8Array | null)[][]
  }

  interface SqlJsOptions {
    locateFile?: (filename: string) => string
  }

  export type { Database, QueryResults, SqlJsOptions }
  export default function initSqlJs(options?: SqlJsOptions): Promise<SqlJsStatic>
}
