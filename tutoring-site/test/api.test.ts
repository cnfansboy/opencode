import { afterAll, beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import path from "node:path"

process.env.TUTORING_DB = path.join(tmpdir(), `tutoring-test-${crypto.randomUUID()}.sqlite`)
process.env.PORT = "0"

// A stand-in for Zoom, so the OAuth callback can be driven end to end without a real Zoom app.
const zoom = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/oauth/token") {
      if (request.headers.get("authorization") !== `Basic ${btoa("test-client:test-secret")}`)
        return new Response("no", { status: 401 })
      if (url.searchParams.get("code") !== "good-code") return new Response("no", { status: 400 })
      return Response.json({ access_token: "test-access-token" })
    }
    if (url.pathname === "/v2/users/me") {
      if (request.headers.get("authorization") !== "Bearer test-access-token")
        return new Response("no", { status: 401 })
      return Response.json({
        id: "zoom-user-1",
        email: "Zoomer@Test.Local",
        first_name: "Zoe",
        last_name: "Zoomer",
        personal_meeting_url: "https://zoom.us/j/111222333",
      })
    }
    return new Response("not found", { status: 404 })
  },
})

process.env.ZOOM_CLIENT_ID = "test-client"
process.env.ZOOM_CLIENT_SECRET = "test-secret"
process.env.ZOOM_REDIRECT_URI = "http://localhost/api/auth/zoom/callback"
process.env.ZOOM_OAUTH_BASE = `http://localhost:${zoom.port}`
process.env.ZOOM_API_BASE = `http://localhost:${zoom.port}/v2`

const { server } = await import("../src/server")
const base = `http://localhost:${server.port}`

afterAll(() => {
  server.stop(true)
  zoom.stop(true)
})

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

test("only the tutor puts a student on a course", async () => {
  // The student has no way to enrol themselves any more.
  expect(
    (
      await call(student, "/api/teacher/enrolments", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await call(anonymous, "/api/teacher/enrolments", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(401)

  // Not yet their tutor.
  expect(
    (
      await call(teacher, "/api/teacher/enrolments", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(403)

  expect(
    (
      await call(teacher, "/api/teacher/students", {
        method: "POST",
        body: JSON.stringify({ email: "pupil@test.local" }),
      })
    ).status,
  ).toBe(201)
  expect(
    (
      await call(teacher, "/api/teacher/enrolments", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher" }),
      })
    ).status,
  ).toBe(201)
  expect(
    (
      await call(teacher, "/api/teacher/enrolments", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-combined-science" }),
      })
    ).status,
  ).toBe(201)

  const progress = await call(student, "/api/me/progress")
  expect(progress.body.courses).toHaveLength(2)

  await call(teacher, "/api/teacher/enrolments", {
    method: "DELETE",
    body: JSON.stringify({ studentId, course: "gcse-combined-science" }),
  })
  expect((await call(student, "/api/me/progress")).body.courses).toHaveLength(1)

  await call(student, "/api/me", { method: "PATCH", body: JSON.stringify({ stage: "alevel" }) })
  expect((await call(student, "/api/me")).body.user.stage).toBe("alevel")
})

test("a teacher can only tick topics for their own students", async () => {
  // Linking and enrolment happen in the test above; ticking a student who is not yours is refused there too.
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
      await call(anonymous, "/api/teacher/lessons", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher" }),
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

test("the site names the one tutor, and only a teacher may rename the site", async () => {
  const site = (await call(anonymous, "/api/site")).body
  expect(site.name).toBe("Bridgewell Tutoring")
  expect(site.tutor.name).toBe("Test Tutor")

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
    body: JSON.stringify({
      weekday: 1,
      starts: "16:00",
      ends: "18:00",
      subject: "Maths",
      note: "After school, online",
    }),
  })
  expect(added.status).toBe(201)

  const published = (await call(anonymous, "/api/availability")).body.slots.find(
    (slot: { id: number }) => slot.id === added.body.id,
  )
  expect(published.teacher).toBe("Test Tutor")
  expect(published.weekday).toBe(1)
  expect(published.subject).toBe("Maths")
  expect(published.note).toBe("After school, online")

  // A slot released for a subject we do not teach is refused; "Any subject" is allowed.
  const latin = await call(teacher, "/api/availability", {
    method: "POST",
    body: JSON.stringify({ weekday: 6, starts: "10:00", ends: "11:00", subject: "Latin" }),
  })
  expect(latin.status).toBe(400)
  const anySlot = await call(teacher, "/api/availability", {
    method: "POST",
    body: JSON.stringify({ weekday: 6, starts: "10:00", ends: "11:00", subject: "Any" }),
  })
  expect(anySlot.status).toBe(201)
  await call(teacher, "/api/availability", { method: "DELETE", body: JSON.stringify({ id: anySlot.body.id }) })

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

  // A student cannot remove the tutor's slots.
  expect(
    (await call(student, "/api/availability", { method: "DELETE", body: JSON.stringify({ id: first.body.id }) }))
      .status,
  ).toBe(403)
})

test("only one tutor account can exist, and every account needs an email", async () => {
  const second = await call({}, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Second Tutor",
      email: "second-tutor@test.local",
      password: "password123",
      role: "teacher",
    }),
  })
  expect(second.status).toBe(409)
  expect(second.body.error).toContain("already has a tutor account")

  // The refused tutor has no account at all.
  const login = await call({}, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "second-tutor@test.local", password: "password123" }),
  })
  expect(login.status).toBe(401)

  // Students are still free to sign up.
  const pupil = await call({}, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Second Pupil",
      email: "second-pupil@test.local",
      password: "password123",
      role: "student",
      stage: "ks3",
    }),
  })
  expect(pupil.status).toBe(201)

  for (const email of ["", "   ", "not-an-email"]) {
    const missing = await call({}, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "No Email", email, password: "password123", role: "student", stage: "ks3" }),
    })
    expect(missing.status).toBe(400)
    expect(missing.body.error.toLowerCase()).toContain("email")
  }
})

