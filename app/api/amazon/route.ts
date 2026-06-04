import { NextResponse } from 'next/server'
import axios from 'axios'

const cache: Record<string, { data: any; ts: number }> = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getAmazonToken() {
  const res = await axios.post('https://api.amazon.com/auth/o2/token', new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.AMAZON_REFRESH_TOKEN!,
    client_id: process.env.AMAZON_CLIENT_ID!,
    client_secret: process.env.AMAZON_CLIENT_SECRET!,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  return res.data.access_token
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'today'

  if (cache[type] && Date.now() - cache[type].ts < CACHE_TTL) {
    return NextResponse.json(cache[type].data)
  }

  try {
    const token = await getAmazonToken()
    const now = new Date()
    let createdAfter: string

    if (type === 'today') {
      const s = new Date(now); s.setHours(0,0,0,0); createdAfter = s.toISOString()
    } else if (type === 'week') {
      const s = new Date(now); s.setDate(s.getDate()-7); createdAfter = s.toISOString()
    } else if (type === 'month') {
      const s = new Date(now); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); createdAfter = s.toISOString()
    } else if (type === 'since') {
      createdAfter = searchParams.get('since') || '2020-01-01T00:00:00Z'
    } else {
      createdAfter = '2020-01-01T00:00:00Z'
    }

    const headers = { 'x-amz-access-token': token, 'content-type': 'application/json' }
    let allOrders: any[] = []
    let nextToken: string | null = null

    do {
      const params: any = nextToken
        ? { NextToken: nextToken, MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID }
        : {
            MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID,
            CreatedAfter: createdAfter,
            OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed,Unfulfillable',
          }

      const res = await axios.get('https://sellingpartnerapi-na.amazon.com/orders/v0/orders', { params, headers })
      allOrders = allOrders.concat(res.data.payload?.Orders || [])
      nextToken = res.data.payload?.NextToken || null
    } while (nextToken)

    const totalOrders = allOrders.length
    const totalRevenue = allOrders.reduce((sum: number, o: any) => sum + parseFloat(o.OrderTotal?.Amount || '0'), 0)

    const result = { totalRevenue: totalRevenue.toFixed(2), totalOrders, orders: allOrders.slice(0, 5) }
    cache[type] = { data: result, ts: Date.now() }
    return NextResponse.json(result)
  } catch (e: any) {
    const msg = e.response?.data?.errors?.[0]?.message || e.message
    return NextResponse.json({ error: msg, totalRevenue: '0.00', totalOrders: 0 }, { status: 200 })
  }
}
