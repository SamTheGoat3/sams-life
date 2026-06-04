'use client'
import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }
type WorkoutLog = { date: string; workout: string }
type Tab = 'chat' | 'sales' | 'workout' | 'calendar'

export default function Home() {
  const [tab, setTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hey Sam 👋 I'm your personal assistant. Ask me anything — sales, workouts, schedule, whatever you need." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [salesData, setSalesData] = useState<any>(null)
  const [salesPeriod, setSalesPeriod] = useState('today')
  const [salesLoading, setSalesLoading] = useState(false)
  const [workoutLog, setWorkoutLog] = useState<WorkoutLog[]>([])
  const [workoutInput, setWorkoutInput] = useState('')
  const [weight, setWeight] = useState<number[]>([])
  const [weightInput, setWeightInput] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<any[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const saved = localStorage.getItem('workoutLog')
    if (saved) setWorkoutLog(JSON.parse(saved))
    const savedWeight = localStorage.getItem('weightLog')
    if (savedWeight) setWeight(JSON.parse(savedWeight))
  }, [])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const newMessages: Message[] = [...messages, { role: 'user', content: input }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, workoutLog })
      })
      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.content }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    }
    setLoading(false)
  }

  async function fetchSales(period: string) {
    setSalesLoading(true)
    setSalesPeriod(period)
    try {
      if (period === 'alltime') {
        await fetchAllTime()
      } else {
        const [shopify, amazon] = await Promise.all([
          fetch(`/api/shopify?type=${period}`).then(r => r.json()),
          fetch(`/api/amazon?type=${period}`).then(r => r.json())
        ])
        const totalRevenue = (parseFloat(shopify.totalRevenue || 0) + parseFloat(amazon.totalRevenue || 0)).toFixed(2)
        const totalOrders = (shopify.totalOrders || 0) + (amazon.totalOrders || 0)
        setSalesData({ totalRevenue, totalOrders, shopify, amazon })
      }
    } catch {
      setSalesData({ error: 'Could not load sales data' })
    }
    setSalesLoading(false)
  }

  async function fetchAllTime() {
    const STORAGE_KEY = 'allTimeSales'
    const saved = localStorage.getItem(STORAGE_KEY)
    const cached = saved ? JSON.parse(saved) : null

    if (!cached) {
      // First time — use hardcoded Amazon baseline + fetch Shopify all-time
      const AMAZON_BASELINE = { revenue: 74005.98, orders: 3883, asOf: '2026-06-04T22:40:00Z' }
      const shopify = await fetch(`/api/shopify?type=alltime`).then(r => r.json())
      const snapshot = {
        shopifyRevenue: parseFloat(shopify.totalRevenue || 0),
        amazonRevenue: AMAZON_BASELINE.revenue,
        shopifyOrders: shopify.totalOrders || 0,
        amazonOrders: AMAZON_BASELINE.orders,
        lastSynced: AMAZON_BASELINE.asOf
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      setSalesData({
        totalRevenue: (snapshot.shopifyRevenue + snapshot.amazonRevenue).toFixed(2),
        totalOrders: snapshot.shopifyOrders + snapshot.amazonOrders,
        shopify: { totalRevenue: snapshot.shopifyRevenue.toFixed(2), totalOrders: snapshot.shopifyOrders },
        amazon: { totalRevenue: snapshot.amazonRevenue.toFixed(2), totalOrders: snapshot.amazonOrders },
        lastSynced: snapshot.lastSynced
      })
    } else {
      // Incremental — only fetch since last sync
      const since = encodeURIComponent(cached.lastSynced)
      const [shopify, amazon] = await Promise.all([
        fetch(`/api/shopify?type=since&since=${since}`).then(r => r.json()),
        fetch(`/api/amazon?type=since&since=${since}`).then(r => r.json())
      ])
      const amazonOk = !amazon.error
      const prevAmazonRevenue = cached.amazonRevenue ?? 0
      const prevAmazonOrders = cached.amazonOrders ?? 0
      const updated = {
        shopifyRevenue: cached.shopifyRevenue + parseFloat(shopify.totalRevenue || 0),
        amazonRevenue: amazonOk ? prevAmazonRevenue + parseFloat(amazon.totalRevenue || 0) : cached.amazonRevenue,
        shopifyOrders: cached.shopifyOrders + (shopify.totalOrders || 0),
        amazonOrders: amazonOk ? prevAmazonOrders + (amazon.totalOrders || 0) : cached.amazonOrders,
        lastSynced: new Date().toISOString()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setSalesData({
        totalRevenue: (updated.shopifyRevenue + (updated.amazonRevenue || 0)).toFixed(2),
        totalOrders: updated.shopifyOrders + (updated.amazonOrders || 0),
        shopify: { totalRevenue: updated.shopifyRevenue.toFixed(2), totalOrders: updated.shopifyOrders },
        amazon: { totalRevenue: updated.amazonRevenue != null ? updated.amazonRevenue.toFixed(2) : 'Loading...', totalOrders: updated.amazonOrders ?? '—', error: !amazonOk },
        lastSynced: updated.lastSynced
      })
    }
  }

  useEffect(() => {
    if (tab === 'sales') fetchSales('today')
    if (tab === 'calendar') fetchCalendar()
  }, [tab])

  async function fetchCalendar() {
    setCalendarLoading(true)
    setCalendarError('')
    try {
      const res = await fetch('/api/calendar')
      const data = await res.json()
      if (data.error) setCalendarError(data.error)
      setCalendarEvents(data.events || [])
    } catch {
      setCalendarError('Could not load calendar')
    }
    setCalendarLoading(false)
  }

  function logWorkout() {
    if (!workoutInput.trim()) return
    const entry: WorkoutLog = { date: new Date().toLocaleDateString(), workout: workoutInput }
    const updated = [...workoutLog, entry]
    setWorkoutLog(updated)
    localStorage.setItem('workoutLog', JSON.stringify(updated))
    setWorkoutInput('')
  }

  function logWeight() {
    if (!weightInput.trim()) return
    const updated = [...weight, parseFloat(weightInput)]
    setWeight(updated)
    localStorage.setItem('weightLog', JSON.stringify(updated))
    setWeightInput('')
  }

  const currentWeight = weight.length > 0 ? weight[weight.length - 1] : 160
  const progress = Math.min(((currentWeight - 160) / (175 - 160)) * 100, 100)

  const styles = {
    container: { display: 'flex', flexDirection: 'column' as const, height: '100dvh', background: '#0f0f0f', color: '#fff' },
    header: { padding: '16px 20px 8px', borderBottom: '1px solid #1a1a1a' },
    title: { fontSize: 22, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #fff 0%, #888 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    tabs: { display: 'flex', gap: 4, padding: '8px 20px', borderBottom: '1px solid #1a1a1a' },
    tab: (active: boolean) => ({
      flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
      background: active ? '#fff' : '#1a1a1a', color: active ? '#000' : '#888',
      fontWeight: active ? 700 : 400, fontSize: 14, transition: 'all 0.2s'
    }),
    content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },
    messages: { flex: 1, overflowY: 'auto' as const, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 12 },
    bubble: (role: string) => ({
      maxWidth: '80%', padding: '12px 16px', borderRadius: role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
      background: role === 'user' ? '#fff' : '#1a1a1a', color: role === 'user' ? '#000' : '#fff',
      alignSelf: role === 'user' ? 'flex-end' : 'flex-start', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const
    }),
    inputRow: { display: 'flex', gap: 8, padding: '12px 20px 20px', borderTop: '1px solid #1a1a1a' },
    input: { flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 16, outline: 'none' },
    sendBtn: { padding: '12px 20px', borderRadius: 24, border: 'none', background: '#fff', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
    salesContent: { flex: 1, overflowY: 'auto' as const, padding: 20 },
    card: { background: '#1a1a1a', borderRadius: 16, padding: 20, marginBottom: 16 },
    bigNum: { fontSize: 42, fontWeight: 800, margin: '8px 0 4px' },
    label: { color: '#888', fontSize: 14 },
    periodRow: { display: 'flex', gap: 8, marginBottom: 20 },
    periodBtn: (active: boolean) => ({
      flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
      background: active ? '#fff' : '#1a1a1a', color: active ? '#000' : '#888', fontWeight: active ? 700 : 400, fontSize: 13
    }),
    workoutContent: { flex: 1, overflowY: 'auto' as const, padding: 20 },
    progressBar: { height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden', marginTop: 8 },
    progressFill: { height: '100%', background: 'linear-gradient(90deg, #4ade80, #22d3ee)', borderRadius: 4, transition: 'width 0.5s' },
    textInput: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const },
    logBtn: { width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: '#fff', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 8 },
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={styles.title}>Sam's Life</p>
      </div>
      <div style={styles.tabs}>
        {(['chat', 'sales', 'workout', 'calendar'] as Tab[]).map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'chat' ? '💬 Chat' : t === 'sales' ? '💰 Sales' : t === 'workout' ? '💪 Workout' : '📅 Cal'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'chat' && (
          <>
            <div style={styles.messages}>
              {messages.map((m, i) => (
                <div key={i} style={styles.bubble(m.role)}>{m.content}</div>
              ))}
              {loading && <div style={styles.bubble('assistant')}>...</div>}
              <div ref={messagesEndRef} />
            </div>
            <div style={styles.inputRow}>
              <input
                style={styles.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask me anything..."
              />
              <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
            </div>
          </>
        )}

        {tab === 'sales' && (
          <div style={styles.salesContent}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ ...styles.periodRow, flex: 1, marginBottom: 0 }}>
                {['today', 'week', 'month', 'alltime'].map(p => (
                  <button key={p} style={styles.periodBtn(salesPeriod === p)} onClick={() => fetchSales(p)}>
                    {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time'}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchSales(salesPeriod)} disabled={salesLoading} style={{ padding: '8px 10px', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#888', cursor: 'pointer', fontSize: 16 }}>↺</button>
              {salesPeriod === 'alltime' && <button onClick={() => { localStorage.removeItem('allTimeSales'); fetchSales('alltime') }} disabled={salesLoading} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #444', background: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' as const }}>Reset</button>}
            </div>
            {salesLoading ? (
              <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading...</div>
            ) : salesData ? (
              <>
                <div style={styles.card}>
                  <div style={styles.label}>Total Revenue</div>
                  <div style={styles.bigNum}>${salesData.totalRevenue}</div>
                  <div style={styles.label}>{salesData.totalOrders} orders combined</div>
                  {salesData.lastSynced && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <div style={{ color: '#555', fontSize: 12 }}>Synced {new Date(salesData.lastSynced).toLocaleString()}</div>
                      <button onClick={() => { localStorage.removeItem('allTimeSales'); fetchSales('alltime') }} style={{ fontSize: 11, color: '#555', background: 'none', border: '1px solid #333', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Reset</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ ...styles.card, flex: 1, marginBottom: 0 }}>
                    <div style={styles.label}>Shopify</div>
                    <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 2px' }}>${salesData.shopify?.totalRevenue || '0.00'}</div>
                    <div style={{ color: '#555', fontSize: 13 }}>{salesData.shopify?.totalOrders || 0} orders</div>
                  </div>
                  <div style={{ ...styles.card, flex: 1, marginBottom: 0 }}>
                    <div style={styles.label}>Amazon</div>
                    <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 2px' }}>${salesData.amazon?.totalRevenue || '0.00'}</div>
                    <div style={{ color: '#555', fontSize: 13 }}>{salesData.amazon?.totalOrders || 0} orders</div>
                  </div>
                </div>
                {salesData.shopify?.orders?.length > 0 && (
                  <div style={styles.card}>
                    <div style={{ ...styles.label, marginBottom: 12 }}>Recent Shopify Orders</div>
                    {salesData.shopify.orders.map((o: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i > 0 ? '1px solid #333' : 'none' }}>
                        <span style={{ color: '#ccc', fontSize: 14 }}>{new Date(o.created_at).toLocaleDateString()}</span>
                        <span style={{ fontWeight: 700 }}>${parseFloat(o.total_price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {tab === 'calendar' && (
          <div style={{ flex: 1, overflowY: 'auto' as const, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Next 14 Days</div>
              <button onClick={fetchCalendar} disabled={calendarLoading} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#888', cursor: 'pointer', fontSize: 14 }}>↺ Refresh</button>
            </div>
            {calendarLoading ? (
              <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading...</div>
            ) : calendarError ? (
              <div style={{ ...styles.card, color: '#f87171' }}>{calendarError}</div>
            ) : calendarEvents.length === 0 ? (
              <div style={{ color: '#555', textAlign: 'center', marginTop: 40 }}>No events in the next 14 days</div>
            ) : (() => {
              const today = new Date(); today.setHours(0,0,0,0)
              const groups: Record<string, any[]> = {}
              calendarEvents.forEach(e => {
                const d = new Date(e.start); d.setHours(0,0,0,0)
                const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                if (!groups[key]) groups[key] = []
                groups[key].push(e)
              })
              return Object.entries(groups).map(([day, events]) => (
                <div key={day} style={{ marginBottom: 20 }}>
                  <div style={{ color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{day}</div>
                  {events.map((e, i) => (
                    <div key={e.id} style={{ ...styles.card, marginBottom: 8, padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{e.title}</div>
                      {!e.allDay && (
                        <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
                          {new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' – '}
                          {new Date(e.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                      {e.allDay && <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>All day</div>}
                      {e.location && <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>{e.location}</div>}
                    </div>
                  ))}
                </div>
              ))
            })()}
          </div>
        )}

        {tab === 'workout' && (
          <div style={styles.workoutContent}>
            <div style={styles.card}>
              <div style={styles.label}>Weight Goal: 160 → 175 lbs</div>
              <div style={styles.bigNum}>{currentWeight} lbs</div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${Math.max(progress, 2)}%` }} />
              </div>
              <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>{Math.max(0, 175 - currentWeight).toFixed(1)} lbs to go</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input style={{ ...styles.textInput, flex: 1 }} value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="Log weight (lbs)" type="number" />
                <button style={{ ...styles.logBtn, width: 'auto', padding: '12px 16px', marginTop: 0 }} onClick={logWeight}>Log</button>
              </div>
            </div>

            <div style={styles.card}>
              <div style={{ ...styles.label, marginBottom: 12 }}>Log Today's Workout</div>
              <textarea
                style={{ ...styles.textInput, minHeight: 80, resize: 'none' as const }}
                value={workoutInput}
                onChange={e => setWorkoutInput(e.target.value)}
                placeholder="e.g. Chest day — bench 4x8, incline 3x10, cable flies 3x12..."
              />
              <button style={styles.logBtn} onClick={logWorkout}>Log Workout</button>
            </div>

            <div style={styles.card}>
              <div style={{ ...styles.label, marginBottom: 12 }}>Recent Workouts</div>
              {workoutLog.length === 0 ? (
                <div style={{ color: '#555', fontSize: 14 }}>No workouts logged yet.</div>
              ) : [...workoutLog].reverse().slice(0, 7).map((w, i) => (
                <div key={i} style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid #333' : 'none' }}>
                  <div style={{ color: '#888', fontSize: 12 }}>{w.date}</div>
                  <div style={{ fontSize: 14, marginTop: 2 }}>{w.workout}</div>
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, background: 'transparent', border: '1px solid #333' }}>
              <div style={{ ...styles.label, marginBottom: 8 }}>💡 Need a workout?</div>
              <div style={{ fontSize: 14, color: '#888' }}>Switch to the Chat tab and ask me for today's workout — I'll give you something fresh.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
