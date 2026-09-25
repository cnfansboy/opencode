import path from "node:path"
import { db, DEFAULT_SITE_NAME, PROGRESS_STATUS, siteName, STAGES, theTutor, WEEKDAYS, type ProgressStatus } from "./db"
import { seed } from "./seed"
import {
  clearCookie,
  createReset,
  currentUser,
  hash,
  login,
  logout,
  readCookie,
  sessionCookie,
  useReset,
  verify,
  type User,
} from "./auth"

seed()

const PUBLIC = path.join(import.meta.dir, "..", "public")

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)
const fail = (status: number, error: string) => Response.json({ error }, { status })

async function body(request: Request) {
  const parsed = await request.json().catch(() => undefined)
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "")

function require_(request: Request, role?: "student" | "teacher") {
  const user = currentUser(request)
  if (!user) return { error: fail(401, "You need to sign in to do that.") }
  if (role && user.role !== role) return { error: fail(403, `That area is for ${role} accounts.`) }
  return { user }
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    stage: user.stage,
    stageLabel: STAGES.find((s) => s.id === user.stage)?.label ?? null,
  }
}

function courseProgress(studentId: number) {
  const courses = db
    .query(
      `SELECT courses.id, courses.slug, courses.title, courses.subject, courses.stage, courses.summary
       FROM interests JOIN courses ON courses.id = interests.course_id
       WHERE interests.user_id = ?
       ORDER BY CASE courses.stage WHEN 'ks2' THEN 1 WHEN 'ks3' THEN 2 WHEN 'gcse' THEN 3 ELSE 4 END, courses.title`,
    )
    .all(studentId) as { id: number; slug: string; title: string; subject: string; stage: string; summary: string }[]

  const topics = db
    .query(
      `SELECT topics.id, topics.course_id, topics.title, topics.position,
              COALESCE(progress.status, 'not_started') as status,
              COALESCE(progress.note, '') as note,
              progress.updated_at as updated_at,
              teacher.name as teacher_name
       FROM topics
       LEFT JOIN progress ON progress.topic_id = topics.id AND progress.student_id = ?
       LEFT JOIN users teacher ON teacher.id = progress.teacher_id
       ORDER BY topics.position`,
    )
    .all(studentId) as {
    id: number
    course_id: number
    title: string
    position: number
    status: ProgressStatus
    note: string
    updated_at: string | null
    teacher_name: string | null
  }[]

  return courses.map((course) => {
    const list = topics.filter((topic) => topic.course_id === course.id)
    const covered = list.filter((topic) => topic.status !== "not_started").length
    const secure = list.filter((topic) => topic.status === "secure").length
    return {
      ...course,
      stageLabel: STAGES.find((s) => s.id === course.stage)?.label ?? course.stage,
      topics: list,
      counts: {
        total: list.length,
        covered,
        secure,
        percent: list.length ? Math.round((covered / list.length) * 100) : 0,
      },
    }
  })
}

function teaches(teacherId: number, studentId: number) {
  return !!db
    .query("SELECT 1 as ok FROM teacher_students WHERE teacher_id = ? AND student_id = ?")
    .get(teacherId, studentId)
}

