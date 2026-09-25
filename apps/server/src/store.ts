import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Session, type SessionEvent } from '@hotseat/shared';

export class Store {
  readonly db: DatabaseSync;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, 'hotseat.sqlite'));
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metrics(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL, duration_ms REAL NOT NULL, created_at INTEGER NOT NULL);',
    );
  }
  save(session: Session) {
    this.db
      .prepare(
        'INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      )
      .run(session.id, session.createdAt, JSON.stringify(session));
  }
  get(id: string): Session | undefined {
    const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(id);
    return row ? Session.parse(JSON.parse(String(row.body))) : undefined;
  }
  list() {
    return this.db
      .prepare('SELECT body FROM sessions ORDER BY created_at DESC')
      .all()
      .map((r) => Session.parse(JSON.parse(String(r.body))));
  }
  remove(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
    this.db.prepare('DELETE FROM metrics WHERE session_id=?').run(id);
    rmSync(this.audioPath(id), { force: true });
  }
  audioPath(id: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid session ID');
    return path.join(this.directory, `${id}.webm`);
  }
  hasAudio(id: string) {
    return existsSync(this.audioPath(id));
  }
  metric(id: string, event: Extract<SessionEvent, { type: 'metric' }>) {
    this.db
      .prepare('INSERT INTO metrics(session_id,name,duration_ms,created_at) VALUES(?,?,?,?)')
      .run(id, event.name, event.durationMs, Date.now());
  }
  metrics(id: string) {
    return this.db
      .prepare('SELECT name,duration_ms,created_at FROM metrics WHERE session_id=? ORDER BY id')
      .all(id);
  }
  close() {
    this.db.close();
  }
}
