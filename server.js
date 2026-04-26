require('dotenv').config()
const express = require('express')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 4001

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))

const BACKEND  = process.env.BACKEND_URL || 'https://api.frostfall.online'
const SITE_URL = process.env.SITE_URL    || 'https://frostfall.online'

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getToken(req) {
  const raw   = req.headers.cookie || ''
  const match = raw.match(/(?:^|;\s*)ff_dash_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function setTokenCookie(res, token) {
  const maxAge = 7 * 24 * 3600 // 7 days
  res.setHeader('Set-Cookie',
    `ff_dash_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/`)
}

function clearTokenCookie(res) {
  res.setHeader('Set-Cookie',
    'ff_dash_token=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/')
}

// ── Backend session helper ────────────────────────────────────────────────────

async function fetchMe(token) {
  try {
    const r = await fetch(BACKEND + '/auth/dashboard/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
    return await r.json()
  } catch {
    return null
  }
}

// ── Public pages ──────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.render('index', { page: 'home' }))

app.get('/lore', (_req, res) => res.render('lore', { page: 'lore', backendUrl: BACKEND }))

app.get('/rules', (_req, res) => res.render('rules', { page: 'rules', backendUrl: BACKEND }))

// ── Dashboard auth ────────────────────────────────────────────────────────────

// Step 1 — redirect user to Discord OAuth via the backend
app.get('/auth/dashboard/login', async (_req, res) => {
  const callbackUrl = SITE_URL + '/auth/dashboard/callback'
  try {
    const data = await fetch(
      BACKEND + '/auth/dashboard/url?redirect=' + encodeURIComponent(callbackUrl)
    ).then(r => r.json())
    if (data.url) return res.redirect(data.url)
  } catch { /* fall through */ }
  res.redirect('/dashboard?error=server_error')
})

// Step 2 — backend redirects here with ?token= (or ?error=) after OAuth
app.get('/auth/dashboard/callback', async (req, res) => {
  const { token, error } = req.query

  if (error) return res.redirect('/dashboard?error=' + encodeURIComponent(error))
  if (!token) return res.redirect('/dashboard?error=server_error')

  const me = await fetchMe(token)
  if (!me || !me.ok || !me.user) return res.redirect('/dashboard?error=unauthorized')

  setTokenCookie(res, token)
  res.redirect('/dashboard')
})

// Logout — clear cookie, revoke backend session
app.post('/auth/dashboard/logout', async (req, res) => {
  const token = getToken(req)
  clearTokenCookie(res)
  if (token) {
    await fetch(BACKEND + '/auth/dashboard/logout', {
      method:  'POST',
      headers: { Authorization: 'Bearer ' + token },
    }).catch(() => {})
  }
  res.redirect('/dashboard')
})

// ── Dashboard page — server-side auth + permission-aware render ───────────────

const AUTH_ERROR_MESSAGES = {
  cancelled:      'Discord login was cancelled.',
  unauthorized:   'Your Discord account does not have access to this dashboard.',
  expired:        'Login link expired. Please try again.',
  server_error:   'A server error occurred. Please try again.',
  session_expired:'Your session has expired. Please sign in again.',
}

app.get('/dashboard', async (req, res) => {
  const { error } = req.query
  const authError = error ? (AUTH_ERROR_MESSAGES[error] || 'Login failed.') : null

  const token = getToken(req)

  if (!token) {
    return res.render('dashboard', {
      page: 'dashboard', backendUrl: BACKEND,
      user: null, permissions: [],
      canServer: false, canLore: false, canRules: false,
      canWhitelist: false, canWhitelistWrite: false,
      dashToken: null, authError,
    })
  }

  const me = await fetchMe(token)

  if (!me || !me.ok || !me.user) {
    clearTokenCookie(res)
    return res.render('dashboard', {
      page: 'dashboard', backendUrl: BACKEND,
      user: null, permissions: [],
      canServer: false, canLore: false, canRules: false,
      canWhitelist: false, canWhitelistWrite: false,
      dashToken: null, authError: AUTH_ERROR_MESSAGES.session_expired,
    })
  }

  const perms = me.user.permissions || []
  const isAdmin = perms.includes('admin.*')

  res.render('dashboard', {
    page:        'dashboard',
    backendUrl:  BACKEND,
    user:        me.user,
    permissions: perms,
    dashToken:   token,
    authError:   null,
    canServer:   isAdmin,
    canLore:     isAdmin || perms.includes('lore.write'),
    canRules:    isAdmin || perms.includes('rules.write'),
    canWhitelist: isAdmin || perms.includes('staff.whitelist_info'),
    canWhitelistWrite: isAdmin || perms.includes('rules.write'),
  })
})

// ── Download ──────────────────────────────────────────────────────────────────

const INSTALLER_FILE    = path.join(__dirname, 'public', 'files', 'Frostfall-Launcher-Setup.exe')
const FALLBACK_DOWNLOAD = 'https://github.com/F02K/Frostfall-Launcher/releases/latest'

app.get('/download', (_req, res) => {
  res.download(INSTALLER_FILE, 'Frostfall-Launcher-Setup.exe', err => {
    if (err) res.redirect(FALLBACK_DOWNLOAD)
  })
})

app.listen(PORT, () => {
  console.log(`Frostfall running on http://localhost:${PORT}`)
})
