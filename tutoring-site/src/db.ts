import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"

export const STAGES = [
  { id: "ks2", label: "KS2 (Primary, Years 3-6)", order: 1 },
  { id: "ks3", label: "KS3 (Secondary, Years 7-9)", order: 2 },
  { id: "gcse", label: "GCSE (Years 10-11)", order: 3 },
  { id: "alevel", label: "A Level (Years 12-13)", order: 4 },
] as const

export type StageId = (typeof STAGES)[number]["id"]

export const PROGRESS_STATUS = ["not_started", "covered", "secure"] as const
export type ProgressStatus = (typeof PROGRESS_STATUS)[number]

const file = process.env.TUTORING_DB ?? path.join(process.cwd(), "data", "tutoring.sqlite")
if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true })

export const db = new Database(file, { create: true })
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
    stage TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    stage TEXT NOT NULL,
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    price_pence INTEGER NOT NULL,
    session_length TEXT NOT NULL,
    exam_boards TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS interests (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS teacher_students (
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (teacher_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('not_started', 'covered', 'secure')),
    note TEXT NOT NULL DEFAULT '',
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (student_id, topic_id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saturday_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    stage TEXT NOT NULL,
    starts TEXT NOT NULL,
    ends TEXT NOT NULL,
    tutor TEXT NOT NULL,
    room TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    price_pence INTEGER NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS class_bookings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES saturday_classes(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, class_id)
  );

  CREATE INDEX IF NOT EXISTS topics_course ON topics(course_id, position);
  CREATE INDEX IF NOT EXISTS reviews_course ON reviews(course_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`)

export const DEFAULT_SITE_NAME = "Bridgewell Tutoring"

export function siteName() {
  const row = db.query("SELECT value FROM settings WHERE key = 'site_name'").get() as { value: string } | null
  return row?.value || DEFAULT_SITE_NAME
}