export const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/stages": () =>
      json({
        stages: STAGES,
        subjects: (
          db.query("SELECT DISTINCT subject FROM courses ORDER BY subject").all() as { subject: string }[]
        ).map((row) => row.subject),
      }),

    "/api/courses": (request) => {
      const params = new URL(request.url).searchParams
      const stage = str(params.get("stage"))
      const subject = str(params.get("subject"))
      const search = str(params.get("q")).toLowerCase()
      const rows = db
        .query(
          `SELECT courses.*,
                  (SELECT COUNT(*) FROM topics WHERE topics.course_id = courses.id) as topic_count,
                  (SELECT COUNT(*) FROM reviews WHERE reviews.course_id = courses.id) as review_count,
                  (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE reviews.course_id = courses.id) as rating
           FROM courses ORDER BY CASE courses.stage WHEN 'ks2' THEN 1 WHEN 'ks3' THEN 2 WHEN 'gcse' THEN 3 ELSE 4 END, courses.title`,
        )
        .all() as (Record<string, unknown> & { stage: string; subject: string; title: string; summary: string })[]

      return json({
        courses: rows
          .filter((course) => !stage || course.stage === stage)
          .filter((course) => !subject || course.subject === subject)
          .filter(
            (course) => !search || `${course.title} ${course.summary} ${course.subject}`.toLowerCase().includes(search),
          )
          .map((course) => ({
            ...course,
            stageLabel: STAGES.find((s) => s.id === course.stage)?.label ?? course.stage,
          })),
      })
    },

    "/api/courses/:slug": (request) => {
      const course = db.query("SELECT * FROM courses WHERE slug = ?").get(request.params.slug) as
        | (Record<string, unknown> & { id: number; stage: string })
        | null
      if (!course) return fail(404, "Course not found.")
      return json({
        course: {
          ...course,
          stageLabel: STAGES.find((s) => s.id === course.stage)?.label ?? course.stage,
          topics: db
            .query("SELECT id, title, position FROM topics WHERE course_id = ? ORDER BY position")
            .all(course.id),
          reviews: db
            .query(
              "SELECT id, author_name, rating, title, body, created_at FROM reviews WHERE course_id = ? ORDER BY created_at DESC",
            )
            .all(course.id),
        },
      })
    },

    "/api/site": {
      GET: () => json({ name: siteName(), defaultName: DEFAULT_SITE_NAME, tutor: theTutor() }),
      PUT: async (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const input = await body(request)
        const name = str(input?.name)
        if (name.length < 2 || name.length > 40) return fail(400, "The site name must be between 2 and 40 characters.")
        db.query(
          "INSERT INTO settings (key, value) VALUES ('site_name', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        ).run(name)
        return json({ name })
      },
    },

    "/api/dashboard": (request) => {
      const auth = require_(request)
      if (auth.error) return auth.error

      const slots = db
        .query(
          `SELECT availability.id, availability.weekday, availability.starts, availability.ends, availability.note,
                  availability.subject, users.name as teacher
           FROM availability JOIN users ON users.id = availability.teacher_id
           WHERE availability.teacher_id = ? ORDER BY availability.weekday, availability.starts`,
        )
        .all(auth.user.id) as { weekday: number; starts: string; ends: string }[]

      if (auth.user.role === "student") {
        const courses = courseProgress(auth.user.id)
        return json({
          role: "student",
          user: publicUser(auth.user),
          courses,
          tutorHours: db
            .query(
              `SELECT availability.weekday, availability.starts, availability.ends, availability.subject,
                      users.name as teacher
               FROM availability JOIN users ON users.id = availability.teacher_id
               JOIN teacher_students ON teacher_students.teacher_id = availability.teacher_id
               WHERE teacher_students.student_id = ? ORDER BY availability.weekday, availability.starts`,
            )
            .all(auth.user.id),
          totals: courses.reduce(
            (sum, course) => ({
              total: sum.total + course.counts.total,
              covered: sum.covered + course.counts.covered,
              secure: sum.secure + course.counts.secure,
            }),
            { total: 0, covered: 0, secure: 0 },
          ),
          recent: db
            .query(
              `SELECT topics.title as topic, courses.title as course, progress.status, progress.note, progress.updated_at,
                      users.name as teacher
               FROM progress
               JOIN topics ON topics.id = progress.topic_id
               JOIN courses ON courses.id = topics.course_id
               LEFT JOIN users ON users.id = progress.teacher_id
               WHERE progress.student_id = ? AND progress.status != 'not_started'
               ORDER BY progress.updated_at DESC LIMIT 6`,
            )
            .all(auth.user.id),
          teachers: db
            .query(
              "SELECT users.id, users.name FROM teacher_students JOIN users ON users.id = teacher_students.teacher_id WHERE teacher_students.student_id = ?",
            )
            .all(auth.user.id),
        })
      }

      const students = db
        .query(
          `SELECT users.id, users.name, users.email, users.stage
           FROM teacher_students JOIN users ON users.id = teacher_students.student_id
           WHERE teacher_students.teacher_id = ? ORDER BY users.name`,
        )
        .all(auth.user.id) as { id: number; name: string; email: string; stage: string | null }[]

      const detailed = students.map((student) => {
        const courses = courseProgress(student.id)
        const total = courses.reduce((sum, course) => sum + course.counts.total, 0)
        const covered = courses.reduce((sum, course) => sum + course.counts.covered, 0)
        return {
          ...student,
          stageLabel: STAGES.find((s) => s.id === student.stage)?.label ?? null,
          courses: courses.map((course) => ({ slug: course.slug, title: course.title, counts: course.counts })),
          counts: { total, covered, percent: total ? Math.round((covered / total) * 100) : 0 },
        }
      })

      return json({
        role: "teacher",
        user: publicUser(auth.user),
        students: detailed,
        slots,
        weeklyHours:
          Math.round(
            slots.reduce(
              (sum, slot) =>
                sum +
                (Number(slot.ends.slice(0, 2)) * 60 +
                  Number(slot.ends.slice(3)) -
                  Number(slot.starts.slice(0, 2)) * 60 -
                  Number(slot.starts.slice(3))) /
                  60,
              0,
            ) * 10,
          ) / 10,
        ticksThisWeek: (
          db
            .query(
              "SELECT COUNT(*) as n FROM progress WHERE teacher_id = ? AND status != 'not_started' AND updated_at >= datetime('now', '-7 days')",
            )
            .get(auth.user.id) as { n: number }
        ).n,
        needsAttention: detailed.filter((student) => student.counts.total === 0 || student.counts.percent < 25).length,
      })
    },

    "/api/availability": {
      GET: () =>
        json({
          weekdays: WEEKDAYS,
          slots: db
            .query(
              `SELECT availability.id, availability.weekday, availability.starts, availability.ends, availability.note,
                      availability.subject, availability.teacher_id, users.name as teacher
               FROM availability JOIN users ON users.id = availability.teacher_id
               ORDER BY availability.weekday, availability.starts`,
            )
            .all(),
        }),
      POST: async (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")

        const weekday = Number(input.weekday)
        const starts = str(input.starts)
        const ends = str(input.ends)
        const note = str(input.note).slice(0, 120)
        const subject = str(input.subject) || "Any"
        const subjects = ["Any"].concat(
          (db.query("SELECT DISTINCT subject FROM courses ORDER BY subject").all() as { subject: string }[]).map(
            (row) => row.subject,
          ),
        )
        if (!subjects.includes(subject)) return fail(400, "Choose a subject these hours are for.")
        const time = /^([01]\d|2[0-3]):[0-5]\d$/

        if (!WEEKDAYS.some((day) => day.id === weekday)) return fail(400, "Choose a day of the week.")
        if (!time.test(starts) || !time.test(ends)) return fail(400, "Times must look like 16:00.")
        if (ends <= starts) return fail(400, "The finish time must be after the start time.")

        const clash = db
          .query(
            "SELECT starts, ends FROM availability WHERE teacher_id = ? AND weekday = ? AND starts < ? AND ends > ?",
          )
          .get(auth.user.id, weekday, ends, starts) as { starts: string; ends: string } | null
        if (clash) return fail(409, `That overlaps the ${clash.starts}–${clash.ends} you already published.`)

        const id = db
          .query(
            "INSERT INTO availability (teacher_id, weekday, starts, ends, subject, note) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
          )
          .get(auth.user.id, weekday, starts, ends, subject, note) as { id: number }
        return json({ id: id.id }, { status: 201 })
      },
      DELETE: async (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const input = await body(request)
        const removed = db
          .query("DELETE FROM availability WHERE id = ? AND teacher_id = ? RETURNING id")
          .get(Number(input?.id), auth.user.id)
        if (!removed) return fail(404, "That slot is not one of yours.")
        return json({ ok: true })
      },
    },

    "/api/reviews": {
      GET: (request) => {
        const slug = str(new URL(request.url).searchParams.get("course"))
        const rows = db
          .query(
            `SELECT reviews.id, reviews.author_name, reviews.rating, reviews.title, reviews.body, reviews.created_at,
                    courses.title as course_title, courses.slug as course_slug
             FROM reviews LEFT JOIN courses ON courses.id = reviews.course_id
             WHERE (? = '' OR courses.slug = ?)
             ORDER BY reviews.created_at DESC, reviews.id DESC`,
          )
          .all(slug, slug)
        const summary = db.query("SELECT COUNT(*) as count, ROUND(AVG(rating), 1) as average FROM reviews").get()
        return json({ reviews: rows, summary })
      },
      POST: async (request) => {
        const auth = require_(request)
        if (auth.error) return auth.error
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")

        const rating = Number(input.rating)
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, "Rating must be between 1 and 5.")
        const title = str(input.title)
        const text = str(input.body)
        if (title.length < 3) return fail(400, "Please give your review a short title.")
        if (text.length < 20) return fail(400, "Please write at least 20 characters so the review is useful.")

        const slug = str(input.course)
        const course = slug
          ? (db.query("SELECT id FROM courses WHERE slug = ?").get(slug) as { id: number } | null)
          : null
        if (slug && !course) return fail(404, "Course not found.")

        const id = db
          .query(
            "INSERT INTO reviews (user_id, course_id, author_name, rating, title, body) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
          )
          .get(auth.user.id, course?.id ?? null, auth.user.name, rating, title, text) as { id: number }
        return json({ id: id.id }, { status: 201 })
      },
    },

    "/api/auth/register": {
      POST: async (request) => {
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")

        const name = str(input.name)
        const email = str(input.email).toLowerCase()
        const password = typeof input.password === "string" ? input.password : ""
        const role = str(input.role)
        const stage = str(input.stage)

        if (name.length < 2) return fail(400, "Please enter your name.")
        if (!email) return fail(400, "An email address is required to create an account.")
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "Please enter a valid email address.")
        if (password.length < 8) return fail(400, "Passwords must be at least 8 characters.")
        if (role !== "student" && role !== "teacher") return fail(400, "Choose whether you are a student or a teacher.")
        if (role === "student" && !STAGES.some((s) => s.id === stage)) return fail(400, "Choose the student's stage.")
        // One person tutors here, so the tutor account can only be claimed once.
        if (role === "teacher" && theTutor())
          return fail(409, `${siteName()} already has a tutor account. Ask them to add you as a student instead.`)
        if (db.query("SELECT 1 as ok FROM users WHERE email = ?").get(email))
          return fail(409, "That email already has an account.")

        const user = db
          .query("INSERT INTO users (name, email, password, role, stage) VALUES (?, ?, ?, ?, ?) RETURNING id")
          .get(name, email, await hash(password), role, role === "student" ? stage : null) as { id: number }

        return json(
          { user: publicUser(currentUserById(user.id)) },
          { status: 201, headers: { "Set-Cookie": sessionCookie(login(user.id)) } },
        )
      },
    },

    "/api/auth/login": {
      POST: async (request) => {
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")
        const email = str(input.email).toLowerCase()
        const password = typeof input.password === "string" ? input.password : ""

        const row = db.query("SELECT * FROM users WHERE email = ?").get(email) as (User & { password: string }) | null
        if (!row || !(await verify(password, row.password))) return fail(401, "Email or password is incorrect.")

        return json({ user: publicUser(row) }, { headers: { "Set-Cookie": sessionCookie(login(row.id)) } })
      },
    },

    "/api/auth/forgot": {
      POST: async (request) => {
        const input = await body(request)
        const email = str(input?.email).toLowerCase()
        if (!email) return fail(400, "Enter the email address on your account.")

        const user = db.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | null
        // Always answer the same way, so this cannot be used to discover who has an account.
        const answer: Record<string, unknown> = {
          ok: true,
          message: `If ${email} has an account, a link to set a new password is on its way.`,
        }

        // With no mailer configured the link has nowhere to go, so the demo shows it instead.
        if (user && !process.env.TUTORING_MAIL) answer.demoToken = createReset(user.id)
        else if (user) createReset(user.id)

        return json(answer)
      },
    },

    "/api/auth/reset": {
      POST: async (request) => {
        const input = await body(request)
        const token = str(input?.token)
        const password = typeof input?.password === "string" ? input.password : ""
        if (password.length < 8) return fail(400, "Passwords must be at least 8 characters.")

        const userId = useReset(token)
        if (!userId) return fail(400, "That link has expired or has already been used. Please request another.")

        db.query("UPDATE users SET password = ? WHERE id = ?").run(await hash(password), userId)
        // Anyone already signed in with the old password is signed out.
        db.query("DELETE FROM sessions WHERE user_id = ?").run(userId)

        return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(login(userId)) } })
      },
    },

    "/api/auth/logout": {
      POST: (request) => {
        const token = readCookie(request)
        if (token) logout(token)
        return json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } })
      },
    },

    "/api/me": {
      GET: (request) => {
        const user = currentUser(request)
        if (!user) return json({ user: null })
        return json({
          user: publicUser(user),
          interests: db
            .query(
              "SELECT courses.id, courses.slug, courses.title, courses.stage, courses.subject FROM interests JOIN courses ON courses.id = interests.course_id WHERE interests.user_id = ? ORDER BY courses.title",
            )
            .all(user.id),
          teachers:
            user.role === "student"
              ? db
                  .query(
                    "SELECT users.id, users.name, users.email FROM teacher_students JOIN users ON users.id = teacher_students.teacher_id WHERE teacher_students.student_id = ?",
                  )
                  .all(user.id)
              : [],
        })
      },
      PATCH: async (request) => {
        const auth = require_(request)
        if (auth.error) return auth.error
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")

        const name = str(input.name)
        if (name && name.length < 2) return fail(400, "Please enter your name.")
        if (name) db.query("UPDATE users SET name = ? WHERE id = ?").run(name, auth.user.id)

        const stage = str(input.stage)
        if (stage) {
          if (auth.user.role !== "student") return fail(400, "Only student accounts have a stage.")
          if (!STAGES.some((s) => s.id === stage)) return fail(400, "Unknown stage.")
          db.query("UPDATE users SET stage = ? WHERE id = ?").run(stage, auth.user.id)
        }

        return json({ user: publicUser(currentUserById(auth.user.id)) })
      },
    },

    "/api/me/interests": {
      POST: async (request) => {
        const auth = require_(request, "student")
        if (auth.error) return auth.error
        const input = await body(request)
        const course = db.query("SELECT id FROM courses WHERE slug = ?").get(str(input?.course)) as {
          id: number
        } | null
        if (!course) return fail(404, "Course not found.")
        db.query("INSERT OR IGNORE INTO interests (user_id, course_id) VALUES (?, ?)").run(auth.user.id, course.id)
        return json({ ok: true })
      },
      DELETE: async (request) => {
        const auth = require_(request, "student")
        if (auth.error) return auth.error
        const input = await body(request)
        const course = db.query("SELECT id FROM courses WHERE slug = ?").get(str(input?.course)) as {
          id: number
        } | null
        if (!course) return fail(404, "Course not found.")
        db.query("DELETE FROM interests WHERE user_id = ? AND course_id = ?").run(auth.user.id, course.id)
        return json({ ok: true })
      },
    },

    "/api/me/progress": (request) => {
      const auth = require_(request, "student")
      if (auth.error) return auth.error
      return json({ courses: courseProgress(auth.user.id) })
    },

    "/api/teacher/students": {
      GET: (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const students = db
          .query(
            `SELECT users.id, users.name, users.email, users.stage
             FROM teacher_students JOIN users ON users.id = teacher_students.student_id
             WHERE teacher_students.teacher_id = ? ORDER BY users.name`,
          )
          .all(auth.user.id) as { id: number; name: string; email: string; stage: string | null }[]

        return json({
          students: students.map((student) => {
            const courses = courseProgress(student.id)
            const total = courses.reduce((sum, course) => sum + course.counts.total, 0)
            const covered = courses.reduce((sum, course) => sum + course.counts.covered, 0)
            return {
              ...student,
              stageLabel: STAGES.find((s) => s.id === student.stage)?.label ?? null,
              courseCount: courses.length,
              counts: { total, covered, percent: total ? Math.round((covered / total) * 100) : 0 },
            }
          }),
        })
      },
      POST: async (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const input = await body(request)
        const student = db.query("SELECT id, role FROM users WHERE email = ?").get(str(input?.email).toLowerCase()) as {
          id: number
          role: string
        } | null
        if (!student || student.role !== "student") return fail(404, "No student account with that email address.")
        db.query("INSERT OR IGNORE INTO teacher_students (teacher_id, student_id) VALUES (?, ?)").run(
          auth.user.id,
          student.id,
        )
        return json({ ok: true, studentId: student.id }, { status: 201 })
      },
    },

    "/api/teacher/students/:id": {
      GET: (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const studentId = Number(request.params.id)
        if (!teaches(auth.user.id, studentId)) return fail(403, "That student is not on your list.")
        const student = db.query("SELECT id, name, email, stage FROM users WHERE id = ?").get(studentId) as {
          id: number
          name: string
          email: string
          stage: string | null
        } | null
        if (!student) return fail(404, "Student not found.")
        return json({
          student: { ...student, stageLabel: STAGES.find((s) => s.id === student.stage)?.label ?? null },
          courses: courseProgress(studentId),
        })
      },
      DELETE: (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        db.query("DELETE FROM teacher_students WHERE teacher_id = ? AND student_id = ?").run(
          auth.user.id,
          Number(request.params.id),
        )
        return json({ ok: true })
      },
    },

    "/api/teacher/progress": {
      PUT: async (request) => {
        const auth = require_(request, "teacher")
        if (auth.error) return auth.error
        const input = await body(request)
        if (!input) return fail(400, "Expected a JSON body.")

        const studentId = Number(input.studentId)
        const topicId = Number(input.topicId)
        const status = str(input.status) as ProgressStatus
        const note = str(input.note).slice(0, 500)

        if (!PROGRESS_STATUS.includes(status)) return fail(400, "Unknown progress status.")
        if (!teaches(auth.user.id, studentId)) return fail(403, "That student is not on your list.")
        if (!db.query("SELECT 1 as ok FROM topics WHERE id = ?").get(topicId)) return fail(404, "Topic not found.")

        db.query(
          `INSERT INTO progress (student_id, topic_id, status, note, teacher_id, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT (student_id, topic_id) DO UPDATE SET
             status = excluded.status, note = excluded.note, teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`,
        ).run(studentId, topicId, status, note, auth.user.id)

        return json({
          topic: db
            .query(
              `SELECT topics.id, COALESCE(progress.status, 'not_started') as status, progress.note, progress.updated_at, users.name as teacher_name
               FROM topics LEFT JOIN progress ON progress.topic_id = topics.id AND progress.student_id = ?
               LEFT JOIN users ON users.id = progress.teacher_id WHERE topics.id = ?`,
            )
            .get(studentId, topicId),
        })
      },
    },
  },

  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) return fail(404, "Unknown endpoint.")

    const asset = Bun.file(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "")))
    if (url.pathname !== "/" && (await asset.exists())) return new Response(asset)
    return new Response(Bun.file(path.join(PUBLIC, "index.html")), { headers: { "Content-Type": "text/html" } })
  },
})

function currentUserById(id: number) {
  return db.query("SELECT id, name, email, role, stage, created_at FROM users WHERE id = ?").get(id) as User
}

console.log(`Tutoring site running at http://localhost:${server.port}`)
