import { NextResponse } from 'next/server'
import axios from 'axios'

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

  try {
    const token = await getAmazonToken()
    const now = new Date()
    let createdAfter: string

    if (type === 'today') {
      const s = new Date(now); s.setHours(0,0,0,0); createdAfter = s.toISOString()
    } else if (type === 'week') {
      const s = new Date(now); s.setDate(s.getDate()-7); createdAfter = s.toISOString()
    } else if (type === 'month') {
      const s = new Date(now); s.setDate(1); s.setHours(0,0,0,0); createdAfter = s.toISOString()
    } else {
      createdAfter = '2020-01-01T00:00:00Z'
    }

    const headers = { 'x-amz-access-token': token, 'content-type': 'application/json' }
    const baseParams = {
      MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID,
      CreatedAfter: createdAfter,
      OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed,Unfulfillable',
    }

    // Paginate through all orders
    let allOrders: any[] = []
    let nextToken: string | null = null

    do {
      const params: any = nextToken ? { NextToken: nextToken, MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID } : baseParams
      const res = await axios.get('https://sellingpartnerapi-na.amazon.com/orders/v0/orders', { params, headers })
      const orders = res.data.payload?.Orders || []
      allOrders = allOrders.concat(orders)
      nextToken = res.data.payload?.NextToken || null
      if (nextToken) await new Promise(r => setTimeout(r, 500)) // avoid rate limiting
    } while (nextToken && allOrders.length < 5000)

    const totalOrders = allOrders.length
    const totalRevenue = allOrders.reduce((sum: number, o: any) => sum + parseFloat(o.OrderTotal?.Amount || '0'), 0)

    return NextResponse.json({ totalRevenue: totalRevenue.toFixed(2), totalOrders, orders: allOrders.slice(0, 5) })
  } catch (e: any) {
    return NextResponse.json({ error: e.response?.data?.errors?.[0]?.message || e.message }, { status: 500 })
  }
}
