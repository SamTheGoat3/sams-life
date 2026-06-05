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
      const s = new Date(now); s.setHours(0,0,0,0); createdAtMin = s.toISOString()
    } else if (type === 'week') {
      const s = new Date(now); s.setDate(s.getDate()-7); createdAtMin = s.toISOString()
    } else if (type === 'month') {
      const s = new Date(now); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); createdAtMin = s.toISOString()
    } else if (type === 'since') {
      createdAtMin = searchParams.get('since') || '2020-01-01T00:00:00Z'
    } else {
      createdAtMin = '2020-01-01T00:00:00Z'
    }

    // Paginate through all orders using Link header
    let allOrders: any[] = []
    let url: string | null = `${base}/orders.json?status=any&created_at_min=${encodeURIComponent(createdAtMin)}&limit=250&fields=id,total_price,created_at,financial_status`

    while (url) {
      const currentUrl: string = url
      const res = await axios.get(currentUrl, { headers })
      allOrders = allOrders.concat(res.data.orders || [])
      const linkHeader = res.headers['link'] || ''
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      url = nextMatch ? nextMatch[1] : null
    }

    const totalRevenue = allOrders
      .filter((o: any) => o.financial_status !== 'refunded' && o.financial_status !== 'voided')
      .reduce((sum: number, o: any) => sum + parseFloat(o.total_price), 0)

    return NextResponse.json({ totalRevenue: totalRevenue.toFixed(2), totalOrders: allOrders.length, orders: allOrders.slice(0, 5) })
  } catch (e: any) {
    const msg = e.response?.data?.errors || e.response?.data || e.message
    return NextResponse.json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg), totalRevenue: '0.00', totalOrders: 0 }, { status: 200 })
  }
}
