import { afterAll, beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import path from "node:path"

process.env.TUTORING_DB = path.join(tmpdir(), `tutoring-test-${crypto.randomUUID()}.sqlite`)
process.env.PORT = "0"

const { server } = await import("../src/server")
const base = `http://localhost:${server.port}`

afterAll(() => server.stop(true))

async function call(session: { cookie?: string }, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(session.cookie ? { cookie: session.cookie } : {}) },
  })
  const cookie = response.headers.get("set-cookie")
  if (cookie) session.cookie = cookie.split(";")[0]
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

const teacher: { cookie?: string } = {}
const student: { cookie?: string } = {}
const anonymous: { cookie?: string } = {}
let topicId = 0
let studentId = 0

beforeAll(async () => {
  const teacherSignup = await call(teacher, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Test Tutor", email: "tutor@test.local", password: "password123", role: "teacher" }),
  })
  expect(teacherSignup.status).toBe(201)

  const studentSignup = await call(student, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Test Student",
      email: "pupil@test.local",
      password: "password123",
      role: "student",
      stage: "gcse",
    }),
  })
  expect(studentSignup.status).toBe(201)
  studentId = studentSignup.body.user.id
})

test("courses are seeded and filterable", async () => {
  const all = await call(anonymous, "/api/courses")
  expect(all.body.courses.length).toBeGreaterThan(5)

  const alevel = await call(anonymous, "/api/courses?stage=alevel")
  expect(alevel.body.courses.every((course: { stage: string }) => course.stage === "alevel")).toBe(true)

  const detail = await call(anonymous, "/api/courses/gcse-maths-higher")
  expect(detail.body.course.topics.length).toBeGreaterThan(10)
  topicId = detail.body.course.topics[0].id
})

test("registration rejects a student with no stage and a weak password", async () => {
  const noStage = await call({}, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "No Stage", email: "nostage@test.local", password: "password123", role: "student" }),
  })
  expect(noStage.status).toBe(400)

  const weak = await call({}, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Weak", email: "weak@test.local", password: "short", role: "teacher" }),
  })
  expect(weak.status).toBe(400)
})

test("login fails on a bad password and succeeds on the right one", async () => {
  const wrong = await call({}, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "pupil@test.local", password: "wrongpassword" }),
  })
  expect(wrong.status).toBe(401)

  const right = await call({}, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "pupil@test.local", password: "password123" }),
  })
  expect(right.status).toBe(200)
  expect(right.body.user.role).toBe("student")
})

test("a student picks courses and changes stage", async () => {
  expect(
    (
      await call(student, "/api/me/interests", {
        method: "POST",
        body: JSON.stringify({ course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await call(student, "/api/me/interests", {
        method: "POST",
        body: JSON.stringify({ course: "gcse-combined-science" }),
      })
    ).status,
  ).toBe(200)

  const progress = await call(student, "/api/me/progress")
  expect(progress.body.courses).toHaveLength(2)
  expect(progress.body.courses[0].counts.covered).toBe(0)

  await call(student, "/api/me/interests", {
    method: "DELETE",
    body: JSON.stringify({ course: "gcse-combined-science" }),
  })
  expect((await call(student, "/api/me/progress")).body.courses).toHaveLength(1)

  await call(student, "/api/me", { method: "PATCH", body: JSON.stringify({ stage: "alevel" }) })
  expect((await call(student, "/api/me")).body.user.stage).toBe("alevel")
})

test("a teacher can only tick topics for their own students", async () => {
  const unlinked = await call(teacher, "/api/teacher/progress", {
    method: "PUT",
    body: JSON.stringify({ studentId, topicId, status: "covered" }),
  })
  expect(unlinked.status).toBe(403)

  expect(
    (
      await call(teacher, "/api/teacher/students", {
        method: "POST",
        body: JSON.stringify({ email: "pupil@test.local" }),
      })
    ).status,
  ).toBe(201)

  const ticked = await call(teacher, "/api/teacher/progress", {
    method: "PUT",
    body: JSON.stringify({ studentId, topicId, status: "covered", note: "Went over surds" }),
  })
  expect(ticked.status).toBe(200)
  expect(ticked.body.topic.status).toBe("covered")

  const seen = await call(student, "/api/me/progress")
  const topic = seen.body.courses[0].topics.find((item: { id: number }) => item.id === topicId)
  expect(topic.status).toBe("covered")
  expect(topic.note).toBe("Went over surds")
  expect(topic.teacher_name).toBe("Test Tutor")
  expect(seen.body.courses[0].counts.covered).toBe(1)
})

test("students cannot reach teacher endpoints and anonymous users cannot write", async () => {
  expect((await call(student, "/api/teacher/students")).status).toBe(403)
  expect((await call(teacher, "/api/me/progress")).status).toBe(403)
  expect(
    (
      await call(anonymous, "/api/me/interests", {
        method: "POST",
        body: JSON.stringify({ course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(401)
})

test("reviews require sign-in and show up in the list", async () => {
  const blocked = await call(anonymous, "/api/reviews", {
    method: "POST",
    body: JSON.stringify({ rating: 5, title: "Great", body: "A long enough review body to pass validation." }),
  })
  expect(blocked.status).toBe(401)

  const tooShort = await call(student, "/api/reviews", {
    method: "POST",
    body: JSON.stringify({ course: "gcse-maths-higher", rating: 5, title: "Great", body: "Too short" }),
  })
  expect(tooShort.status).toBe(400)

  const badRating = await call(student, "/api/reviews", {
    method: "POST",
    body: JSON.stringify({ rating: 9, title: "Great", body: "A long enough review body to pass validation." }),
  })
  expect(badRating.status).toBe(400)

  const posted = await call(student, "/api/reviews", {
    method: "POST",
    body: JSON.stringify({
      course: "gcse-maths-higher",
      rating: 5,
      title: "Really helpful",
      body: "The topic tracker meant we always knew what had been covered each week.",
    }),
  })
  expect(posted.status).toBe(201)

  const list = await call(anonymous, "/api/reviews?course=gcse-maths-higher")
  expect(list.body.reviews.some((review: { title: string }) => review.title === "Really helpful")).toBe(true)
  expect(list.body.reviews[0].author_name).toBe("Test Student")
})

test("signing out invalidates the session", async () => {
  const session = { ...student }
  await call(session, "/api/auth/logout", { method: "POST" })
  expect((await call({ cookie: student.cookie }, "/api/me")).body.user).toBeNull()
})
