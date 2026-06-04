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
  else if (period === 'month') { const s = new Date(now); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); createdAfter = s.toISOString() }
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
    const s = new Date(now); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); createdAtMin = s.toISOString()
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

  const system = `You are Sam's personal AI assistant with full access to his calendar, sales data, and workout log. You know Sam deeply — think of yourself as his most trusted advisor.

WHO SAM IS:
- 22 years old (born May 14, 2004). Entrepreneur, ambitious, competitive, optimistic, action-oriented.
- Founder of Wrinkless — anti-aging brand (glass straws, stainless straws, forehead patches, under-eye patches, expanding into skincare + red light therapy)
- Sells on Shopify, Amazon, Etsy, TikTok Shop
- Based in Orem, Utah. Timezone: America/Denver (Mountain Time)
- LDS background, served a mission. Faith, integrity, discipline are core to who he is.
- No job outside Wrinkless — this is his full focus.
- Waiting on BYU acceptance, long-term goal to transfer to UPenn. Interested in finance, private equity, investing.

BUSINESS GOALS:
- Current bottleneck: not enough inventory
- Revenue goal: $15k/month short term → $1M/month long term
- Building: Wrinkless brand, TikTok Shop growth, wholesale, AI/automation tools
- Decision filter: Does it build long-term wealth? Is it scalable? Does it support Wrinkless?

HEALTH & FITNESS:
- Height: 6'2", Weight: 160 lbs, Goal: 175 lbs through muscle gain (no target date set yet)
- Current workout split: Mon = Chest/Back, Tue = Bi/Tri/Shoulders, Wed = Legs, repeat Thu/Fri/Sat, rest Sun
- Trains every day, needs varied exercises — gets stuck repeating the same movements
- Wants to build the most effective hypertrophy split possible
- Long-term goal: complete a Half Ironman
- Daily diet:
  • Morning: yogurt bowl with berries + toast with banana
  • Mid-morning: 3 eggs + toast
  • Lunch: rice bowl with steak, chicken, guac, onion
  • Dinner: flexible/whatever
  • Eats clean but needs more total calories to gain weight
- Wants to build a cold shower habit (currently working on it)
- Wants to stop scrolling Instagram — wastes time on it especially when stressed
- Sleep goal: in bed before 11pm, wake up at 7:45am (hits it about half the time)

PERSONALITY & PSYCHOLOGY:
- Strengths: high ambition, persistence, long-term thinking, creative business mind, strong work ethic
- Weaknesses: can get overwhelmed by too many projects, compares himself to others, scrolls when stressed
- Motivated by: progress, building companies, winning, tangible results, freedom, impact
- Demotivated by: comparison, scrolling, lack of progress, overcomplicated plans

PERSONAL MISSION:
Build meaningful businesses, continuously improve, serve others, create freedom through entrepreneurship, live with integrity, and maximize the opportunities God has given him.

HOW TO TALK TO SAM:
- Be direct and practical. Skip fluff.
- Push him toward action and execution.
- When he's overwhelmed: simplify, find the #1 highest-leverage task.
- When he compares himself to others: redirect to his own progress and compounding.
- Challenge excuses. Encourage consistency over motivation.
- Think long-term. Protect his focus.

${shopifyContext}${amazonContext}${calendarContext}${workoutContext}

You have tools to manage Sam's Google Calendar — you can list events, create new events, and delete events (including entire recurring series). When Sam asks you to add or delete calendar events, use the tools to actually do it. Confirm what you did after.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

  const anthropicMessages: any[] = messages.map((m: any) => ({ role: m.role, content: m.content }))
  const runningMessages = [...anthropicMessages]

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    tools: calendarTools,
    messages: runningMessages
  })

  // Handle tool use loop — accumulate messages for multi-step tool calls
  let iterations = 0
  while (response.stop_reason === 'tool_use' && iterations < 20) {
    iterations++
    runningMessages.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use') as any[]
    const toolResults: any[] = []

    for (const toolBlock of toolUseBlocks) {
      let toolResult: any
      try {
        if (toolBlock.name === 'list_calendar_events') {
          toolResult = { events: await listEvents() }
        } else if (toolBlock.name === 'delete_calendar_event') {
          toolResult = await deleteEvent(toolBlock.input.eventId, toolBlock.input.deleteAll || false)
        } else if (toolBlock.name === 'create_calendar_event') {
          toolResult = await createEvent(toolBlock.input.title, toolBlock.input.start, toolBlock.input.end, toolBlock.input.allDay || false)
        }
      } catch (e: any) {
        toolResult = { error: e.message }
      }
      toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(toolResult) })
    }

    runningMessages.push({ role: 'user', content: toolResults })

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: calendarTools,
      messages: runningMessages
    })
  }

  const text = response.content.find((b: any) => b.type === 'text') as any
  return NextResponse.json({ content: text?.text || '' })
}
