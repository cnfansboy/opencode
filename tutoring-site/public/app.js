const main = document.getElementById("main")
const account = document.getElementById("nav-account")
const toast = document.getElementById("toast")

const state = {
  user: null,
  courses: [],
  stages: [],
  subjects: [],
  site: { name: "Bridgewell Tutoring", tutor: null },
}

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
const money = (pence) => `£${(pence / 100).toFixed(0)}`
const stars = (rating) =>
  `<span class="stars" aria-label="${rating} out of 5">${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}</span>`
const date = (value) =>
  value
    ? new Date(value.replace(" ", "T") + "Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

let toastTimer
function notify(message) {
  toast.textContent = message
  toast.classList.add("show")
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200)
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: options.body ? { "Content-Type": "application/json" } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.")
  return data
}

function applySite() {
  document.title = state.site.name
  document.getElementById("brand-name").textContent = state.site.name
  document.querySelector(".brand-mark").textContent = state.site.name.trim().charAt(0).toUpperCase()
  for (const node of document.querySelectorAll("[data-site-name]")) node.textContent = state.site.name
}

async function refreshUser() {
  const data = await api("/me")
  state.user = data.user
  state.courses = data.courses ?? []
  renderAccountNav()
}

function renderAccountNav() {
  if (!state.user) {
    account.innerHTML = `<a class="btn primary small" href="#/">Sign in</a>`
    return
  }
  account.innerHTML = `
    <span class="who small muted">${esc(state.user.name)}</span>
    <button class="btn ghost small" id="logout">Sign out</button>`
  document.getElementById("logout").onclick = async () => {
    await api("/auth/logout", { method: "POST" })
    state.user = null
    state.courses = []
    renderAccountNav()
    notify("Signed out")
    go("/")
  }
}

const go = (path) => {
  location.hash = `#${path}`
}

function loading() {
  main.innerHTML = `<div class="wrap"><p class="muted">Loading…</p></div>`
}

/* ---------- views ---------- */

