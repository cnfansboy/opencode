# Bridgewell Tutoring

A tutoring website with a shared topic tracker: families browse what is offered and leave reviews,
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

**Public pages** — a home page, a course catalogue filterable by stage, subject and free text, a page
per course listing every topic it covers, and a reviews page with the overall average rating.

**Accounts** — email and password sign-up, hashed with bcrypt via `Bun.password`, with an httpOnly
session cookie that expires after 30 days. An account is either a _student_ (a student or their
parent) or a _tutor_.

**Student area** (`#/account`)

- Set the student's stage: KS2, KS3 (secondary), GCSE or A Level.
- Add the courses they are interested in, from the catalogue or from any course page.
- See topic-by-topic progress for each of those courses: what has been covered, what is marked
  secure, which tutor ticked it, when, and any note they left.

**Tutor area** (`#/teaching`)

- Add a student by the email address they registered with.
- See every student with their stage and overall topics-covered count.
- Open a student's tracker and mark each topic _not covered yet_, _covered_ or _secure_, with an
  optional session note. The student sees the same tracker in their own account immediately.

**Saturday classes** — a Saturday timetable of small-group classes grouped by start time, showing the
tutor, room, price and how many places are still free. Students book or cancel a place, the count
updates for everyone, and a full class is refused rather than overbooked. Booked classes also show in
the student's own area.

**Reviews** — any signed-in account can leave a review of a specific course or of the service
overall. Reviews show on the reviews page and on the relevant course page.

## Data model

| Table              | Holds                                                               |
| ------------------ | ------------------------------------------------------------------- |
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
