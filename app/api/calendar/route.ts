import { NextResponse } from 'next/server'
import axios from 'axios'

async function getGoogleToken() {
  const res = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  return res.data.access_token
}

export async function GET() {
  try {
    const token = await getGoogleToken()
    const now = new Date()
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString()

    const res = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        timeMin,
        timeMax,
        orderBy: 'startTime',
        singleEvents: true,
        maxResults: 50,
      }
    })

    const events = (res.data.items || []).map((e: any) => ({
      id: e.id,
      title: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      location: e.location || null,
    }))

    return NextResponse.json({ events })
  } catch (e: any) {
    const msg = e.response?.data?.error?.message || e.message
    return NextResponse.json({ error: msg, events: [] }, { status: 200 })
  }
}
