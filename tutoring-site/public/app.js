const main = document.getElementById("main")
const account = document.getElementById("nav-account")
const toast = document.getElementById("toast")

const state = { user: null, interests: [], stages: [], subjects: [], site: { name: "Bridgewell Tutoring" } }

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
  state.interests = data.interests ?? []
  renderAccountNav()
}

function renderAccountNav() {
  if (!state.user) {
    account.innerHTML = `<a href="#/signin">Sign in</a><a class="btn primary small" href="#/signup">Create account</a>`
    return
  }
  account.innerHTML = `
    <a href="#/dashboard">Dashboard</a>
    ${state.user.role === "student" ? '<a href="#/account">My courses</a>' : ""}
    <button class="btn ghost small" id="logout">Sign out</button>`
  document.getElementById("logout").onclick = async () => {
    await api("/auth/logout", { method: "POST" })
    state.user = null
    state.interests = []
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

async function home() {
  const [{ courses }, { reviews, summary }] = await Promise.all([api("/courses"), api("/reviews")])
  const featured = [...courses]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.review_count - a.review_count)
    .slice(0, 3)
  main.innerHTML = `
    <div class="wrap">
      <div class="hero">
        <h1>Tutoring that shows its working</h1>
        <p class="lead">
          Specialist maths tuition from KS2 through to A Level, and science up to GCSE. Every family gets an account
          with a shared topic tracker, so you can see exactly which topics your tutor has covered and which are still
          to come.
        </p>
        <div class="row">
          <a class="btn primary" href="#/courses">Browse courses</a>
          <a class="btn" href="#/reviews">Read reviews</a>
        </div>
        <div class="stats">
          <div class="stat"><strong>${courses.length}</strong><span class="muted">courses offered</span></div>
          <div class="stat"><strong>Maths &amp; science</strong><span class="muted">KS2 to A Level</span></div>
          <div class="stat"><strong>${summary.average ?? "—"} / 5</strong><span class="muted">from ${summary.count} reviews</span></div>
        </div>
      </div>

      <section class="block">
        <h2>How it works</h2>
        <div class="grid">
          <div class="card"><h3>1. Choose your courses</h3><p class="muted">Create an account, tell us the student's stage, and pick the courses you are interested in.</p></div>
          <div class="card"><h3>2. Meet your tutor</h3><p class="muted">Weekly sessions online or in person, planned around the exam board your school follows.</p></div>
          <div class="card"><h3>3. Follow the progress</h3><p class="muted">After each session the tutor ticks off the topics covered, so nothing quietly gets missed.</p></div>
        </div>
      </section>

      <section class="block">
        <div class="row between"><h2>Popular courses</h2><a href="#/courses">See all ${courses.length} →</a></div>
        <div class="grid">${featured.map(courseCard).join("")}</div>
      </section>

      <section class="block">
        <div class="row between"><h2>What families say</h2><a href="#/reviews">All reviews →</a></div>
        <div class="grid">
          ${reviews
            .slice(0, 3)
            .map(
              (review) => `<div class="card">
                ${stars(review.rating)}
                <h3>${esc(review.title)}</h3>
                <p class="muted">${esc(review.body)}</p>
                <p class="small muted">${esc(review.author_name)}${review.course_title ? ` · ${esc(review.course_title)}` : ""}</p>
              </div>`,
            )
            .join("")}
        </div>
      </section>
    </div>`
}

const courseCard = (course) => `
  <article class="card">
    <div class="row"><span class="tag stage">${esc(course.stageLabel ?? course.stage)}</span><span class="tag">${esc(course.subject)}</span></div>
    <h3 style="margin-top:10px"><a href="#/courses/${esc(course.slug)}">${esc(course.title)}</a></h3>
    <p class="muted">${esc(course.summary)}</p>
    <p class="small muted">${course.topic_count} topics · ${money(course.price_pence)} per session · ${esc(course.session_length)}</p>
    ${course.rating ? `<p class="small">${stars(course.rating)} ${course.rating} (${course.review_count})</p>` : `<p class="small muted">No reviews yet</p>`}
  </article>`

async function courses() {
  if (!state.stages.length) Object.assign(state, await api("/stages"))
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "")
  const query = new URLSearchParams({
    stage: params.get("stage") ?? "",
    subject: params.get("subject") ?? "",
    q: params.get("q") ?? "",
  })
  const { courses: list } = await api(`/courses?${query}`)

  main.innerHTML = `
    <div class="wrap">
      <h1>Courses</h1>
      <p class="lead muted">Filter by the stage the student is working at, or by subject.</p>
      <form id="filters" class="card" style="margin-bottom:24px">
        <div class="field-row">
          <div><label for="stage">Stage</label>
            <select id="stage" name="stage">
              <option value="">All stages</option>
              ${state.stages.map((stage) => `<option value="${stage.id}" ${query.get("stage") === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}
            </select></div>
          <div><label for="subject">Subject</label>
            <select id="subject" name="subject">
              <option value="">All subjects</option>
              ${state.subjects.map((subject) => `<option value="${esc(subject)}" ${query.get("subject") === subject ? "selected" : ""}>${esc(subject)}</option>`).join("")}
            </select></div>
          <div><label for="q">Search</label><input id="q" name="q" value="${esc(query.get("q"))}" placeholder="e.g. algebra" /></div>
        </div>
      </form>
      ${list.length ? `<div class="grid">${list.map(courseCard).join("")}</div>` : `<div class="empty">No courses match those filters.</div>`}
    </div>`

  const form = document.getElementById("filters")
  form.onsubmit = (event) => event.preventDefault()
  form.oninput = () => {
    const next = new URLSearchParams(Object.fromEntries(new FormData(form)))
    for (const [key, value] of [...next]) if (!value) next.delete(key)
    location.hash = `#/courses${next.toString() ? `?${next}` : ""}`
  }
}

