import { NextResponse } from 'next/server'
import axios from 'axios'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'today'

  try {
    const base = `https://${SHOPIFY_STORE}/admin/api/2024-01`
    const headers = { 'X-Shopify-Access-Token': SHOPIFY_API_KEY! }

    const now = new Date()
    let createdAtMin: string

    if (type === 'today') {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      createdAtMin = start.toISOString()
    } else if (type === 'week') {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      createdAtMin = start.toISOString()
    } else if (type === 'month') {
      const start = new Date(now)
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      createdAtMin = start.toISOString()
    } else {
      createdAtMin = '2020-01-01T00:00:00Z'
    }

    const [ordersRes, countRes] = await Promise.all([
      axios.get(`${base}/orders.json?status=any&created_at_min=${createdAtMin}&limit=250&fields=id,total_price,created_at,line_items,customer`, { headers }),
      axios.get(`${base}/orders/count.json?status=any&created_at_min=${createdAtMin}`, { headers })
    ])

    const orders = ordersRes.data.orders
    const totalRevenue = orders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price), 0)
    const totalOrders = countRes.data.count

    return NextResponse.json({ totalRevenue: totalRevenue.toFixed(2), totalOrders, orders: orders.slice(0, 5) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
