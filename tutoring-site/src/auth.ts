import { db } from "./db"

const COOKIE = "tutoring_session"
const DAYS = 30

export type User = {
  id: number
  name: string
  email: string
  role: "student" | "teacher"
  stage: string | null
  created_at: string
}

export async function hash(password: string) {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 })
}

export async function verify(password: string, stored: string) {
  return Bun.password.verify(password, stored)
}

export function login(userId: number) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "")
  db.query("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(
    token,
    userId,
    `+${DAYS} days`,
  )
  return token
}

export function logout(token: string) {
  db.query("DELETE FROM sessions WHERE token = ?").run(token)
}

export function readCookie(request: Request) {
  const header = request.headers.get("cookie")
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === COOKIE) return decodeURIComponent(rest.join("="))
  }
  return undefined
}

export function currentUser(request: Request): User | undefined {
  const token = readCookie(request)
  if (!token) return undefined
  db.query("DELETE FROM sessions WHERE expires_at <= datetime('now')").run()
  return (
    (db
      .query(
        "SELECT users.id, users.name, users.email, users.role, users.stage, users.created_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?",
      )
      .get(token) as User | null) ?? undefined
  )
}

export function sessionCookie(token: string) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 24 * 60 * 60}`
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
