'use client'
import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }
type WorkoutLog = { date: string; workout: string }
type Tab = 'chat' | 'sales' | 'workout'

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
      const res = await fetch(`/api/shopify?type=${period}`)
      const data = await res.json()
      setSalesData(data)
    } catch {
      setSalesData({ error: 'Could not load sales data' })
    }
    setSalesLoading(false)
  }

  useEffect(() => {
    if (tab === 'sales') fetchSales('today')
  }, [tab])

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
        {(['chat', 'sales', 'workout'] as Tab[]).map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'chat' ? '💬 Chat' : t === 'sales' ? '💰 Sales' : '💪 Workout'}
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
            <div style={styles.periodRow}>
              {['today', 'week', 'month', 'alltime'].map(p => (
                <button key={p} style={styles.periodBtn(salesPeriod === p)} onClick={() => fetchSales(p)}>
                  {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time'}
                </button>
              ))}
            </div>
            {salesLoading ? (
              <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>Loading...</div>
            ) : salesData ? (
              <>
                <div style={styles.card}>
                  <div style={styles.label}>Revenue</div>
                  <div style={styles.bigNum}>${salesData.totalRevenue}</div>
                </div>
                <div style={styles.card}>
                  <div style={styles.label}>Orders</div>
                  <div style={styles.bigNum}>{salesData.totalOrders}</div>
                </div>
                {salesData.orders?.length > 0 && (
                  <div style={styles.card}>
                    <div style={{ ...styles.label, marginBottom: 12 }}>Recent Orders</div>
                    {salesData.orders.map((o: any, i: number) => (
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