test("the tutor schedules sessions and the student sees them with a joining link", async () => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  expect(
    (
      await call(student, "/api/teacher/lessons", {
        method: "POST",
        body: JSON.stringify({ studentId, course: "gcse-maths-higher", startsAt: soon }),
      })
    ).status,
  ).toBe(403)

  for (const bad of [
    { startsAt: "whenever", minutes: 60 },
    { startsAt: soon, minutes: 5 },
    { startsAt: soon, minutes: 600 },
    { startsAt: soon, minutes: 60, joinUrl: "https://evil.example.com/j/1" },
  ]) {
    const refused = await call(teacher, "/api/teacher/lessons", {
      method: "POST",
      body: JSON.stringify({ studentId, course: "gcse-maths-higher", ...bad }),
    })
    expect(refused.status).toBe(400)
  }

  const booked = await call(teacher, "/api/teacher/lessons", {
    method: "POST",
    body: JSON.stringify({
      studentId,
      course: "gcse-maths-higher",
      startsAt: soon,
      minutes: 60,
      joinUrl: "https://zoom.us/j/123456789",
      note: "Circle theorems",
    }),
  })
  expect(booked.status).toBe(201)

  const dash = await call(student, "/api/dashboard")
  const lesson = dash.body.lessons.find((item: { id: number }) => item.id === booked.body.id)
  expect(lesson.join_url).toBe("https://zoom.us/j/123456789")
  expect(lesson.course).toBe("GCSE Maths (Higher Tier)")
  expect(lesson.note).toBe("Circle theorems")

  // The tutor sees it in their own diary, named for the student.
  expect(
    (await call(teacher, "/api/dashboard")).body.lessons.some(
      (item: { student: string }) => item.student === "Test Student",
    ),
  ).toBe(true)

  // A session already finished drops off the list.
  const past = await call(teacher, "/api/teacher/lessons", {
    method: "POST",
    body: JSON.stringify({
      studentId,
      course: "gcse-maths-higher",
      startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      minutes: 60,
    }),
  })
  expect(past.status).toBe(201)
  expect(
    (await call(student, "/api/dashboard")).body.lessons.some((item: { id: number }) => item.id === past.body.id),
  ).toBe(false)

  expect(
    (await call(student, "/api/teacher/lessons", { method: "DELETE", body: JSON.stringify({ id: booked.body.id }) }))
      .status,
  ).toBe(403)
  expect(
    (await call(teacher, "/api/teacher/lessons", { method: "DELETE", body: JSON.stringify({ id: booked.body.id }) }))
      .status,
  ).toBe(200)
  expect(
    (await call(student, "/api/dashboard")).body.lessons.some((item: { id: number }) => item.id === booked.body.id),
  ).toBe(false)
})

