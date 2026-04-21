/* ── Frostfall Admin Dashboard ──────────────────────────────────────────────── */
;(function () {
  'use strict'

  const BACKEND  = window.__BACKEND_URL__ || 'http://localhost:4000'
  const TOKEN_KEY = 'ff_dash_token'

  let token       = null
  let currentPath = '.'
  let editorPath  = null
  let logTimer    = null
  let statusTimer = null

  // ── Helpers ────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id) }

  function api(method, path, body) {
    return fetch(BACKEND + '/api/admin' + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json())
  }

  function formatBytes(n) {
    if (!n) return ''
    if (n < 1024) return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1048576).toFixed(1) + ' MB'
  }

  function formatTs(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString()
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────

  function showAuth()      { $('auth-gate').classList.remove('hidden') }
  function showDashboard() { $('auth-gate').classList.add('hidden'); $('dashboard').classList.remove('hidden') }

  // Validate a session token via /auth/dashboard/me
  async function tryToken(t) {
    token = t
    try {
      const res = await fetch(BACKEND + '/auth/dashboard/me', {
        headers: { 'Authorization': 'Bearer ' + t },
      }).then(r => r.json())

      if (!res.ok || !res.user) {
        token = null
        return null
      }
      return res.user
    } catch {
      token = null
      return null
    }
  }

  // Kick off Discord OAuth — ask the backend for the auth URL, redirect there
  $('discord-login-btn').addEventListener('click', async () => {
    $('discord-login-btn').disabled = true
    $('discord-login-btn').textContent = '…'
    $('auth-error').classList.add('hidden')
    try {
      const redirectBack = window.location.href.split('?')[0]
      const res = await fetch(
        BACKEND + '/auth/dashboard/url?redirect=' + encodeURIComponent(redirectBack)
      ).then(r => r.json())

      if (res.error) throw new Error(res.error)
      window.location.href = res.url
    } catch (err) {
      $('auth-error').textContent = err.message || 'Could not reach auth service.'
      $('auth-error').classList.remove('hidden')
      $('discord-login-btn').disabled = false
      $('discord-login-btn').innerHTML = '<svg class="discord-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>Sign in with Discord'
    }
  })

  $('logout-btn').addEventListener('click', async () => {
    if (token) {
      await fetch(BACKEND + '/auth/dashboard/logout', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).catch(() => {})
    }
    sessionStorage.removeItem(TOKEN_KEY)
    token = null
    clearInterval(logTimer)
    clearInterval(statusTimer)
    $('dashboard').classList.add('hidden')
    showAuth()
  })

  function setUserInfo(user) {
    if (!user) return
    const avatar = $('dash-avatar')
    const name   = $('dash-username')
    if (user.avatar) {
      avatar.src = user.avatar
      avatar.hidden = false
    }
    name.textContent = user.username || ''
  }

  // ── Server control ─────────────────────────────────────────────────────────

  async function refreshStatus() {
    const dot   = $('status-dot')
    const label = $('status-label')
    const meta  = $('server-meta')
    dot.className = 'status-dot checking'
    try {
      const res = await api('GET', '/server/status')
      if (res.running) {
        dot.className = 'status-dot running'
        label.textContent = 'Running'
        meta.textContent =
          'PID ' + res.pid +
          ' · started ' + formatTs(res.startedAt) +
          ' · cmd: ' + res.cmd
      } else {
        dot.className = 'status-dot stopped'
        label.textContent = 'Stopped'
        meta.textContent = 'cmd: ' + (res.cmd || '—')
      }
    } catch {
      dot.className = 'status-dot stopped'
      label.textContent = 'Unreachable'
      meta.textContent = ''
    }
  }

  async function serverAction(action) {
    const btn = $('btn-' + action)
    btn.disabled = true
    btn.textContent = '…'
    try {
      await api('POST', '/server/' + action)
      await refreshStatus()
    } finally {
      btn.disabled = false
      btn.textContent = action.charAt(0).toUpperCase() + action.slice(1)
    }
  }

  window.serverAction = serverAction

  // ── Logs ───────────────────────────────────────────────────────────────────

  async function refreshLogs() {
    const el = $('log-output')
    const res = await api('GET', '/server/logs?limit=200').catch(() => null)
    if (!res || !res.logs) return

    const lines = res.logs.map(({ ts, line }) => {
      const time = formatTs(ts)
      const cls  = line.startsWith('[err]') ? 'log-err'
                 : line.startsWith('---')   ? 'log-sep'
                 : ''
      const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      return `<span class="${cls}">[${time}] ${escaped}</span>`
    })

    el.innerHTML = lines.join('\n') || '<span class="log-placeholder">No logs yet.</span>'

    if ($('log-follow').checked) {
      el.scrollTop = el.scrollHeight
    }
  }

  window.refreshLogs = refreshLogs

  // ── File manager ───────────────────────────────────────────────────────────

  async function loadDir(path) {
    currentPath = path
    renderBreadcrumb(path)

    const list = $('file-list')
    list.innerHTML = '<div class="file-list-placeholder">Loading…</div>'

    const res = await api('GET', '/files?path=' + encodeURIComponent(path)).catch(() => null)
    if (!res || res.error) {
      list.innerHTML = '<div class="file-list-placeholder">' + (res?.error || 'Error loading directory') + '</div>'
      return
    }

    if (!res.entries.length) {
      list.innerHTML = '<div class="file-list-placeholder">Empty directory.</div>'
      return
    }

    // Dirs first, then files
    const entries = [...res.entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    list.innerHTML = entries.map(e => {
      const icon     = e.type === 'dir' ? '📁' : '📄'
      const fullPath = (path === '.' ? '' : path + '/') + e.name
      const nameBtn  = e.type === 'dir'
        ? `<button class="file-name is-dir" onclick="loadDir('${esc(fullPath)}')">${esc(e.name)}/</button>`
        : `<button class="file-name" onclick="openEditor('${esc(fullPath)}')">${esc(e.name)}</button>`
      const delBtn = `<button class="file-action-btn" title="Delete" onclick="deleteFile('${esc(fullPath)}')">✕</button>`
      return `<div class="file-row">
        <span class="file-icon">${icon}</span>
        ${nameBtn}
        <span class="file-size">${formatBytes(e.size)}</span>
        <div class="file-actions">${e.type === 'file' ? delBtn : ''}</div>
      </div>`
    }).join('')
  }

  function esc(s) {
    return String(s).replace(/'/g, "\\'").replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  function renderBreadcrumb(path) {
    const bc    = $('breadcrumb')
    const parts = path === '.' ? [] : path.split('/')
    let html    = `<button class="breadcrumb-link" onclick="loadDir('.')">root</button>`
    let built   = ''
    for (const p of parts) {
      built    = built ? built + '/' + p : p
      const b  = built
      html    += `<span class="breadcrumb-sep">/</span><button class="breadcrumb-link" onclick="loadDir('${esc(b)}')">${esc(p)}</button>`
    }
    bc.innerHTML = html
  }

  window.loadDir = loadDir

  async function deleteFile(path) {
    if (!confirm('Delete ' + path + '?')) return
    await api('DELETE', '/files?path=' + encodeURIComponent(path))
    loadDir(currentPath)
  }

  window.deleteFile = deleteFile

  // ── File upload ────────────────────────────────────────────────────────────

  $('upload-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(BACKEND + '/api/admin/files/upload?path=' + encodeURIComponent(currentPath), {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body:    fd,
      })
    }
    e.target.value = ''
    loadDir(currentPath)
  })

  // ── Editor ─────────────────────────────────────────────────────────────────

  async function openEditor(path) {
    const res = await api('GET', '/files/content?path=' + encodeURIComponent(path)).catch(() => null)
    if (!res || res.error) return alert('Cannot read file: ' + (res?.error || 'unknown error'))
    if (res.encoding === 'base64') return alert('Binary files cannot be edited in the browser.')

    editorPath = path
    $('editor-title').textContent = path
    $('editor-area').value = res.content
    $('editor-backdrop').classList.remove('hidden')
    $('editor-area').focus()
  }

  window.openEditor = openEditor

  function closeEditor() {
    $('editor-backdrop').classList.add('hidden')
    editorPath = null
  }

  window.closeEditor = closeEditor

  async function saveFile() {
    if (!editorPath) return
    const content = $('editor-area').value
    const res = await api('PUT', '/files/content', { path: editorPath, content, encoding: 'utf8' }).catch(() => null)
    if (!res || res.error) return alert('Save failed: ' + (res?.error || 'unknown error'))
    closeEditor()
  }

  window.saveFile = saveFile

  // Close editor on backdrop click
  $('editor-backdrop').addEventListener('click', e => {
    if (e.target === $('editor-backdrop')) closeEditor()
  })

  // ── Init ───────────────────────────────────────────────────────────────────

  function init(user) {
    setUserInfo(user)
    showDashboard()
    refreshStatus()
    refreshLogs()
    loadDir('.')

    clearInterval(statusTimer)
    clearInterval(logTimer)
    statusTimer = setInterval(refreshStatus, 5000)
    logTimer    = setInterval(refreshLogs, 4000)
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  // Check for ?token= in URL (returned by Discord callback), then fall back
  // to sessionStorage.

  ;(async function boot() {
    const params   = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlError = params.get('error')

    if (urlError) {
      // Clean the URL, show auth with error message
      history.replaceState({}, '', window.location.pathname)
      const msgs = {
        cancelled:    'Discord login was cancelled.',
        unauthorized: 'Your Discord account is not authorised for this dashboard.',
        expired:      'Login session expired. Please try again.',
        server_error: 'A server error occurred. Please try again.',
      }
      $('auth-error').textContent = msgs[urlError] || 'Login failed: ' + urlError
      $('auth-error').classList.remove('hidden')
      showAuth()
      return
    }

    if (urlToken) {
      // Clean the ?token= from the address bar
      history.replaceState({}, '', window.location.pathname)
      const user = await tryToken(urlToken)
      if (user) {
        sessionStorage.setItem(TOKEN_KEY, urlToken)
        init(user)
        return
      }
      $('auth-error').textContent = 'Invalid or expired session token.'
      $('auth-error').classList.remove('hidden')
      showAuth()
      return
    }

    const saved = sessionStorage.getItem(TOKEN_KEY)
    if (saved) {
      const user = await tryToken(saved)
      if (user) { init(user); return }
      sessionStorage.removeItem(TOKEN_KEY)
    }

    showAuth()
  })()

  $('auth-gate').classList.remove('hidden')

}())
