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

    const res = await axios.get('https://sellingpartnerapi-na.amazon.com/orders/v0/orders', {
      params: {
        MarketplaceIds: process.env.AMAZON_MARKETPLACE_ID,
        CreatedAfter: createdAfter,
        OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed,Canceled,Unfulfillable',
      },
      headers: {
        'x-amz-access-token': token,
        'content-type': 'application/json',
      }
    })

    const orders = res.data.payload?.Orders || []
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum: number, o: any) => {
      return sum + parseFloat(o.OrderTotal?.Amount || '0')
    }, 0)

    return NextResponse.json({ totalRevenue: totalRevenue.toFixed(2), totalOrders, orders: orders.slice(0, 5) })
  } catch (e: any) {
    return NextResponse.json({ error: e.response?.data?.errors?.[0]?.message || e.message }, { status: 500 })
  }
}