async function courseDetail(slug) {
  const { course } = await api(`/courses/${encodeURIComponent(slug)}`)
  const saved = state.interests.some((interest) => interest.slug === course.slug)

  main.innerHTML = `
    <div class="wrap">
      <p class="small"><a href="#/courses">← All courses</a></p>
      <div class="row"><span class="tag stage">${esc(course.stageLabel)}</span><span class="tag">${esc(course.subject)}</span></div>
      <h1>${esc(course.title)}</h1>
      <p class="lead muted">${esc(course.description)}</p>
      <p><strong>${money(course.price_pence)}</strong> per session · ${esc(course.session_length)} · ${course.topics.length} topics</p>
      <div class="row" style="margin-bottom:32px">
        ${
          state.user?.role === "student"
            ? `<button class="btn ${saved ? "" : "primary"}" id="interest">${saved ? "✓ In my courses — remove" : "Add to my courses"}</button>`
            : state.user
              ? `<span class="muted small">Sign in with a student account to add courses.</span>`
              : `<a class="btn primary" href="#/register">Create an account to track this course</a>`
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

  const button = document.getElementById("interest")
  if (button)
    button.onclick = async () => {
      button.disabled = true
      try {
        await api("/me/interests", { method: saved ? "DELETE" : "POST", body: { course: course.slug } })
        await refreshUser()
        notify(saved ? "Removed from your courses" : "Added to your courses")
        courseDetail(slug)
      } catch (error) {
        notify(error.message)
        button.disabled = false
      }
    }
}

async function saturday() {
  const { classes } = await api("/saturday-classes")
  const slots = [...new Set(classes.map((item) => item.starts))].sort()

  main.innerHTML = `
    <div class="wrap">
      <h1>Saturday classes</h1>
      <p class="lead muted">
        Small-group classes at the Bridgewell centre every Saturday in term time, 9am to 3pm. Book a regular place, or
        come to a single session while a space is free.
      </p>
      ${
        state.user?.role === "student"
          ? ""
          : state.user
            ? `<p class="muted small">Sign in with a student account to book a place.</p>`
            : `<p class="muted small"><a href="#/register">Create an account</a> to book a place.</p>`
      }
      ${slots
        .map(
          (slot) => `<section class="block">
            <h2 class="slot">${slot}</h2>
            <div class="grid">
              ${classes
                .filter((item) => item.starts === slot)
                .map(
                  (item) => `<article class="card class-card">
                    <div class="row"><span class="tag stage">${esc(item.stageLabel)}</span><span class="tag">${esc(item.subject)}</span></div>
                    <h3 style="margin-top:10px">${esc(item.title)}</h3>
                    <p class="small muted">${esc(item.starts)}–${esc(item.ends)} · ${esc(item.room)} · ${esc(item.tutor)}</p>
                    <p class="muted">${esc(item.description)}</p>
                    <p class="small"><strong>${money(item.price_pence)}</strong> per session ·
                      <span class="${item.spaces ? "spaces" : "full"}">${item.spaces ? `${item.spaces} of ${item.capacity} spaces left` : "Full"}</span></p>
                    ${
                      state.user?.role === "student"
                        ? `<button class="btn ${item.mine ? "" : "primary"} ${item.spaces || item.mine ? "" : "disabled"}" data-book="${esc(item.slug)}" data-mine="${item.mine ? "1" : ""}" ${item.spaces || item.mine ? "" : "disabled"}>
                            ${item.mine ? "✓ Booked — cancel place" : item.spaces ? "Book a place" : "Class full"}
                          </button>`
                        : ""
                    }
                  </article>`,
                )
                .join("")}
            </div>
          </section>`,
        )
        .join("")}
    </div>`

  for (const button of document.querySelectorAll("[data-book]"))
    button.onclick = async () => {
      button.disabled = true
      try {
        await api("/saturday-classes", {
          method: button.dataset.mine ? "DELETE" : "POST",
          body: { class: button.dataset.book },
        })
        notify(button.dataset.mine ? "Place cancelled" : "Place booked")
        saturday()
      } catch (error) {
        notify(error.message)
        button.disabled = false
      }
    }
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

async function signIn(mode) {
  const creating = mode === "register"
  if (creating && !state.stages.length) Object.assign(state, await api("/stages"))

  main.innerHTML = `
    <div class="wrap">
      <div class="auth">
        <aside class="auth-brand">
          <p class="auth-eyebrow">${esc(state.site.name)}</p>
          <h2>Every topic, tracked.</h2>
          <p>Maths from KS2 to A Level and science up to GCSE, taught weekly and ticked off topic by topic so you always know where you are.</p>
          <ul class="auth-points">
            <li>See exactly what your tutor has covered</li>
            <li>Follow the AQA, Edexcel or OCR specification</li>
            <li>Book a Saturday class at the centre</li>
          </ul>
        </aside>
        <div class="auth-card">
          <div class="auth-tabs" role="tablist">
            <button role="tab" aria-selected="${!creating}" data-mode="login">Sign in</button>
            <button role="tab" aria-selected="${creating}" data-mode="register">Create account</button>
          </div>
          <form id="form">
            <div id="error"></div>
            ${
              creating
                ? `<div class="field"><label for="name">Full name</label><input id="name" name="name" required autocomplete="name" /></div>`
                : ""
            }
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" required ${creating ? 'minlength="8"' : ""} autocomplete="${creating ? "new-password" : "current-password"}" />
              ${creating ? `<p class="small muted" style="margin:6px 0 0">At least 8 characters.</p>` : ""}
            </div>
            ${
              creating
                ? `<div class="field"><label for="role">I am</label>
                    <select id="role" name="role">
                      <option value="student">A student or parent</option>
                      <option value="teacher">A tutor at ${esc(state.site.name)}</option>
                    </select></div>
                  <div class="field" id="stage-field"><label for="stage">Student stage</label>
                    <select id="stage" name="stage">${state.stages.map((stage) => `<option value="${stage.id}">${esc(stage.label)}</option>`).join("")}</select></div>`
                : ""
            }
            <button class="btn primary block" type="submit">${creating ? "Create account" : "Sign in"}</button>
          </form>
          <p class="small muted auth-swap">
            ${creating ? `Already have an account? <a href="#/signin">Sign in</a>.` : `New here? <a href="#/signup">Create an account</a>.`}
          </p>
        </div>
      </div>
    </div>`

  for (const tab of document.querySelectorAll("[data-mode]"))
    tab.onclick = () => go(tab.dataset.mode === "register" ? "/signup" : "/signin")

  const form = document.getElementById("form")
  if (creating)
    form.role.onchange = () => {
      document.getElementById("stage-field").hidden = form.role.value === "teacher"
    }

  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api(creating ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      })
      await refreshUser()
      notify(`${GREETING()}, ${state.user.name}`)
      go("/dashboard")
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

async function dashboard() {
  if (!state.user) return go("/signin")
  const data = await api("/dashboard")
  if (data.role === "student") return studentDashboard(data)
  return teacherDashboard(data)
}

function studentDashboard(data) {
  const next = data.classes[0]
  const percent = data.totals.total ? Math.round((data.totals.covered / data.totals.total) * 100) : 0

  main.innerHTML = `
    <div class="wrap">
      <header class="dash-head">
        <div>
          <p class="eyebrow">${GREETING()}</p>
          <h1>${esc(data.user.name)}</h1>
          <p class="muted">${esc(data.user.stageLabel ?? "No stage set")}${data.teachers.length ? ` · Tutor: ${data.teachers.map((t) => esc(t.name)).join(", ")}` : ""}</p>
        </div>
        <a class="btn" href="#/courses">Browse courses</a>
      </header>

      <div class="tiles">
        <div class="tile"><span class="tile-label">Courses</span><strong>${data.courses.length}</strong><span class="muted small">on your plan</span></div>
        <div class="tile"><span class="tile-label">Topics covered</span><strong>${data.totals.covered}<span class="of">/${data.totals.total}</span></strong><span class="muted small">${percent}% of your courses</span></div>
        <div class="tile"><span class="tile-label">Marked secure</span><strong>${data.totals.secure}</strong><span class="muted small">ready for the exam</span></div>
        <div class="tile"><span class="tile-label">Next Saturday</span><strong class="tile-small">${next ? esc(next.starts) : "—"}</strong><span class="muted small">${next ? esc(next.title) : "No class booked"}</span></div>
      </div>

      <section class="block">
        <div class="row between"><h2>Your courses</h2><a href="#/account">Manage courses →</a></div>
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
                    <a class="btn small" href="#/account">See topics</a>
                  </article>`,
                )
                .join("")}</div>`
            : `<div class="empty">No courses yet. <a href="#/courses">Pick one from the catalogue</a> and your tutor can start ticking topics off.</div>`
        }
      </section>

      <section class="block">
        <h2>Recent sessions</h2>
        ${
          data.recent.length
            ? `<ul class="feed">${data.recent
                .map(
                  (item) => `<li>
                    <span class="feed-tick ${item.status}">${item.status === "secure" ? "✔✔" : "✔"}</span>
                    <div>
                      <strong>${esc(item.topic)}</strong>
                      <span class="small muted">${esc(item.course)} · ${esc(item.teacher ?? "Tutor")} · ${date(item.updated_at)}</span>
                      ${item.note ? `<p class="small note-line">“${esc(item.note)}”</p>` : ""}
                    </div>
                  </li>`,
                )
                .join("")}</ul>`
            : `<div class="empty">Nothing ticked off yet — your tutor updates this after each session.</div>`
        }
      </section>

      ${
        data.classes.length
          ? `<section class="block">
              <div class="row between"><h2>Your Saturday classes</h2><a href="#/saturday">Timetable →</a></div>
              <ul class="feed">${data.classes
                .map(
                  (item) => `<li><span class="feed-time">${esc(item.starts)}</span>
                    <div><strong>${esc(item.title)}</strong><span class="small muted">${esc(item.room)} · ${esc(item.tutor)} · until ${esc(item.ends)}</span></div></li>`,
                )
                .join("")}</ul>
            </section>`
          : ""
      }
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
        <a class="btn" href="#/saturday">Saturday timetable</a>
      </header>

      <div class="tiles">
        <div class="tile"><span class="tile-label">Students</span><strong>${data.students.length}</strong><span class="muted small">you tutor</span></div>
        <div class="tile"><span class="tile-label">Topics ticked</span><strong>${data.ticksThisWeek}</strong><span class="muted small">in the last 7 days</span></div>
        <div class="tile"><span class="tile-label">Needs attention</span><strong>${data.needsAttention}</strong><span class="muted small">under 25% covered</span></div>
        <div class="tile"><span class="tile-label">Your Saturdays</span><strong class="tile-small">${data.classes.length ? esc(data.classes[0].starts) : "—"}</strong><span class="muted small">${data.classes.length ? esc(data.classes[0].title) : "No class booked"}</span></div>
      </div>

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

