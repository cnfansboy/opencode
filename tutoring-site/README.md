# Bridgewell Tutoring

A tutoring website for maths from KS2 to A Level and science up to GCSE, with a shared topic tracker:
families browse what is offered and leave reviews,
students create an account and choose their stage and courses, and tutors tick off the topics they
have covered with each student.

Self-contained — Bun, `bun:sqlite` and vanilla front-end code. No build step and no runtime
dependencies.

## Viewable artifact version

`artifact/index.html` is a single-page version of this site, published as a Claude Artifact so it can
be opened in a browser without running the server:

**https://claude.ai/artifact/R57eMvR7XczEfHpdRGGJSB**

It carries the same catalogue (`artifact/catalogue.json`, exported from this app's API) and the same
areas behind three tabs: Subjects, Reviews and a Dashboard. The Dashboard tab is the
sign-in section: pick student or tutor and it renders that role's dashboard, matching the app's. A
tutor can rename the site from there, stored in `settings/site` and applied for every viewer.

Two differences are forced by the medium: there is no password — the claude.ai account opening the
page authenticates you, and signing in stores your email address and role (the email goes in your own
private subtree, which no other viewer can read) — and state lives in the
artifact's shared document store rather than SQLite, so courses, bookings, reviews, topic ticks and
the site name are shared live between everyone who opens it. The example students and reviews are
seeded demo data and are labelled as such.

## Running it

```sh
bun run demo    # optional: seed demo accounts and some existing progress
bun run start   # http://localhost:3000
bun run dev     # same, with reload on change
bun test        # API tests
```

The database is created at `data/tutoring.sqlite` on first run (override with `TUTORING_DB`, and the
port with `PORT`). Courses, topics and the opening set of reviews are seeded automatically.

Demo accounts created by `bun run demo`, all with the password `demopass123`:

| Role    | Email                 | Notes                                             |
| ------- | --------------------- | ------------------------------------------------- |
| Tutor   | `teacher@example.com` | Linked to both students below                     |
| Student | `amira@example.com`   | GCSE, two courses, first five maths topics ticked |
| Student | `tom@example.com`     | KS2, one course, nothing ticked yet               |

## What the site does

**What is taught** — maths at KS2, KS3, GCSE and A Level, and science at KS3 and GCSE. The catalogue,
and the seeded reviews follow that rule, and a test enforces it.

**Landing** — the site opens on the sign-in gate: choose whether you are a student or the tutor, and
you get that role's sign-in page. Students can create an account from there; the tutor's page says
who holds the account once it is claimed.

**Public pages** — the Subjects tab (levels and released time slots), a page per course
listing every topic it covers, and a reviews page with the overall average rating.

**Sign in** — a sign-in section with tabs for signing in and creating an account, hashed with bcrypt
via `Bun.password` and an httpOnly session cookie that expires after 30 days. An account is either a
_student_ (a student or their parent) or a _tutor_, and signing in lands on the dashboard for that
role.

**Account rules** — every account needs a valid, unique email address; sign-up is refused without
one. Only one tutor account can exist: once it is claimed, `POST /api/auth/register` refuses a second
tutor with a 409 and the sign-up form stops offering the role, naming whoever holds it.

**Forgotten password** — asking for a link always answers the same way, so the endpoint cannot be
used to discover who has an account. A real request stores a single-use token, hashed with SHA-256
and valid for an hour; setting a new password consumes the token and ends every session opened with
the old one. With no mailer configured the response also returns the token so the demo can show the
link on screen — set `TUTORING_MAIL` once you wire up real email and it stops being returned.

**Student dashboard** (`#/dashboard`) — a greeting, tiles for courses, topics covered, topics marked
secure and their tutor's next published slot, a progress ring per course coloured by subject, and a feed of the
topics the tutor most recently ticked off with their session notes. `#/account` behind it is where
the student sets their stage, adds or removes courses, and reads the full topic list for each one.

**Tutor dashboard** (`#/dashboard`) — tiles for students, topics ticked in the last seven days,
students under 25% covered and the hours released each week; each student with a progress ring and
a link into their tracker, where every topic is marked _not covered yet_, _covered_ or _secure_ with
an optional session note. The student sees the same tracker in their own account immediately. The
dashboard also holds the form to add a student by their registered email, the time-slot release form,
and the site settings.

**Website name** — a tutor renames the site from their dashboard. The name is stored in `settings`
and drives the header, the brand initial, the footer and the browser tab.

**Subjects** (`#/subjects`) — one tab for everything taught. Open a subject to see the levels it runs
to — each level opens to its summary, session length and exam boards — and the time slots released
for that subject. A slot released for "Any subject" shows under every subject. A student adds a
course to their plan from here.

**Time slots** — one person tutors here, and they release their week from their dashboard: day, from,
until, which subject it is for, and an optional note. Overlapping hours on the same day are refused,
as are malformed or backwards times and a subject that is not taught. Slots appear under their
subject on the Subjects tab and on that tutor's students' dashboards.

**Reviews** — any signed-in account can leave a review of a specific course or of the service
overall. Reviews show on the reviews page and on the relevant course page.

## Data model

| Table              | Holds                                                               |
| ------------------ | ------------------------------------------------------------------- |
| `settings`         | Site-wide settings, currently the website name                      |
| `password_resets`  | Hashed single-use reset tokens with an expiry                       |
| `users`            | Name, email, bcrypt password, role (`student` / `teacher`), stage   |
| `saturday_classes` | Timetabled class: time, tutor, room, capacity and price             |
| `sessions`         | Session cookie tokens and their expiry                              |
| `courses`          | Title, subject, stage, description, price, session length           |
| `topics`           | The ordered topic list belonging to a course                        |
| `interests`        | Courses a student has said they are interested in                   |
| `teacher_students` | Which tutor works with which student                                |
| `progress`         | One row per student and topic: status, note, who ticked it and when |
| `reviews`          | Rating, title and body, optionally attached to a course             |

## API

| Method   | Path                        | Who                                          |
| -------- | --------------------------- | -------------------------------------------- |
| `GET`    | `/api/site`                 | Anyone                                       |
| `PUT`    | `/api/site`                 | Tutor                                        |
| `GET`    | `/api/dashboard`            | Signed in, shaped by role                    |
| `GET`    | `/api/stages`               | Anyone                                       |
| `GET`    | `/api/courses`              | Anyone (`?stage=&subject=&q=`)               |
| `GET`    | `/api/courses/:slug`        | Anyone                                       |
| `GET`    | `/api/availability`         | Anyone                                       |
| `POST`   | `/api/availability`         | Tutor; refused on overlap or unknown subject |
| `DELETE` | `/api/availability`         | Tutor, own slots only                        |
| `GET`    | `/api/reviews`              | Anyone (`?course=slug`)                      |
| `POST`   | `/api/reviews`              | Signed in                                    |
| `POST`   | `/api/auth/register`        | Anyone                                       |
| `POST`   | `/api/auth/login`           | Anyone                                       |
| `POST`   | `/api/auth/forgot`          | Anyone; always answers the same              |
| `POST`   | `/api/auth/reset`           | Anyone holding a valid token                 |
| `POST`   | `/api/auth/logout`          | Signed in                                    |
| `GET`    | `/api/me`                   | Anyone (`user` is `null` when signed out)    |
| `PATCH`  | `/api/me`                   | Signed in                                    |
| `POST`   | `/api/me/interests`         | Student                                      |
| `DELETE` | `/api/me/interests`         | Student                                      |
| `GET`    | `/api/me/progress`          | Student                                      |
| `GET`    | `/api/teacher/students`     | Tutor                                        |
| `POST`   | `/api/teacher/students`     | Tutor                                        |
| `GET`    | `/api/teacher/students/:id` | Tutor, own students only                     |
| `DELETE` | `/api/teacher/students/:id` | Tutor                                        |
| `PUT`    | `/api/teacher/progress`     | Tutor, own students only                     |

Every write checks the session and the role server-side; a tutor can only read or change progress
for a student on their own list.

## Before using this for real

This is a working demo, not a production deployment. At minimum you would want: HTTPS with the
`Secure` cookie flag, rate limiting on the auth and review endpoints, email verification and a
a real mailer behind the reset flow (with `TUTORING_MAIL` set so the token stops coming back in the
response), moderation of reviews before they publish, a parent/child account distinction
if parents rather than students hold the login, and a backup routine for the SQLite file.

## Layout

```
src/server.ts   HTTP routes, validation and static file serving
src/db.ts       SQLite connection, schema, stage and status definitions
src/seed.ts     Course, topic and review seed data
src/auth.ts     Password hashing, sessions and cookies
src/demo.ts     Optional demo accounts and sample progress
public/         index.html, styles.css and app.js (hash-routed client)
test/api.test.ts
```
