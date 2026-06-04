import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import { listEvents, deleteEvent, createEvent } from '@/app/lib/calendar'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY

async function getAmazonToken() {
  const res = await axios.post('https://api.amazon.com/auth/o2/token', new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
    client_id: process.env.AMAZON_CLIENT_ID!,
    client_secret: process.env.AMAZON_CLIENT_SECRET!,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  return res.data.access_token
}

async function getAmazonData(period: string) {
  const token = await getAmazonToken()
  const now = new Date()
  let createdAfter: string
  if (period === 'today') { const s = new Date(now); s.setHours(0,0,0,0); createdAfter = s.toISOString() }
  else if (period === 'week') { const s = new Date(now); s.setDate(s.getDate()-7); createdAfter = s.toISOString() }
  else if (period === 'month') { const s = new Date(now); s.setDate(1); s.setHours(0,0,0,0); createdAfter = s.toISOString() }
  else { createdAfter = '2020-01-01T00:00:00Z' }

  const res = await axios.get('https://sellingpartnerapi-na.amazon.com/orders/v0/orders', {
    params: { MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID, CreatedAfter: createdAfter, OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,Canceled,Unfulfillable' },
    headers: { 'x-amz-access-token': token, 'content-type': 'application/json' }
  })
  const orders = res.data.payload?.Orders || []
  const revenue = orders.reduce((s: number, o: any) => s + parseFloat(o.OrderTotal?.Amount || '0'), 0)
  return { period, orders: orders.length, revenue: revenue.toFixed(2) }
}

async function getShopifyData(period: string) {
  const base = `https://${SHOPIFY_STORE}/admin/api/2024-01`
  const headers = { 'X-Shopify-Access-Token': SHOPIFY_API_KEY! }
  const now = new Date()
  let createdAtMin: string

  if (period === 'today') {
    const s = new Date(now); s.setHours(0,0,0,0); createdAtMin = s.toISOString()
  } else if (period === 'week') {
    const s = new Date(now); s.setDate(s.getDate()-7); createdAtMin = s.toISOString()
  } else if (period === 'month') {
    const s = new Date(now); s.setDate(1); s.setHours(0,0,0,0); createdAtMin = s.toISOString()
  } else {
    createdAtMin = '2020-01-01T00:00:00Z'
  }

  const [ordersRes, countRes] = await Promise.all([
    axios.get(`${base}/orders.json?status=any&created_at_min=${createdAtMin}&limit=250&fields=id,total_price,created_at,line_items`, { headers }),
    axios.get(`${base}/orders/count.json?status=any&created_at_min=${createdAtMin}`, { headers })
  ])

  const orders = ordersRes.data.orders
  const revenue = orders.reduce((s: number, o: any) => s + parseFloat(o.total_price), 0)
  return { period, orders: countRes.data.count, revenue: revenue.toFixed(2) }
}


const calendarTools: Anthropic.Tool[] = [
  {
    name: 'list_calendar_events',
    description: 'List upcoming calendar events for the next 14 days',
    input_schema: { type: 'object' as const, properties: {}, required: [] }
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event. Set deleteAll=true to delete all instances of a recurring event series.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID to delete' },
        deleteAll: { type: 'boolean', description: 'If true, deletes the entire recurring series' }
      },
      required: ['eventId']
    }
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start datetime in ISO format (YYYY-MM-DDTHH:MM:SS) or date (YYYY-MM-DD) for all-day' },
        end: { type: 'string', description: 'End datetime in ISO format or date for all-day' },
        allDay: { type: 'boolean', description: 'Whether this is an all-day event' }
      },
      required: ['title', 'start', 'end']
    }
  }
]

