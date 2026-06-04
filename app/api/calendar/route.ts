import { NextResponse } from 'next/server'
import { listEvents, deleteEvent, createEvent } from '@/app/lib/calendar'

export async function GET() {
  try {
    const events = await listEvents()
    return NextResponse.json({ events })
  } catch (e: any) {
    const msg = e.response?.data?.error?.message || e.message
    return NextResponse.json({ error: msg, events: [] }, { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (body.action === 'delete') {
      const result = await deleteEvent(body.eventId, body.deleteAll || false)
      return NextResponse.json(result)
    }
    if (body.action === 'create') {
      const result = await createEvent(body.title, body.start, body.end, body.allDay || false)
      return NextResponse.json(result)
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    const msg = e.response?.data?.error?.message || e.message
    return NextResponse.json({ error: msg }, { status: 200 })
  }
}