async function subjects() {
  if (!state.stages.length) Object.assign(state, await api("/stages"))
  const [{ courses: list }, { slots }] = await Promise.all([api("/courses"), api("/availability")])

  const groups = state.subjects
    .map((subject) => ({
      subject,
      courses: list
        .filter((course) => course.subject === subject)
        .sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage]),
      slots: slots.filter((slot) => slot.subject === subject || slot.subject === "Any"),
    }))
    .filter((group) => group.courses.length)

  main.innerHTML = `
    <div class="wrap">
      <header class="dash-head">
        <div>
          <p class="eyebrow">What we teach</p>
          <h1>Subjects</h1>
          <p class="muted">
            Open a subject to see the levels it runs to and the time slots ${esc(tutorName())} has released for it.
          </p>
        </div>
      </header>

      ${groups
        .map(
          (group, index) => `<details class="subject-block ${subjectClass(group.subject)}" ${index === 0 ? "open" : ""}>
            <summary>
              <div class="subject-head">
                <h2>${esc(group.subject)}</h2>
                <div class="level-chips">
                  ${group.courses.map((course) => `<span class="chip level">${esc(levelShort(course.stage))}</span>`).join("")}
                  <span class="chip slots-count">${group.slots.length} slot${group.slots.length === 1 ? "" : "s"} free</span>
                </div>
              </div>
            </summary>

            <div class="subject-body">
              <h3 class="section-label">Levels</h3>
              <div class="levels">
                ${group.courses
                  .map(
                    (course) => `<details class="level-card">
                      <summary>
                        <span class="level-name">
                          <strong>${esc(levelShort(course.stage))}</strong>
                          <span class="muted small">${esc(course.title)}</span>
                        </span>
                        <span class="level-meta">${course.topic_count} topics · ${money(course.price_pence)}</span>
                      </summary>
                      <div class="level-body">
                        <p class="small">${esc(course.summary)}</p>
                        <p class="small muted">${esc(course.session_length)} · ${esc(course.exam_boards)}</p>
                        <div class="rowline">
                          <a class="btn small" href="#/subjects/${esc(course.slug)}">Topics and reviews</a>
                          ${state.courses.some((c) => c.slug === course.slug) ? `<span class="chip good">You're taking this</span>` : ""}
                        </div>
                      </div>
                    </details>`,
                  )
                  .join("")}
              </div>

              <h3 class="section-label">Time slots released for ${esc(group.subject)}</h3>
              ${
                group.slots.length
                  ? `<ul class="slot-list">${group.slots
                      .map(
                        (slot) => `<li class="slot-row">
                          <span class="slot-day">${esc(WEEKDAY_NAMES[slot.weekday])}</span>
                          <span class="slot-time">${esc(slot.starts)}–${esc(slot.ends)}</span>
                          <span class="slot-detail">
                            ${slot.subject === "Any" ? `<span class="chip">Any subject</span>` : ""}
                            ${slot.note ? esc(slot.note) : ""}
                          </span>
                        </li>`,
                      )
                      .join("")}</ul>
                     <p class="small muted">Sessions run with ${esc(tutorName())}. Get in touch to take one of these slots.</p>`
                  : `<div class="empty">No slots released for ${esc(group.subject)} yet.</div>`
              }
            </div>
          </details>`,
        )
        .join("")}
    </div>`
}

async function courseDetail(slug) {
  const { course } = await api(`/courses/${encodeURIComponent(slug)}`)
  const taking = state.courses.some((item) => item.slug === course.slug)

  main.innerHTML = `
    <div class="wrap">
      <p class="small"><a href="#/subjects">← All subjects</a></p>
      <div class="row"><span class="tag stage">${esc(course.stageLabel)}</span><span class="tag">${esc(course.subject)}</span></div>
      <h1>${esc(course.title)}</h1>
      <p class="lead muted">${esc(course.description)}</p>
      <p><strong>${money(course.price_pence)}</strong> per session · ${esc(course.session_length)} · ${course.topics.length} topics</p>
      <div class="row" style="margin-bottom:32px">
        ${
          taking
            ? `<span class="chip good">You're taking this course</span>`
            : `<span class="muted small">Your tutor adds courses to your plan — ask them about this one.</span>`
        }
      </div>

      <section class="block">
        <h2>Topics covered</h2>
        <p class="muted">Your tutor ticks these off in your account as you work through them.</p>
        <ul class="topics">${course.topics.map((topic) => `<li class="topic"><span class="title">${topic.position}. ${esc(topic.title)}</span></li>`).join("")}</ul>
      </section>

      <section class="block">
        <h2>Reviews for this course</h2>
        ${
          course.reviews.length
            ? course.reviews
                .map(
                  (review) => `<div class="review">${stars(review.rating)}<h4>${esc(review.title)}</h4>
                    <p class="muted">${esc(review.body)}</p>
                    <p class="small muted">${esc(review.author_name)} · ${date(review.created_at)}</p></div>`,
                )
                .join("")
            : `<div class="empty">No reviews for this course yet.</div>`
        }
        <a class="btn" href="#/reviews">Leave a review</a>
      </section>
    </div>`
}

async function reviews() {
  const [{ reviews: list, summary }, { courses: all }] = await Promise.all([api("/reviews"), api("/courses")])

  main.innerHTML = `
    <div class="wrap">
      <h1>Reviews</h1>
      <p class="lead muted">${summary.count} reviews · average ${summary.average ?? "—"} out of 5 ${summary.average ? stars(summary.average) : ""}</p>

      <section class="block card">
        <h2>Leave a review</h2>
        ${
          state.user
            ? `<form id="review-form" class="narrow">
                <div id="review-error"></div>
                <div class="field"><label for="course">Course</label>
                  <select id="course" name="course"><option value="">General / overall experience</option>
                  ${all.map((course) => `<option value="${esc(course.slug)}">${esc(course.title)}</option>`).join("")}</select></div>
                <div class="field"><label for="rating">Rating</label>
                  <select id="rating" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)} (${n})</option>`).join("")}</select></div>
                <div class="field"><label for="title">Title</label><input id="title" name="title" required placeholder="Sum it up in a few words" /></div>
                <div class="field"><label for="body">Your review</label><textarea id="body" name="body" required placeholder="What went well? What would you tell another family?"></textarea></div>
                <button class="btn primary" type="submit">Publish review</button>
                <p class="small muted" style="margin-top:8px">Posting as ${esc(state.user.name)}.</p>
              </form>`
            : `<p class="muted">Please <a href="#/login">sign in</a> or <a href="#/register">create an account</a> to leave a review.</p>`
        }
      </section>

      <section class="block">
        <h2>All reviews</h2>
        ${list
          .map(
            (review) => `<div class="review">${stars(review.rating)}<h4>${esc(review.title)}</h4>
              <p class="muted">${esc(review.body)}</p>
              <p class="small muted">${esc(review.author_name)} · ${review.course_title ? `${esc(review.course_title)} · ` : ""}${date(review.created_at)}</p></div>`,
          )
          .join("")}
      </section>
    </div>`

  const form = document.getElementById("review-form")
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault()
      const data = Object.fromEntries(new FormData(form))
      try {
        await api("/reviews", { method: "POST", body: { ...data, rating: Number(data.rating) } })
        notify("Thank you — your review is published")
        reviews()
      } catch (error) {
        document.getElementById("review-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
      }
    }
}

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const tutorName = () => state.site.tutor?.name || "your tutor"

const STAGE_RANK = { ks2: 1, ks3: 2, gcse: 3, alevel: 4 }
const levelShort = (stage) => (state.stages.find((s) => s.id === stage) || {}).short || stage

const STATUS_LABEL = { not_started: "Not covered yet", covered: "Covered", secure: "Secure" }