export async function POST(request: Request) {
  const { messages, workoutLog } = await request.json()
  const userMessage = messages[messages.length - 1].content.toLowerCase()

  let shopifyContext = ''
  let amazonContext = ''
  let calendarContext = ''

  const isSalesQuery = userMessage.includes('today') || userMessage.includes('sale') || userMessage.includes('order') || userMessage.includes('revenue') || userMessage.includes('money')
  const isAmazonQuery = userMessage.includes('amazon')
  const isShopifyQuery = userMessage.includes('shopify')
  const isCalendarQuery = userMessage.includes('calendar') || userMessage.includes('event') || userMessage.includes('schedule') || userMessage.includes('meeting') || userMessage.includes('appointment') || userMessage.includes('delete') || userMessage.includes('add') || userMessage.includes('create')

  try {
    if (isSalesQuery && !isAmazonQuery) {
      const [today, week, month] = await Promise.all([
        getShopifyData('today'), getShopifyData('week'), getShopifyData('month')
      ])
      shopifyContext = `\nLIVE SHOPIFY DATA:\n- Today: ${today.orders} orders, $${today.revenue}\n- This week: ${week.orders} orders, $${week.revenue}\n- This month: ${month.orders} orders, $${month.revenue}\n`
    }
  } catch (e) { shopifyContext = 'Could not fetch Shopify data.' }

  try {
    if (isSalesQuery && !isShopifyQuery) {
      const [today, week, month] = await Promise.all([
        getAmazonData('today'), getAmazonData('week'), getAmazonData('month')
      ])
      amazonContext = `\nLIVE AMAZON DATA:\n- Today: ${today.orders} orders, $${today.revenue}\n- This week: ${week.orders} orders, $${week.revenue}\n- This month: ${month.orders} orders, $${month.revenue}\n`
    }
  } catch (e) { amazonContext = 'Could not fetch Amazon data.' }

  try {
    if (isCalendarQuery) {
      const events = await listEvents()
      if (events?.length > 0) {
        calendarContext = `\nUPCOMING CALENDAR EVENTS:\n${events.map((e: any) => `- [${e.id}] ${e.title} on ${new Date(e.start).toLocaleString()} ${e.recurringEventId ? '(recurring, seriesId: ' + e.recurringEventId + ')' : ''}`).join('\n')}\n`
      }
    }
  } catch (e) { calendarContext = '' }

  const workoutContext = workoutLog?.length > 0
    ? `\nRECENT WORKOUTS:\n${workoutLog.slice(-10).map((w: any) => `${w.date}: ${w.workout}`).join('\n')}`
    : ''

  const system = `You are Sam's personal AI assistant with full access to his calendar, sales data, and workout log.

ABOUT SAM:
- Runs Wrinkless — an anti-wrinkle glass straw brand sold on Shopify, Amazon, Etsy, TikTok
- Height: 6'2", Weight: 160 lbs, Goal: reach 175 lbs through muscle gain
- Goes to the gym every day, needs varied workouts for progressive overload
- Based in Utah (Orem, UT), timezone: America/Denver (Mountain Time)

${shopifyContext}${amazonContext}${calendarContext}${workoutContext}

You have tools to manage Sam's Google Calendar — you can list events, create new events, and delete events (including entire recurring series). When Sam asks you to add or delete calendar events, use the tools to actually do it. Confirm what you did after.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

  const anthropicMessages = messages.map((m: any) => ({ role: m.role, content: m.content }))

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    tools: calendarTools,
    messages: anthropicMessages
  })

  // Handle tool use loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find((b: any) => b.type === 'tool_use') as any
    if (!toolUseBlock) break

    let toolResult: any
    try {
      if (toolUseBlock.name === 'list_calendar_events') {
        toolResult = { events: await listEvents() }
      } else if (toolUseBlock.name === 'delete_calendar_event') {
        toolResult = await deleteEvent(toolUseBlock.input.eventId, toolUseBlock.input.deleteAll || false)
      } else if (toolUseBlock.name === 'create_calendar_event') {
        toolResult = await createEvent(toolUseBlock.input.title, toolUseBlock.input.start, toolUseBlock.input.end, toolUseBlock.input.allDay || false)
      }
    } catch (e: any) {
      toolResult = { error: e.message }
    }

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: calendarTools,
      messages: [
        ...anthropicMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(toolResult) }] }
      ]
    })
  }

  const text = response.content.find((b: any) => b.type === 'text') as any
  return NextResponse.json({ content: text?.text || '' })
}
