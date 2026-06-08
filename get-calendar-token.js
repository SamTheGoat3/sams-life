const { createServer } = require('http')
const { exec } = require('child_process')

const CLIENT_ID = '30763606043-up9ijb7urticc3nvj8qr2m1o81cv5q3n.apps.googleusercontent.com'
const CLIENT_SECRET = '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'
const REDIRECT_URI = 'http://localhost:3333/callback'

const scope = encodeURIComponent([
  'https://www.googleapis.com/auth/calendar',
  'https://mail.google.com/'
].join(' '))

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`

console.log('\nOpening Google auth in browser...\n')
exec(`open "${authUrl}"`)

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3333')
  const code = url.searchParams.get('code')
  if (!code) { res.end('No code'); return }

  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  })

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
  const data = await tokenRes.json()

  if (data.refresh_token) {
    console.log('\n✅ NEW GOOGLE_REFRESH_TOKEN:\n')
    console.log(data.refresh_token)
    console.log('\nUpdate this in Vercel Environment Variables → GOOGLE_REFRESH_TOKEN\n')
    res.end('<h2>Success! Check your terminal for the new refresh token. You can close this tab.</h2>')
  } else {
    console.log('Error:', data)
    res.end('<h2>Error — check terminal</h2>')
  }
  server.close()
})

server.listen(3333, () => console.log('Waiting for Google auth callback on port 3333...'))
