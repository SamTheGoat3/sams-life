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

export async function listEvents() {
  const token = await getGoogleToken()
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString()

  const res = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    headers: { Authorization: `Bearer ${token}` },
    params: { timeMin, timeMax, orderBy: 'startTime', singleEvents: true, maxResults: 50 }
  })

  return (res.data.items || []).map((e: any) => ({
    id: e.id,
    recurringEventId: e.recurringEventId || null,
    title: e.summary || '(No title)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start?.dateTime,
    location: e.location || null,
  }))
}

export async function deleteEvent(eventId: string, deleteAll: boolean) {
  const token = await getGoogleToken()
  const idToDelete = deleteAll ? eventId.split('_')[0] : eventId
  await axios.delete(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${idToDelete}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return { success: true }
}

export async function createEvent(title: string, start: string, end: string, allDay: boolean) {
  const token = await getGoogleToken()
  const event: any = {
    summary: title,
    start: allDay ? { date: start } : { dateTime: start, timeZone: 'America/Denver' },
    end: allDay ? { date: end } : { dateTime: end, timeZone: 'America/Denver' },
  }
  const res = await axios.post(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    event,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return { success: true, event: res.data }
}
