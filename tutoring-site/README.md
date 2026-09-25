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
five areas, with two differences forced by the medium: there is no email/password sign-up — the
viewer is identified by the claude.ai account opening the page — and state lives in the artifact's
shared document store rather than SQLite, so courses, bookings, reviews and topic ticks are shared
live between everyone who opens it. The example students and reviews in it are seeded demo data and
are labelled as such.

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
the Saturday timetable and the seeded reviews all follow that rule, and a test enforces it.

**Public pages** — a home page, a course catalogue filterable by stage, subject and free text, a page
per course listing every topic it covers, and a reviews page with the overall average rating.

**Sign in** — a sign-in section with tabs for signing in and creating an account, hashed with bcrypt
via `Bun.password` and an httpOnly session cookie that expires after 30 days. An account is either a
_student_ (a student or their parent) or a _tutor_, and signing in lands on the dashboard for that
role.

**Student dashboard** (`#/dashboard`) — a greeting, tiles for courses, topics covered, topics marked
secure and the next Saturday class, a progress ring per course coloured by subject, and a feed of the
topics the tutor most recently ticked off with their session notes. `#/account` behind it is where
the student sets their stage, adds or removes courses, and reads the full topic list for each one.

**Tutor dashboard** (`#/dashboard`) — tiles for students, topics ticked in the last seven days,
students under 25% covered and the tutor's own Saturday class; each student with a progress ring and
a link into their tracker, where every topic is marked _not covered yet_, _covered_ or _secure_ with
an optional session note. The student sees the same tracker in their own account immediately. The
dashboard also holds the form to add a student by their registered email, and the site settings.

**Website name** — a tutor renames the site from their dashboard. The name is stored in `settings`
and drives the header, the brand initial, the footer and the browser tab.

**Saturday classes** — a Saturday timetable of small-group classes grouped by start time, showing the
tutor, room, price and how many places are still free. Students book or cancel a place, the count
updates for everyone, and a full class is refused rather than overbooked. Booked classes also show in
the student's own area.

**Reviews** — any signed-in account can leave a review of a specific course or of the service
overall. Reviews show on the reviews page and on the relevant course page.

## Data model

| Table              | Holds                                                               |
| ------------------ | ------------------------------------------------------------------- |
| `settings`         | Site-wide settings, currently the website name                      |
| `users`            | Name, email, bcrypt password, role (`student` / `teacher`), stage   |
| `saturday_classes` | Timetabled class: time, tutor, room, capacity and price             |
| `class_bookings`   | Which student holds a place in which Saturday class                 |
| `sessions`         | Session cookie tokens and their expiry                              |
| `courses`          | Title, subject, stage, description, price, session length           |
| `topics`           | The ordered topic list belonging to a course                        |
| `interests`        | Courses a student has said they are interested in                   |
| `teacher_students` | Which tutor works with which student                                |
| `progress`         | One row per student and topic: status, note, who ticked it and when |
| `reviews`          | Rating, title and body, optionally attached to a course             |

## API

| Method   | Path                        | Who                                       |
| -------- | --------------------------- | ----------------------------------------- |
| `GET`    | `/api/site`                 | Anyone                                    |
| `PUT`    | `/api/site`                 | Tutor                                     |
| `GET`    | `/api/dashboard`            | Signed in, shaped by role                 |
| `GET`    | `/api/stages`               | Anyone                                    |
| `GET`    | `/api/courses`              | Anyone (`?stage=&subject=&q=`)            |
| `GET`    | `/api/courses/:slug`        | Anyone                                    |
| `GET`    | `/api/saturday-classes`     | Anyone (adds `mine` when signed in)       |
| `POST`   | `/api/saturday-classes`     | Student, refused when the class is full   |
| `DELETE` | `/api/saturday-classes`     | Student                                   |
| `GET`    | `/api/reviews`              | Anyone (`?course=slug`)                   |
| `POST`   | `/api/reviews`              | Signed in                                 |
| `POST`   | `/api/auth/register`        | Anyone                                    |
| `POST`   | `/api/auth/login`           | Anyone                                    |
| `POST`   | `/api/auth/logout`          | Signed in                                 |
| `GET`    | `/api/me`                   | Anyone (`user` is `null` when signed out) |
| `PATCH`  | `/api/me`                   | Signed in                                 |
| `POST`   | `/api/me/interests`         | Student                                   |
| `DELETE` | `/api/me/interests`         | Student                                   |
| `GET`    | `/api/me/progress`          | Student                                   |
| `GET`    | `/api/teacher/students`     | Tutor                                     |
| `POST`   | `/api/teacher/students`     | Tutor                                     |
| `GET`    | `/api/teacher/students/:id` | Tutor, own students only                  |
| `DELETE` | `/api/teacher/students/:id` | Tutor                                     |
| `PUT`    | `/api/teacher/progress`     | Tutor, own students only                  |

Every write checks the session and the role server-side; a tutor can only read or change progress
for a student on their own list.

## Before using this for real

This is a working demo, not a production deployment. At minimum you would want: HTTPS with the
`Secure` cookie flag, rate limiting on the auth and review endpoints, email verification and a
password reset flow, moderation of reviews before they publish, a parent/child account distinction
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
