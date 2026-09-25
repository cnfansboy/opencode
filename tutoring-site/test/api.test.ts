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
  expect(all.body.courses.length).toBeGreaterThan(2)

  const alevel = await call(anonymous, "/api/courses?stage=alevel")
  expect(alevel.body.courses.every((course: { stage: string }) => course.stage === "alevel")).toBe(true)

  const detail = await call(anonymous, "/api/courses/gcse-maths-higher")
  expect(detail.body.course.topics.length).toBeGreaterThan(10)
  topicId = detail.body.course.topics[0].id
})

test("the catalogue is maths to A Level and science to GCSE only", async () => {
  const { courses } = (await call(anonymous, "/api/courses")).body

  for (const item of courses) {
    expect(["Maths", "Science"]).toContain(item.subject)
    if (item.subject === "Science") expect(item.stage).not.toBe("alevel")
  }

  // Maths runs the whole way, science stops at GCSE.
  expect(
    courses.filter((c: { subject: string }) => c.subject === "Maths").map((c: { stage: string }) => c.stage),
  ).toEqual(["ks2", "ks3", "gcse", "alevel"])
  expect(courses.some((c: { subject: string; stage: string }) => c.subject === "Science" && c.stage === "gcse")).toBe(
    true,
  )
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

test("the site name is readable by anyone and only a teacher may change it", async () => {
  expect((await call(anonymous, "/api/site")).body.name).toBe("Bridgewell Tutoring")

  expect((await call(anonymous, "/api/site", { method: "PUT", body: JSON.stringify({ name: "Anyone" }) })).status).toBe(
    401,
  )
  expect(
    (await call(student, "/api/site", { method: "PUT", body: JSON.stringify({ name: "A Student" }) })).status,
  ).toBe(403)
  expect((await call(teacher, "/api/site", { method: "PUT", body: JSON.stringify({ name: "x" }) })).status).toBe(400)

  expect(
    (await call(teacher, "/api/site", { method: "PUT", body: JSON.stringify({ name: "Northgate Tuition" }) })).status,
  ).toBe(200)
  expect((await call(anonymous, "/api/site")).body.name).toBe("Northgate Tuition")

  await call(teacher, "/api/site", { method: "PUT", body: JSON.stringify({ name: "Bridgewell Tutoring" }) })
})

test("each role gets its own dashboard", async () => {
  expect((await call(anonymous, "/api/dashboard")).status).toBe(401)

  const learner = await call(student, "/api/dashboard")
  expect(learner.body.role).toBe("student")
  expect(learner.body.user.name).toBe("Test Student")
  expect(learner.body.courses.length).toBeGreaterThan(0)
  expect(learner.body.totals.total).toBeGreaterThan(0)
  expect(learner.body.recent[0].topic).toBeTruthy()
  expect(learner.body.recent[0].teacher).toBe("Test Tutor")
  expect(learner.body.students).toBeUndefined()

  const tutor = await call(teacher, "/api/dashboard")
  expect(tutor.body.role).toBe("teacher")
  expect(tutor.body.students.map((s: { name: string }) => s.name)).toContain("Test Student")
  expect(tutor.body.ticksThisWeek).toBeGreaterThan(0)
  expect(tutor.body.students[0].counts.percent).toBeGreaterThanOrEqual(0)
  expect(tutor.body.courses).toBeUndefined()
})

test("courses carry the exam boards they follow", async () => {
  const { courses } = (await call(anonymous, "/api/courses")).body
  const gcseMaths = courses.find((c: { slug: string }) => c.slug === "gcse-maths-higher")
  expect(gcseMaths.exam_boards).toContain("AQA")
  expect(courses.every((c: { exam_boards: string }) => c.exam_boards.length > 0)).toBe(true)
})

test("a tutor publishes weekly availability that everyone can read", async () => {
  expect((await call(anonymous, "/api/availability")).body.weekdays).toHaveLength(7)

  expect(
    (
      await call(anonymous, "/api/availability", {
        method: "POST",
        body: JSON.stringify({ weekday: 1, starts: "16:00", ends: "18:00" }),
      })
    ).status,
  ).toBe(401)
  expect(
    (
      await call(student, "/api/availability", {
        method: "POST",
        body: JSON.stringify({ weekday: 1, starts: "16:00", ends: "18:00" }),
      })
    ).status,
  ).toBe(403)

  const added = await call(teacher, "/api/availability", {
    method: "POST",
    body: JSON.stringify({ weekday: 1, starts: "16:00", ends: "18:00", note: "After school, online" }),
  })
  expect(added.status).toBe(201)

  const published = (await call(anonymous, "/api/availability")).body.slots.find(
    (slot: { id: number }) => slot.id === added.body.id,
  )
  expect(published.teacher).toBe("Test Tutor")
  expect(published.weekday).toBe(1)
  expect(published.note).toBe("After school, online")

  // The tutor's own hours reach their dashboard, and their students' dashboards.
  const tutorDash = await call(teacher, "/api/dashboard")
  expect(tutorDash.body.weeklyHours).toBe(2)
  expect(
    (await call(student, "/api/dashboard")).body.tutorHours.some((slot: { starts: string }) => slot.starts === "16:00"),
  ).toBe(true)

  await call(teacher, "/api/availability", { method: "DELETE", body: JSON.stringify({ id: added.body.id }) })
  expect(
    (await call(anonymous, "/api/availability")).body.slots.some((slot: { id: number }) => slot.id === added.body.id),
  ).toBe(false)
})

test("availability rejects bad times, overlaps and other tutors' slots", async () => {
  const bad = [
    { weekday: 9, starts: "16:00", ends: "18:00" },
    { weekday: 2, starts: "9am", ends: "11am" },
    { weekday: 2, starts: "18:00", ends: "16:00" },
    { weekday: 2, starts: "16:00", ends: "16:00" },
  ]
  for (const slot of bad)
    expect((await call(teacher, "/api/availability", { method: "POST", body: JSON.stringify(slot) })).status).toBe(400)

  const first = await call(teacher, "/api/availability", {
    method: "POST",
    body: JSON.stringify({ weekday: 3, starts: "16:00", ends: "18:00" }),
  })
  expect(first.status).toBe(201)

  const overlap = await call(teacher, "/api/availability", {
    method: "POST",
    body: JSON.stringify({ weekday: 3, starts: "17:00", ends: "19:00" }),
  })
  expect(overlap.status).toBe(409)

  // Back to back is fine; a different day is fine.
  expect(
    (
      await call(teacher, "/api/availability", {
        method: "POST",
        body: JSON.stringify({ weekday: 3, starts: "18:00", ends: "19:00" }),
      })
    ).status,
  ).toBe(201)

  const other: { cookie?: string } = {}
  await call(other, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Other Tutor",
      email: "other-tutor@test.local",
      password: "password123",
      role: "teacher",
    }),
  })
  expect(
    (await call(other, "/api/availability", { method: "DELETE", body: JSON.stringify({ id: first.body.id }) })).status,
  ).toBe(404)
  expect(
    (
      await call(other, "/api/availability", {
        method: "POST",
        body: JSON.stringify({ weekday: 3, starts: "16:00", ends: "18:00" }),
      })
    ).status,
  ).toBe(201)
})

test("signing out invalidates the session", async () => {
  const session = { ...student }
  await call(session, "/api/auth/logout", { method: "POST" })
  expect((await call({ cookie: student.cookie }, "/api/me")).body.user).toBeNull()
})
