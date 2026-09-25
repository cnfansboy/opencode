const main = document.getElementById("main")
const account = document.getElementById("nav-account")
const toast = document.getElementById("toast")

const state = { user: null, interests: [], stages: [], subjects: [] }

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

async function refreshUser() {
  const data = await api("/me")
  state.user = data.user
  state.interests = data.interests ?? []
  renderAccountNav()
}

function renderAccountNav() {
  if (!state.user) {
    account.innerHTML = `<a href="#/login">Sign in</a><a class="btn primary small" href="#/register">Create account</a>`
    return
  }
  const home = state.user.role === "teacher" ? "#/teaching" : "#/account"
  account.innerHTML = `
    <a href="${home}">${state.user.role === "teacher" ? "My students" : "My learning"}</a>
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

async function register() {
  if (!state.stages.length) Object.assign(state, await api("/stages"))
  main.innerHTML = `
    <div class="wrap">
      <h1>Create an account</h1>
      <form id="form" class="card narrow">
        <div id="error"></div>
        <div class="field"><label for="name">Full name</label><input id="name" name="name" required autocomplete="name" /></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
          <p class="small muted" style="margin:6px 0 0">At least 8 characters.</p></div>
        <div class="field"><label for="role">This account is for</label>
          <select id="role" name="role"><option value="student">A student or parent</option><option value="teacher">A tutor</option></select></div>
        <div class="field" id="stage-field"><label for="stage">Student stage</label>
          <select id="stage" name="stage">${state.stages.map((stage) => `<option value="${stage.id}">${esc(stage.label)}</option>`).join("")}</select></div>
        <button class="btn primary" type="submit">Create account</button>
        <p class="small muted" style="margin-top:12px">Already registered? <a href="#/login">Sign in</a>.</p>
      </form>
    </div>`

  const form = document.getElementById("form")
  form.role.onchange = () => {
    document.getElementById("stage-field").hidden = form.role.value === "teacher"
  }
  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api("/auth/register", { method: "POST", body: Object.fromEntries(new FormData(form)) })
      await refreshUser()
      notify(`Welcome, ${state.user.name}`)
      go(state.user.role === "teacher" ? "/teaching" : "/account")
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

function signIn() {
  main.innerHTML = `
    <div class="wrap">
      <h1>Sign in</h1>
      <form id="form" class="card narrow">
        <div id="error"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password" /></div>
        <button class="btn primary" type="submit">Sign in</button>
        <p class="small muted" style="margin-top:12px">No account yet? <a href="#/register">Create one</a>.</p>
      </form>
    </div>`

  const form = document.getElementById("form")
  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api("/auth/login", { method: "POST", body: Object.fromEntries(new FormData(form)) })
      await refreshUser()
      notify(`Welcome back, ${state.user.name}`)
      go(state.user.role === "teacher" ? "/teaching" : "/account")
    } catch (error) {
      document.getElementById("error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
  }
}

const STATUS_LABEL = { not_started: "Not covered yet", covered: "Covered", secure: "Secure" }

async function studentArea() {
  if (!state.user) return go("/login")
  if (state.user.role !== "student") return go("/teaching")
  if (!state.stages.length) Object.assign(state, await api("/stages"))

  const [{ courses: tracked }, { courses: all }, me] = await Promise.all([
    api("/me/progress"),
    api("/courses"),
    api("/me"),
  ])
  const totals = tracked.reduce(
    (sum, course) => ({ total: sum.total + course.counts.total, covered: sum.covered + course.counts.covered }),
    { total: 0, covered: 0 },
  )

  main.innerHTML = `
    <div class="wrap">
      <h1>My learning</h1>
      <p class="lead muted">${esc(state.user.name)} · ${esc(state.user.stageLabel ?? "No stage set")}</p>

      <section class="block card">
        <h2>Stage</h2>
        <p class="muted small">Tell us where the student is working so tutors pitch sessions correctly.</p>
        <div class="field-row">
          <div><label for="stage">Current stage</label>
            <select id="stage">${state.stages.map((stage) => `<option value="${stage.id}" ${state.user.stage === stage.id ? "selected" : ""}>${esc(stage.label)}</option>`).join("")}</select></div>
        </div>
        ${
          me.classes.length
            ? `<p class="small muted">Saturday classes booked: ${me.classes.map((item) => `${esc(item.title)} (${esc(item.starts)}, ${esc(item.room)})`).join(", ")}. <a href="#/saturday">Change</a></p>`
            : `<p class="small muted">No Saturday classes booked — <a href="#/saturday">see the timetable</a>.</p>`
        }
        ${me.teachers.length ? `<p class="small muted">Your tutors: ${me.teachers.map((teacher) => esc(teacher.name)).join(", ")}</p>` : `<p class="small muted">No tutor linked yet — your tutor can add you using your email address (${esc(state.user.email)}).</p>`}
      </section>

      <section class="block card">
        <h2>Add a course</h2>
        <p class="muted small">Pick anything you are interested in — it appears in your topic tracker below and your tutor can start ticking it off.</p>
        <div class="field-row">
          <div><label for="add-course">Course</label>
            <select id="add-course">
              <option value="">Choose a course…</option>
              ${all
                .filter((course) => !tracked.some((item) => item.slug === course.slug))
                .map(
                  (course) =>
                    `<option value="${esc(course.slug)}">${esc(course.title)} — ${esc(course.stageLabel)}</option>`,
                )
                .join("")}
            </select></div>
        </div>
      </section>

      <section class="block">
        <div class="row between">
          <h2>Topic progress</h2>
          <span class="muted small">${totals.covered} of ${totals.total} topics covered</span>
        </div>
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
            : `<div class="empty">You haven't added any courses yet. Pick one above or <a href="#/courses">browse the full list</a>.</div>`
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

async function teacherArea() {
  if (!state.user) return go("/login")
  if (state.user.role !== "teacher") return go("/account")
  const { students } = await api("/teacher/students")

  main.innerHTML = `
    <div class="wrap">
      <h1>My students</h1>
      <p class="lead muted">Tick off topics as you cover them. Students and parents see the same tracker in their own account.</p>

      <section class="block card">
        <h2>Add a student</h2>
        <form id="add" class="row" style="align-items:flex-end">
          <div style="flex:1 1 260px"><label for="email">Student's account email</label><input id="email" name="email" type="email" required placeholder="student@example.com" /></div>
          <button class="btn primary" type="submit">Add student</button>
        </form>
        <div id="add-error"></div>
      </section>

      <section class="block">
        ${
          students.length
            ? `<table class="students">
                <thead><tr><th>Student</th><th>Stage</th><th>Courses</th><th>Topics covered</th><th></th></tr></thead>
                <tbody>${students
                  .map(
                    (student) => `<tr>
                      <td><strong>${esc(student.name)}</strong><br /><span class="small muted">${esc(student.email)}</span></td>
                      <td>${esc(student.stageLabel ?? "—")}</td>
                      <td>${student.courseCount}</td>
                      <td>${student.counts.covered}/${student.counts.total}
                        <div class="bar" style="max-width:140px"><span style="width:${student.counts.percent}%"></span></div></td>
                      <td><a class="btn small" href="#/teaching/${student.id}">Open tracker</a></td>
                    </tr>`,
                  )
                  .join("")}</tbody>
              </table>`
            : `<div class="empty">No students yet. Add one using the email address they registered with.</div>`
        }
      </section>
    </div>`

  const form = document.getElementById("add")
  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      await api("/teacher/students", { method: "POST", body: { email: form.email.value } })
      notify("Student added")
      teacherArea()
    } catch (error) {
      document.getElementById("add-error").innerHTML = `<div class="error">${esc(error.message)}</div>`
    }
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
    else if (parts[0] === "login") signIn()
    else if (parts[0] === "register") await register()
    else if (parts[0] === "account") await studentArea()
    else if (parts[0] === "teaching" && parts[1]) await studentTracker(parts[1])
    else if (parts[0] === "teaching") await teacherArea()
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
await refreshUser()
await render()
