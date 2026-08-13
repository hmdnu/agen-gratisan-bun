// SQLite-backed duplicate suppression, a port of internal/notification/state.go
// using the built-in bun:sqlite module (no native dependencies). Database
// is a single synchronous connection, satisfying the Go SetMaxOpenConns(1)
// intent (no SQLITE_BUSY between reads and writes).
import { Database } from "bun:sqlite";
import { errorMessage } from "../util/guards.js";

/** Tracks which game releases have already been notified. */
export class State {
  private constructor(private readonly db: Database) {}

  /** Opens the SQLite database at path, creating it and its schema when missing. */
  static open(path: string): State {
    let db: Database;
    try {
      db = new Database(path);
    } catch (err) {
      throw new Error("open notification database: " + errorMessage(err));
    }

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notified_games (
          key TEXT PRIMARY KEY
        )
      `);
    } catch (err) {
      db.close();
      throw new Error("create notification table: " + errorMessage(err));
    }
    return new State(db);
  }

  /** Releases the underlying database. */
  close(): void {
    try {
      this.db.close();
    } catch (err) {
      throw new Error("close notification database: " + errorMessage(err));
    }
  }

  /** Reports whether key was already marked as notified. */
  has(key: string): boolean {
    let row: Record<string, unknown> | undefined;
    try {
      const statement = this.db.prepare(
        `SELECT COUNT(*) FROM notified_games WHERE key = ?`,
      );
      row = statement.get(key) as Record<string, unknown> | undefined;
    } catch (err) {
      throw new Error("query notification state: " + errorMessage(err));
    }
    const count = row?.["COUNT(*)"];
    if (typeof count === "bigint") {
      return count > 0n;
    }
    return (typeof count === "number" ? count : 0) > 0;
  }

  /** Records key as notified. Repeated marks are a no-op. */
  mark(key: string): void {
    try {
      this.db
        .prepare(
          `INSERT INTO notified_games (key) VALUES (?) ON CONFLICT (key) DO NOTHING`,
        )
        .run(key);
    } catch (err) {
      throw new Error("record notification state: " + errorMessage(err));
    }
  }
}
