import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 2;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    spec_id TEXT NOT NULL,
    spec_version INTEGER NOT NULL,
    runner_id TEXT,
    execution_state TEXT NOT NULL,
    analysis_phase TEXT NOT NULL,
    analysis_error TEXT,
    rules_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spec_versions (
    mission_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    confirmed_rules_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (mission_id, version),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    depends_on_json TEXT NOT NULL,
    relevant_rule_ids_json TEXT NOT NULL,
    runner_task_id TEXT,
    status TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0,
    review_cause_ids_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    spec_version INTEGER NOT NULL,
    task_ids_json TEXT NOT NULL,
    rule_ids_json TEXT NOT NULL,
    situation TEXT NOT NULL,
    prompt TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    state TEXT NOT NULL,
    deduplication_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    spec_version INTEGER NOT NULL,
    choice_id TEXT NOT NULL,
    assessment_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS control_commands (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    status TEXT NOT NULL,
    acknowledged_at TEXT,
    runner_message TEXT,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    mission_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (mission_id, sequence),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );

  CREATE TABLE IF NOT EXISTS idempotency (
    mission_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (mission_id, operation, idempotency_key)
  );

  CREATE TABLE IF NOT EXISTS extracted_rules (
    mission_id TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    proposed_tasks_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (mission_id)
  );
  `,
  `
  CREATE TABLE tasks_scoped (
    id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    depends_on_json TEXT NOT NULL,
    relevant_rule_ids_json TEXT NOT NULL,
    runner_task_id TEXT,
    status TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0,
    review_cause_ids_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (mission_id, id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
  INSERT INTO tasks_scoped SELECT * FROM tasks;
  DROP TABLE tasks;
  ALTER TABLE tasks_scoped RENAME TO tasks;

  CREATE TABLE questions_scoped (
    id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    spec_version INTEGER NOT NULL,
    task_ids_json TEXT NOT NULL,
    rule_ids_json TEXT NOT NULL,
    situation TEXT NOT NULL,
    prompt TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    state TEXT NOT NULL,
    deduplication_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (mission_id, id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
  INSERT INTO questions_scoped SELECT * FROM questions;
  DROP TABLE questions;
  ALTER TABLE questions_scoped RENAME TO questions;
  `,
];

export type Db = DatabaseSync;

let singleton: DatabaseSync | null = null;

export function resolveDataDir(): string {
  const fromEnv = process.env.SPECOPS_DATA_DIR;
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "data");
}

export function openDatabase(dbPath?: string): DatabaseSync {
  const file =
    dbPath ??
    (process.env.SPECOPS_DB_PATH
      ? process.env.SPECOPS_DB_PATH
      : path.join(resolveDataDir(), "specops.sqlite"));

  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  singleton = db;
  return db;
}

export function getDb(): DatabaseSync {
  if (!singleton) {
    singleton = openDatabase();
  }
  return singleton;
}

export function resetDbForTests(dbPath = ":memory:"): DatabaseSync {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* ignore */
    }
  }
  singleton = openDatabase(dbPath);
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      /* ignore */
    }
    singleton = null;
  }
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  const current = row ? Number(row.value) : 0;
  for (let i = current; i < SCHEMA_VERSION; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.prepare(
        "INSERT INTO meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(String(i + 1));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
