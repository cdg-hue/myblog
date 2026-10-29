import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

interface SqliteStatement {
  run(...values: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get(...values: unknown[]): Record<string, unknown> | undefined
  all(...values: unknown[]): Array<Record<string, unknown>>
}

interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (filename: string) => SqliteDatabase
}

export function createTestDatabase(withSchema = true) {
  const sqlite = new DatabaseSync(':memory:')
  if (withSchema) sqlite.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'))

  class Statement {
    constructor(private sql: string, private values: unknown[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.sql, values) }
    async first(column?: string) {
      const row = sqlite.prepare(this.sql).get(...this.values)
      return row ? (column ? row[column] : row) : null
    }
    async all() {
      return { success: true, results: sqlite.prepare(this.sql).all(...this.values), meta: {} }
    }
    async run() {
      const results = sqlite.prepare(this.sql).all(...this.values)
      const meta = sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get()!
      return {
        success: true,
        results,
        meta: { changes: Number(meta.changes), last_row_id: Number(meta.last_row_id) },
      }
    }
  }

  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    exec: async (sql: string) => { sqlite.exec(sql); return { count: 1, duration: 0 } },
  } as unknown as D1Database

  return { db, sqlite, close: () => sqlite.close() }
}
