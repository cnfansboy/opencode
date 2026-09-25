import { db } from "./db"

// Zoom's own endpoints, overridable so tests can point at a local stand-in.
const OAUTH_BASE = process.env.ZOOM_OAUTH_BASE ?? "https://zoom.us"
const API_BASE = process.env.ZOOM_API_BASE ?? "https://api.zoom.us/v2"

export function zoomConfigured() {
  return !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET && process.env.ZOOM_REDIRECT_URI)
}

export function authorizeUrl() {
  const state = crypto.randomUUID().replaceAll("-", "")
  db.query("DELETE FROM oauth_states WHERE created_at <= datetime('now', '-15 minutes')").run()
  db.query("INSERT INTO oauth_states (state) VALUES (?)").run(state)

  const url = new URL(`${OAUTH_BASE}/oauth/authorize`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", process.env.ZOOM_CLIENT_ID!)
  url.searchParams.set("redirect_uri", process.env.ZOOM_REDIRECT_URI!)
  url.searchParams.set("state", state)
  return url.toString()
}

export function takeState(state: string) {
  const row = db
    .query("SELECT state FROM oauth_states WHERE state = ? AND created_at > datetime('now', '-15 minutes')")
    .get(state)
  if (row) db.query("DELETE FROM oauth_states WHERE state = ?").run(state)
  return !!row
}

/** Swaps the authorization code for a token, then reads who that token belongs to. */
export async function exchange(code: string) {
  const token = await fetch(
    `${OAUTH_BASE}/oauth/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(process.env.ZOOM_REDIRECT_URI!)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  )
  if (!token.ok) return undefined

  const granted = (await token.json()) as { access_token?: string }
  if (!granted.access_token) return undefined

  const profile = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${granted.access_token}` },
  })
  if (!profile.ok) return undefined

  const me = (await profile.json()) as {
    id?: string
    email?: string
    first_name?: string
    last_name?: string
    personal_meeting_url?: string
  }
  if (!me.id || !me.email) return undefined

  return {
    id: me.id,
    email: me.email.toLowerCase(),
    name: [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email,
    personalMeetingUrl: me.personal_meeting_url ?? "",
  }
}