const GREETING = () => {
  const hour = new Date().getHours()
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

const subjectClass = (subject) => (subject === "Maths" ? "subject-maths" : "subject-science")

function ring(percent, subject) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  return `<svg class="ring ${subjectClass(subject)}" viewBox="0 0 64 64" role="img" aria-label="${percent}% covered">
    <circle class="ring-track" cx="32" cy="32" r="${radius}" />
    <circle class="ring-value" cx="32" cy="32" r="${radius}"
      stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - percent / 100)}" />
    <text x="32" y="33" class="ring-text">${percent}%</text>
  </svg>`
}

const ROLE_COPY = {
  student: {
    title: "Student sign in",
    blurb: "For students and parents following their topics.",
    label: "I'm a student or parent",
    detail: "Pick your courses, set your stage and follow every topic your tutor has covered.",
  },
  tutor: {
    title: "Tutor sign in",
    blurb: "For the one person tutoring here.",
    label: "I'm the tutor",
    detail: "See every student, tick off the topics you cover and release the hours you are free.",
  },
}

function authShell(inner) {
  return `
    <div class="wrap">
      <div class="auth">
        <aside class="auth-brand">
          <p class="auth-eyebrow">${esc(state.site.name)}</p>
          <h2>Every topic, tracked.</h2>
          <p>Maths from KS2 to A Level and science up to GCSE, taught weekly and ticked off topic by topic so you always know where you are.</p>
          <ul class="auth-points">
            <li>See exactly what your tutor has covered</li>
            <li>Follow the AQA, Edexcel or OCR specification</li>
            <li>Book into the slots your tutor releases</li>
          </ul>
        </aside>
        <div class="auth-card">${inner}</div>
      </div>
    </div>`
}

function roleChooser() {
  main.innerHTML = authShell(`
    <h1 class="auth-title">Sign in</h1>
    <p class="muted">Who is signing in?</p>
    <div class="role-picker">
      ${["student", "tutor"]
        .map(
          (role) => `<button class="role" data-role="${role}">
            <span class="role-icon" aria-hidden="true">${role === "student" ? "✎" : "✓"}</span>
            <strong>${esc(ROLE_COPY[role].label)}</strong>
            <span class="muted">${esc(ROLE_COPY[role].detail)}</span>
          </button>`,
        )
        .join("")}
    </div>
    <p class="small muted auth-swap">New here? Choose “student or parent” — you can create an account on the next step.</p>`)

  for (const button of document.querySelectorAll("[data-role]"))
    button.onclick = () => go(`/signin/${button.dataset.role}`)
}