async function studentArea() {
  if (!state.user) return go("/signin")
  if (state.user.role !== "student") return go("/dashboard")
  if (!state.stages.length) Object.assign(state, await api("/stages"))

  const [{ courses: tracked }, { courses: all }, me] = await Promise.all([
    api("/me/progress"),
    api("/courses"),
    api("/me"),
  ])

  main.innerHTML = `
    <div class="wrap">
      <header class="dash-head">
        <div>
          <p class="eyebrow">My courses</p>
          <h1>${esc(state.user.name)}</h1>
          <p class="muted">Choose your stage and the courses you want tutoring in. Your tutor ticks the topics off as you cover them.</p>
        </div>
        <a class="btn" href="#/dashboard">← Dashboard</a>
      </header>

      <section class="block grid two">
        <div class="card">
          <h3>Stage</h3>
          <p class="small muted">So tutors pitch sessions at the right level.</p>
          <div class="field">
            <label for="stage">Current stage</label>
            <select id="stage">${state.stages.map((stage) => `<option value="${stage.id}" ${state.user.stage === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}</select>
          </div>
          ${me.teachers.length ? `<p class="small muted">Your tutors: ${me.teachers.map((teacher) => esc(teacher.name)).join(", ")}</p>` : `<p class="small muted">No tutor linked yet — your tutor adds you using ${esc(state.user.email)}.</p>`}
        </div>
        <div class="card">
          <h3>Add a course</h3>
          <p class="small muted">Everything we teach: maths to A Level, science to GCSE.</p>
          <div class="field">
            <label for="add-course">Course</label>
            <select id="add-course">
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
          ${me.classes.length ? `<p class="small muted">Saturday: ${me.classes.map((item) => `${esc(item.title)} (${esc(item.starts)})`).join(", ")}. <a href="#/saturday">Change</a></p>` : `<p class="small muted">No Saturday classes booked — <a href="#/saturday">see the timetable</a>.</p>`}
        </div>
      </section>

      <section class="block">
        <h2>Topic progress</h2>
        ${
          tracked.length
            ? tracked
                .map(
                  (course, index) => `<details class="course" ${index === 0 ? "open" : ""}>
                    <summary>
                      <span>${esc(course.title)} <span class="tag stage">${esc(course.stageLabel)}</span></span>
                      <span class="muted small">${course.counts.covered}/${course.counts.total} · ${course.counts.percent}%</span>
                    </summary>
                    <div class="bar"><span style="width:${course.counts.percent}%"></span></div>
                    <p class="small muted">${course.counts.secure} topics marked secure.
                      <button class="btn small ghost" data-remove="${esc(course.slug)}">Remove course</button></p>
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
            : `<div class="empty">No courses yet. Add one above, or <a href="#/courses">browse the catalogue</a>.</div>`
        }
      </section>
    </div>`

  document.getElementById("stage").onchange = async (event) => {
    await api("/me", { method: "PATCH", body: { stage: event.target.value } })
    await refreshUser()
    notify("Stage updated")
    studentArea()
  }
  document.getElementById("add-course").onchange = async (event) => {
    if (!event.target.value) return
    await api("/me/interests", { method: "POST", body: { course: event.target.value } })
    await refreshUser()
    notify("Course added")
    studentArea()
  }
  for (const button of document.querySelectorAll("[data-remove]"))
    button.onclick = async () => {
      await api("/me/interests", { method: "DELETE", body: { course: button.dataset.remove } })
      await refreshUser()
      notify("Course removed")
      studentArea()
    }
}

async function studentTracker(id) {
  if (!state.user) return go("/login")
  const { student, courses: tracked } = await api(`/teacher/students/${id}`)

  main.innerHTML = `
    <div class="wrap">
      <p class="small"><a href="#/teaching">← My students</a></p>
      <h1>${esc(student.name)}</h1>
      <p class="lead muted">${esc(student.stageLabel ?? "No stage set")} · ${esc(student.email)}</p>
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
    if (!parts.length) await home()
    else if (parts[0] === "courses" && parts[1]) await courseDetail(parts[1])
    else if (parts[0] === "courses") await courses()
    else if (parts[0] === "saturday") await saturday()
    else if (parts[0] === "reviews") await reviews()
    else if (parts[0] === "signin" || parts[0] === "login") await signIn("login")
    else if (parts[0] === "signup" || parts[0] === "register") await signIn("register")
    else if (parts[0] === "dashboard") await dashboard()
    else if (parts[0] === "account") await studentArea()
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
