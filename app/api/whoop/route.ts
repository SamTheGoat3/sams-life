import { NextResponse } from 'next/server'
import axios from 'axios'

let cachedData: { data: any; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export async function GET() {
  if (cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
    return NextResponse.json(cachedData.data)
  }

  const token = process.env.WHOOP_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'no_token' }, { status: 200 })
  }

  try {
    const headers = { Authorization: `Bearer ${token}` }

    const [recoveryRes, cycleRes, bodyRes] = await Promise.allSettled([
      axios.get('https://api.prod.whoop.com/developer/v2/recovery?limit=1', { headers }),
      axios.get('https://api.prod.whoop.com/developer/v1/cycle?limit=1', { headers }),
      axios.get('https://api.prod.whoop.com/developer/v1/user/measurement/body', { headers }),
    ])

    const recovery = recoveryRes.status === 'fulfilled' ? recoveryRes.value.data?.records?.[0] : null
    const cycle = cycleRes.status === 'fulfilled' ? cycleRes.value.data?.records?.[0] : null
    const body = bodyRes.status === 'fulfilled' ? bodyRes.value.data : null

    const result = {
      recovery: recovery?.score ? {
        score: recovery.score.recovery_score,
        hrv: Math.round(recovery.score.hrv_rmssd_milli),
        restingHr: recovery.score.resting_heart_rate,
        spo2: recovery.score.spo2_percentage,
        skinTemp: recovery.score.skin_temp_celsius,
      } : null,
      strain: cycle?.score ? {
        score: Math.round(cycle.score.strain * 10) / 10,
        calories: Math.round(cycle.score.kilojoule * 0.239),
        avgHr: cycle.score.average_heart_rate,
        maxHr: cycle.score.max_heart_rate,
      } : null,
      body: body ? {
        heightFt: Math.round(body.height_meter * 3.28084 * 10) / 10,
        weightLbs: Math.round(body.weight_kilogram * 2.20462),
        maxHr: body.max_heart_rate,
      } : null,
    }

    cachedData = { data: result, ts: Date.now() }
    return NextResponse.json(result)
  } catch (e: any) {
    if (e.response?.status === 401) {
      return NextResponse.json({ error: 'token_expired' }, { status: 200 })
    }
    return NextResponse.json({ error: e.message }, { status: 200 })
  }
}
