import { db } from "./db"
import { seed } from "./seed"
import { hash } from "./auth"

seed()

const PASSWORD = "demopass123"

const accounts = [
  { name: "Ms Rowan Blake", email: "teacher@example.com", role: "teacher", stage: null },
  { name: "Amira Khan", email: "amira@example.com", role: "student", stage: "gcse" },
  { name: "Tom Fielding", email: "tom@example.com", role: "student", stage: "ks2" },
] as const

for (const account of accounts) {
  if (db.query("SELECT 1 as ok FROM users WHERE email = ?").get(account.email)) continue
  db.query("INSERT INTO users (name, email, password, role, stage) VALUES (?, ?, ?, ?, ?)").run(
    account.name,
    account.email,
    await hash(PASSWORD),
    account.role,
    account.stage,
  )
}

const id = (email: string) => (db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id
const courseId = (slug: string) => (db.query("SELECT id FROM courses WHERE slug = ?").get(slug) as { id: number }).id

const teacher = id("teacher@example.com")
for (const email of ["amira@example.com", "tom@example.com"])
  db.query("INSERT OR IGNORE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)").run(teacher, id(email))

for (const [email, slugs] of [
  ["amira@example.com", ["gcse-maths-higher", "gcse-combined-science"]],
  ["tom@example.com", ["ks2-maths-foundations"]],
] as const)
  for (const slug of slugs)
    db.query("INSERT OR IGNORE INTO interests (user_id, course_id) VALUES (?, ?)").run(id(email), courseId(slug))

// Amira has worked through the first few Higher tier topics with her tutor.
const topics = db
  .query("SELECT id, position FROM topics WHERE course_id = ? ORDER BY position LIMIT 5")
  .all(courseId("gcse-maths-higher")) as { id: number; position: number }[]

for (const topic of topics)
  db.query(
    `INSERT INTO progress (student_id, topic_id, status, note, teacher_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (student_id, topic_id) DO UPDATE SET status = excluded.status, note = excluded.note`,
  ).run(
    id("amira@example.com"),
    topic.id,
    topic.position <= 3 ? "secure" : "covered",
    topic.position === 4 ? "Needs another look at the quadratic formula" : "",
    teacher,
  )

console.log(`Demo accounts ready (password: ${PASSWORD})`)
for (const account of accounts) console.log(`  ${account.role.padEnd(7)} ${account.email}`)
