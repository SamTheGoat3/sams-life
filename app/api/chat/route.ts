import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY

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

export async function POST(request: Request) {
  const { messages, workoutLog } = await request.json()
  const userMessage = messages[messages.length - 1].content.toLowerCase()

  let shopifyContext = ''
  try {
    if (userMessage.includes('today') || userMessage.includes('sale') || userMessage.includes('order') || userMessage.includes('revenue') || userMessage.includes('money')) {
      const [today, week, month] = await Promise.all([
        getShopifyData('today'),
        getShopifyData('week'),
        getShopifyData('month')
      ])
      shopifyContext = `
LIVE SHOPIFY DATA:
- Today: ${today.orders} orders, $${today.revenue} revenue
- This week: ${week.orders} orders, $${week.revenue} revenue
- This month: ${month.orders} orders, $${month.revenue} revenue
`
    }
  } catch (e) {
    shopifyContext = 'Could not fetch Shopify data right now.'
  }

  const workoutContext = workoutLog?.length > 0
    ? `\nRECENT WORKOUTS LOGGED:\n${workoutLog.slice(-10).map((w: any) => `${w.date}: ${w.workout}`).join('\n')}`
    : ''

  const system = `You are Sam's personal AI assistant. You know everything about his life and business.

ABOUT SAM:
- Runs Wrinkless — an anti-wrinkle glass straw brand sold on Shopify, Amazon, Etsy, TikTok
- Height: 6'2", Weight: 160 lbs, Goal: reach 175 lbs through muscle gain
- Goes to the gym every day but tends to repeat the same workouts
- Needs fresh workout variety to keep building muscle (progressive overload)
- Based in Utah (Orem, UT)

${shopifyContext}${workoutContext}

When asked about workouts, give specific, varied routines he hasn't likely done recently. Focus on hypertrophy (muscle building) with compound + isolation movements. Keep responses concise and direct — Sam is a busy entrepreneur.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages: messages.map((m: any) => ({ role: m.role, content: m.content }))
  })

  return NextResponse.json({ content: response.content[0].type === 'text' ? response.content[0].text : '' })
}