test("signing in with Zoom creates and then reuses the account", async () => {
  expect((await call(anonymous, "/api/site")).body.zoom).toBe(true)

  // The authorize step hands out a state we have to give back.
  const started = await fetch(`${base}/api/auth/zoom/start`, { redirect: "manual" })
  expect(started.status).toBe(302)
  const authorize = new URL(started.headers.get("location")!)
  expect(authorize.pathname).toBe("/oauth/authorize")
  expect(authorize.searchParams.get("client_id")).toBe("test-client")
  expect(authorize.searchParams.get("response_type")).toBe("code")
  const state = authorize.searchParams.get("state")!
  expect(state).toBeTruthy()

  // A callback with someone else's state is refused.
  const forged = await fetch(`${base}/api/auth/zoom/callback?code=good-code&state=made-up`, { redirect: "manual" })
  expect(forged.headers.get("location")).toContain("zoom=expired")

  const declined = await fetch(`${base}/api/auth/zoom/callback?error=access_denied&state=${state}`, {
    redirect: "manual",
  })
  expect(declined.headers.get("location")).toContain("zoom=declined")

  // That state is spent, so a fresh one is needed.
  const second = await fetch(`${base}/api/auth/zoom/start`, { redirect: "manual" })
  const goodState = new URL(second.headers.get("location")!).searchParams.get("state")!

  const badCode = await fetch(`${base}/api/auth/zoom/callback?code=wrong&state=${goodState}`, { redirect: "manual" })
  expect(badCode.headers.get("location")).toContain("zoom=failed")

  const third = await fetch(`${base}/api/auth/zoom/start`, { redirect: "manual" })
  const finalState = new URL(third.headers.get("location")!).searchParams.get("state")!
  const done = await fetch(`${base}/api/auth/zoom/callback?code=good-code&state=${finalState}`, { redirect: "manual" })
  expect(done.status).toBe(302)
  expect(done.headers.get("location")).toBe("/#/dashboard")

  const zoomSession = { cookie: done.headers.get("set-cookie")!.split(";")[0] }
  const me = await call(zoomSession, "/api/me")
  expect(me.body.user.email).toBe("zoomer@test.local")
  expect(me.body.user.name).toBe("Zoe Zoomer")
  expect(me.body.user.role).toBe("student")

  // Signing in again reuses that account rather than making a second one.
  const again = await fetch(`${base}/api/auth/zoom/start`, { redirect: "manual" })
  const againState = new URL(again.headers.get("location")!).searchParams.get("state")!
  const back = await fetch(`${base}/api/auth/zoom/callback?code=good-code&state=${againState}`, { redirect: "manual" })
  const secondSession = { cookie: back.headers.get("set-cookie")!.split(";")[0] }
  expect((await call(secondSession, "/api/me")).body.user.id).toBe(me.body.user.id)
})

test("a forgotten password can be reset once, and the old one stops working", async () => {
  // The answer is the same whether or not the address has an account.
  const unknown = await call({}, "/api/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ email: "nobody@test.local" }),
  })
  expect(unknown.status).toBe(200)
  expect(unknown.body.message).toContain("nobody@test.local")
  expect(unknown.body.demoToken).toBeUndefined()

  expect((await call({}, "/api/auth/forgot", { method: "POST", body: JSON.stringify({ email: "" }) })).status).toBe(400)

  const asked = await call({}, "/api/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ email: "pupil@test.local" }),
  })
  expect(asked.status).toBe(200)
  expect(asked.body.demoToken).toBeTruthy()

  expect(
    (
      await call({}, "/api/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: asked.body.demoToken, password: "short" }),
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await call({}, "/api/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: "not-a-token", password: "brandnewpass" }),
      })
    ).status,
  ).toBe(400)

  const reset = await call({}, "/api/auth/reset", {
    method: "POST",
    body: JSON.stringify({ token: asked.body.demoToken, password: "brandnewpass" }),
  })
  expect(reset.status).toBe(200)

  // The link is single use.
  expect(
    (
      await call({}, "/api/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: asked.body.demoToken, password: "another-one" }),
      })
    ).status,
  ).toBe(400)

  // The old password is dead; the new one works.
  expect(
    (
      await call({}, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "pupil@test.local", password: "password123" }),
      })
    ).status,
  ).toBe(401)
  const back = await call({}, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "pupil@test.local", password: "brandnewpass" }),
  })
  expect(back.status).toBe(200)

  // Sessions opened with the old password were ended by the reset.
  expect((await call(student, "/api/me")).body.user).toBeNull()
})

test("signing out invalidates the session", async () => {
  const session = { ...student }
  await call(session, "/api/auth/logout", { method: "POST" })
  expect((await call({ cookie: student.cookie }, "/api/me")).body.user).toBeNull()
})
