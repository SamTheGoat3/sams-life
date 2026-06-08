// Run: node get-whoop-token.js
// Then open the URL it prints, authorize, and it saves your token automatically

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { URL, URLSearchParams } = require('url')

const CLIENT_ID = 'c2a937da-3c62-47df-ae1a-12a5cfdb6984'
const CLIENT_SECRET = '62cbcb74c6aac08f03ed450d964e0e61817fdf1d9c18eb424d60661c7d44cf83'
const REDIRECT_URI = 'http://localhost:3001/callback'
const SCOPES = 'read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement'

const STATE = 'samslife12345678'
const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${STATE}`

console.log('\n=== WHOOP OAuth Flow ===')
console.log('Open this URL in your browser:\n')
console.log(authUrl)
console.log('\nWaiting for callback on http://localhost:3333...\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3333')
  if (url.pathname !== '/callback') return

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')
  console.log('Callback received:', req.url)
  if (!code) {
    const msg = error ? `Error: ${error} — ${errorDesc}` : 'No code received'
    console.log(msg)
    res.end(msg)
    return
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }).toString()

  const options = {
    hostname: 'api.prod.whoop.com',
    path: '/oauth/oauth2/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const tokenReq = https.request(options, (tokenRes) => {
    let data = ''
    tokenRes.on('data', chunk => data += chunk)
    tokenRes.on('end', () => {
      const parsed = JSON.parse(data)
      if (parsed.access_token) {
        // Auto-save token to .env.local
        const envPath = path.join(__dirname, '.env.local')
        let envContent = fs.readFileSync(envPath, 'utf8')
        if (envContent.includes('WHOOP_ACCESS_TOKEN=')) {
          envContent = envContent.replace(/WHOOP_ACCESS_TOKEN=.*/m, `WHOOP_ACCESS_TOKEN=${parsed.access_token}`)
        } else {
          envContent += `\nWHOOP_ACCESS_TOKEN=${parsed.access_token}`
        }
        fs.writeFileSync(envPath, envContent)
        console.log('\n✅ WHOOP token saved to .env.local automatically!')
        console.log('Token expires in:', Math.round(parsed.expires_in / 60), 'minutes')
        res.end('✅ Success! WHOOP token saved. You can close this tab and restart your dev server.')
      } else {
        console.log('Error:', data)
        res.end('Error: ' + data)
      }
      server.close()
    })
  })

  tokenReq.write(body)
  tokenReq.end()
})

server.listen(3001)