async function signIn(role, mode) {
  if (!ROLE_COPY[role]) return go("/")
  const creating = mode === "register"
  if (creating && !state.stages.length) Object.assign(state, await api("/stages"))

  // The tutor account can only be claimed once.
  if (creating && role === "tutor" && state.site.tutor) return go("/signin/tutor")

  main.innerHTML = authShell(`
    <p class="small"><a href="#/">← Not you?</a></p>
    <h1 class="auth-title">${creating ? "Create your account" : ROLE_COPY[role].title}</h1>
    <p class="muted">${creating ? "You need an email address — it is how your tutor adds you to their list." : ROLE_COPY[role].blurb}</p>
    <form id="form">
      <div id="error"></div>
      ${creating ? `<div class="field"><label for="name">Full name</label><input id="name" name="name" required autocomplete="name" /></div>` : ""}
      <div class="field">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" required autocomplete="email" />
      </div>
      <div class="field">
        <div class="label-row">
          <label for="password">Password</label>
          ${creating ? "" : `<a class="small" href="#/forgot">Forgotten your password?</a>`}
        </div>
        <input id="password" name="password" type="password" required ${creating ? 'minlength="8"' : ""} autocomplete="${creating ? "new-password" : "current-password"}" />
        ${creating ? `<p class="small muted" style="margin:6px 0 0">At least 8 characters.</p>` : ""}
      </div>
      ${
        creating && role === "student"
          ? `<div class="field"><label for="stage">Student stage</label>
              <select id="stage" name="stage">${state.stages.map((stage) => `<option value="${stage.id}">${esc(stage.label)}</option>`).join("")}</select></div>`
          : ""
      }
      <button class="btn primary block" type="submit">${creating ? "Create account" : "Sign in"}</button>
    </form>
    ${
      state.site.zoom
        ? `<div class="or-line"><span>or</span></div>
           <a class="btn block zoom-btn" href="/api/auth/zoom/start">
             <span class="zoom-mark" aria-hidden="true">Z</span> Continue with Zoom
           </a>
           <p class="small muted" style="margin-top:8px">
             Sign in with Zoom and your session links open straight into your own Zoom account.
           </p>`
        : `<p class="small muted" style="margin-top:14px">Signing in with Zoom is not switched on for this site yet.</p>`
    }
    <p class="small muted auth-swap">
      ${
        creating
          ? `Already have an account? <a href="#/signin/${role}">Sign in</a>.`
          : role === "student"
            ? `New here? <a href="#/signup/student">Create an account</a>.`
            : state.site.tutor
              ? `${esc(state.site.tutor.name)} holds the tutor account for this site.`
              : `Setting up? <a href="#/signup/tutor">Claim the tutor account</a>.`
      }
    </p>`)

  const form = document.getElementById("form")
  form.onsubmit = async (event) => {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(form))
    try {
      await api(creating ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: creating ? { ...payload, role: role === "tutor" ? "teacher" : "student" } : payload,
      })
      state.site = await api("/site")
      applySite()
      await refreshUser()
      notify(`${GREETING()}, ${state.user.name}`)
      go("/dashboard")
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

function forgotPassword() {
  main.innerHTML = authShell(`
    <p class="small"><a href="#/">← Back to sign in</a></p>
    <h1 class="auth-title">Forgotten your password?</h1>
    <p class="muted">Enter the email address on your account and we will send a link to set a new one.</p>
    <form id="form">
      <div id="error"></div>
      <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
      <button class="btn primary block" type="submit">Email me a link</button>
    </form>
    <div id="sent"></div>`)

  const form = document.getElementById("form")
  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      const answer = await api("/auth/forgot", { method: "POST", body: { email: form.email.value } })
      form.hidden = true
      document.getElementById("sent").innerHTML = `
        <div class="sent-note">
          <p><strong>Check your inbox.</strong> ${esc(answer.message)}</p>
          <p class="small muted">The link works once and expires in an hour.</p>
        </div>
        ${
          answer.demoToken
            ? `<div class="demo-note">
                <p class="small"><strong>Demo site:</strong> no email is actually sent, so here is the link that would have been in it.</p>
                <a class="btn small" href="#/reset/${esc(answer.demoToken)}">Set a new password</a>
              </div>`
            : ""
        }
        <p class="small muted auth-swap"><a href="#/">Back to sign in</a></p>`
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

function resetPassword(token) {
  main.innerHTML = authShell(`
    <h1 class="auth-title">Set a new password</h1>
    <p class="muted">Choose a password you have not used here before. Signing in elsewhere ends when you save it.</p>
    <form id="form">
      <div id="error"></div>
      <div class="field">
        <label for="password">New password</label>
        <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
        <p class="small muted" style="margin:6px 0 0">At least 8 characters.</p>
      </div>
      <div class="field"><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required autocomplete="new-password" /></div>
      <button class="btn primary block" type="submit">Save and sign in</button>
    </form>
    <p class="small muted auth-swap"><a href="#/forgot">Request a new link</a></p>`)

  const form = document.getElementById("form")
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (form.password.value !== form.confirm.value)
      return (document.getElementById("error").innerHTML = `<div class="error">Those passwords do not match.</div>`)
    try {
      await api("/auth/reset", { method: "POST", body: { token, password: form.password.value } })
      await refreshUser()
      notify("Password updated")
      go("/dashboard")
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

async function dashboard() {
  if (!state.user) return go("/")
  if (!state.stages.length) Object.assign(state, await api("/stages"))
  const data = await api("/dashboard")
  if (data.role === "student") return studentDashboard(data)
  return teacherDashboard(data)
}

const LESSON_FORMAT = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }

function lessonWhen(iso) {
  const when = new Date(iso)
  return isNaN(when) ? "" : when.toLocaleString("en-GB", LESSON_FORMAT)
}

// The joining link goes live a quarter of an hour before the session and stays up until it ends.
function joinState(lesson) {
  const starts = new Date(lesson.starts_at).getTime()
  const now = Date.now()
  if (isNaN(starts)) return "later"
  if (now >= starts + lesson.minutes * 60000) return "over"
  if (now >= starts - 15 * 60000) return "open"
  return "later"
}

function lessonRow(lesson, forTutor) {
  const state = joinState(lesson)
  return `<li class="lesson ${state === "open" ? "lesson-now" : ""}">
    <div class="lesson-when">
      <strong>${esc(lessonWhen(lesson.starts_at))}</strong>
      <span class="small muted">${lesson.minutes} minutes</span>
    </div>
    <div class="lesson-what">
      <strong>${esc(lesson.course)}</strong>
      <span class="small muted">${forTutor ? esc(lesson.student) : esc(lesson.subject)}${lesson.note ? ` · ${esc(lesson.note)}` : ""}</span>
    </div>
    <div class="lesson-join">
      ${
        lesson.join_url
          ? state === "open"
            ? `<a class="btn primary small" href="${esc(lesson.join_url)}" target="_blank" rel="noopener">Join the Zoom meeting</a>`
            : `<a class="btn small" href="${esc(lesson.join_url)}" target="_blank" rel="noopener">Zoom link</a>`
          : `<span class="small muted">No link yet</span>`
      }
      ${forTutor ? `<button class="btn small ghost" data-drop-lesson="${lesson.id}">Cancel</button>` : ""}
    </div>
  </li>`
}

function studentDashboard(data) {
  const percent = data.totals.total ? Math.round((data.totals.covered / data.totals.total) * 100) : 0

  main.innerHTML = `
    <div class="wrap">
      <header class="dash-head">
        <div>
          <p class="eyebrow">${GREETING()}</p>
          <h1>${esc(data.user.name)}</h1>
          <p class="muted">${esc(data.user.stageLabel ?? "No stage set")}${data.teachers.length ? ` · Tutor: ${esc(data.teachers[0].name)}` : ""}</p>
        </div>
      </header>

      <section class="block">
        <h2>Courses you're taking</h2>
        ${
          data.courses.length
            ? `<div class="grid">${data.courses
                .map(
                  (course) => `<article class="card course-tile ${subjectClass(course.subject)}">
                    <div class="course-tile-top">
                      ${ring(course.counts.percent, course.subject)}
                      <div>
                        <h3>${esc(course.title)}</h3>
                        <p class="small muted">${esc(course.stageLabel)} · ${esc(course.subject)}</p>
                      </div>
                    </div>
                    <p class="small muted">${course.counts.covered} of ${course.counts.total} topics covered · ${course.counts.secure} secure</p>
                  </article>`,
                )
                .join("")}</div>`
            : `<div class="empty">Your tutor hasn't put you on a course yet. They add courses from their own dashboard.</div>`
        }
      </section>

      <section class="block">
        <h2>Next sessions</h2>
        ${
          data.lessons.length
            ? `<ul class="lessons">${data.lessons.map((lesson) => lessonRow(lesson, false)).join("")}</ul>
               <p class="small muted">The joining link opens 15 minutes before the session starts.</p>`
            : `<div class="empty">No sessions booked in. Your tutor schedules these.</div>`
        }
      </section>

      <section class="block">
        <div class="row between">
          <h2>Progress</h2>
          <span class="muted small">${data.totals.covered} of ${data.totals.total} topics covered · ${percent}%</span>
        </div>
        ${
          data.courses.length
            ? data.courses
                .map(
                  (course, index) => `<details class="course" ${index === 0 ? "open" : ""}>
                    <summary>
                      <span>${esc(course.title)} <span class="tag stage">${esc(course.stageLabel)}</span></span>
                      <span class="muted small">${course.counts.covered}/${course.counts.total} · ${course.counts.percent}%</span>
                    </summary>
                    <div class="bar"><span style="width:${course.counts.percent}%"></span></div>
                    <ul class="topics">
                      ${course.topics
                        .map(
                          (topic) => `<li class="topic ${topic.status}">
                            <span class="title">${topic.status === "not_started" ? "○" : "✓"} ${esc(topic.title)}</span>
                            <span class="tag">${STATUS_LABEL[topic.status]}</span>
                            ${topic.updated_at ? `<span class="meta">${esc(topic.teacher_name ?? "Tutor")} · ${date(topic.updated_at)}${topic.note ? ` · ${esc(topic.note)}` : ""}</span>` : ""}
                          </li>`,
                        )
                        .join("")}
                    </ul>
                  </details>`,
                )
                .join("")
            : `<div class="empty">Progress appears here once you are on a course.</div>`
        }
      </section>
    </div>`
}

function teacherDashboard(data) {
  main.innerHTML = `
    <div class="wrap">
      <header class="dash-head">
        <div>
          <p class="eyebrow">${GREETING()}</p>
          <h1>${esc(data.user.name)}</h1>
          <p class="muted">${data.students.length} student${data.students.length === 1 ? "" : "s"} on your list</p>
        </div>
        <a class="btn" href="#/subjects">Subjects</a>
      </header>

      <div class="tiles">
        <div class="tile"><span class="tile-label">Students</span><strong>${data.students.length}</strong><span class="muted small">you tutor</span></div>
        <div class="tile"><span class="tile-label">Topics ticked</span><strong>${data.ticksThisWeek}</strong><span class="muted small">in the last 7 days</span></div>
        <div class="tile"><span class="tile-label">Needs attention</span><strong>${data.needsAttention}</strong><span class="muted small">under 25% covered</span></div>
        <div class="tile"><span class="tile-label">Hours published</span><strong>${data.weeklyHours}</strong><span class="muted small">across ${data.slots.length} slot${data.slots.length === 1 ? "" : "s"} released</span></div>
      </div>

      <section class="block">
        <div class="row between"><h2>Next sessions</h2><span class="muted small">${data.lessons.length} booked in</span></div>
        ${
          data.lessons.length
            ? `<ul class="lessons">${data.lessons.map((lesson) => lessonRow(lesson, true)).join("")}</ul>`
            : `<div class="empty">Nothing in the diary. Schedule a session below.</div>`
        }
      </section>

      <section class="block">
        <h2>Your students</h2>
        ${
          data.students.length
            ? data.students
                .map(
                  (student) => `<article class="student-card">
                    ${ring(student.counts.percent, student.courses[0] ? "Maths" : "Science")}
                    <div class="student-main">
                      <h3>${esc(student.name)}</h3>
                      <p class="small muted">${esc(student.stageLabel ?? "No stage set")} · ${esc(student.email)}</p>
                      <p class="small muted">${student.courses.length ? student.courses.map((c) => `${esc(c.title)} (${c.counts.covered}/${c.counts.total})`).join(" · ") : "No courses chosen yet"}</p>
                    </div>
                    <a class="btn" href="#/teaching/${student.id}">Open tracker</a>
                  </article>`,
                )
                .join("")
            : `<div class="empty">No students yet. Add one below using the email address they registered with.</div>`
        }
      </section>

      <section class="block grid two">
        <div class="card">
          <h3>Add a student</h3>
          <p class="small muted">They need an account here first.</p>
          <form id="add-student">
            <div class="field"><label for="email">Student's email</label><input id="email" name="email" type="email" required placeholder="student@example.com" /></div>
            <button class="btn primary" type="submit">Add student</button>
          </form>
          <div id="add-error"></div>
        </div>
        <div class="card">
          <h3>Schedule a session</h3>
          <p class="small muted">The student sees it under “Next sessions”, and the Zoom link goes live 15 minutes before.</p>
          <form id="lesson-form">
            <div class="field-row">
              <div><label for="lesson-student">Student</label>
                <select id="lesson-student">${data.students.map((student) => `<option value="${student.id}">${esc(student.name)}</option>`).join("")}</select></div>
              <div><label for="lesson-course">Course</label><select id="lesson-course"></select></div>
            </div>
            <div class="field-row">
              <div><label for="lesson-when">Date and time</label><input id="lesson-when" type="datetime-local" required /></div>
              <div><label for="lesson-minutes">Minutes</label><input id="lesson-minutes" type="number" min="15" max="240" step="15" value="60" required /></div>
            </div>
            <div class="field"><label for="lesson-url">Zoom joining link</label><input id="lesson-url" type="url" placeholder="https://zoom.us/j/123456789" /></div>
            <div class="field"><label for="lesson-note">Note (optional)</label><input id="lesson-note" maxlength="120" placeholder="Circle theorems" /></div>
            <button class="btn primary" type="submit">Schedule session</button>
          </form>
          <div id="lesson-error"></div>
        </div>
        <div class="card">
          <h3>Release time slots</h3>
          <p class="small muted">Students see these under the subject you choose. Overlapping hours on the same day are refused.</p>
          <form id="slot-form">
            <div class="field-row">
              <div><label for="weekday">Day</label>
                <select id="weekday">${WEEKDAY_NAMES.map((day, index) => `<option value="${index}">${day}</option>`).join("")}</select></div>
              <div><label for="slot-subject">Subject</label>
                <select id="slot-subject">
                  <option value="Any">Any subject</option>
                  ${state.subjects.map((subject) => `<option value="${esc(subject)}">${esc(subject)}</option>`).join("")}
                </select></div>
            </div>
            <div class="field-row">
              <div><label for="starts">From</label><input id="starts" type="time" value="16:00" required /></div>
              <div><label for="ends">Until</label><input id="ends" type="time" value="18:00" required /></div>
            </div>
            <div class="field"><label for="slot-note">Note (optional)</label><input id="slot-note" maxlength="120" placeholder="Online, or at the centre" /></div>
            <button class="btn primary" type="submit">Release these hours</button>
          </form>
          <div id="slot-error"></div>
          ${
            data.slots.length
              ? `<ul class="slot-list tight">${data.slots
                  .map(
                    (slot) => `<li class="slot-row">
                      <span class="slot-day">${esc(WEEKDAY_NAMES[slot.weekday])}</span>
                      <span class="slot-time">${esc(slot.starts)}–${esc(slot.ends)}</span>
                      <span class="slot-detail"><span class="chip">${esc(slot.subject === "Any" ? "Any subject" : slot.subject)}</span>${slot.note ? " " + esc(slot.note) : ""}</span>
                      <button class="btn small ghost" data-drop-slot="${slot.id}">Remove</button>
                    </li>`,
                  )
                  .join("")}</ul>`
              : `<p class="small muted">No hours released yet.</p>`
          }
        </div>
        <div class="card">
          <h3>Site settings</h3>
          <p class="small muted">The name shown in the header, the footer and the browser tab.</p>
          <form id="site-form">
            <div class="field"><label for="site-name">Website name</label><input id="site-name" value="${esc(state.site.name)}" maxlength="40" required /></div>
            <button class="btn primary" type="submit">Save name</button>
          </form>
          <div id="site-error"></div>
        </div>
      </section>
    </div>`

  document.getElementById("add-student").onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api("/teacher/students", { method: "POST", body: { email: event.target.email.value } })
      notify("Student added")
      dashboard()
    } catch (error) {
      document.getElementById("add-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }

  const lessonForm = document.getElementById("lesson-form")
  const lessonStudent = document.getElementById("lesson-student")
  const lessonCourse = document.getElementById("lesson-course")

  const fillCourses = () => {
    const student = data.students.find((item) => String(item.id) === lessonStudent.value)
    lessonCourse.innerHTML = (student?.courses ?? [])
      .map((course) => `<option value="${esc(course.slug)}">${esc(course.title)}</option>`)
      .join("")
    if (!lessonCourse.innerHTML) lessonCourse.innerHTML = `<option value="">Put them on a course first</option>`
  }

  if (lessonStudent) {
    fillCourses()
    lessonStudent.onchange = fillCourses
  }

  if (lessonForm)
    lessonForm.onsubmit = async (event) => {
      event.preventDefault()
      try {
        await api("/teacher/lessons", {
          method: "POST",
          body: {
            studentId: Number(lessonStudent.value),
            course: lessonCourse.value,
            startsAt: new Date(document.getElementById("lesson-when").value).toISOString(),
            minutes: Number(document.getElementById("lesson-minutes").value),
            joinUrl: document.getElementById("lesson-url").value.trim(),
            note: document.getElementById("lesson-note").value,
          },
        })
        notify("Session scheduled")
        dashboard()
      } catch (error) {
        document.getElementById("lesson-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
      }
    }

  for (const button of document.querySelectorAll("[data-drop-lesson]"))
    button.onclick = async () => {
      await api("/teacher/lessons", { method: "DELETE", body: { id: Number(button.dataset.dropLesson) } })
      notify("Session cancelled")
      dashboard()
    }

  document.getElementById("slot-form").onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api("/availability", {
        method: "POST",
        body: {
          weekday: Number(document.getElementById("weekday").value),
          subject: document.getElementById("slot-subject").value,
          starts: document.getElementById("starts").value,
          ends: document.getElementById("ends").value,
          note: document.getElementById("slot-note").value,
        },
      })
      notify("Hours released")
      dashboard()
    } catch (error) {
      document.getElementById("slot-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }

  for (const button of document.querySelectorAll("[data-drop-slot]"))
    button.onclick = async () => {
      await api("/availability", { method: "DELETE", body: { id: Number(button.dataset.dropSlot) } })
      notify("Slot removed")
      dashboard()
    }

  document.getElementById("site-form").onsubmit = async (event) => {
    event.preventDefault()
    try {
      state.site = await api("/site", { method: "PUT", body: { name: document.getElementById("site-name").value } })
      applySite()
      notify("Website name updated")
    } catch (error) {
      document.getElementById("site-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

async function studentTracker(id) {
  if (!state.user) return go("/")
  const [{ student, courses: tracked }, { courses: all }] = await Promise.all([
    api(`/teacher/students/${id}`),
    api("/courses"),
  ])

  main.innerHTML = `
    <div class="wrap">
      <p class="small"><a href="#/teaching">← My students</a></p>
      <h1>${esc(student.name)}</h1>
      <p class="lead muted">${esc(student.stageLabel ?? "No stage set")} · ${esc(student.email)}</p>

      <section class="block card">
        <h2>Courses</h2>
        <p class="small muted">You decide what this student is taking. Removing a course keeps the ticks in case you put it back.</p>
        <div class="rowline" style="margin-bottom:12px">
          ${
            tracked.length
              ? tracked
                  .map(
                    (course) => `<span class="chip good">${esc(course.title)}
                      <button class="chip-x" data-unenrol="${esc(course.slug)}" aria-label="Remove ${esc(course.title)}">×</button></span>`,
                  )
                  .join("")
              : `<span class="muted small">Not on any course yet.</span>`
          }
        </div>
        <div class="field-row">
          <div>
            <label for="enrol">Put them on a course</label>
            <select id="enrol">
              <option value="">Choose a course…</option>
              ${all
                .filter((course) => !tracked.some((item) => item.slug === course.slug))
                .map(
                  (course) =>
                    `<option value="${esc(course.slug)}">${esc(course.title)} — ${esc(course.stageLabel)}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>
      </section>
      ${
        tracked.length
          ? tracked
              .map(
                (course) => `<details class="course" open>
                  <summary>
                    <span>${esc(course.title)} <span class="tag stage">${esc(course.stageLabel)}</span></span>
                    <span class="muted small">${course.counts.covered}/${course.counts.total} · ${course.counts.percent}%</span>
                  </summary>
                  <div class="bar"><span style="width:${course.counts.percent}%"></span></div>
                  <ul class="topics">
                    ${course.topics
                      .map(
                        (topic) => `<li class="topic ${topic.status}" data-topic="${topic.id}">
                          <span class="title">${esc(topic.title)}</span>
                          <span class="status-group">
                            ${["not_started", "covered", "secure"]
                              .map(
                                (status) =>
                                  `<button class="btn small ${topic.status === status ? "on" : ""}" data-set="${status}" data-topic-id="${topic.id}">${STATUS_LABEL[status]}</button>`,
                              )
                              .join("")}
                          </span>
                          <span class="meta">
                            <input class="note" data-note-for="${topic.id}" value="${esc(topic.note)}" placeholder="Session note (optional) — press Enter to save" />
                            ${topic.updated_at ? `<span data-updated="${topic.id}">Last updated ${date(topic.updated_at)} by ${esc(topic.teacher_name ?? "tutor")}</span>` : `<span data-updated="${topic.id}"></span>`}
                          </span>
                        </li>`,
                      )
                      .join("")}
                  </ul>
                </details>`,
              )
              .join("")
          : `<div class="empty">${esc(student.name)} hasn't added any courses yet. Ask them to choose their courses in their account.</div>`
      }
    </div>`

  const enrol = document.getElementById("enrol")
  if (enrol)
    enrol.onchange = async () => {
      if (!enrol.value) return
      await api("/teacher/enrolments", { method: "POST", body: { studentId: Number(id), course: enrol.value } })
      notify("Course added")
      studentTracker(id)
    }

  for (const button of document.querySelectorAll("[data-unenrol]"))
    button.onclick = async () => {
      await api("/teacher/enrolments", {
        method: "DELETE",
        body: { studentId: Number(id), course: button.dataset.unenrol },
      })
      notify("Course removed")
      studentTracker(id)
    }

  const save = async (topicId, status, note) => {
    await api("/teacher/progress", {
      method: "PUT",
      body: { studentId: Number(id), topicId: Number(topicId), status, note },
    })
  }

  for (const button of document.querySelectorAll("[data-set]"))
    button.onclick = async () => {
      const topicId = button.dataset.topicId
      const note = document.querySelector(`[data-note-for="${topicId}"]`).value
      try {
        await save(topicId, button.dataset.set, note)
        notify(`Marked "${STATUS_LABEL[button.dataset.set].toLowerCase()}"`)
        studentTracker(id)
      } catch (error) {
        notify(error.message)
      }
    }

  for (const input of document.querySelectorAll(".note"))
    input.onkeydown = async (event) => {
      if (event.key !== "Enter") return
      event.preventDefault()
      const topicId = input.dataset.noteFor
      const current = document.querySelector(`[data-topic="${topicId}"] .btn.on`)?.dataset.set ?? "covered"
      await save(topicId, current, input.value)
      notify("Note saved")
    }
}

/* ---------- router ---------- */

async function render() {
  const [path] = location.hash.replace(/^#/, "").split("?")
  const parts = path.split("/").filter(Boolean)
  loading()

  try {
    if (!parts.length) state.user ? await dashboard() : roleChooser()
    else if ((parts[0] === "subjects" || parts[0] === "courses") && parts[1]) await courseDetail(parts[1])
    else if (parts[0] === "subjects" || parts[0] === "courses") await subjects()
    else if (parts[0] === "availability" || parts[0] === "saturday") return go("/subjects")
    else if (parts[0] === "reviews") await reviews()
    else if (parts[0] === "forgot") forgotPassword()
    else if (parts[0] === "reset" && parts[1]) resetPassword(parts[1])
    else if (parts[0] === "signin" && parts[1]) await signIn(parts[1], "login")
    else if (parts[0] === "signup" && parts[1]) await signIn(parts[1], "register")
    else if (parts[0] === "signin" || parts[0] === "login" || parts[0] === "signup" || parts[0] === "register")
      roleChooser()
    else if (parts[0] === "dashboard") await dashboard()
    else if (parts[0] === "teaching" && parts[1]) await studentTracker(parts[1])
    else if (parts[0] === "teaching") await dashboard()
    else main.innerHTML = `<div class="wrap"><h1>Page not found</h1><p><a href="#/">Back to the home page</a></p></div>`
  } catch (error) {
    main.innerHTML = `<div class="wrap"><div class="error">${esc(error.message)}</div><p><a href="#/">Back to the home page</a></p></div>`
  }

  for (const link of document.querySelectorAll("nav a"))
    link.classList.toggle("active", link.getAttribute("href") === `#${path}`)
  document.getElementById("nav").classList.remove("open")
  window.scrollTo({ top: 0 })
}

document.getElementById("nav-toggle").onclick = (event) => {
  const nav = document.getElementById("nav")
  nav.classList.toggle("open")
  event.currentTarget.setAttribute("aria-expanded", String(nav.classList.contains("open")))
}

addEventListener("hashchange", render)
state.site = await api("/site")
applySite()
await refreshUser()
await render()
